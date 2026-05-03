package com.poc.radio

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

class ServerConfigActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_server_config)

        val etHttp = findViewById<EditText>(R.id.etHttpBaseUrl)
        val etWs = findViewById<EditText>(R.id.etWsUrl)
        val btnSave = findViewById<Button>(R.id.btnSave)

        etHttp.setText(AppConfig.httpBaseUrl(this))
        etWs.setText(AppConfig.wsUrl(this))

        btnSave.setOnClickListener {
            AppConfig.setServer(
                context = this,
                httpBaseUrl = etHttp.text.toString(),
                wsUrl = etWs.text.toString()
            )
            finish()
        }
    }
}
