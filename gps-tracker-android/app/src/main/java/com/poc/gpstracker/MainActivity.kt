package com.poc.gpstracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val etServer = findViewById<EditText>(R.id.etServerUrl)
        val etDevice = findViewById<EditText>(R.id.etDeviceId)
        val etAuth = findViewById<EditText>(R.id.etAuthKey)
        val spMode = findViewById<Spinner>(R.id.spMode)
        val etKeepSec = findViewById<EditText>(R.id.etKeepSec)
        val etSubmitMin = findViewById<EditText>(R.id.etSubmitMin)
        val btnSave = findViewById<Button>(R.id.btnSave)
        val sw = findViewById<Switch>(R.id.swTracker)
        val tv = findViewById<TextView>(R.id.tvStatus)

        spMode.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("standard", "eco"))
        etServer.setText(TrackerConfig.serverUrl(this))
        etDevice.setText(TrackerConfig.deviceId(this))
        etAuth.setText(TrackerConfig.authKey(this))
        spMode.setSelection(if (TrackerConfig.mode(this) == "eco") 1 else 0)
        etKeepSec.setText(String.format("%d", TrackerConfig.keepSec(this)))
        etSubmitMin.setText(String.format("%d", TrackerConfig.submitMin(this)))
        sw.isChecked = TrackerConfig.enabled(this)
        tv.text = if (sw.isChecked) "Status: ON" else "Status: OFF"

        ensurePermissions()

        btnSave.setOnClickListener {
            TrackerConfig.save(
                this,
                etServer.text.toString(),
                etDevice.text.toString(),
                etAuth.text.toString(),
                spMode.selectedItem?.toString() ?: "standard",
                (etKeepSec.text.toString().toIntOrNull() ?: 30),
                (etSubmitMin.text.toString().toIntOrNull() ?: 5)
            )
            tv.text = "Status: setting saved"
        }

        sw.setOnCheckedChangeListener { _, isChecked ->
            TrackerConfig.setEnabled(this, isChecked)
            if (isChecked) {
                startTracker()
                tv.text = "Status: ON"
            } else {
                stopService(Intent(this, TrackerService::class.java))
                tv.text = "Status: OFF"
            }
        }
    }

    private fun startTracker() {
        val intent = Intent(this, TrackerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, intent)
        } else {
            startService(intent)
        }
    }

    private fun ensurePermissions() {
        val need = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.ACCESS_FINE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.POST_NOTIFICATIONS
        }
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 9001)
    }
}
