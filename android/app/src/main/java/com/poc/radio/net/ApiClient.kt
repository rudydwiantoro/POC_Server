package com.poc.radio.net

import android.content.Context
import android.content.Intent
import android.net.Uri
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
    data class ActivationCheckResult(
        val activated: Boolean,
        val reason: String
    )
    data class LoginResult(
        val accessToken: String,
        val role: String,
        val userId: String,
        val deviceId: String,
        val beaconEnabled: Boolean,
        val beaconIntervalMin: Int,
        val beaconDistanceKm: Double,
        val beaconMode: String,
        val beaconBatchSize: Int,
        val beaconBatchMaxWaitMin: Int,
        val beaconNormalSendMin: Int
    )
    data class PttTextMessage(val userId: String, val text: String, val createdAt: String)
    data class VoiceHistory(val channelId: String, val audioUrl: String, val createdAt: String)
    data class ImageHistory(val channelId: String, val imageUrl: String, val noteText: String, val createdAt: String)
    data class MyHistory(val voice: List<VoiceHistory>, val images: List<ImageHistory>)
    data class AboutInfo(
        val companyName: String,
        val serverName: String,
        val expiresAt: String?,
        val deviceId: String
    )

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
                deviceId = user.optString("deviceId", deviceId),
                beaconEnabled = user.optJSONObject("beacon")?.optBoolean("enabled", false) ?: false,
                beaconIntervalMin = user.optJSONObject("beacon")?.optInt("intervalMin", 15) ?: 15,
                beaconDistanceKm = user.optJSONObject("beacon")?.optDouble("distanceKm", 1.0) ?: 1.0,
                beaconMode = user.optJSONObject("beacon")?.optString("mode", "normal") ?: "normal",
                beaconBatchSize = user.optJSONObject("beacon")?.optInt("batchSize", 50) ?: 50,
                beaconBatchMaxWaitMin = user.optJSONObject("beacon")?.optInt("batchMaxWaitMin", 120) ?: 120,
                beaconNormalSendMin = user.optJSONObject("beacon")?.optInt("normalSendMin", 60) ?: 60
            )
        }
    }

    fun sendBeaconLocation(
        accessToken: String,
        deviceId: String,
        lat: Double,
        lon: Double,
        accuracy: Double?,
        timestampIso: String? = null
    ): Result<Unit> = runCatching {
        val payload = JSONObject()
            .put("deviceId", deviceId)
            .put("lat", lat)
            .put("lon", lon)
            .put("accuracy", accuracy)
            .put("timestamp", timestampIso ?: java.time.Instant.now().toString())
            .toString()
        val req = Request.Builder()
            .url("$baseUrl/api/location/update")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Send beacon failed (${resp.code}): $body")
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

    fun uploadPttImage(
        accessToken: String,
        userId: String,
        deviceId: String,
        channelId: String,
        imageBase64: String,
        noteText: String,
        gps: JSONObject?
    ): Result<String> = runCatching {
        val payload = JSONObject()
            .put("userId", userId)
            .put("deviceId", deviceId)
            .put("channelId", channelId)
            .put("mimeType", "image/jpeg")
            .put("imageBase64", imageBase64)
            .put("noteText", noteText)
            .put("gps", gps)
            .toString()
        val req = Request.Builder()
            .url("$baseUrl/api/ptt/floor/messages/image")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Upload image failed (${resp.code}): $body")
            JSONObject(body).getJSONObject("message").optString("imageUrl", "")
        }
    }

    fun getMyHistory(accessToken: String, userId: String, limit: Int): Result<MyHistory> = runCatching {
        val req = Request.Builder()
            .url("$baseUrl/api/dispatch/staff/${URLEncoder.encode(userId, StandardCharsets.UTF_8.toString())}/messages?limit=$limit")
            .get()
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Get history failed (${resp.code}): $body")
            val root = JSONObject(body)
            val voice = mutableListOf<VoiceHistory>()
            val voiceArr = root.optJSONArray("messages")
            if (voiceArr != null) {
                for (i in 0 until voiceArr.length()) {
                    val v = voiceArr.getJSONObject(i)
                    voice += VoiceHistory(v.optString("channelId"), v.optString("audioUrl"), v.optString("createdAt"))
                }
            }
            val images = mutableListOf<ImageHistory>()
            val imgArr = root.optJSONArray("images")
            if (imgArr != null) {
                for (i in 0 until imgArr.length()) {
                    val v = imgArr.getJSONObject(i)
                    images += ImageHistory(v.optString("channelId"), v.optString("imageUrl"), v.optString("noteText"), v.optString("createdAt"))
                }
            }
            MyHistory(voice, images)
        }
    }

    fun openImageInBrowser(context: Context, imageUrl: String) {
        val u = if (imageUrl.startsWith("http")) imageUrl else "${baseUrl.removeSuffix("/")}$imageUrl"
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)))
    }

    fun checkActivation(userId: String, deviceId: String): Result<ActivationCheckResult> = runCatching {
        val payload = JSONObject()
            .put("userId", userId)
            .put("deviceId", deviceId)
            .toString()
        val req = Request.Builder()
            .url("$baseUrl/api/auth/activation/check")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("Activation check failed (${resp.code}): $body")
            val root = JSONObject(body)
            ActivationCheckResult(
                activated = root.optBoolean("activated", false),
                reason = root.optString("reason", "unknown")
            )
        }
    }

    fun getAbout(accessToken: String): Result<AboutInfo> = runCatching {
        val req = Request.Builder()
            .url("$baseUrl/api/dispatch/about")
            .get()
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        httpClient.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("About failed (${resp.code}): $body")
            val root = JSONObject(body)
            AboutInfo(
                companyName = root.optString("companyName", "-"),
                serverName = root.optString("serverName", "-"),
                expiresAt = if (root.isNull("expiresAt")) null else root.optString("expiresAt"),
                deviceId = root.optString("deviceId", "-")
            )
        }
    }
}
