import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  Info,
  CheckCheck,
  Check,
  Clock,
  Star,
  Archive,
  Trash2,
  Tag,
  UserPlus,
  MessageCircle,
  Image,
  FileText,
  Mic,
  Bell,
  X,
} from "lucide-react";
import { apiGet, apiGetBlob, apiPost, apiPostForm, buildIdempotencyKey, wabaGetOnboardingStatus } from "@/lib/api";
import { getSession } from "@/lib/api";
import { playNotificationTone, isNotificationAudioUnlocked, unlockNotificationAudio } from "@/lib/notificationAudio";
import { toast } from "sonner";

const NOTIFICATION_STYLE_KEY = "textzy.inbox.notificationStyle";
const FULL_EMOJI_SET = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","🙂","🙃","😍","🥰","😘","😗","😙","😚","😋","😛","😜","🤪","🤗","🤩","🤔",
  "😐","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","🥱","😴","😌","😛","🫡","🤝","👍","👎","👏","🙌","🙏","💪","🔥","✅",
  "❌","⚡","💯","🎉","✨","💬","📌","📎","🧩","📞","📹","🎤","📷","📝","🛒","💰","📦","🚚","📍","📅","⌛","⏱️","⚠️","❓","❤️"
];

const InboxPage = () => {
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [wabaDetails, setWabaDetails] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [me, setMe] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVars, setTemplateVars] = useState({});
  const [templatePresetTokens, setTemplatePresetTokens] = useState([]);
  const [templatePresetSuggested, setTemplatePresetSuggested] = useState({});
  const [templatePresetBusy, setTemplatePresetBusy] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [faqs, setFaqs] = useState([]);
  const [sla, setSla] = useState({ breachedCount: 0, items: [] });
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [showTemplateAttach, setShowTemplateAttach] = useState(false);
  const [showFaqAttach, setShowFaqAttach] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [starBusy, setStarBusy] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [pendingVoiceFile, setPendingVoiceFile] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceMimeType, setVoiceMimeType] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(() => isNotificationAudioUnlocked());
  const [notificationStyle, setNotificationStyle] = useState(() => {
    try {
      return localStorage.getItem(NOTIFICATION_STYLE_KEY) || "classic";
    } catch {
      return "classic";
    }
  });
  const selectedChatIdRef = useRef(null);
  const meEmailRef = useRef("");
  const playNotificationSoundRef = useRef(() => {});
  const typingTimerRef = useRef(null);
  const typingActiveRef = useRef(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);
  const endMessageRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const mapConversation = (x) => ({
    id: x.id,
    name: x.customerName || x.customerPhone,
    phone: x.customerPhone,
    lastMessage: x.status || "Conversation",
    time: x.lastMessageAtUtc || x.createdAtUtc || null,
    unread: Number(x.unreadCount || 0),
    starred: false,
    channel: "whatsapp",
    avatar: (x.customerName || x.customerPhone || "U").slice(0, 2).toUpperCase(),
    assignedUserId: x.assignedUserId || "",
    assignedUserName: x.assignedUserName || "",
    labels: (x.labelsCsv || "").split(",").map((z) => z.trim()).filter(Boolean),
    canReply: !!x.canReply,
    hoursSinceInbound: Number(x.hoursSinceInbound || 999),
  });
  const mapMessage = (x) => {
    const rawStatus = String(x.status || "").toLowerCase();
    const sender = rawStatus === "received" ? "customer" : "agent";
    const normalizedStatus = sender === "agent" ? (rawStatus || "sent") : "received";
    const messageType = String(x.messageType || "session");
    let text = x.body || "";
    let media = null;
    if (messageType.startsWith("media:")) {
      const kind = messageType.split(":")[1] || "media";
      try {
        media = JSON.parse(x.body || "{}");
        text = `${kind === "audio" ? "🎤" : "📎"} ${kind.toUpperCase()}${media.caption ? ` - ${media.caption}` : ""}`;
      } catch {
        text = `📎 ${kind.toUpperCase()} attachment`;
      }
    } else if (messageType === "template") {
      const name = String(x.body || "").split("|")[0] || "template";
      text = `🧩 Template: ${name}`;
    }
    return {
    id: x.id,
    sender,
    text,
    time: x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now",
    retryCount: Number(x.retryCount || 0),
    nextRetryAtUtc: x.nextRetryAtUtc || null,
    lastError: x.lastError || "",
    queueProvider: x.queueProvider || "memory",
    status: normalizedStatus,
    messageType,
    media,
  };
  };

  const openInboundMedia = async (msg) => {
    const mediaId = msg?.media?.mediaId;
    if (!mediaId) {
      toast.error("Media id not available");
      return;
    }
    try {
      const blob = await apiGetBlob(`/api/messages/media/${encodeURIComponent(mediaId)}`);
      const url = URL.createObjectURL(blob);
      const fileName = msg?.media?.fileName || `media-${mediaId}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e?.message || "Failed to open media");
    }
  };

  const loadConversations = useCallback(
    () => apiGet("/api/inbox/conversations").then((c) => setConversations((c || []).map(mapConversation))).catch(() => {}),
    []
  );
  const loadThread = useCallback(
    (conversationId) =>
      apiGet(`/api/inbox/conversations/${conversationId}/messages`).then((rows) => setMessages((rows || []).map(mapMessage))).catch(() => setMessages([])),
    []
  );
  const loadNotes = useCallback(
    (conversationId) =>
      apiGet(`/api/inbox/conversations/${conversationId}/notes`).then((rows) => setNotes(rows || [])).catch(() => setNotes([])),
    []
  );
  const loadSla = useCallback(
    () => apiGet("/api/inbox/sla?thresholdMinutes=15").then((x) => setSla(x || { breachedCount: 0, items: [] })).catch(() => {}),
    []
  );

  const playNotificationSound = useCallback((frequency = 880) => {
    try {
      if (notificationStyle === "off") return;
      playNotificationTone(notificationStyle, frequency);
    } catch {
      // Ignore audio failures (autoplay policy / unsupported browser)
    }
  }, [notificationStyle]);

  useEffect(() => {
    meEmailRef.current = String(me?.email || "").toLowerCase();
  }, [me?.email]);

  useEffect(() => {
    playNotificationSoundRef.current = playNotificationSound;
  }, [playNotificationSound]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_STYLE_KEY, notificationStyle);
    } catch {
      // ignore storage issues
    }
  }, [notificationStyle]);

  useEffect(() => {
    Promise.all([
      apiGet("/api/inbox/conversations"),
      apiGet("/api/contacts"),
      apiGet("/api/auth/team-members").catch(() => []),
      apiGet("/api/auth/me").catch(() => null),
      apiGet("/api/templates").catch(() => []),
      apiGet("/api/automation/faq").catch(() => []),
      wabaGetOnboardingStatus().catch(() => null),
    ])
      .then(([c, ct, tm, meData, tpl, faqRows, waba]) => {
        const mapped = (c || []).map(mapConversation);
        setConversations(mapped);
        setSelectedConversationId((prev) => prev || mapped[0]?.id || null);
        setMessages([]);
        setContacts(ct || []);
        setTeamMembers(tm || []);
        setMe(meData);
        const approved = (tpl || []).filter((x) => String(x.status || "").toLowerCase() === "approved" && Number(x.channel) === 2);
        setTemplates(approved);
        if (approved.length > 0) setSelectedTemplateId(String(approved[0].id));
        setFaqs((faqRows || []).filter((f) => f.isActive !== false));
        setWabaDetails(waba);
        loadSla();
      })
      .catch(() => {
        setConversations([]);
        setMessages([]);
      });
  }, [loadSla]);

  const formatAgo = (value) => {
    if (!value) return "just now";
    const dt = new Date(value);
    const sec = Math.max(1, Math.floor((Date.now() - dt.getTime()) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQ = !q || c.name.toLowerCase().includes(q) || (c.phone || "").toLowerCase().includes(q);
      if (!matchesQ) return false;
      if (activeFilter === "mine") return !!me && c.assignedUserId === me.userId;
      if (activeFilter === "unassigned") return !c.assignedUserId;
      return true;
    });
  }, [conversations, searchQuery, activeFilter, me]);

  const filterCounts = useMemo(
    () => ({
      all: conversations.length,
      mine: conversations.filter((c) => !!me && c.assignedUserId === me.userId).length,
      unassigned: conversations.filter((c) => !c.assignedUserId).length,
    }),
    [conversations, me]
  );

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedConversationId(null);
      return;
    }
    const exists = filteredConversations.some((x) => x.id === selectedConversationId);
    if (!exists) setSelectedConversationId(filteredConversations[0].id);
  }, [filteredConversations, selectedConversationId]);

  const selectedChat = filteredConversations.find((x) => x.id === selectedConversationId) || filteredConversations[0] || {
    avatar: "NA",
    name: "No conversation",
    phone: "-",
    labels: [],
    canReply: false,
    assignedUserName: "",
  };
  const canReplyInSession = !!selectedChat.canReply;
  const isStarred = (selectedChat.labels || []).some((x) => String(x).toLowerCase() === "starred");
  const selectedContact = contacts.find((x) => x.phone === selectedChat.phone);
  const selectedTemplate = templates.find((x) => String(x.id) === selectedTemplateId) || templates[0];
  const filteredEmojis = useMemo(() => {
    const q = emojiSearch.trim();
    if (!q) return FULL_EMOJI_SET;
    return FULL_EMOJI_SET.filter((e) => e.includes(q));
  }, [emojiSearch]);
  const templateParamIndexes = useMemo(() => {
    const body = selectedTemplate?.body || "";
    const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return Array.from(new Set(matches)).sort((a, b) => a - b);
  }, [selectedTemplate]);

  const tokenValueMap = useMemo(() => {
    const map = {};
    for (const t of templatePresetTokens || []) {
      if (!t?.key) continue;
      map[String(t.key).toLowerCase()] = t.value || "";
    }
    return map;
  }, [templatePresetTokens]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id || null;
    if (!selectedChat?.id) {
      setMessages([]);
      setReplyToMessage(null);
      return;
    }
    setReplyToMessage(null);
    loadThread(selectedChat.id);
    loadNotes(selectedChat.id);
  }, [selectedChat?.id, loadNotes, loadThread]);

  useEffect(() => {
    if (!endMessageRef.current) return;
    endMessageRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, selectedChat?.id]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      try {
        voiceStreamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // ignore
      }
    };
  }, []);

  const handleAttachFaq = (item) => {
    if (!item?.answer) return;
    setMessage((prev) => {
      const next = `${prev ? `${prev}\n` : ""}${item.answer}`;
      return next;
    });
    setShowFaqAttach(false);
  };

  const setReplyTarget = (msg) => {
    if (!msg) return;
    const preview = String(msg.text || "").trim();
    setReplyToMessage({
      id: msg.id,
      sender: msg.sender,
      text: preview.length > 140 ? `${preview.slice(0, 140)}...` : preview,
      time: msg.time,
    });
    toast.success("Reply target selected");
  };

  const toggleTemplatePanel = () => {
    setShowTemplateAttach((prev) => {
      const next = !prev;
      if (next) setShowFaqAttach(false);
      return next;
    });
  };

  const toggleFaqPanel = () => {
    setShowFaqAttach((prev) => {
      const next = !prev;
      if (next) setShowTemplateAttach(false);
      return next;
    });
  };

  const isWhatsAppAudioMimeSupported = (mimeType) => {
    const m = String(mimeType || "").toLowerCase();
    return m.includes("ogg") || m.includes("mpeg") || m.includes("mp4") || m.includes("aac") || m.includes("wav") || m.includes("amr");
  };

  const pickRecorderMimeType = () => {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const candidates = [
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
      "audio/aac",
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  };

  const requestBrowserNotificationAndSound = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const ok = await unlockNotificationAudio();
      setAudioUnlocked(ok || isNotificationAudioUnlocked());
      if (ok) toast.success("Notification sounds enabled");
      else toast.error("Could not enable sound. Click once again and allow browser permissions.");
    } catch {
      toast.error("Unable to enable notification sounds");
    }
  };

  const handleSendMessage = async () => {
    if (pendingVoiceFile) {
      const ok = await uploadAndSendMedia(pendingVoiceFile, "audio");
      if (ok) {
        setPendingVoiceFile(null);
        setVoiceMimeType("");
      }
      return;
    }
    if (!canReplyInSession) {
      toast.error("24-hour session expired. Send an approved template first.");
      return;
    }
    if (!message.trim() || sendBusy) return;
    try {
      setSendBusy(true);
      stopTyping();
      const replyPrefix = replyToMessage ? `↪ Reply to (${replyToMessage.sender === "agent" ? "You" : "Customer"} ${replyToMessage.time}): ${replyToMessage.text}\n` : "";
      await apiPost("/api/messages/send", {
        recipient: selectedChat.phone || "+910000000000",
        body: `${replyPrefix}${message}`,
        channel: 2,
        idempotencyKey: buildIdempotencyKey("inbox"),
      });
      setMessage("");
      setReplyToMessage(null);
      await loadThread(selectedChat.id);
      await loadConversations();
    } catch (e) {
      toast.error(e?.message || "Message send failed");
    } finally {
      setSendBusy(false);
    }
  };

  const handleSendTemplateFallback = async () => {
    const tpl = selectedTemplate;
    if (!tpl || !selectedChat?.phone) {
      toast.error("No approved WhatsApp template available.");
      return;
    }
    try {
      stopTyping();
      const params = templateParamIndexes.map((idx) => (templateVars[idx] || "").trim());
      if (params.some((p) => !p)) {
        toast.error("Fill all template variables before sending.");
        return;
      }
      setSendBusy(true);
      const replyPrefix = replyToMessage ? `↪ Reply to (${replyToMessage.sender === "agent" ? "You" : "Customer"} ${replyToMessage.time}): ${replyToMessage.text}\n` : "";
      await apiPost("/api/messages/send", {
        recipient: selectedChat.phone,
        body: `${replyPrefix}${tpl.body || "Template message"}`,
        channel: 2,
        useTemplate: true,
        templateName: tpl.name,
        templateLanguageCode: tpl.language || "en",
        templateParameters: params,
        idempotencyKey: buildIdempotencyKey("tpl"),
      });
      toast.success(`Template sent: ${tpl.name}`);
      setReplyToMessage(null);
      await loadThread(selectedChat.id);
      await loadConversations();
      setShowTemplateAttach(false);
    } catch (e) {
      toast.error(e?.message || "Template send failed");
    } finally {
      setSendBusy(false);
    }
  };

  useEffect(() => {
    setTemplateVars({});
  }, [selectedTemplateId]);

  const loadTemplatePresets = useCallback(async () => {
    if (!selectedTemplate?.id || !selectedChat?.phone) {
      setTemplatePresetTokens([]);
      setTemplatePresetSuggested({});
      return;
    }
    try {
      setTemplatePresetBusy(true);
      const query = encodeURIComponent(selectedChat.phone);
      const res = await apiGet(`/api/templates/${selectedTemplate.id}/presets?recipient=${query}`);
      const tokens = Array.isArray(res?.tokens) ? res.tokens : [];
      const suggested = res?.suggestedByIndex && typeof res.suggestedByIndex === "object" ? res.suggestedByIndex : {};
      setTemplatePresetTokens(tokens);
      setTemplatePresetSuggested(suggested);
    } catch {
      setTemplatePresetTokens([]);
      setTemplatePresetSuggested({});
    } finally {
      setTemplatePresetBusy(false);
    }
  }, [selectedTemplate?.id, selectedChat?.phone]);

  useEffect(() => {
    loadTemplatePresets();
  }, [loadTemplatePresets]);

  const applySuggestedTemplateVars = () => {
    if (!templatePresetSuggested || Object.keys(templatePresetSuggested).length === 0) {
      toast.error("No system presets available for this contact.");
      return;
    }
    setTemplateVars((prev) => {
      const next = { ...prev };
      for (const idx of templateParamIndexes) {
        const v = templatePresetSuggested[String(idx)];
        if (v) next[idx] = v;
      }
      return next;
    });
    toast.success("System variables auto-filled");
  };

  const previewTemplateBody = useMemo(() => {
    const body = selectedTemplate?.body || "";
    return body.replace(/\{\{(\d+)\}\}/g, (_, i) => {
      const raw = templateVars[Number(i)] || `{{${i}}}`;
      const marker = String(raw || "").trim();
      if (marker.startsWith("{{") && marker.endsWith("}}")) {
        const token = marker.slice(2, -2).trim().toLowerCase();
        return tokenValueMap[token] || marker;
      }
      return raw;
    });
  }, [selectedTemplate?.body, templateVars, tokenValueMap]);

  useEffect(() => {
    const s = getSession();
    if (!s?.tenantSlug) return;
    let disposed = false;
    let joined = false;
    let startPromise = null;
    const runtimeConfig = typeof window !== "undefined" ? (window.__APP_CONFIG__ || {}) : {};
    const baseUrl =
      runtimeConfig.API_BASE ||
      process.env.REACT_APP_API_BASE ||
      process.env.VITE_API_BASE ||
      "https://textzy-backend-production.up.railway.app";
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/inbox?tenantSlug=${encodeURIComponent(s.tenantSlug)}`, {
        withCredentials: true,
        accessTokenFactory: () => s.accessToken || s.token || "",
      })
      .withAutomaticReconnect()
      .build();

    const joinRoom = () => connection.invoke("JoinTenantRoom", s.tenantSlug).catch(() => {});
    const activeConversationId = () => selectedChatIdRef.current;

    const refreshMessageViews = () => {
      loadConversations();
      const activeId = activeConversationId();
      if (activeId) loadThread(activeId);
    };
    connection.on("message.queued", () => {
      refreshMessageViews();
    });
    connection.on("message.sent", () => {
      refreshMessageViews();
      playNotificationSoundRef.current?.(980);
    });
    connection.on("webhook.inbound", () => {
      loadConversations();
      const activeId = activeConversationId();
      if (activeId) loadThread(activeId);
      loadSla();
      playNotificationSoundRef.current?.(760);
    });
    connection.on("conversation.assigned", () => loadConversations());
    connection.on("conversation.transferred", () => loadConversations());
    connection.on("conversation.labels", () => loadConversations());
    connection.on("conversation.note", () => {
      const activeId = activeConversationId();
      if (activeId) loadNotes(activeId);
    });
    connection.onreconnected(() => {
      joinRoom();
      loadConversations();
      const activeId = activeConversationId();
      if (activeId) loadThread(activeId);
      loadSla();
    });
    connection.on("conversation.typing", (e) => {
      const activeId = activeConversationId();
      if (!e?.conversationId || String(e.conversationId) !== String(activeId)) return;
      if (e.user && meEmailRef.current && String(e.user).toLowerCase() === meEmailRef.current) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (e.isTyping) next.add(e.user || "Agent");
        else next.delete(e.user || "Agent");
        return [...next];
      });
      if (e.isTyping) {
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== (e.user || "Agent")));
        }, 3000);
      }
    });
    connection.onclose(() => {
      setTypingUsers([]);
    });

    startPromise = connection.start()
      .then(() => {
        if (disposed) return connection.stop().catch(() => {});
        return joinRoom().then(() => {
          joined = true;
        });
      })
      .catch(() => {
        if (disposed) return;
        toast.error("Realtime connection failed. Inbox will auto-refresh on actions.");
      });

    return () => {
      disposed = true;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (joined) {
        connection.invoke("LeaveTenantRoom", s.tenantSlug).catch(() => {});
      }
      Promise.resolve(startPromise).finally(() => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          connection.stop().catch(() => {});
        }
      });
    };
  }, [loadConversations, loadNotes, loadSla, loadThread]);

  const emitTyping = useCallback((isTyping) => {
    if (!selectedChat?.id) return;
    apiPost("/api/inbox/typing", { conversationId: selectedChat.id, isTyping }).catch(() => {});
  }, [selectedChat?.id]);

  const handleInputTyping = useCallback((value) => {
    setMessage(value);
    if (!selectedChat?.id) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emitTyping(true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      emitTyping(false);
    }, 1200);
  }, [emitTyping, selectedChat?.id]);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      emitTyping(false);
    }
  }, [emitTyping]);

  const handleAssign = async (member) => {
    if (!selectedChat.id || assignBusy) return;
    try {
      setAssignBusy(true);
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/assign`, {
        userId: String(member.id),
        userName: member.name,
      });
      setConversations((prev) =>
        prev.map((x) => (x.id === selectedChat.id ? { ...x, assignedUserId: updated.assignedUserId, assignedUserName: updated.assignedUserName } : x))
      );
      toast.success(`Assigned to ${member.name}`);
    } catch (e) {
      toast.error(e?.message || "Failed to assign");
    } finally {
      setAssignBusy(false);
    }
  };

  const handleTransfer = async (member) => {
    if (!selectedChat.id || transferBusy) return;
    try {
      setTransferBusy(true);
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/transfer`, {
        userId: String(member.id),
        userName: member.name,
      });
      setConversations((prev) =>
        prev.map((x) => (x.id === selectedChat.id ? { ...x, assignedUserId: updated.assignedUserId, assignedUserName: updated.assignedUserName } : x))
      );
      toast.success(`Transferred to ${member.name}`);
    } catch (e) {
      toast.error(e?.message || "Failed to transfer chat");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleAddLabel = async () => {
    const label = newLabel.trim();
    if (!label || !selectedChat.id) return;
    try {
      const labels = Array.from(new Set([...(selectedChat.labels || []), label]));
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/labels`, { labels });
      const nextLabels = (updated.labelsCsv || "").split(",").map((z) => z.trim()).filter(Boolean);
      setConversations((prev) => prev.map((x) => (x.id === selectedChat.id ? { ...x, labels: nextLabels } : x)));
      setNewLabel("");
      toast.success("Label added");
    } catch {
      toast.error("Failed to add label");
    }
  };

  const handleToggleStar = async () => {
    if (!selectedChat?.id || starBusy) return;
    try {
      setStarBusy(true);
      const current = selectedChat.labels || [];
      const has = current.some((x) => String(x).toLowerCase() === "starred");
      const labels = has ? current.filter((x) => String(x).toLowerCase() !== "starred") : [...current, "starred"];
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/labels`, { labels });
      const nextLabels = (updated.labelsCsv || "").split(",").map((z) => z.trim()).filter(Boolean);
      setConversations((prev) => prev.map((x) => (x.id === selectedChat.id ? { ...x, labels: nextLabels } : x)));
      toast.success(has ? "Star removed" : "Conversation starred");
    } catch (e) {
      toast.error(e?.message || "Failed to update star");
    } finally {
      setStarBusy(false);
    }
  };

  const handleCall = () => {
    const digits = String(selectedChat?.phone || "").replace(/[^\d]/g, "");
    if (!digits) return toast.error("Phone not available");
    window.location.href = `tel:+${digits}`;
  };

  const handleVideoCall = () => {
    const digits = String(selectedChat?.phone || "").replace(/[^\d]/g, "");
    if (!digits) return toast.error("Phone not available");
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const uploadAndSendMedia = async (file, mediaType, caption = "") => {
    if (!file || !selectedChat?.phone) return;
    if (!canReplyInSession) {
      toast.error("24-hour session expired. Send an approved template first.");
      return false;
    }
    try {
      setSendBusy(true);
      const fd = new FormData();
      fd.append("recipient", selectedChat.phone);
      fd.append("file", file);
      fd.append("mediaType", mediaType);
      const replyPrefix = replyToMessage ? `↪ Reply to (${replyToMessage.sender === "agent" ? "You" : "Customer"} ${replyToMessage.time}): ${replyToMessage.text}\n` : "";
      fd.append("caption", `${replyPrefix}${caption || ""}`.trim());
      const res = await apiPostForm("/api/messages/upload-whatsapp-media", fd, { "Idempotency-Key": buildIdempotencyKey(mediaType) });
      const statusText = String(res?.status || "Queued").toLowerCase();
      toast.success(`${mediaType[0].toUpperCase()}${mediaType.slice(1)} ${statusText === "queued" ? "queued" : "sent"}`);
      setReplyToMessage(null);
      await loadThread(selectedChat.id);
      await loadConversations();
      return true;
    } catch (e) {
      toast.error(e?.message || `${mediaType} send failed`);
      return false;
    } finally {
      setSendBusy(false);
    }
  };

  const handlePickAttachment = () => fileInputRef.current?.click();
  const handlePickImage = () => imageInputRef.current?.click();
  const handlePickDocument = () => docInputRef.current?.click();

  const handleAttachmentSelected = async (e, forcedType = null) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const mime = String(file.type || "").toLowerCase();
    const mediaType = forcedType || (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document");
    await uploadAndSendMedia(file, mediaType, mediaType === "audio" ? "" : (message || "").trim());
  };

  const handleInsertEmoji = (emoji) => {
    setMessage((prev) => `${prev}${emoji}`);
  };

  const handleVoiceNote = async () => {
    if (!selectedChat?.phone) return;
    if (!voiceRecording) {
      try {
        const mimeType = pickRecorderMimeType();
        if (!mimeType) {
          toast.error("Voice recording not supported for WhatsApp in this browser. Use Chrome/Edge or upload audio file.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType });
        voiceStreamRef.current = stream;
        voiceChunksRef.current = [];
        setRecordingSeconds(0);
        setVoiceMimeType(mimeType);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
        recorder.ondataavailable = (evt) => {
          if (evt.data?.size > 0) voiceChunksRef.current.push(evt.data);
        };
        recorder.onstop = () => {
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
          const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || mimeType || "audio/ogg" });
          if (!blob.size) {
            toast.error("No voice captured. Try again.");
            return;
          }
          if (!isWhatsAppAudioMimeSupported(blob.type || mimeType)) {
            setPendingVoiceFile(null);
            setVoiceMimeType("");
            toast.error("Recorded format is not WhatsApp-supported. Please upload .ogg/.mp3/.m4a audio file.");
            try {
              voiceStreamRef.current?.getTracks?.().forEach((t) => t.stop());
            } catch {
              // ignore
            }
            return;
          }
          const ext = blob.type.includes("ogg")
            ? "ogg"
            : blob.type.includes("mp4")
              ? "m4a"
              : blob.type.includes("mpeg")
                ? "mp3"
                : "webm";
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || mimeType || "audio/ogg" });
          setPendingVoiceFile(file);
          toast.success("Voice ready. Click Send to deliver.");
          try {
            voiceStreamRef.current?.getTracks?.().forEach((t) => t.stop());
          } catch {
            // ignore
          }
        };
        voiceRecorderRef.current = recorder;
        recorder.start();
        setPendingVoiceFile(null);
        setVoiceRecording(true);
        toast.success("Recording started.");
      } catch (e) {
        toast.error(e?.message || "Microphone access denied");
      }
      return;
    }
    try {
      voiceRecorderRef.current?.stop();
      setVoiceRecording(false);
      toast.success("Recording stopped.");
    } catch {
      setVoiceRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      toast.error("Voice send failed");
    }
  };

  const handleAddNote = async () => {
    const body = newNote.trim();
    if (!body || !selectedChat?.id) return;
    try {
      await apiPost(`/api/inbox/conversations/${selectedChat.id}/notes`, { body });
      setNewNote("");
      loadNotes(selectedChat.id);
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "read":
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case "delivered":
        return <CheckCheck className="w-4 h-4 text-slate-400" />;
      case "sent":
      case "acceptedbymeta":
      case "accepted":
        return <Check className="w-4 h-4 text-slate-400" />;
      case "queued":
      case "processing":
      case "retryscheduled":
        return <Clock className="w-4 h-4 text-amber-500" />;
      case "failed":
        return <Clock className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex rounded-3xl overflow-hidden border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-[0_12px_30px_rgba(15,23,42,0.08)]" data-testid="inbox-page">
      <div className="w-[320px] xl:w-[340px] border-r border-slate-200 bg-white flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-4xl leading-none font-heading font-semibold text-slate-900">Inbox</h2>
            <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl px-3 py-1 shadow-sm border-0">{filterCounts.all}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search conversations..." className="pl-10 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 h-11" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} data-testid="inbox-search" />
            </div>
            <Button variant="outline" size="icon" className="rounded-xl h-11 w-11 border-slate-200 bg-white text-slate-700 hover:bg-slate-50" data-testid="inbox-filter-btn">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
            <button className={`h-9 rounded-lg text-sm font-medium transition ${activeFilter === "all" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600"}`} onClick={() => setActiveFilter("all")}>All ({filterCounts.all})</button>
            <button className={`h-9 rounded-lg text-sm font-medium transition ${activeFilter === "mine" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600"}`} onClick={() => setActiveFilter("mine")}>Mine ({filterCounts.mine})</button>
            <button className={`h-9 rounded-lg text-sm font-medium transition ${activeFilter === "unassigned" ? "bg-orange-500 text-white shadow-sm" : "text-slate-600"}`} onClick={() => setActiveFilter("unassigned")}>Unassigned ({filterCounts.unassigned})</button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredConversations.map((conversation) => (
            <div key={conversation.id} className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${selectedChat?.id === conversation.id ? "bg-orange-50 border-l-4 border-l-orange-500" : "hover:bg-slate-50"}`} onClick={() => setSelectedConversationId(conversation.id)}>
              <div className="flex items-start gap-3">
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-medium">{conversation.avatar}</AvatarFallback>
                  </Avatar>
                  {conversation.channel === "whatsapp" && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"><MessageCircle className="w-3 h-3 text-white" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-slate-900 truncate">{conversation.name}</p>
                    <span className="text-xs text-slate-500">{formatAgo(conversation.time)}</span>
                  </div>
                  <p className="text-sm text-slate-500 truncate">{conversation.lastMessage}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">{conversation.phone} {conversation.assignedUserName ? `• ${conversation.assignedUserName}` : "• Unassigned"}</span>
                    {conversation.unread > 0 ? <Badge className="bg-orange-500 text-white border-0">{conversation.unread}</Badge> : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0 flex flex-col bg-slate-50/60">
        <div className="min-h-16 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10"><AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-medium">{selectedChat.avatar}</AvatarFallback></Avatar>
            <div className="max-w-[220px]"><p className="font-semibold text-slate-900 text-lg leading-tight truncate">{selectedChat.name}</p><p className="text-xs text-slate-500 truncate">{selectedChat.phone}</p></div>
          </div>
          {typingUsers.length > 0 ? <div className="text-xs text-emerald-600">{typingUsers.join(", ")} typing...</div> : null}
          {!canReplyInSession ? (
            <div className="hidden 2xl:flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 max-w-[220px] truncate">24h session closed. Customer must reply first.</div>
              <select
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 max-w-[180px]"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.length === 0 ? <option value="">No templates</option> : null}
                {templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
              {templateParamIndexes.map((idx) => (
                <Input
                  key={idx}
                  className="h-8 text-xs w-28"
                  placeholder={`Var ${idx}`}
                  value={templateVars[idx] || ""}
                  onChange={(e) => setTemplateVars((prev) => ({ ...prev, [idx]: e.target.value }))}
                />
              ))}
              {selectedTemplate ? (
                <div className="hidden 2xl:block text-[11px] text-slate-500 max-w-[220px] truncate">
                  Preview: {previewTemplateBody}
                </div>
              ) : null}
              <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSendTemplateFallback}>Send Template</Button>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 shrink-0">
            {!audioUnlocked ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl h-9 px-3 border-orange-200 text-orange-700 hover:bg-orange-50"
                onClick={requestBrowserNotificationAndSound}
              >
                Enable notification sounds
              </Button>
            ) : null}
            <div className="hidden 2xl:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 h-9">
              <Bell className="w-4 h-4 text-slate-500" />
              <select
                className="h-7 bg-transparent text-xs text-slate-700 outline-none"
                value={notificationStyle}
                onChange={(e) => setNotificationStyle(e.target.value)}
              >
                <option value="classic">Classic</option>
                <option value="soft">Soft</option>
                <option value="double">Double</option>
                <option value="chime">Chime</option>
                <option value="off">Off</option>
              </select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button disabled={assignBusy} variant="outline" size="sm" className="rounded-xl h-9 px-3 border-slate-200 bg-white text-slate-800 hover:bg-slate-50"><UserPlus className="w-4 h-4 mr-1.5" />{assignBusy ? "Assigning..." : "Assign"}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">{teamMembers.length === 0 ? <DropdownMenuItem disabled>No members</DropdownMenuItem> : teamMembers.map((member) => <DropdownMenuItem key={member.id} disabled={assignBusy} onClick={() => handleAssign(member)}>{member.name} ({member.role})</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button disabled={transferBusy} variant="outline" size="sm" className="rounded-xl h-9 px-3 border-slate-200 bg-white text-slate-800 hover:bg-slate-50">{transferBusy ? "Transferring..." : "Transfer"}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">{teamMembers.length === 0 ? <DropdownMenuItem disabled>No members</DropdownMenuItem> : teamMembers.map((member) => <DropdownMenuItem key={member.id} disabled={transferBusy} onClick={() => handleTransfer(member)}>{member.name} ({member.role})</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700" onClick={handleCall}><Phone className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700" onClick={handleVideoCall}><Video className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><Info className="w-4 h-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={starBusy} onClick={handleToggleStar}><Star className="w-4 h-4 mr-2" /> {starBusy ? "Updating..." : isStarred ? "Unstar conversation" : "Star conversation"}</DropdownMenuItem>
                <DropdownMenuItem><UserPlus className="w-4 h-4 mr-2" /> Assign to agent</DropdownMenuItem>
                <DropdownMenuItem><Tag className="w-4 h-4 mr-2" /> Add label</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Archive className="w-4 h-4 mr-2" /> Archive</DropdownMenuItem>
                <DropdownMenuItem className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6 bg-slate-50/70">
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="flex items-center justify-center"><span className="px-3 py-1 bg-white text-xs text-slate-500 rounded-full border border-slate-200">Today</span></div>
            {messages.length === 0 ? <div className="h-[60vh] flex items-center justify-center"><div className="text-center max-w-sm"><div className="w-16 h-16 rounded-2xl mx-auto bg-orange-100 text-orange-600 flex items-center justify-center mb-4"><MessageCircle className="w-8 h-8" /></div><h3 className="text-xl font-semibold text-slate-900">No messages yet</h3><p className="text-slate-500 mt-1">Start conversation with a customer to see messages and actions here.</p></div></div> : null}
            {messages.map((msg) => <div key={msg.id} className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"}`}><div className={`group max-w-[70%] ${msg.sender === "agent" ? "chat-bubble-sent text-slate-900" : "chat-bubble-received text-slate-900"} px-4 py-3`} onDoubleClick={() => setReplyTarget(msg)}><p className="text-sm">{msg.text}</p>{msg.messageType.startsWith("media:") && msg.media?.mediaId ? <div className="mt-2"><Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInboundMedia(msg)}>Open attachment</Button></div> : null}<div className={`flex items-center gap-2 mt-1 ${msg.sender === "agent" ? "justify-end" : ""}`}><span className="text-xs text-slate-500">{msg.time}</span>{msg.sender === "agent" && getStatusIcon(msg.status)}<button type="button" className="text-[11px] text-slate-400 hover:text-orange-600 opacity-0 group-hover:opacity-100 transition" onClick={() => setReplyTarget(msg)}>Reply</button></div>{msg.sender === "agent" && msg.status === "failed" ? <p className="text-[11px] text-red-600 mt-1">{msg.lastError || "Send failed"}</p> : null}{msg.sender === "agent" && msg.status === "retryscheduled" && msg.nextRetryAtUtc ? <p className="text-[11px] text-amber-700 mt-1">Retry at {new Date(msg.nextRetryAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p> : null}</div></div>)}
            <div ref={endMessageRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-slate-200 bg-white">
          {replyToMessage ? (
            <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-orange-700">Replying to {replyToMessage.sender === "agent" ? "your message" : "customer message"}</div>
                <div className="text-xs text-slate-600 truncate">{replyToMessage.text || "Message"}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-slate-500" onClick={() => setReplyToMessage(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : null}
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500" onClick={handlePickAttachment}><Paperclip className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="text-slate-500" onClick={handlePickImage}><Image className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="text-slate-500" onClick={handlePickDocument}><FileText className="w-5 h-5" /></Button>
              <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs inline-flex items-center gap-1.5" onClick={toggleTemplatePanel}>
                <FileText className="w-3.5 h-3.5" />
                <span>Attach Template</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 rounded-lg text-xs inline-flex items-center gap-1.5" onClick={toggleFaqPanel}>
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Attach Q&A</span>
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleAttachmentSelected(e)} />
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAttachmentSelected(e, "image")} />
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={(e) => handleAttachmentSelected(e, "document")} />
            </div>
            <div className="flex-1 relative rounded-2xl border border-slate-200 bg-white">
              <Textarea
                placeholder={canReplyInSession ? "Type a message..." : "24h session closed. Use template message flow."}
                value={message}
                onChange={(e) => handleInputTyping(e.target.value)}
                className="min-h-[70px] max-h-40 resize-none pr-12 text-base leading-6 border-0 focus-visible:ring-0 rounded-2xl bg-transparent text-slate-900 placeholder:text-slate-400"
                disabled={!canReplyInSession}
                onFocus={() => {
                  if (selectedChat?.id) emitTyping(true);
                }}
                onBlur={() => {
                  stopTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button variant="ghost" size="icon" className="absolute right-2 bottom-3 text-slate-500" onClick={() => setShowEmojiTray((v) => !v)}><Smile className="w-5 h-5" /></Button>
              {showEmojiTray ? (
                <div className="absolute right-3 bottom-14 z-20 rounded-xl border border-slate-200 bg-white shadow-lg p-2 w-80">
                  <Input placeholder="Search emoji..." className="h-8 text-xs mb-2" value={emojiSearch} onChange={(e) => setEmojiSearch(e.target.value)} />
                  <div className="max-h-44 overflow-auto grid grid-cols-10 gap-1">
                    {filteredEmojis.map((e, idx) => (
                      <button key={`${e}-${idx}`} className="w-7 h-7 rounded hover:bg-slate-100 text-lg" onClick={() => handleInsertEmoji(e)}>{e}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {showTemplateAttach ? (
                <div className="absolute left-3 bottom-16 z-20 rounded-xl border border-slate-200 bg-white shadow-lg p-3 w-[420px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700">Attach Template</p>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowTemplateAttach(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                      {templates.length === 0 ? <option value="">No templates</option> : null}
                      {templates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                    </select>
                    <Button size="sm" className="h-9 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSendTemplateFallback} disabled={sendBusy || !selectedTemplate}>Send Template</Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={applySuggestedTemplateVars}
                      disabled={templatePresetBusy}
                    >
                      {templatePresetBusy ? "Loading presets..." : "Auto-fill system variables"}
                    </Button>
                    <span className="text-[11px] text-slate-500">{templatePresetTokens.length} presets</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {templateParamIndexes.map((idx) => (
                      <div key={idx} className="space-y-1">
                        <Input
                          className="h-8 text-xs"
                          placeholder={`Var ${idx}`}
                          value={templateVars[idx] || ""}
                          onChange={(e) => setTemplateVars((prev) => ({ ...prev, [idx]: e.target.value }))}
                        />
                        <select
                          className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-[11px] text-slate-600"
                          value=""
                          onChange={(e) => {
                            const token = e.target.value;
                            if (!token) return;
                            setTemplateVars((prev) => ({ ...prev, [idx]: `{{${token}}}` }));
                            e.target.value = "";
                          }}
                        >
                          <option value="">Use system variable...</option>
                          {templatePresetTokens.map((token) => (
                            <option key={`${idx}-${token.key}`} value={token.key}>
                              {token.label} ({token.value})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {selectedTemplate ? (
                    <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 line-clamp-3">
                      {previewTemplateBody}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showFaqAttach ? (
                <div className="absolute left-3 bottom-16 z-20 rounded-xl border border-slate-200 bg-white shadow-lg p-3 w-[420px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-700">Attach Q&A Answer</p>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFaqAttach(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="max-h-44 overflow-auto space-y-1">
                    {faqs.length === 0 ? <p className="text-xs text-slate-500">No Q&A items found.</p> : null}
                    {faqs.map((f) => (
                      <button key={f.id} className="w-full text-left rounded-md border border-slate-200 p-2 hover:bg-slate-50" onClick={() => handleAttachFaq(f)}>
                        <div className="text-xs font-medium text-slate-700 truncate">{f.question}</div>
                        <div className="text-[11px] text-slate-500 truncate">{f.answer}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className={`text-slate-500 ${voiceRecording ? "bg-red-50 text-red-600" : ""}`} onClick={handleVoiceNote}><Mic className="w-5 h-5" /></Button>
              <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl h-12 w-14 shadow-md shadow-orange-500/30" onClick={handleSendMessage} disabled={!canReplyInSession || sendBusy}><Send className="w-5 h-5" /></Button>
            </div>
          </div>
          {voiceRecording ? (
            <div className="mt-2 text-xs text-red-600">
              Recording... {Math.floor(recordingSeconds / 60).toString().padStart(2, "0")}:{(recordingSeconds % 60).toString().padStart(2, "0")}
            </div>
          ) : null}
          {!voiceRecording && pendingVoiceFile ? (
            <div className="mt-2 text-xs text-emerald-700">
              Voice ready ({voiceMimeType || pendingVoiceFile.type || "audio"}). Click send to deliver.
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-[300px] 2xl:w-[330px] border-l border-slate-200 bg-white hidden xl:block">
        <div className="p-6">
          <div className="text-center mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <Avatar className="w-24 h-24 mx-auto mb-4"><AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white text-2xl font-medium">{selectedChat.avatar}</AvatarFallback></Avatar>
            <h3 className="font-semibold text-slate-900 text-base truncate">{selectedChat.name}</h3>
            <p className="text-slate-500 text-sm truncate">{selectedChat.phone}</p>
            <p className="text-xs text-slate-500 mt-1">Assigned: <span className="font-medium text-slate-700">{selectedChat.assignedUserName || "Unassigned"}</span></p>
          </div>

          <div className="space-y-4">
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-medium text-slate-800 mb-2">Contact Info</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Name</span><span className="text-slate-900 text-right break-words">{selectedContact?.name || selectedChat.name || "-"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Phone</span><span className="text-slate-900 text-right break-all">{selectedContact?.phone || selectedChat.phone || "-"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="text-slate-900 text-right break-all">{selectedContact?.email || "-"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Added</span><span className="text-slate-900 text-right">{selectedContact?.createdAtUtc ? new Date(selectedContact.createdAtUtc).toLocaleDateString() : "-"}</span></div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-medium text-slate-800 mb-2">Labels</p>
              <div className="flex flex-wrap gap-2">{(selectedChat.labels || []).length === 0 ? <span className="text-sm text-slate-500">No labels</span> : (selectedChat.labels || []).map((label) => <Badge key={label} variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">{label}</Badge>)}</div>
              <div className="mt-3 flex gap-2">
                <Input placeholder="Add label" className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLabel(); } }} />
                <Button onClick={handleAddLabel} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5">Add</Button>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-medium text-slate-800 mb-2">WABA Profile</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Business</span><span className="text-slate-900 font-medium">{wabaDetails?.businessName || "-"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">WABA ID</span><span className="text-slate-900 font-medium">{wabaDetails?.wabaId || "-"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Phone Number ID</span><span className="text-slate-900 font-medium">{wabaDetails?.phoneNumberId || "-"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Display Number</span><span className="text-slate-900 font-medium">{wabaDetails?.displayPhoneNumber || wabaDetails?.phone || "-"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Status</span><Badge className={wabaDetails?.readyToSend ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>{wabaDetails?.readyToSend ? "Ready" : (wabaDetails?.state || "Pending")}</Badge></div>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-medium text-slate-800 mb-2">SLA</p>
              <div className="text-sm text-slate-600">Breached: <span className="font-semibold text-slate-900">{sla.breachedCount || 0}</span></div>
            </div>

            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-medium text-slate-800 mb-2">Notes</p>
              <div className="space-y-2 max-h-32 overflow-auto">
                {(notes || []).length === 0 ? <p className="text-xs text-slate-500">No notes yet</p> : null}
                {(notes || []).slice(0, 8).map((n) => (
                  <div key={n.id} className="text-xs bg-white border border-slate-200 rounded p-2">
                    <div className="text-slate-700">{n.body}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{n.createdByName || "Agent"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input placeholder="Add note" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                <Button size="sm" onClick={handleAddNote} className="bg-orange-500 hover:bg-orange-600 text-white">Save</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxPage;
