package com.poc.radio

import android.content.Context

object AppConfig {
    private const val PREFS = "poc_radio_prefs"
    private const val KEY_HTTP_BASE = "http_base_url"
    private const val KEY_WS_URL = "ws_url"
    private const val KEY_TOKEN = "access_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_DEVICE_ID = "device_id"

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

    fun saveSession(context: Context, token: String, userId: String, deviceId: String) {
        prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_DEVICE_ID, deviceId)
            .apply()
    }

    fun token(context: Context): String = prefs(context).getString(KEY_TOKEN, "") ?: ""
    fun userId(context: Context): String = prefs(context).getString(KEY_USER_ID, "") ?: ""
    fun deviceId(context: Context): String = prefs(context).getString(KEY_DEVICE_ID, "") ?: ""

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
