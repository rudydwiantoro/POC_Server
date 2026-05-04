package com.poc.radio.net

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class ApiClient(
    private val baseUrl: String,
    private val httpClient: OkHttpClient = OkHttpClient()
) {
    data class LoginResult(val accessToken: String, val role: String, val userId: String, val deviceId: String)
    data class PttTextMessage(val userId: String, val text: String, val createdAt: String)

    fun login(userId: String, deviceId: String): Result<LoginResult> = runCatching {
        val payload = JSONObject()
            .put("userId", userId)
            .put("deviceId", deviceId)
            .toString()
        val req = Request.Builder()
            .url("$baseUrl/api/auth/login")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Login failed (${resp.code}): $body")
            val root = JSONObject(body)
            val user = root.getJSONObject("user")
            LoginResult(
                accessToken = root.getString("accessToken"),
                role = user.optString("role", "operator"),
                userId = user.optString("userId", userId),
                deviceId = user.optString("deviceId", deviceId)
            )
        }
    }

    fun getLatestPttText(accessToken: String, channelId: String): Result<PttTextMessage?> = runCatching {
        val encodedChannelId = URLEncoder.encode(channelId, StandardCharsets.UTF_8.toString())
        val req = Request.Builder()
            .url("$baseUrl/api/ptt/floor/messages/text/latest?channelId=$encodedChannelId")
            .get()
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Get latest text failed (${resp.code}): $body")
            val root = JSONObject(body)
            if (root.isNull("message")) return@use null
            val message = root.getJSONObject("message")
            PttTextMessage(
                userId = message.optString("userId", "unknown"),
                text = message.optString("text", ""),
                createdAt = message.optString("createdAt", "")
            )
        }
    }
}
