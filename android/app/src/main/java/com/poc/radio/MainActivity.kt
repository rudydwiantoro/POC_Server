package com.poc.radio

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
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
import com.poc.radio.service.PttForegroundService
import org.json.JSONObject
import java.io.ByteArrayOutputStream
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
    private lateinit var tvMiniDisplay: TextView
    private lateinit var tvFloorStatus: TextView
    private lateinit var tvSignalStatus: TextView
    private lateinit var apiClient: ApiClient

    private var signalingClient: SignalingClient? = null
    private var isConnected = false
    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) confirmAndUploadPhoto(bmp)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

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
                    signalingClient?.requestTalk(channelId)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
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
    }

    private fun connectSignaling() {
        startPttService()
        signalingClient = SignalingClient(
            wsUrl = AppConfig.wsUrl(this),
            userId = AppConfig.userId(this),
            channelIdProvider = { selectedChannel() },
            callback = this
        ).also { it.connect() }
    }

    private fun disconnectSignaling() {
        signalingClient?.close()
        signalingClient = null
        stopService(Intent(this, PttForegroundService::class.java))
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
        disconnectSignaling()
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
}
