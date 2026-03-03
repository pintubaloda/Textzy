package com.textzy.mobile.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TextzyApi(private val baseUrl: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private fun req(path: String, method: String = "GET", body: JSONObject? = null, session: SessionState? = null, includeTenant: Boolean = false): Request {
        val builder = Request.Builder().url("$baseUrl$path")
        if (session?.accessToken?.isNotBlank() == true) builder.addHeader("Authorization", "Bearer ${session.accessToken}")
        if (session?.csrfToken?.isNotBlank() == true && method in listOf("POST", "PUT", "PATCH", "DELETE")) builder.addHeader("X-CSRF-Token", session.csrfToken)
        if (includeTenant && session?.tenantSlug?.isNotBlank() == true) builder.addHeader("X-Tenant-Slug", session.tenantSlug)
        if (body != null) builder.addHeader("Content-Type", "application/json")

        val requestBody = body?.toString()?.toRequestBody(jsonMedia)
        when (method) {
            "POST" -> builder.post(requestBody ?: "{}".toRequestBody(jsonMedia))
            "PUT" -> builder.put(requestBody ?: "{}".toRequestBody(jsonMedia))
            "PATCH" -> builder.patch(requestBody ?: "{}".toRequestBody(jsonMedia))
            "DELETE" -> if (requestBody != null) builder.delete(requestBody) else builder.delete()
            else -> builder.get()
        }
        return builder.build()
    }

    private fun execute(request: Request): okhttp3.Response {
        return client.newCall(request).execute()
    }

    fun login(email: String, password: String): SessionState {
        val payload = JSONObject().put("email", email).put("password", password)
        val response = execute(req("/api/auth/login", "POST", payload, null, false))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Login failed" })
            val bodyText = res.body?.string().orEmpty()
            val bodyJson = if (bodyText.isNotBlank()) JSONObject(bodyText) else JSONObject()
            val accessToken = bodyJson.optString("accessToken").ifBlank {
                res.header("X-Access-Token").orEmpty().ifBlank {
                    res.header("Authorization").orEmpty().removePrefix("Bearer ").trim()
                }
            }
            val csrf = res.header("X-CSRF-Token").orEmpty()
            if (accessToken.isBlank()) throw IllegalStateException("Missing access token")
            return SessionState(accessToken = accessToken, csrfToken = csrf, email = email)
        }
    }

    fun projects(session: SessionState): List<ProjectItem> {
        val response = execute(req("/api/auth/projects", "GET", null, session, false))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Projects failed" })
            val arr = JSONArray(res.body?.string().orEmpty().ifBlank { "[]" })
            return (0 until arr.length()).map { i ->
                val it = arr.getJSONObject(i)
                ProjectItem(
                    slug = it.optString("slug"),
                    name = it.optString("name"),
                    role = it.optString("role")
                )
            }
        }
    }

    fun switchProject(session: SessionState, slug: String): SessionState {
        val payload = JSONObject().put("slug", slug)
        val response = execute(req("/api/auth/switch-project", "POST", payload, session, false))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Switch project failed" })
            val body = JSONObject(res.body?.string().orEmpty().ifBlank { "{}" })
            val token = body.optString("accessToken").ifBlank { res.header("X-Access-Token").orEmpty() }
            val csrf = res.header("X-CSRF-Token").orEmpty().ifBlank { session.csrfToken }
            return session.copy(
                accessToken = token.ifBlank { session.accessToken },
                csrfToken = csrf,
                tenantSlug = body.optString("tenantSlug", slug),
                role = body.optString("role", session.role)
            )
        }
    }

    fun pairExchange(apiBaseUrl: String, pairingToken: String, installId: String, appVersion: String): SessionState {
        val pairApi = TextzyApi(apiBaseUrl)
        val payload = JSONObject()
            .put("pairingToken", pairingToken)
            .put("installId", installId)
            .put("deviceName", android.os.Build.MODEL ?: "Android")
            .put("devicePlatform", "android")
            .put("deviceModel", android.os.Build.MODEL ?: "")
            .put("osVersion", android.os.Build.VERSION.RELEASE ?: "")
            .put("appVersion", appVersion)

        val response = pairApi.execute(pairApi.req("/api/public/mobile/pair/exchange", "POST", payload, null, false))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Pair exchange failed" })
            val body = JSONObject(res.body?.string().orEmpty())
            return SessionState(
                accessToken = body.optString("accessToken"),
                csrfToken = body.optString("csrfToken"),
                tenantSlug = body.optString("tenantSlug"),
                email = body.optJSONObject("user")?.optString("email").orEmpty(),
                role = body.optString("role")
            )
        }
    }

    fun conversations(session: SessionState): List<ConversationItem> {
        val response = execute(req("/api/inbox/conversations?take=100", "GET", null, session, true))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Conversations failed" })
            val arr = JSONArray(res.body?.string().orEmpty().ifBlank { "[]" })
            return (0 until arr.length()).map { i ->
                val it = arr.getJSONObject(i)
                ConversationItem(
                    id = it.optString("id"),
                    customerName = it.optString("customerName"),
                    customerPhone = it.optString("customerPhone"),
                    status = it.optString("status")
                )
            }
        }
    }

    fun messages(session: SessionState, conversationId: String): List<MessageItem> {
        val response = execute(req("/api/inbox/conversations/$conversationId/messages?take=80", "GET", null, session, true))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Messages failed" })
            val arr = JSONArray(res.body?.string().orEmpty().ifBlank { "[]" })
            return (0 until arr.length()).map { i ->
                val it = arr.getJSONObject(i)
                MessageItem(
                    id = it.optString("id"),
                    body = it.optString("body"),
                    status = it.optString("status"),
                    createdAtUtc = it.optString("createdAtUtc")
                )
            }
        }
    }

    fun sendMessage(session: SessionState, recipient: String, text: String) {
        val payload = JSONObject()
            .put("recipient", recipient)
            .put("body", text)
            .put("channel", "whatsapp")
            .put("idempotencyKey", "android-${System.currentTimeMillis()}")

        val request = req("/api/messages/send", "POST", payload, session, true).newBuilder()
            .addHeader("Idempotency-Key", "android-${System.currentTimeMillis()}")
            .build()
        val response = execute(request)
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Send failed" })
        }
    }

    fun sendTelemetry(session: SessionState, eventType: String, data: JSONObject) {
        val payload = JSONObject()
            .put("eventType", eventType)
            .put("data", data)
        val response = execute(req("/api/mobile/telemetry", "POST", payload, session, false))
        response.use { res ->
            if (!res.isSuccessful) throw IllegalStateException(res.body?.string().orEmpty().ifBlank { "Telemetry failed" })
        }
    }
}
