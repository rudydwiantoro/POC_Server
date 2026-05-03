package com.poc.radio

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.poc.radio.net.SignalingClient
import com.poc.radio.service.PttForegroundService

class MainActivity : AppCompatActivity(), SignalingClient.Callback {
    private lateinit var spChannel: Spinner
    private lateinit var btnConnect: Button
    private lateinit var btnPtt: Button
    private lateinit var tvFloorStatus: TextView
    private lateinit var tvSignalStatus: TextView

    private var signalingClient: SignalingClient? = null
    private var isConnected = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        findViewById<TextView>(R.id.tvUserInfo).text =
            "User: ${AppConfig.userId(this)} / ${AppConfig.deviceId(this)}"
        spChannel = findViewById(R.id.spChannel)
        btnConnect = findViewById(R.id.btnConnect)
        btnPtt = findViewById(R.id.btnPtt)
        tvFloorStatus = findViewById(R.id.tvFloorStatus)
        tvSignalStatus = findViewById(R.id.tvSignalStatus)

        val channels = listOf("engineering", "housekeeping", "security", "all-call")
        spChannel.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, channels)

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
}
