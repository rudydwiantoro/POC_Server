package com.poc.radio

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.media.AudioManager
import android.media.ToneGenerator
import android.Manifest
import android.content.pm.PackageManager
import android.view.MotionEvent
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.poc.radio.net.ApiClient
import com.poc.radio.net.SignalingClient
import com.poc.radio.net.WebRtcAudioEngine
import com.poc.radio.service.PttForegroundService
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import android.media.MediaRecorder
import android.app.ActivityManager
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity(), SignalingClient.Callback {
    private lateinit var spChannel: Spinner
    private lateinit var btnConnect: Button
    private lateinit var btnPtt: Button
    private lateinit var btnSendShortMessage: Button
    private lateinit var etShortMessage: EditText
    private lateinit var etPhotoNote: EditText
    private lateinit var btnTakePhoto: ImageButton
    private lateinit var btnOpenHistory: Button
    private lateinit var btnAbout: ImageButton
    private lateinit var tvMiniDisplay: TextView
    private lateinit var tvFloorStatus: TextView
    private lateinit var tvSignalStatus: TextView
    private lateinit var apiClient: ApiClient

    private var signalingClient: SignalingClient? = null
    private var isConnected = false
    private var mediaRecorder: MediaRecorder? = null
    private var currentVoiceFile: File? = null
    private var currentVoiceStartMs: Long = 0L
    private var webRtcEngine: WebRtcAudioEngine? = null
    private var currentPeerUserId: String? = null
    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) confirmAndUploadPhoto(bmp)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        ensureMicPermission()
        if (AppConfig.beaconEnabled(this)) {
            startPttService()
        }

        findViewById<TextView>(R.id.tvUserInfo).text =
            "User: ${AppConfig.userId(this)} / ${AppConfig.deviceId(this)}"
        spChannel = findViewById(R.id.spChannel)
        btnConnect = findViewById(R.id.btnConnect)
        btnPtt = findViewById(R.id.btnPtt)
        btnSendShortMessage = findViewById(R.id.btnSendShortMessage)
        etShortMessage = findViewById(R.id.etShortMessage)
        etPhotoNote = findViewById(R.id.etPhotoNote)
        btnTakePhoto = findViewById(R.id.btnTakePhoto)
        btnOpenHistory = findViewById(R.id.btnOpenHistory)
        btnAbout = findViewById(R.id.btnAbout)
        tvMiniDisplay = findViewById(R.id.tvMiniDisplay)
        tvFloorStatus = findViewById(R.id.tvFloorStatus)
        tvSignalStatus = findViewById(R.id.tvSignalStatus)
        apiClient = ApiClient(AppConfig.httpBaseUrl(this))

        val channels = listOf("engineering", "housekeeping", "security", "all-call")
        spChannel.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, channels)
        spChannel.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val channelId = selectedChannel()
                if (isConnected) {
                    signalingClient?.switchChannel(channelId)
                    loadLatestTextFromDb(channelId)
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        btnConnect.setOnClickListener {
            if (!isConnected) {
                connectSignaling()
            } else {
                disconnectSignaling()
            }
        }

        btnPtt.setOnTouchListener { _, event ->
            val channelId = selectedChannel()
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (isWebRtcMode()) {
                        webRtcEngine?.setMicEnabled(true)
                    } else {
                        startVoiceRecording()
                    }
                    signalingClient?.requestTalk(channelId)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isWebRtcMode()) {
                        webRtcEngine?.setMicEnabled(false)
                    } else {
                        stopAndUploadVoiceRecording(channelId)
                    }
                    playRogerBeepIfEnabled()
                    signalingClient?.releaseTalk(channelId)
                    true
                }
                else -> false
            }
        }

        btnSendShortMessage.setOnClickListener {
            val text = etShortMessage.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                tvSignalStatus.text = "Signal: short text cannot be empty"
                return@setOnClickListener
            }
            signalingClient?.sendPttText(selectedChannel(), text)
            etShortMessage.text?.clear()
        }
        btnTakePhoto.setOnClickListener { takePictureLauncher.launch(null) }
        btnOpenHistory.setOnClickListener { startActivity(Intent(this, HistoryActivity::class.java)) }
        btnAbout.setOnClickListener { showAboutDialog() }
    }

    private fun connectSignaling() {
        startPttService()
        if (isWebRtcMode()) {
            ensureWebRtcEngine()
            webRtcEngine?.ensurePeerConnection()
        }
        signalingClient = SignalingClient(
            wsUrl = AppConfig.wsUrl(this),
            userId = AppConfig.userId(this),
            deviceId = AppConfig.deviceId(this),
            channelIdProvider = { selectedChannel() },
            callback = this
        ).also { it.connect() }
    }

    private fun disconnectSignaling() {
        signalingClient?.close()
        signalingClient = null
        currentPeerUserId = null
        webRtcEngine?.release()
        webRtcEngine = null
        if (!AppConfig.beaconEnabled(this)) {
            stopService(Intent(this, PttForegroundService::class.java))
        }
    }

    private fun selectedChannel(): String = spChannel.selectedItem?.toString() ?: "engineering"

    private fun startPttService() {
        val intent = Intent(this, PttForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, intent)
        } else {
            startService(intent)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVoiceRecordingInternal()
        disconnectSignaling()
    }

    private fun isWebRtcMode(): Boolean = AppConfig.voiceTransportMode(this) == "webrtc"

    private fun ensureWebRtcEngine() {
        if (webRtcEngine != null) return
        webRtcEngine = WebRtcAudioEngine(this, object : WebRtcAudioEngine.Callback {
            override fun onLocalIceCandidate(candidate: JSONObject) {
                val toUserId = currentPeerUserId ?: return
                signalingClient?.sendWebRtcIce(toUserId, candidate)
            }

            override fun onRemoteAudioTrack() {
                runOnUiThread { tvSignalStatus.text = "Signal: remote audio track connected" }
            }

            override fun onError(message: String) {
                runOnUiThread { tvSignalStatus.text = "Signal: webrtc error ($message)" }
            }
        })
    }

    private fun ensureMicPermission() {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7001)
        }
    }

    override fun onStatus(status: String) {
        runOnUiThread {
            tvSignalStatus.text = "Signal: $status"
            val connected = status == "connected"
            isConnected = connected
            btnConnect.text = if (connected) "Disconnect Signaling" else "Connect Signaling"
            btnPtt.isEnabled = connected
            etShortMessage.isEnabled = connected
            btnSendShortMessage.isEnabled = connected
            etPhotoNote.isEnabled = connected
            btnTakePhoto.isEnabled = connected
            if (connected) {
                loadLatestTextFromDb(selectedChannel())
            } else {
                tvMiniDisplay.text = "-"
            }
        }
    }

    override fun onFloorHolder(userId: String?) {
        runOnUiThread {
            tvFloorStatus.text = "Floor: ${userId ?: "-"}"
            val isMine = userId == AppConfig.userId(this)
            btnPtt.setBackgroundColor(if (isMine) Color.parseColor("#0B8F35") else Color.parseColor("#B42A2A"))
        }
    }

    override fun onError(message: String) {
        runOnUiThread { tvSignalStatus.text = "Signal: error ($message)" }
    }

    override fun onPttTextMessage(userId: String?, text: String) {
        runOnUiThread {
            val sender = userId ?: "unknown"
            tvMiniDisplay.text = "$sender: $text"
        }
    }

    override fun onPttImageMessage(userId: String?, imageUrl: String, noteText: String) {
        runOnUiThread {
            val sender = userId ?: "unknown"
            tvSignalStatus.text = "Signal: image masuk dari $sender"
            tvMiniDisplay.text = "$sender kirim image: $noteText"
        }
    }

    private fun loadLatestTextFromDb(channelId: String) {
        val token = AppConfig.token(this)
        if (token.isBlank()) return
        thread {
            val result = apiClient.getLatestPttText(token, channelId)
            runOnUiThread {
                result.onSuccess { message ->
                    tvMiniDisplay.text = if (message == null) "-" else "${message.userId}: ${message.text}"
                }.onFailure {
                    tvSignalStatus.text = "Signal: latest text sync failed"
                }
            }
        }
    }

    private fun confirmAndUploadPhoto(bitmap: Bitmap) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Kirim Foto")
            .setMessage("Kirim foto ini ke channel ${selectedChannel()}?")
            .setNegativeButton("Batal", null)
            .setPositiveButton("Kirim") { _, _ -> uploadPhoto(bitmap) }
            .show()
    }

    private fun uploadPhoto(bitmap: Bitmap) {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 55, out)
        val base64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
        val token = AppConfig.token(this)
        val note = etPhotoNote.text?.toString()?.trim().orEmpty()
        val gps = currentGps()
        thread {
            val res = apiClient.uploadPttImage(
                accessToken = token,
                userId = AppConfig.userId(this),
                deviceId = AppConfig.deviceId(this),
                channelId = selectedChannel(),
                imageBase64 = base64,
                noteText = note,
                gps = gps
            )
            runOnUiThread {
                res.onSuccess {
                    tvSignalStatus.text = "Signal: image uploaded"
                    if (note.isNotBlank()) tvMiniDisplay.text = "me: $note"
                }.onFailure { tvSignalStatus.text = "Signal: upload image gagal (${it.message})" }
            }
        }
    }

    private fun currentGps(): JSONObject? {
        return runCatching {
            val lm = getSystemService(LOCATION_SERVICE) as LocationManager
            val loc: Location? = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (loc == null) null else JSONObject()
                .put("latitude", loc.latitude)
                .put("longitude", loc.longitude)
                .put("accuracyM", loc.accuracy.toDouble())
        }.getOrNull()
    }

    private fun showAboutDialog() {
        val token = AppConfig.token(this)
        if (token.isBlank()) return
        thread {
            val about = apiClient.getAbout(token)
            runOnUiThread {
                about.onSuccess {
                    androidx.appcompat.app.AlertDialog.Builder(this)
                        .setTitle("About")
                        .setMessage(
                            "Company: ${it.companyName}\n" +
                                "Server: ${it.serverName}\n" +
                                "Device: ${it.deviceId}\n" +
                                "License Expiry: ${it.expiresAt ?: "-"}\n" +
                                "Voice Mode: ${it.voiceTransportMode}\n" +
                                "Audio Profile: ${it.audioProfile?.name ?: AppConfig.audioProfileName(this)}"
                        )
                        .setPositiveButton("OK", null)
                        .show()
                }.onFailure {
                    tvSignalStatus.text = "Signal: about unavailable"
                }
            }
        }
    }

    override fun onPeerJoined(userId: String) {
        if (!isWebRtcMode()) return
        val me = AppConfig.userId(this)
        if (userId == me) return
        if (me < userId) {
            ensureWebRtcEngine()
            webRtcEngine?.ensurePeerConnection()
            currentPeerUserId = userId
            webRtcEngine?.createOffer { desc ->
                signalingClient?.sendWebRtcOffer(userId, desc.type.canonicalForm(), desc.description)
            }
        }
    }

    override fun onJoinAck(peers: List<String>) {
        if (!isWebRtcMode()) return
        val me = AppConfig.userId(this)
        val peer = peers.filter { it.isNotBlank() && it != me }.sorted().firstOrNull { me < it } ?: return
        ensureWebRtcEngine()
        webRtcEngine?.ensurePeerConnection()
        currentPeerUserId = peer
        webRtcEngine?.createOffer { desc ->
            signalingClient?.sendWebRtcOffer(peer, desc.type.canonicalForm(), desc.description)
        }
    }

    override fun onWebRtcOffer(fromUserId: String, sdpType: String, sdp: String) {
        if (!isWebRtcMode()) return
        ensureWebRtcEngine()
        webRtcEngine?.ensurePeerConnection()
        currentPeerUserId = fromUserId
        webRtcEngine?.setRemoteDescription(sdpType, sdp)
        webRtcEngine?.createAnswer { desc ->
            signalingClient?.sendWebRtcAnswer(fromUserId, desc.type.canonicalForm(), desc.description)
        }
    }

    override fun onWebRtcAnswer(fromUserId: String, sdpType: String, sdp: String) {
        if (!isWebRtcMode()) return
        currentPeerUserId = fromUserId
        webRtcEngine?.setRemoteDescription(sdpType, sdp)
    }

    override fun onWebRtcIce(fromUserId: String, candidate: JSONObject) {
        if (!isWebRtcMode()) return
        currentPeerUserId = fromUserId
        webRtcEngine?.addRemoteIce(candidate)
    }

    private fun startVoiceRecording() {
        if (mediaRecorder != null) return
        val output = File(cacheDir, "ptt-${System.currentTimeMillis()}.m4a")
        currentVoiceFile = output
        currentVoiceStartMs = System.currentTimeMillis()
        val memoryClass = (getSystemService(ACTIVITY_SERVICE) as ActivityManager).memoryClass
        val lowEndMode = memoryClass <= 128
        runCatching {
            val recorder = MediaRecorder()
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setAudioSamplingRate(if (lowEndMode) 12000 else 16000)
            recorder.setAudioEncodingBitRate(if (lowEndMode) 24000 else 48000)
            recorder.setAudioChannels(1)
            recorder.setOutputFile(output.absolutePath)
            recorder.prepare()
            recorder.start()
            mediaRecorder = recorder
        }.onFailure {
            tvSignalStatus.text = "Signal: start voice record gagal (${it.message})"
            stopVoiceRecordingInternal()
        }
    }

    private fun stopAndUploadVoiceRecording(channelId: String) {
        val token = AppConfig.token(this)
        val userId = AppConfig.userId(this)
        val deviceId = AppConfig.deviceId(this)
        val file = currentVoiceFile
        stopVoiceRecordingInternal()
        if (token.isBlank() || userId.isBlank() || deviceId.isBlank() || file == null || !file.exists()) return
        val duration = (System.currentTimeMillis() - currentVoiceStartMs).toInt().coerceAtLeast(0)
        thread {
            val bytes = runCatching { file.readBytes() }.getOrNull()
            if (bytes == null || bytes.isEmpty()) {
                runOnUiThread { tvSignalStatus.text = "Signal: voice kosong, tidak diupload" }
                runCatching { file.delete() }
                return@thread
            }
            val upload = apiClient.uploadPttVoice(
                accessToken = token,
                userId = userId,
                deviceId = deviceId,
                channelId = channelId,
                audioBytes = bytes,
                mimeType = "audio/mp4",
                durationMs = duration
            )
            runOnUiThread {
                upload.onSuccess {
                    tvSignalStatus.text = "Signal: voice uploaded"
                }.onFailure {
                    tvSignalStatus.text = "Signal: voice upload gagal (${it.message})"
                }
            }
            runCatching { file.delete() }
        }
    }

    private fun stopVoiceRecordingInternal() {
        val recorder = mediaRecorder ?: return
        runCatching { recorder.stop() }
        runCatching { recorder.reset() }
        runCatching { recorder.release() }
        mediaRecorder = null
    }

    private fun playRogerBeepIfEnabled() {
        if (!AppConfig.rogerBeepEnabled(this)) return
        runCatching {
            val hz = AppConfig.rogerBeepHz(this).coerceIn(300, 3000)
            val ms = AppConfig.rogerBeepMs(this).coerceIn(40, 500)
            val toneType = when {
                hz >= 1500 -> ToneGenerator.TONE_DTMF_D
                hz >= 900 -> ToneGenerator.TONE_DTMF_0
                else -> ToneGenerator.TONE_DTMF_8
            }
            val tg = ToneGenerator(AudioManager.STREAM_MUSIC, 65)
            try {
                tg.startTone(toneType, ms)
            } finally {
                tg.release()
            }
        }
    }
}
