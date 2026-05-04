package com.poc.radio

import android.content.Context

object AppConfig {
    private const val PREFS = "poc_radio_prefs"
    private const val KEY_HTTP_BASE = "http_base_url"
    private const val KEY_WS_URL = "ws_url"
    private const val KEY_TOKEN = "access_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_BEACON_ENABLED = "beacon_enabled"
    private const val KEY_BEACON_INTERVAL_MIN = "beacon_interval_min"
    private const val KEY_BEACON_DISTANCE_KM = "beacon_distance_km"
    private const val KEY_BEACON_MODE = "beacon_mode"
    private const val KEY_BEACON_BATCH_SIZE = "beacon_batch_size"
    private const val KEY_BEACON_BATCH_WAIT_MIN = "beacon_batch_wait_min"
    private const val KEY_BEACON_NORMAL_SEND_MIN = "beacon_normal_send_min"

    fun httpBaseUrl(context: Context): String =
        prefs(context).getString(KEY_HTTP_BASE, "http://10.0.2.2:3100") ?: "http://10.0.2.2:3100"

    fun wsUrl(context: Context): String =
        prefs(context).getString(KEY_WS_URL, "ws://10.0.2.2:3100/ws/signaling")
            ?: "ws://10.0.2.2:3100/ws/signaling"

    fun setServer(context: Context, httpBaseUrl: String, wsUrl: String) {
        prefs(context).edit()
            .putString(KEY_HTTP_BASE, httpBaseUrl.trim().removeSuffix("/"))
            .putString(KEY_WS_URL, wsUrl.trim())
            .apply()
    }

    fun saveSession(
        context: Context,
        token: String,
        userId: String,
        deviceId: String,
        beaconEnabled: Boolean = false,
        beaconIntervalMin: Int = 15,
        beaconDistanceKm: Double = 1.0,
        beaconMode: String = "normal",
        beaconBatchSize: Int = 50,
        beaconBatchMaxWaitMin: Int = 120,
        beaconNormalSendMin: Int = 60
    ) {
        prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_DEVICE_ID, deviceId)
            .putBoolean(KEY_BEACON_ENABLED, beaconEnabled)
            .putInt(KEY_BEACON_INTERVAL_MIN, beaconIntervalMin.coerceIn(1, 120))
            .putString(KEY_BEACON_DISTANCE_KM, beaconDistanceKm.toString())
            .putString(KEY_BEACON_MODE, if (beaconMode == "eco") "eco" else "normal")
            .putInt(KEY_BEACON_BATCH_SIZE, beaconBatchSize.coerceIn(10, 500))
            .putInt(KEY_BEACON_BATCH_WAIT_MIN, beaconBatchMaxWaitMin.coerceIn(10, 720))
            .putInt(KEY_BEACON_NORMAL_SEND_MIN, beaconNormalSendMin.coerceIn(5, 240))
            .apply()
    }

    fun token(context: Context): String = prefs(context).getString(KEY_TOKEN, "") ?: ""
    fun userId(context: Context): String = prefs(context).getString(KEY_USER_ID, "") ?: ""
    fun deviceId(context: Context): String = prefs(context).getString(KEY_DEVICE_ID, "") ?: ""
    fun beaconEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_BEACON_ENABLED, false)
    fun beaconIntervalMin(context: Context): Int = prefs(context).getInt(KEY_BEACON_INTERVAL_MIN, 15)
    fun beaconDistanceKm(context: Context): Double =
        (prefs(context).getString(KEY_BEACON_DISTANCE_KM, "1.0") ?: "1.0").toDoubleOrNull() ?: 1.0
    fun beaconMode(context: Context): String = prefs(context).getString(KEY_BEACON_MODE, "normal") ?: "normal"
    fun beaconBatchSize(context: Context): Int = prefs(context).getInt(KEY_BEACON_BATCH_SIZE, 50)
    fun beaconBatchWaitMin(context: Context): Int = prefs(context).getInt(KEY_BEACON_BATCH_WAIT_MIN, 120)
    fun beaconNormalSendMin(context: Context): Int = prefs(context).getInt(KEY_BEACON_NORMAL_SEND_MIN, 60)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
