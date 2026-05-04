package com.poc.radio

import android.media.MediaPlayer
import android.os.Bundle
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.poc.radio.net.ApiClient
import kotlin.concurrent.thread

class HistoryActivity : AppCompatActivity() {
    private lateinit var container: LinearLayout
    private val apiClient by lazy { ApiClient(AppConfig.httpBaseUrl(this)) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_history)
        container = findViewById(R.id.historyContainer)
        loadHistory()
    }

    private fun loadHistory() {
        val token = AppConfig.token(this)
        val userId = AppConfig.userId(this)
        if (token.isBlank() || userId.isBlank()) return
        thread {
            val res = apiClient.getMyHistory(token, userId, 20)
            runOnUiThread {
                res.onSuccess {
                    render(it.voice, it.images)
                }.onFailure {
                    addText("Gagal load history: ${it.message}")
                }
            }
        }
    }

    private fun render(voice: List<ApiClient.VoiceHistory>, images: List<ApiClient.ImageHistory>) {
        container.removeAllViews()
        addText("Voice History")
        voice.forEach { v ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            row.addView(TextView(this).apply { text = "${v.channelId} | ${v.createdAt}" })
            row.addView(Button(this).apply {
                text = "Play Ulang"
                setOnClickListener {
                    runCatching {
                        MediaPlayer().apply {
                            setDataSource(AppConfig.httpBaseUrl(this@HistoryActivity).removeSuffix("/") + v.audioUrl)
                            prepare()
                            start()
                        }
                    }
                }
            })
            container.addView(row)
        }

        addText("Image History")
        images.forEach { img ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            row.addView(TextView(this).apply { text = "${img.channelId} | ${img.createdAt} | ${img.noteText}" })
            row.addView(Button(this).apply {
                text = "View Image"
                setOnClickListener { apiClient.openImageInBrowser(this@HistoryActivity, img.imageUrl) }
            })
            row.addView(ImageView(this).apply {
                setImageResource(android.R.drawable.ic_menu_gallery)
                setPadding(0, 0, 0, 16)
            })
            container.addView(row)
        }
    }

    private fun addText(t: String) {
        container.addView(TextView(this).apply { text = t })
    }
}
