package com.poc.radio.net

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class ApiClient(
    private val baseUrl: String,
    private val httpClient: OkHttpClient = OkHttpClient()
) {
    data class LoginResult(val accessToken: String, val role: String, val userId: String, val deviceId: String)

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
}
