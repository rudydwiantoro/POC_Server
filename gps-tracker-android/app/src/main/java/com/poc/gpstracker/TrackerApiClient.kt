package com.poc.gpstracker

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class TrackerApiClient(
    private val httpClient: OkHttpClient = OkHttpClient()
) {
    data class BeaconPoint(
        val lat: Double,
        val lon: Double,
        val accuracy: Double?,
        val battery: Double?,
        val timestamp: String
    )

    fun sendBeacon(
        serverUrl: String,
        deviceId: String,
        authKey: String,
        lat: Double,
        lon: Double,
        accuracy: Double?,
        battery: Double?
    ): Result<Unit> = runCatching {
        val payload = JSONObject()
            .put("deviceId", deviceId)
            .put("authKey", authKey)
            .put("lat", lat)
            .put("lon", lon)
            .put("accuracy", accuracy)
            .put("battery", battery)
            .put("timestamp", java.time.Instant.now().toString())
            .toString()
        val req = Request.Builder()
            .url("${serverUrl.removeSuffix("/")}/api/public/gps-tracker/beacon")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        httpClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("beacon failed (${resp.code})")
        }
    }

    fun sendBeaconBatch(
        serverUrl: String,
        deviceId: String,
        authKey: String,
        points: List<BeaconPoint>
    ): Result<Unit> = runCatching {
        val arr = org.json.JSONArray()
        for (p in points) {
            arr.put(
                JSONObject()
                    .put("lat", p.lat)
                    .put("lon", p.lon)
                    .put("accuracy", p.accuracy)
                    .put("battery", p.battery)
                    .put("timestamp", p.timestamp)
            )
        }
        val payload = JSONObject()
            .put("deviceId", deviceId)
            .put("authKey", authKey)
            .put("points", arr)
            .toString()
        val req = Request.Builder()
            .url("${serverUrl.removeSuffix("/")}/api/public/gps-tracker/beacon-batch")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        httpClient.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("beacon batch failed (${resp.code})")
        }
    }
}
