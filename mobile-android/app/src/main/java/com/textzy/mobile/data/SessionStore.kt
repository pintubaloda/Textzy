package com.textzy.mobile.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "textzy_mobile_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveSession(state: SessionState) {
        prefs.edit()
            .putString("accessToken", state.accessToken)
            .putString("csrfToken", state.csrfToken)
            .putString("tenantSlug", state.tenantSlug)
            .putString("email", state.email)
            .putString("role", state.role)
            .apply()
    }

    fun readSession(): SessionState {
        return SessionState(
            accessToken = prefs.getString("accessToken", "") ?: "",
            csrfToken = prefs.getString("csrfToken", "") ?: "",
            tenantSlug = prefs.getString("tenantSlug", "") ?: "",
            email = prefs.getString("email", "") ?: "",
            role = prefs.getString("role", "") ?: ""
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun installId(): String {
        val existing = prefs.getString("installId", "") ?: ""
        if (existing.isNotBlank()) return existing
        val newId = "install-" + java.util.UUID.randomUUID().toString()
        prefs.edit().putString("installId", newId).apply()
        return newId
    }
}
