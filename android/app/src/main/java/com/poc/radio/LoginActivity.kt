package com.poc.radio

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.poc.radio.net.ApiClient
import kotlin.concurrent.thread

class LoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val tvServerInfo = findViewById<TextView>(R.id.tvServerInfo)
        val etUserId = findViewById<EditText>(R.id.etUserId)
        val etDeviceId = findViewById<EditText>(R.id.etDeviceId)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val btnConfig = findViewById<Button>(R.id.btnConfig)
        val tvStatus = findViewById<TextView>(R.id.tvStatus)

        etUserId.setText(AppConfig.userId(this))
        etDeviceId.setText(AppConfig.deviceId(this))
        etDeviceId.isEnabled = false
        etDeviceId.visibility = android.view.View.GONE
        tvServerInfo.text = "Server: ${AppConfig.httpBaseUrl(this)}"

        btnConfig.setOnClickListener {
            startActivity(Intent(this, ServerConfigActivity::class.java))
        }

        btnLogin.setOnClickListener {
            val userId = etUserId.text.toString().trim()
            val deviceId = etDeviceId.text.toString().trim().ifBlank { "android-auto" }
            if (userId.isEmpty()) {
                tvStatus.text = "Status: userId required"
                return@setOnClickListener
            }

            btnLogin.isEnabled = false
            tvStatus.text = "Status: logging in..."

            thread {
                val api = ApiClient(AppConfig.httpBaseUrl(this))
                val loginResult = api.login(userId, deviceId)
                runOnUiThread {
                    btnLogin.isEnabled = true
                    loginResult.onSuccess {
                        AppConfig.saveSession(
                            this,
                            token = it.accessToken,
                            userId = it.userId,
                            deviceId = it.deviceId,
                            beaconEnabled = it.beaconEnabled,
                            beaconIntervalMin = it.beaconIntervalMin,
                            beaconDistanceKm = it.beaconDistanceKm,
                            beaconMode = it.beaconMode,
                            beaconBatchSize = it.beaconBatchSize,
                            beaconBatchMaxWaitMin = it.beaconBatchMaxWaitMin,
                            beaconNormalSendMin = it.beaconNormalSendMin
                        )
                        tvStatus.text = "Status: login success (${it.role})"
                        startActivity(Intent(this, MainActivity::class.java))
                    }.onFailure { err ->
                        btnLogin.isEnabled = true
                        tvStatus.text = "Status: ${err.message}"
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        findViewById<TextView>(R.id.tvServerInfo).text = "Server: ${AppConfig.httpBaseUrl(this)}"
    }
}
