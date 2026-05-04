package com.poc.radio.net

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

class SignalingClient(
    private val wsUrl: String,
    private val userId: String,
    private val deviceId: String,
    private val channelIdProvider: () -> String,
    private val callback: Callback
) {
    interface Callback {
        fun onStatus(status: String)
        fun onFloorHolder(userId: String?)
        fun onPttTextMessage(userId: String?, text: String)
        fun onPttImageMessage(userId: String?, imageUrl: String, noteText: String)
        fun onError(message: String)
    }

    private val httpClient = OkHttpClient()
    private var ws: WebSocket? = null

    fun connect() {
        callback.onStatus("connecting")
        ws = httpClient.newWebSocket(
            Request.Builder().url(wsUrl).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    callback.onStatus("connected")
                    switchChannel(channelIdProvider())
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    callback.onStatus("failed")
                    callback.onError(t.message ?: "websocket failed")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    callback.onStatus("closed")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching {
                        val msg = JSONObject(text)
                        when (msg.optString("type")) {
                            "floor_granted", "floor_state", "floor_busy" -> {
                                val holder = msg.optJSONObject("holder")
                                callback.onFloorHolder(holder?.optString("userId"))
                            }
                            "floor_released" -> callback.onFloorHolder(null)
                            "ptt_text" -> {
                                val sender = if (msg.has("userId")) msg.optString("userId") else null
                                callback.onPttTextMessage(sender, msg.optString("text", ""))
                            }
                            "ptt_image" -> {
                                val sender = if (msg.has("userId")) msg.optString("userId") else null
                                callback.onPttImageMessage(
                                    sender,
                                    msg.optString("imageUrl", ""),
                                    msg.optString("noteText", "")
                                )
                            }
                            "error" -> callback.onError(msg.optString("message", "signaling error"))
                        }
                    }.onFailure { callback.onError(it.message ?: "parse error") }
                }
            }
        )
    }

    fun requestTalk(channelId: String) {
        ws?.send(
            JSONObject()
                .put("type", "request_talk")
                .put("userId", userId)
                .put("channelId", channelId)
                .toString()
        )
    }

    fun releaseTalk(channelId: String) {
        ws?.send(
            JSONObject()
                .put("type", "release_talk")
                .put("userId", userId)
                .put("channelId", channelId)
                .toString()
        )
    }

    fun close() {
        ws?.close(1000, "bye")
        ws = null
        callback.onStatus("disconnected")
    }

    fun switchChannel(channelId: String) {
        ws?.send(
            JSONObject()
                .put("type", "join_channel")
                .put("userId", userId)
                .put("deviceId", deviceId)
                .put("channelId", channelId)
                .toString()
        )
        ws?.send(
            JSONObject()
                .put("type", "floor_state")
                .put("channelId", channelId)
                .toString()
        )
    }

    fun sendPttText(channelId: String, text: String) {
        ws?.send(
            JSONObject()
                .put("type", "ptt_text")
                .put("userId", userId)
                .put("channelId", channelId)
                .put("text", text)
                .toString()
        )
    }
}
