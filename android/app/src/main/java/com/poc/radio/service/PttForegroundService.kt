package com.poc.radio.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.poc.radio.AppConfig
import com.poc.radio.net.ApiClient
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.concurrent.thread

class PttForegroundService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var lastSentAtMs: Long = 0L
    private var lastSentLat: Double? = null
    private var lastSentLon: Double? = null
    private var lastQueuedAtMs: Long = 0L
    private var lastQueuedLat: Double? = null
    private var lastQueuedLon: Double? = null

    private val beaconRunnable = object : Runnable {
        override fun run() {
            runBeaconTick()
            handler.postDelayed(this, 60_000L)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.removeCallbacks(beaconRunnable)
        handler.post(beaconRunnable)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(beaconRunnable)
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PoC Radio Active")
            .setContentText("PTT standby + beacon low-power active")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PoC Radio Service",
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }
    }

    private fun runBeaconTick() {
        if (!AppConfig.beaconEnabled(this)) return
        val token = AppConfig.token(this)
        val deviceId = AppConfig.deviceId(this)
        if (token.isBlank() || deviceId.isBlank()) return

        val loc = getLastKnownLocation(this) ?: return
        val now = System.currentTimeMillis()
        val minIntervalMs = (AppConfig.beaconIntervalMin(this).coerceIn(1, 120) * 60_000L)
        val minDistanceKm = AppConfig.beaconDistanceKm(this).coerceIn(0.1, 50.0)
        val mode = if (AppConfig.beaconMode(this) == "eco") "eco" else "normal"
        val normalSendMs = AppConfig.beaconNormalSendMin(this).coerceIn(5, 240) * 60_000L
        val ecoBatchSize = AppConfig.beaconBatchSize(this).coerceIn(10, 500)
        val ecoWaitMs = AppConfig.beaconBatchWaitMin(this).coerceIn(10, 720) * 60_000L

        val elapsedEnough = lastSentAtMs == 0L || (now - lastSentAtMs) >= minIntervalMs
        val movedEnough = if (lastSentLat == null || lastSentLon == null) {
            true
        } else {
            haversineKm(lastSentLat!!, lastSentLon!!, loc.latitude, loc.longitude) >= minDistanceKm
        }
        val queuedMovedEnough = if (lastQueuedLat == null || lastQueuedLon == null) {
            true
        } else {
            haversineKm(lastQueuedLat!!, lastQueuedLon!!, loc.latitude, loc.longitude) >= minDistanceKm
        }
        val queuedElapsedEnough = lastQueuedAtMs == 0L || (now - lastQueuedAtMs) >= minIntervalMs

        if (elapsedEnough || movedEnough || queuedElapsedEnough || queuedMovedEnough) {
            enqueuePoint(
                BeaconPoint(
                    lat = loc.latitude,
                    lon = loc.longitude,
                    accuracy = loc.accuracy.toDouble(),
                    timestamp = java.time.Instant.ofEpochMilli(now).toString()
                )
            )
            lastQueuedAtMs = now
            lastQueuedLat = loc.latitude
            lastQueuedLon = loc.longitude
        }

        thread {
            val api = ApiClient(AppConfig.httpBaseUrl(this))
            val queue = loadQueue().toMutableList()
            if (queue.isEmpty()) return@thread
            val oldestMs = runCatching { java.time.Instant.parse(queue.first().timestamp).toEpochMilli() }.getOrDefault(now)
            val shouldFlush = if (mode == "eco") {
                queue.size >= ecoBatchSize || (now - oldestMs) >= ecoWaitMs
            } else {
                lastSentAtMs == 0L || (now - lastSentAtMs) >= normalSendMs
            }
            if (!shouldFlush) return@thread
            var sentCount = 0
            for (p in queue) {
                val sent = api.sendBeaconLocation(
                    accessToken = token,
                    deviceId = deviceId,
                    lat = p.lat,
                    lon = p.lon,
                    accuracy = p.accuracy,
                    timestampIso = p.timestamp
                )
                if (sent.isFailure) break
                sentCount += 1
                lastSentAtMs = now
                lastSentLat = p.lat
                lastSentLon = p.lon
            }
            if (sentCount > 0) {
                saveQueue(queue.drop(sentCount))
            }
        }
    }

    private data class BeaconPoint(
        val lat: Double,
        val lon: Double,
        val accuracy: Double?,
        val timestamp: String
    )

    private fun enqueuePoint(p: BeaconPoint) {
        val queue = loadQueue().toMutableList()
        queue.add(p)
        val trimmed = if (queue.size > 2000) queue.takeLast(2000) else queue
        saveQueue(trimmed)
    }

    private fun loadQueue(): List<BeaconPoint> {
        val raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_QUEUE, "[]") ?: "[]"
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    add(
                        BeaconPoint(
                            lat = o.optDouble("lat"),
                            lon = o.optDouble("lon"),
                            accuracy = if (o.has("accuracy")) o.optDouble("accuracy") else null,
                            timestamp = o.optString("timestamp", java.time.Instant.now().toString())
                        )
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun saveQueue(points: List<BeaconPoint>) {
        val arr = JSONArray()
        for (p in points) {
            arr.put(
                JSONObject()
                    .put("lat", p.lat)
                    .put("lon", p.lon)
                    .put("accuracy", p.accuracy)
                    .put("timestamp", p.timestamp)
            )
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_QUEUE, arr.toString()).apply()
    }

    private fun getLastKnownLocation(context: Context): Location? {
        return runCatching {
            val lm = context.getSystemService(LOCATION_SERVICE) as LocationManager
            val candidates = listOf(
                lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER),
                lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER),
                lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ).filterNotNull()
            candidates.maxByOrNull { it.time }
        }.getOrNull()
    }

    private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    companion object {
        private const val CHANNEL_ID = "poc_radio_service"
        private const val NOTIFICATION_ID = 1001
        private const val PREFS = "poc_radio_beacon"
        private const val KEY_QUEUE = "pending_queue"
    }
}
