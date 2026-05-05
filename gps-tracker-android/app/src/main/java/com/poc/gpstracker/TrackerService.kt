package com.poc.gpstracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import kotlin.concurrent.thread

class TrackerService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val api = TrackerApiClient()
    private val ecoQueue = mutableListOf<TrackerApiClient.BeaconPoint>()
    private var lastSubmitAtMs: Long = 0L

    private val tick = object : Runnable {
        override fun run() {
            sendBeaconOnce()
            val delayMs = if (TrackerConfig.mode(this@TrackerService) == "eco") {
                (TrackerConfig.keepSec(this@TrackerService).coerceIn(5, 3600) * 1000L)
            } else {
                (TrackerConfig.submitMin(this@TrackerService).coerceIn(1, 120) * 60_000L)
            }
            handler.postDelayed(this, delayMs)
        }
    }

    override fun onBind(intent: android.content.Intent?): IBinder? = null

    override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
        createChannel()
        startForeground(2211, buildNotification("Tracker active"))
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        super.onDestroy()
    }

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, "gps_tracker_channel")
            .setContentTitle("GPS Tracker Beacon")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel("gps_tracker_channel", "GPS Tracker", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    private fun sendBeaconOnce() {
        val serverUrl = TrackerConfig.serverUrl(this)
        val deviceId = TrackerConfig.deviceId(this)
        val authKey = TrackerConfig.authKey(this)
        val mode = TrackerConfig.mode(this)
        val submitMs = TrackerConfig.submitMin(this).coerceIn(1, 120) * 60_000L
        val loc = getLastKnownLocation(this) ?: return
        val point = TrackerApiClient.BeaconPoint(
            lat = loc.latitude,
            lon = loc.longitude,
            accuracy = loc.accuracy.toDouble(),
            battery = null,
            timestamp = java.time.Instant.now().toString()
        )
        thread {
            if (mode == "eco") {
                synchronized(ecoQueue) {
                    ecoQueue.add(point)
                    val now = System.currentTimeMillis()
                    val due = lastSubmitAtMs == 0L || (now - lastSubmitAtMs) >= submitMs
                    if (due && ecoQueue.isNotEmpty()) {
                        val batch = ecoQueue.toList()
                        val sent = api.sendBeaconBatch(serverUrl, deviceId, authKey, batch)
                        if (sent.isSuccess) {
                            ecoQueue.clear()
                            lastSubmitAtMs = now
                        }
                    }
                }
            } else {
                api.sendBeacon(
                    serverUrl = serverUrl,
                    deviceId = deviceId,
                    authKey = authKey,
                    lat = point.lat,
                    lon = point.lon,
                    accuracy = point.accuracy,
                    battery = null
                )
                lastSubmitAtMs = System.currentTimeMillis()
            }
        }
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
}
