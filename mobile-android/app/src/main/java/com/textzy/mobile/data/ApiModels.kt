package com.textzy.mobile.data

data class SessionState(
    val accessToken: String = "",
    val csrfToken: String = "",
    val tenantSlug: String = "",
    val email: String = "",
    val role: String = ""
)

data class ProjectItem(
    val slug: String,
    val name: String,
    val role: String
)

data class ConversationItem(
    val id: String,
    val customerName: String,
    val customerPhone: String,
    val status: String
)

data class MessageItem(
    val id: String,
    val body: String,
    val status: String,
    val createdAtUtc: String
)

data class PairPayload(
    val apiBaseUrl: String,
    val pairingToken: String,
    val expiresAtUtc: String,
    val tenantSlug: String
)
