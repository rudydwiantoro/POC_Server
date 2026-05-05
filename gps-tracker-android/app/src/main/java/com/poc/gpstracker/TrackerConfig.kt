package com.poc.gpstracker

import android.content.Context
import android.provider.Settings

object TrackerConfig {
    private const val PREFS = "gps_tracker_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_AUTH_KEY = "auth_key"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_MODE = "mode"
    private const val KEY_KEEP_SEC = "keep_sec"
    private const val KEY_SUBMIT_MIN = "submit_min"

    fun serverUrl(context: Context): String =
        prefs(context).getString(KEY_SERVER_URL, "http://10.0.2.2:3100") ?: "http://10.0.2.2:3100"

    fun deviceId(context: Context): String {
        val existing = prefs(context).getString(KEY_DEVICE_ID, "") ?: ""
        if (existing.isNotBlank()) return existing
        val androidId = runCatching { Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) }.getOrNull().orEmpty()
        return if (androidId.isNotBlank()) "gps-$androidId" else "gps-unknown"
    }

    fun authKey(context: Context): String = prefs(context).getString(KEY_AUTH_KEY, "") ?: ""
    fun enabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)
    fun mode(context: Context): String = prefs(context).getString(KEY_MODE, "standard") ?: "standard"
    fun keepSec(context: Context): Int = prefs(context).getInt(KEY_KEEP_SEC, 30)
    fun submitMin(context: Context): Int = prefs(context).getInt(KEY_SUBMIT_MIN, 5)

    fun save(context: Context, serverUrl: String, deviceId: String, authKey: String, mode: String, keepSec: Int, submitMin: Int) {
        prefs(context).edit()
            .putString(KEY_SERVER_URL, serverUrl.trim().removeSuffix("/"))
            .putString(KEY_DEVICE_ID, deviceId.trim())
            .putString(KEY_AUTH_KEY, authKey.trim())
            .putString(KEY_MODE, if (mode == "eco") "eco" else "standard")
            .putInt(KEY_KEEP_SEC, keepSec.coerceIn(5, 3600))
            .putInt(KEY_SUBMIT_MIN, submitMin.coerceIn(1, 120))
            .apply()
    }

    fun setEnabled(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, value).apply()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
