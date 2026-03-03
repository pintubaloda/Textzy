package com.textzy.mobile

import android.Manifest
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.google.android.gms.location.LocationServices
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.textzy.mobile.data.ConversationItem
import com.textzy.mobile.data.MessageItem
import com.textzy.mobile.data.ProjectItem
import com.textzy.mobile.data.SessionState
import com.textzy.mobile.data.SessionStore
import com.textzy.mobile.data.TextzyApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore(this)
        setContent {
            MaterialTheme {
                Surface(color = Color(0xFFF3F4F6)) {
                    TextzyMobileApp(this, store)
                }
            }
        }
    }
}

private enum class Screen { LOGIN, PROJECTS, INBOX, CHAT }

private val Orange = Color(0xFFF97316)
private val Navy = Color(0xFF111827)
private val Muted = Color(0xFF6B7280)
private val BubbleSent = Color(0xFFFFEDD5)
private val BubbleRecv = Color.White

@Composable
private fun TextzyMobileApp(context: Context, store: SessionStore) {
    val scope = rememberCoroutineScope()
    var apiBaseUrl by remember { mutableStateOf("https://textzy-backend-production.up.railway.app") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    var loginTab by remember { mutableStateOf(0) }

    var session by remember { mutableStateOf(store.readSession()) }
    var screen by remember { mutableStateOf(if (session.accessToken.isNotBlank()) Screen.PROJECTS else Screen.LOGIN) }

    val projects = remember { mutableStateListOf<ProjectItem>() }
    val conversations = remember { mutableStateListOf<ConversationItem>() }
    val messages = remember { mutableStateListOf<MessageItem>() }
    var selectedConversation by remember { mutableStateOf<ConversationItem?>(null) }
    var composeText by remember { mutableStateOf("") }

    fun fail(t: Throwable, fallback: String) {
        error = t.message?.takeIf { it.isNotBlank() } ?: fallback
        Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
    }

    fun loadProjects() {
        scope.launch {
            isBusy = true
            try {
                val loaded = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).projects(session) }
                projects.clear()
                projects.addAll(loaded)
                if (loaded.size == 1) {
                    val switched = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).switchProject(session, loaded.first().slug) }
                    session = switched
                    store.saveSession(switched)
                    val convs = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).conversations(switched) }
                    conversations.clear()
                    conversations.addAll(convs)
                    screen = Screen.INBOX
                } else {
                    screen = Screen.PROJECTS
                }
            } catch (t: Throwable) {
                fail(t, "Failed to load projects")
            } finally {
                isBusy = false
            }
        }
    }

    fun loadConversations() {
        scope.launch {
            isBusy = true
            try {
                val convs = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).conversations(session) }
                conversations.clear()
                conversations.addAll(convs)
            } catch (t: Throwable) {
                fail(t, "Failed to load conversations")
            } finally {
                isBusy = false
            }
        }
    }

    fun openConversation(c: ConversationItem) {
        scope.launch {
            isBusy = true
            try {
                selectedConversation = c
                val rows = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).messages(session, c.id) }
                messages.clear()
                messages.addAll(rows)
                screen = Screen.CHAT
            } catch (t: Throwable) {
                fail(t, "Failed to load messages")
            } finally {
                isBusy = false
            }
        }
    }

    val scannerLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: return@rememberLauncherForActivityResult
        scope.launch {
            isBusy = true
            try {
                val parsed = parsePairPayload(raw)
                val pairApiBase = parsed.optString("apiBaseUrl").ifBlank { apiBaseUrl }
                val pairingToken = parsed.optString("token").ifBlank { raw }
                val next = withContext(Dispatchers.IO) {
                    TextzyApi(pairApiBase).pairExchange(
                        apiBaseUrl = pairApiBase,
                        pairingToken = pairingToken,
                        installId = store.installId(),
                        appVersion = "1.0.0"
                    )
                }
                session = next
                store.saveSession(next)
                apiBaseUrl = pairApiBase
                error = ""
                loadProjects()
            } catch (t: Throwable) {
                fail(t, "QR pairing failed")
            } finally {
                isBusy = false
            }
        }
    }

    val attachImageVideo = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null || selectedConversation == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val file = readFileFromUri(context, uri)
                val mediaType = resolveMediaType(file.mimeType)
                withContext(Dispatchers.IO) {
                    TextzyApi(apiBaseUrl).uploadWhatsAppMedia(
                        session = session,
                        recipient = selectedConversation!!.customerPhone,
                        fileName = file.fileName,
                        mimeType = file.mimeType,
                        bytes = file.bytes,
                        mediaType = mediaType,
                        caption = ""
                    )
                }
                openConversation(selectedConversation!!)
            } catch (t: Throwable) {
                fail(t, "Attachment failed")
            }
        }
    }

    val attachAudio = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null || selectedConversation == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val file = readFileFromUri(context, uri)
                withContext(Dispatchers.IO) {
                    TextzyApi(apiBaseUrl).uploadWhatsAppMedia(
                        session = session,
                        recipient = selectedConversation!!.customerPhone,
                        fileName = file.fileName,
                        mimeType = file.mimeType,
                        bytes = file.bytes,
                        mediaType = "audio",
                        caption = ""
                    )
                }
                openConversation(selectedConversation!!)
            } catch (t: Throwable) {
                fail(t, "Voice upload failed")
            }
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted || selectedConversation == null) {
            Toast.makeText(context, "Location permission denied", Toast.LENGTH_SHORT).show()
            return@rememberLauncherForActivityResult
        }
        val fused = LocationServices.getFusedLocationProviderClient(context)
        fused.lastLocation
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    Toast.makeText(context, "Unable to fetch location", Toast.LENGTH_SHORT).show()
                    return@addOnSuccessListener
                }
                val locationText = "Location: https://maps.google.com/?q=${loc.latitude},${loc.longitude}"
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).sendMessage(session, selectedConversation!!.customerPhone, locationText) }
                        openConversation(selectedConversation!!)
                    } catch (t: Throwable) {
                        fail(t, "Location send failed")
                    }
                }
            }
            .addOnFailureListener {
                Toast.makeText(context, "Location not available", Toast.LENGTH_SHORT).show()
            }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) {
            Toast.makeText(context, "Microphone permission denied", Toast.LENGTH_SHORT).show()
            return@rememberLauncherForActivityResult
        }
        attachAudio.launch(arrayOf("audio/*"))
    }

    LaunchedEffect(session.accessToken) {
        if (session.accessToken.isNotBlank() && screen == Screen.PROJECTS && projects.isEmpty()) loadProjects()
    }

    Scaffold(
        topBar = {
            if (screen == Screen.INBOX || screen == Screen.CHAT) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Navy)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (screen == Screen.CHAT) {
                        IconButton(onClick = { screen = Screen.INBOX }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Textzy", color = Color.White, fontWeight = FontWeight.Bold)
                        Text(
                            if (screen == Screen.CHAT) selectedConversation?.customerName?.ifBlank { selectedConversation?.customerPhone ?: "" } ?: "" else "Inbox",
                            color = Color(0xFFD1D5DB),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    IconButton(onClick = {
                        store.clear()
                        session = SessionState()
                        projects.clear()
                        conversations.clear()
                        messages.clear()
                        selectedConversation = null
                        composeText = ""
                        screen = Screen.LOGIN
                    }) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout", tint = Color.White)
                    }
                }
            }
        }
    ) { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (error.isNotBlank()) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            if (isBusy) {
                Text("Loading...", color = Muted)
            }

            when (screen) {
                Screen.LOGIN -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Textzy Mobile", style = MaterialTheme.typography.headlineSmall, color = Navy)
                        OutlinedTextField(value = apiBaseUrl, onValueChange = { apiBaseUrl = it }, label = { Text("API Base URL") }, modifier = Modifier.fillMaxWidth())

                        TabRow(selectedTabIndex = loginTab) {
                            Tab(selected = loginTab == 0, onClick = { loginTab = 0 }, text = { Text("Email Login") })
                            Tab(selected = loginTab == 1, onClick = { loginTab = 1 }, text = { Text("Scan QR") })
                        }

                        if (loginTab == 0) {
                            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(
                                value = password,
                                onValueChange = { password = it },
                                label = { Text("Password") },
                                visualTransformation = PasswordVisualTransformation(),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Button(
                                onClick = {
                                    scope.launch {
                                        isBusy = true
                                        try {
                                            val next = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).login(email.trim(), password) }
                                            session = next
                                            store.saveSession(next)
                                            withContext(Dispatchers.IO) {
                                                TextzyApi(apiBaseUrl).sendTelemetry(
                                                    next,
                                                    "login_success",
                                                    JSONObject().put("installId", store.installId()).put("appVersion", "1.0.0")
                                                )
                                            }
                                            loadProjects()
                                        } catch (t: Throwable) {
                                            fail(t, "Login failed")
                                        } finally {
                                            isBusy = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isBusy && email.isNotBlank() && password.isNotBlank()
                            ) { Text("Sign In") }
                        } else {
                            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7ED))) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Scan QR from Textzy web desktop", fontWeight = FontWeight.SemiBold)
                                    Text("Open Connect Mobile on web and scan here.", color = Muted)
                                    Button(onClick = {
                                        val options = ScanOptions().apply {
                                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                                            setPrompt("Scan QR from Textzy desktop")
                                            setBeepEnabled(true)
                                            setOrientationLocked(false)
                                        }
                                        scannerLauncher.launch(options)
                                    }, modifier = Modifier.fillMaxWidth()) {
                                        Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                                        Spacer(Modifier.size(8.dp))
                                        Text("Start QR Scan")
                                    }
                                }
                            }
                        }
                    }
                }

                Screen.PROJECTS -> {
                    Text("Select Project", style = MaterialTheme.typography.headlineSmall, color = Navy)
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(projects) { p ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(containerColor = Color.White)
                            ) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(p.name, style = MaterialTheme.typography.titleMedium)
                                    Text("/${p.slug} • ${p.role}", color = Muted)
                                    Button(onClick = {
                                        scope.launch {
                                            isBusy = true
                                            try {
                                                val next = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).switchProject(session, p.slug) }
                                                session = next
                                                store.saveSession(next)
                                                val convs = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).conversations(next) }
                                                conversations.clear()
                                                conversations.addAll(convs)
                                                screen = Screen.INBOX
                                            } catch (t: Throwable) {
                                                fail(t, "Switch project failed")
                                            } finally {
                                                isBusy = false
                                            }
                                        }
                                    }) { Text("Continue") }
                                }
                            }
                        }
                    }
                }

                Screen.INBOX -> {
                    Button(onClick = { loadConversations() }) { Text("Refresh") }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(conversations) { c ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { openConversation(c) },
                                colors = CardDefaults.cardColors(containerColor = Color.White)
                            ) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(c.customerName.ifBlank { c.customerPhone }, style = MaterialTheme.typography.titleMedium)
                                    Text(c.customerPhone, color = Muted)
                                    Text(c.status, color = Orange)
                                }
                            }
                        }
                    }
                }

                Screen.CHAT -> {
                    selectedConversation?.let { conv ->
                        LazyColumn(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            items(messages) { m ->
                                val mine = m.status.equals("sent", ignoreCase = true) || m.status.equals("queued", ignoreCase = true)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(if (mine) BubbleSent else BubbleRecv)
                                            .padding(horizontal = 10.dp, vertical = 8.dp)
                                    ) {
                                        Text(m.body.ifBlank { "[media]" })
                                        if (m.createdAtUtc.isNotBlank()) {
                                            Text(m.createdAtUtc.take(16), color = Muted, style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            IconButton(onClick = { attachImageVideo.launch(arrayOf("image/*", "video/*", "application/pdf")) }) {
                                Icon(Icons.Default.AttachFile, contentDescription = "Attach", tint = Orange)
                            }
                            IconButton(onClick = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }) {
                                Icon(Icons.Default.Mic, contentDescription = "Voice", tint = Orange)
                            }
                            IconButton(onClick = { locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) }) {
                                Icon(Icons.Default.LocationOn, contentDescription = "Location", tint = Orange)
                            }
                            OutlinedTextField(
                                value = composeText,
                                onValueChange = { composeText = it },
                                label = { Text("Message") },
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = {
                                val text = composeText.trim()
                                if (text.isBlank()) return@IconButton
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).sendMessage(session, conv.customerPhone, text) }
                                        composeText = ""
                                        openConversation(conv)
                                    } catch (t: Throwable) {
                                        fail(t, "Send failed")
                                    }
                                }
                            }) {
                                Icon(Icons.Default.Send, contentDescription = "Send", tint = Orange)
                            }
                        }
                        Text(
                            "Permissions are requested only when you use camera, mic, attachment, or location.",
                            color = Muted,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}

private data class FileReadResult(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray
)

private fun readFileFromUri(context: Context, uri: Uri): FileReadResult {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri).orEmpty()
    val name = queryDisplayName(context, uri).ifBlank { "upload.bin" }
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
        ?: throw IllegalStateException("Unable to read attachment")
    return FileReadResult(name, mime, bytes)
}

private fun queryDisplayName(context: Context, uri: Uri): String {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0) return c.getString(idx) ?: ""
        }
    }
    return ""
}

private fun resolveMediaType(mime: String): String {
    val value = mime.lowercase()
    return when {
        value.startsWith("image/") -> "image"
        value.startsWith("video/") -> "video"
        value.startsWith("audio/") -> "audio"
        else -> "document"
    }
}

private fun parsePairPayload(raw: String): JSONObject {
    return try {
        JSONObject(raw)
    } catch (_: Exception) {
        JSONObject().put("token", raw)
    }
}
