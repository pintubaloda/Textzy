package com.textzy.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
                TextzyMobileApp(store)
            }
        }
    }
}

private enum class Screen { LOGIN, PROJECTS, INBOX }

@Composable
private fun TextzyMobileApp(store: SessionStore) {
    val scope = rememberCoroutineScope()
    var apiBaseUrl by remember { mutableStateOf("https://textzy-backend-production.up.railway.app") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var session by remember { mutableStateOf(store.readSession()) }
    var screen by remember { mutableStateOf(if (session.accessToken.isNotBlank()) Screen.PROJECTS else Screen.LOGIN) }

    val projects = remember { mutableStateListOf<ProjectItem>() }
    val conversations = remember { mutableStateListOf<ConversationItem>() }
    val messages = remember { mutableStateListOf<MessageItem>() }

    var activeConversationId by remember { mutableStateOf("") }
    var activeRecipient by remember { mutableStateOf("") }
    var composeText by remember { mutableStateOf("") }

    val scannerLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val raw = result.contents ?: return@rememberLauncherForActivityResult
        scope.launch {
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
                val loadedProjects = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).projects(next) }
                projects.clear(); projects.addAll(loadedProjects)
                if (loadedProjects.size == 1) {
                    val switched = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).switchProject(next, loadedProjects.first().slug) }
                    session = switched
                    store.saveSession(switched)
                    val convs = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).conversations(switched) }
                    conversations.clear(); conversations.addAll(convs)
                    screen = Screen.INBOX
                } else {
                    screen = Screen.PROJECTS
                }
            } catch (e: Exception) {
                error = e.message ?: "QR pairing failed"
            }
        }
    }

    LaunchedEffect(session.accessToken) {
        if (session.accessToken.isBlank()) return@LaunchedEffect
        if (screen != Screen.PROJECTS) return@LaunchedEffect
        try {
            val loaded = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).projects(session) }
            projects.clear(); projects.addAll(loaded)
        } catch (e: Exception) {
            error = e.message ?: "Failed to load projects"
        }
    }

    Scaffold { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Textzy Android", style = MaterialTheme.typography.headlineSmall)
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)

            when (screen) {
                Screen.LOGIN -> {
                    OutlinedTextField(value = apiBaseUrl, onValueChange = { apiBaseUrl = it }, label = { Text("API Base URL") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("Password") }, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            scope.launch {
                                try {
                                    val next = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).login(email, password) }
                                    session = next
                                    store.saveSession(next)
                                    val loaded = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).projects(next) }
                                    projects.clear(); projects.addAll(loaded)
                                    screen = Screen.PROJECTS
                                    // Operational telemetry only.
                                    withContext(Dispatchers.IO) {
                                        TextzyApi(apiBaseUrl).sendTelemetry(next, "login_success", JSONObject().put("appVersion", "1.0.0").put("installId", store.installId()))
                                    }
                                } catch (e: Exception) {
                                    error = e.message ?: "Login failed"
                                }
                            }
                        }) { Text("Login") }
                        Button(onClick = {
                            val options = ScanOptions().apply {
                                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                                setPrompt("Scan QR from Textzy web desktop")
                                setBeepEnabled(true)
                                setOrientationLocked(false)
                            }
                            scannerLauncher.launch(options)
                        }) { Text("Scan QR") }
                    }
                    Text("Permissions: Camera is requested only for QR scan. Microphone/Media/Location are requested only when those features are used.")
                }

                Screen.PROJECTS -> {
                    Text("Select Project")
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(projects) { p ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(p.name, style = MaterialTheme.typography.titleMedium)
                                    Text("/${p.slug} • ${p.role}")
                                    Button(onClick = {
                                        scope.launch {
                                            try {
                                                val next = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).switchProject(session, p.slug) }
                                                session = next
                                                store.saveSession(next)
                                                val convs = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).conversations(next) }
                                                conversations.clear(); conversations.addAll(convs)
                                                screen = Screen.INBOX
                                            } catch (e: Exception) {
                                                error = e.message ?: "Switch project failed"
                                            }
                                        }
                                    }) { Text("Continue") }
                                }
                            }
                        }
                    }
                }

                Screen.INBOX -> {
                    Text("Inbox")
                    LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(conversations) { c ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(if (c.customerName.isNotBlank()) c.customerName else c.customerPhone)
                                    Text(c.status)
                                    Button(onClick = {
                                        scope.launch {
                                            try {
                                                activeConversationId = c.id
                                                activeRecipient = c.customerPhone
                                                val rows = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).messages(session, c.id) }
                                                messages.clear(); messages.addAll(rows)
                                            } catch (e: Exception) {
                                                error = e.message ?: "Load messages failed"
                                            }
                                        }
                                    }) { Text("Open") }
                                }
                            }
                        }
                    }

                    if (activeConversationId.isNotBlank()) {
                        Text("Messages")
                        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            items(messages) { m -> Text("• ${m.body}") }
                        }
                        OutlinedTextField(value = composeText, onValueChange = { composeText = it }, label = { Text("Message") }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).sendMessage(session, activeRecipient, composeText) }
                                    composeText = ""
                                    val rows = withContext(Dispatchers.IO) { TextzyApi(apiBaseUrl).messages(session, activeConversationId) }
                                    messages.clear(); messages.addAll(rows)
                                } catch (e: Exception) {
                                    error = e.message ?: "Send failed"
                                }
                            }
                        }) { Text("Send") }
                    }

                    Button(onClick = {
                        store.clear()
                        session = SessionState()
                        projects.clear(); conversations.clear(); messages.clear()
                        activeConversationId = ""
                        screen = Screen.LOGIN
                    }) { Text("Logout") }
                }
            }
        }
    }
}

private fun parsePairPayload(raw: String): JSONObject {
    return try {
        JSONObject(raw)
    } catch (_: Exception) {
        JSONObject().put("token", raw)
    }
}
