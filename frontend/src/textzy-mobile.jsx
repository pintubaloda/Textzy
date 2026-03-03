import { useState, useRef, useEffect } from "react";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TEXTZY MOBILE â€” NO BLACK PALETTE
   Orange #F97316  Â·  White #FFFFFF
   All dark tones replaced with deep teal/slate
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const C = {
  /* brand */
  orange:       "#F97316",
  orangeDark:   "#EA6C0A",
  orangeLight:  "#FB923C",
  orangePale:   "#FFF7ED",
  orangeLight2: "#FFEDD5",

  /* replacing all blacks with warm deep teal */
  headerBg:     "#1E3A5F",   /* deep navy-blue (NOT black) */
  headerText:   "#FFFFFF",
  headerSub:    "rgba(255,255,255,0.65)",

  /* surfaces */
  bg:           "#F8FAFC",
  sidebarBg:    "#FFFFFF",
  chatBg:       "#F1F5F9",
  bubbleSent:   "#FFEDD5",
  bubbleRecv:   "#FFFFFF",
  inputBg:      "#FFFFFF",
  panelBg:      "#F8FAFC",

  /* text â€” warm slates, never black */
  textMain:     "#1E3A5F",
  textSub:      "#64748B",
  textMuted:    "#94A3B8",
  textLight:    "#FFFFFF",

  /* ui */
  divider:      "#E2E8F0",
  hover:        "#F8FAFC",
  selected:     "#FFF7ED",
  unread:       "#F97316",
  online:       "#22C55E",
  iconColor:    "#64748B",
  danger:       "#EF4444",
  scanLine:     "#F97316",
};

const API_BASE =
  (typeof window !== "undefined" && window.__APP_CONFIG__?.API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  process.env.VITE_API_BASE ||
  "https://textzy-backend-production.up.railway.app";

const SESSION_KEY = "textzy.mobile.session";

const idempotencyKey = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const readCookie = (name) => {
  if (typeof document === "undefined") return "";
  const key = `${name}=`;
  const parts = document.cookie.split(";").map((x) => x.trim());
  const row = parts.find((x) => x.startsWith(key));
  return row ? decodeURIComponent(row.slice(key.length)) : "";
};

const resolveCsrf = (token) => token || readCookie("textzy_csrf") || "";

const parsePairingToken = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";

  const fromObject = (obj) =>
    obj?.pairingToken ||
    obj?.pairing_token ||
    obj?.pairToken ||
    obj?.token ||
    obj?.Token ||
    obj?.payload?.pairingToken ||
    obj?.payload?.pairing_token ||
    obj?.payload?.token ||
    obj?.payload?.Token ||
    "";

  const tryJson = (text) => {
    try {
      const obj = JSON.parse(text);
      return fromObject(obj) || "";
    } catch {
      return "";
    }
  };

  // Plain JSON
  let token = tryJson(input);
  if (token) return String(token).trim();

  // URL-encoded JSON (common with QR image providers)
  const decodedOnce = (() => {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  })();
  token = tryJson(decodedOnce);
  if (token) return String(token).trim();

  // Query string token
  const tokenFromUrl =
    input.match(/[?&](pairingToken|pairing_token|pairToken|token)=([^&]+)/i) ||
    decodedOnce.match(/[?&](pairingToken|pairing_token|pairToken|token)=([^&]+)/i);
  if (tokenFromUrl?.[2]) return decodeURIComponent(tokenFromUrl[2]).trim();

  // Regex extraction from JSON-like text
  const tokenRegex =
    /"(pairingToken|pairing_token|pairToken|token|Token)"\s*:\s*"([^"]+)"/i;
  const directMatch = input.match(tokenRegex) || decodedOnce.match(tokenRegex);
  if (directMatch?.[2]) return directMatch[2].trim();

  return "";
};

async function apiFetch(path, { method = "GET", token = "", tenantSlug = "", csrfToken = "", body, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantSlug && !path.startsWith("/api/auth/") && !path.startsWith("/api/public/")) headers["X-Tenant-Slug"] = tenantSlug;
  if (path === "/api/messages/send" && !headers["Idempotency-Key"]) {
    headers["Idempotency-Key"] = body?.idempotencyKey || idempotencyKey();
  }
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body != null && !isFormData) headers["Content-Type"] = "application/json";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    const csrf = resolveCsrf(csrfToken);
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body == null ? undefined : (isFormData ? body : JSON.stringify(body)),
    credentials: "include",
    cache: "no-store",
  });

  const nextTokenHeader = res.headers.get("x-access-token") || "";
  const nextCsrfHeader = res.headers.get("x-csrf-token") || "";
  return { res, nextTokenHeader, nextCsrfHeader };
}

const mapConversation = (x) => {
  const id = x.id ?? x.Id ?? "";
  const customerName = x.customerName ?? x.CustomerName ?? "";
  const customerPhone = x.customerPhone ?? x.CustomerPhone ?? "";
  const status = x.status ?? x.Status ?? "";
  const lastMessageAtUtc = x.lastMessageAtUtc ?? x.LastMessageAtUtc ?? null;
  const createdAtUtc = x.createdAtUtc ?? x.CreatedAtUtc ?? null;
  return {
    id,
    customerPhone,
    name: customerName || customerPhone || "Conversation",
    avatar: "",
    color: "#F97316",
    online: false,
    unread: Number(x.unreadCount ?? x.UnreadCount ?? 0),
    time: lastMessageAtUtc
      ? new Date(lastMessageAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : (createdAtUtc ? new Date(createdAtUtc).toLocaleDateString() : ""),
    lastMsg: status || "Conversation",
    typing: false,
    messages: [],
  };
};

const mapMessage = (x) => {
  const rawStatus = String(x.status ?? x.Status ?? "").toLowerCase();
  const sender = rawStatus === "received" ? "customer" : "agent";
  const text = String(x.body ?? x.Body ?? "");
  const createdAt = x.createdAtUtc ?? x.CreatedAtUtc;
  return {
    id: x.id ?? x.Id ?? `${Date.now()}-${Math.random()}`,
    sent: sender === "agent",
    direction: sender,
    text,
    time: createdAt
      ? new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "now",
    createdAtMs: createdAt ? new Date(createdAt).getTime() : null,
    status: rawStatus || "sent",
  };
};

/* â”€â”€ MOCK DATA â”€â”€ */
const CONTACTS = [
  { id:1, name:"Alice Johnson",    avatar:"AJ", color:"#7C3AED",
    online:true, unread:2, time:"10:42 AM", lastMsg:"Sure, I'll send the report by EOD.", typing:false,
    messages:[
      {id:1,text:"Hey! Did you review the Q3 report?",sent:false,time:"10:30 AM",status:"read"},
      {id:2,text:"Yes looks great! Just a few numbers to double-check.",sent:true,time:"10:35 AM",status:"read"},
      {id:3,text:"Which ones? I can fix right now.",sent:false,time:"10:38 AM",status:"read"},
      {id:4,text:"Pages 4 and 7 - the revenue projections look off.",sent:true,time:"10:40 AM",status:"read"},
      {id:5,text:"Sure, I'll send the report by EOD.",sent:false,time:"10:42 AM",status:"read"},
    ]},
  { id:2, name:"Bob Martinez",     avatar:"BM", color:"#DC2626",
    online:false, unread:0, time:"9:15 AM", lastMsg:"Meeting rescheduled to 3 PM", typing:false,
    messages:[
      {id:1,text:"Are we still on for the 2 PM sync?",sent:false,time:"8:50 AM",status:"read"},
      {id:2,text:"Let me check with the team.",sent:true,time:"8:55 AM",status:"read"},
      {id:3,text:"Meeting rescheduled to 3 PM",sent:false,time:"9:15 AM",status:"read"},
    ]},
  { id:3, name:"Customer Support", avatar:"CS", color:"#0891B2",
    online:true, unread:1, time:"Yesterday", lastMsg:"Ticket #4821 has been resolved.", typing:true,
    messages:[
      {id:1,text:"Hello, I need help with my subscription.",sent:true,time:"Yesterday",status:"read"},
      {id:2,text:"Hi! Happy to help. Can you share your account email?",sent:false,time:"Yesterday",status:"read"},
      {id:3,text:"It's user@example.com",sent:true,time:"Yesterday",status:"read"},
      {id:4,text:"Ticket #4821 has been resolved.",sent:false,time:"Yesterday",status:"read"},
    ]},
  { id:4, name:"Dev Team",      avatar:"DT", color:"#059669",
    online:true, unread:0, time:"Yesterday", lastMsg:"Deployment to prod done.", typing:false,
    messages:[
      {id:1,text:"Starting prod deployment...",sent:false,time:"Yesterday",status:"read"},
      {id:2,text:"Pipeline passed all checks.",sent:false,time:"Yesterday",status:"read"},
      {id:3,text:"Deployment to prod done.",sent:false,time:"Yesterday",status:"read"},
    ]},
  { id:5, name:"Sarah Patel",      avatar:"SP", color:"#9333EA",
    online:false, unread:0, time:"Mon", lastMsg:"Can you review my PR?", typing:false,
    messages:[
      {id:1,text:"Just pushed my feature branch.",sent:false,time:"Mon",status:"read"},
      {id:2,text:"Looks good from the summary!",sent:true,time:"Mon",status:"read"},
      {id:3,text:"Can you review my PR when free?",sent:false,time:"Mon",status:"read"},
    ]},
  { id:6, name:"Marketing Hub",    avatar:"MH", color:"#D97706",
    online:false, unread:3, time:"Sun", lastMsg:"New campaign brief ready.", typing:false,
    messages:[
      {id:1,text:"Q4 campaign planning started!",sent:false,time:"Sun",status:"read"},
      {id:2,text:"New campaign brief ready.",sent:false,time:"Sun",status:"read"},
    ]},
];

const PROJECTS = [
  {slug:"moneyart",  name:"MoneyArt",  icon:"MA", role:"Agent"},
  {slug:"techcorp",  name:"TechCorp",  icon:"TC", role:"Admin"},
  {slug:"retailhub", name:"RetailHub", icon:"RH", role:"Agent"},
];

const REPLIES = [
  "Got it!", "Sure thing!", "I'll check and get back to you.",
  "Sounds good!", "On it.", "Thanks!", "Will do.", "Let me look into this.", "Perfect!",
];

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TEXTZY LOGO
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Logo = ({ size=32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="#F97316"/>
    <path d="M8 12C8 10.343 9.343 9 11 9H29C30.657 9 32 10.343 32 12V22C32 23.657 30.657 25 29 25H22L16 31V25H11C9.343 25 8 23.657 8 22V12Z" fill="white"/>
  </svg>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ICONS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const I = {
  Send:    ()=><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>,
  Key:     ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="3.5"/><path d="M11 13l9-9"/><path d="M16 4l4 4"/><path d="M14 6l4 4"/></svg>,
  Mic:     ()=><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  Attach:  ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
  Emoji:   ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  Back:    ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  More:    ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>,
  Phone:   ()=><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>,
  Video:   ()=><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  Search:  ()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Eye:     ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:  ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a21.77 21.77 0 015.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0112 5c7 0 11 7 11 7a21.8 21.8 0 01-3.22 4.38"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  ArrowRight: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Shield:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 4v6c0 5-3.4 9.7-8 10-4.6-.3-8-5-8-10V6z"/></svg>,
  Close:   ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Logout:  ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Camera:  ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Check:   ()=><svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5L4.5 8.5L12 1" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  DblChk:  ()=><svg width="18" height="11" viewBox="0 0 18 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 5.5L10.5 9L17 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Star:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Device:  ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  Bell:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Cog:     ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Tag:     ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41L11 22l-9-9V2h11z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  Plus:    ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

const QA_LIBRARY = [
  "QA: Thank you for contacting Textzy. How can I assist you today?",
  "QA: We are open 7 AM to 11 PM, 24x7 support available.",
  "QA: Please share your order ID so I can check details quickly.",
  "QA: I am connecting you with our support specialist now.",
];

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AVATAR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Avatar = ({ name, color, size=46, online=false }) => (
  <div style={{ position:"relative", flexShrink:0 }}>
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background:`linear-gradient(135deg,${color}EE,${color}88)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.34, fontWeight:700, color:"#fff",
      boxShadow:`0 2px 8px ${color}44`,
    }}>
      {name.replace(/[^\w\s]/gi,"").trim().split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?"}
    </div>
    {online && (
      <div style={{ position:"absolute", bottom:1, right:1,
        width:size*0.27, height:size*0.27, borderRadius:"50%",
        background:C.online, border:"2.5px solid #fff",
        boxShadow:`0 0 0 1px ${C.online}44`,
      }}/>
    )}
  </div>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TYPING INDICATOR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Typing = () => (
  <div style={{ display:"flex", gap:5, alignItems:"center", padding:"11px 15px" }}>
    {[0,1,2].map(i=>(
      <div key={i} style={{
        width:7, height:7, borderRadius:"50%",
        background:C.orange, opacity:0.7,
        animation:`tdot 1.2s ease-in-out ${i*0.2}s infinite`,
      }}/>
    ))}
  </div>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   QR CODE (decorative)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const QRCode = ({ size=175 }) => {
  const cells=21, cs=size/cells;
  const grid = Array.from({length:cells},(_,r)=>
    Array.from({length:cells},(_,c)=>{
      if((r<7&&c<7)||(r<7&&c>13)||(r>13&&c<7)) return true;
      if(r===0||r===6||c===0||c===6) return false;
      if(r>=14&&(r===14||r===20)) return true;
      if(c>=14&&(c===14||c===20)) return true;
      if(r>=2&&r<=4&&c>=2&&c<=4) return true;
      if(r>=2&&r<=4&&c>=16&&c<=18) return true;
      if(r>=16&&r<=18&&c>=2&&c<=4) return true;
      const h=(7919*r+c*1009+r*c)%7;
      return h<3;
    })
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx="12"/>
      {grid.map((row,r)=>row.map((on,c)=>
        on&&<rect key={`${r}-${c}`} x={c*cs+0.5} y={r*cs+0.5} width={cs-1} height={cs-1}
          fill={C.headerBg} rx="1.5"/>
      ))}
      <rect x={size/2-16} y={size/2-16} width="32" height="32" rx="7" fill="white"/>
      <rect x={size/2-13} y={size/2-13} width="26" height="26" rx="6" fill={C.orange}/>
      <path d={`M${size/2-7} ${size/2-4}h10a2.5 2.5 0 010 5h-2.5v4.5h-3.5v-4.5h-4z`} fill="white"/>
    </svg>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SCAN ANIMATION (camera view)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const Scanner = ({ onDone }) => {
  const [pct, setPct]   = useState(0);
  const [done, setDone] = useState(false);
  const [camErr, setCamErr] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let active = true;
    let stream = null;
    let detector = null;
    let useJsQrFallback = false;
    const w = window;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };

    const scanLoop = async () => {
      if (!active) return;
      setPct((p) => (p >= 99 ? 8 : p + 1.1));
      try {
        const video = videoRef.current;
        if (detector && video && video.readyState >= 2) {
          const found = await detector.detect(video);
          if (found?.length) {
            const rawValue = found[0].rawValue || "";
            setDone(true);
            stop();
            setTimeout(() => onDone?.(rawValue), 700);
            return;
          }
        } else if (useJsQrFallback && video && video.readyState >= 2 && w.jsQR) {
          const canvas = canvasRef.current;
          if (canvas) {
            const size = 360;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, size, size);
              const image = ctx.getImageData(0, 0, size, size);
              const code = w.jsQR(image.data, image.width, image.height, {
                inversionAttempts: "dontInvert",
              });
              if (code?.data) {
                setDone(true);
                stop();
                setTimeout(() => onDone?.(code.data), 700);
                return;
              }
            }
          }
        }
      } catch {
        // keep scanning
      }
      rafRef.current = requestAnimationFrame(scanLoop);
    };

    const ensureJsQr = () =>
      new Promise((resolve) => {
        if (w.jsQR) {
          resolve(true);
          return;
        }
        const id = "jsqr-lib-script";
        const existing = document.getElementById(id);
        if (existing) {
          existing.addEventListener("load", () => resolve(true), { once: true });
          existing.addEventListener("error", () => resolve(false), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamErr("Camera not available on this device.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if ("BarcodeDetector" in w) {
          detector = new w.BarcodeDetector({ formats: ["qr_code"] });
        } else {
          const ok = await ensureJsQr();
          if (ok && w.jsQR) {
            useJsQrFallback = true;
          } else {
            setCamErr("QR scanner not supported here. Use manual token.");
          }
        }
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch {
        setCamErr("Camera permission denied or unavailable.");
      }
    };

    start();
    return () => {
      active = false;
      stop();
    };
  }, [onDone]);

  return (
    <div style={{
      width:"100%", aspectRatio:"1/1", borderRadius:20,
      overflow:"hidden", position:"relative",
      background: done
        ? `linear-gradient(135deg,#052e16,#14532d)`
        : `linear-gradient(160deg,#0c2340 0%,#1E3A5F 50%,#0d1f38 100%)`,
      transition:"background 0.5s",
    }}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: done ? 0 : 0.55,
        }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* animated scan line */}
      {!done && (
        <div style={{
          position:"absolute", left:"12%", right:"12%", height:2.5,
          background:`linear-gradient(90deg,transparent,${C.orange},transparent)`,
          top:`${12+(pct*0.76)}%`,
          boxShadow:`0 0 14px ${C.orange}BB`,
          transition:"top 0.05s linear",
        }}/>
      )}

      {/* corner brackets */}
      {!done && ["tl","tr","bl","br"].map(pos=>(
        <div key={pos} style={{
          position:"absolute",
          ...(pos.includes("t")?{top:"11%"}:{bottom:"11%"}),
          ...(pos.includes("l")?{left:"11%"}:{right:"11%"}),
          width:34, height:34,
          borderTop:   pos.includes("t")?`3px solid ${C.orange}`:"none",
          borderBottom:pos.includes("b")?`3px solid ${C.orange}`:"none",
          borderLeft:  pos.includes("l")?`3px solid ${C.orange}`:"none",
          borderRight: pos.includes("r")?`3px solid ${C.orange}`:"none",
          borderRadius:pos==="tl"?"6px 0 0 0":pos==="tr"?"0 6px 0 0":pos==="bl"?"0 0 0 6px":"0 0 6px 0",
        }}/>
      ))}

      {/* dashed frame */}
      {!done && (
        <div style={{
          position:"absolute", top:"11%", left:"11%", right:"11%", bottom:"11%",
          border:`1.5px dashed ${C.orange}66`, borderRadius:14,
        }}/>
      )}

      {/* success */}
      {done && (
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10,
          animation:"fadeUp 0.3s ease-out",
        }}>
          <div style={{
            width:68, height:68, borderRadius:"50%", background:C.online,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 0 28px ${C.online}88`,
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ color:"#fff", fontWeight:700, fontSize:16, margin:0 }}>QR Detected!</p>
          <p style={{ color:"rgba(255,255,255,0.7)", fontSize:13, margin:0 }}>Logging you in...</p>
        </div>
      )}

      {/* label */}
      {!done && (
        <div style={{ position:"absolute", bottom:16, left:0, right:0, textAlign:"center" }}>
          <p style={{ color:"rgba(255,255,255,0.9)", fontSize:13, fontWeight:500, margin:0 }}>
            Point camera at the QR on your computer
          </p>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:5,
            marginTop:5, padding:"3px 12px",
            background:"rgba(249,115,22,0.2)", borderRadius:10,
          }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:C.orange,animation:"pulse 1s ease-in-out infinite" }}/>
            <span style={{ color:C.orange, fontSize:11, fontWeight:600 }}>Scanning {Math.round(pct)}%</span>
          </div>
          {camErr ? (
            <p style={{ color:"rgba(255,255,255,0.88)", fontSize:11, margin:"6px 0 0" }}>{camErr}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SCREEN 1 â€” MOBILE LOGIN
   Orange gradient bg Â· no black
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const LoginScreen = ({ onLogin }) => {
  const [tab,setTab]     = useState("password");
  const [email,setEmail] = useState("admin@textzy.io");
  const [pass,setPass]   = useState("password123");
  const [showPass,setShowPass] = useState(false);
  const [loading,setLoad]= useState(false);
  const [err,setErr]     = useState("");

  const submit = async () => {
    if (!email||!pass) { setErr("Please fill all fields."); return; }
    setLoad(true);
    setErr("");
    try {
      await onLogin({ mode: "password", email, password: pass });
    } catch (e) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoad(false);
    }
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      background:`linear-gradient(165deg, ${C.orange} 0%, #EA6C0A 35%, #C2560A 75%, #1E3A5F 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif",
    }}>
      {/* top hero */}
      <div style={{
        flex:"0 0 auto", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"16px 20px 8px",
      }}>
        <div style={{
          width:58, height:58, borderRadius:16,
          background:"rgba(255,255,255,0.18)",
          backdropFilter:"blur(8px)",
          display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:8,
          boxShadow:"0 8px 32px rgba(0,0,0,0.12)",
        }}>
          <Logo size={34}/>
        </div>
        <h1 style={{ margin:0, fontSize:24, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" }}>Textzy</h1>
        <p style={{ margin:"2px 0 0", color:"rgba(255,255,255,0.75)", fontSize:13 }}>Business Inbox</p>
      </div>

      {/* card */}
      <div style={{
        flex:1,
        minHeight:"72vh",
        background:"#fff", borderRadius:"28px 28px 0 0",
        padding:"24px 24px 42px",
        boxShadow:"0 -8px 40px rgba(0,0,0,0.12)",
      }}>
        {/* tab switcher */}
        <div style={{ display:"flex", background:C.panelBg, borderRadius:12, padding:4, marginBottom:22 }}>
          {[{ mode: "password", label: "Password", icon: <I.Key/> }, { mode: "qr", label: "Scan QR", icon: <I.Camera/> }].map((item)=>(
            <button key={item.mode} onClick={()=>{setTab(item.mode);setErr("");}} style={{
              flex:1, padding:"10px 0", border:"none", borderRadius:9,
              background:tab===item.mode?"#fff":"transparent",
              color:tab===item.mode?C.orange:C.textSub,
              fontWeight:tab===item.mode?700:500, fontSize:14,
              cursor:"pointer", fontFamily:"inherit",
              boxShadow:tab===item.mode?"0 1px 6px rgba(0,0,0,0.10)":"none",
              transition:"all 0.2s",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {tab==="password" ? (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block",fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.7px" }}>Email</label>
              <input
                type="email"
                value={email}
                placeholder="you@company.com"
                onChange={e=>{setEmail(e.target.value);setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&submit()}
                style={{
                  width:"100%", padding:"13px 15px", borderRadius:12, boxSizing:"border-box",
                  border:`1.5px solid ${C.divider}`, fontSize:15, color:C.textMain,
                  outline:"none", fontFamily:"inherit", transition:"border-color 0.2s",
                  background:"#fff",
                }}
                onFocus={e=>e.target.style.borderColor=C.orange}
                onBlur={e=>e.target.style.borderColor=C.divider}
              />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block",fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.7px" }}>Password</label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={pass}
                  placeholder="********"
                  onChange={e=>{setPass(e.target.value);setErr("");}}
                  onKeyDown={e=>e.key==="Enter"&&submit()}
                  style={{
                    width:"100%", padding:"13px 72px 13px 15px", borderRadius:12, boxSizing:"border-box",
                    border:`1.5px solid ${C.divider}`, fontSize:15, color:C.textMain,
                    outline:"none", fontFamily:"inherit", transition:"border-color 0.2s",
                    background:"#fff",
                  }}
                  onFocus={e=>e.target.style.borderColor=C.orange}
                  onBlur={e=>e.target.style.borderColor=C.divider}
                />
                <button
                  type="button"
                  onClick={()=>setShowPass(v=>!v)}
                  style={{
                    position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                    border:"none", background:"transparent", color:C.textSub, cursor:"pointer",
                    padding:"4px 6px", display:"flex", alignItems:"center", justifyContent:"center",
                  }}
                >
                  {showPass ? <I.EyeOff/> : <I.Eye/>}
                </button>
              </div>
            </div>
            {err&&<p style={{ color:C.danger,fontSize:13,marginBottom:10,textAlign:"center" }}>{err}</p>}
            <button onClick={submit} disabled={loading} style={{
              width:"100%", padding:15, borderRadius:14, border:"none",
              background:`linear-gradient(135deg,${C.orange},${C.orangeLight})`,
              color:"#fff", fontWeight:700, fontSize:16,
              cursor:loading?"not-allowed":"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              boxShadow:`0 6px 24px ${C.orange}55`,
              opacity:loading?0.85:1, transition:"opacity 0.2s",
            }}>
              {loading
                ? <><div style={{ width:20,height:20,border:"2.5px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>Signing in...</>
                : <><span>Sign In</span><I.ArrowRight/></>}
            </button>
            <p style={{ textAlign:"center",marginTop:16,fontSize:12,color:C.textMuted }}>
              <span style={{ display:"inline-flex",alignItems:"center",gap:6 }}><I.Shield/>Secure session | HTTPS only</span>
            </p>
            <p style={{ textAlign:"center",marginTop:8,fontSize:12,color:C.textMuted }}>
              Powerd By - Moneyart Private Limited
            </p>
          </>
        ) : (
          /* QR SCANNER */
          <div>
            <div style={{
              background:C.orangePale, borderRadius:12, padding:"11px 14px",
              marginBottom:16, display:"flex", alignItems:"center", gap:10,
            }}>
              <span style={{ display:"inline-flex", color:C.orange }}><I.Camera/></span>
              <div>
                <div style={{ fontWeight:700,fontSize:13,color:C.textMain }}>Scan from your computer</div>
                <div style={{ fontSize:11,color:C.textSub,marginTop:1 }}>Textzy web -> Link Mobile -> QR appears</div>
              </div>
            </div>
            <Scanner onDone={async (raw)=>{
              try {
                const pairingToken = parsePairingToken(raw);
                if (!pairingToken) throw new Error("Could not read pairing token from QR. Please regenerate QR and scan again.");
                await onLogin({ mode: "qr", pairingToken });
              } catch (e) {
                setErr(e?.message || "QR login failed.");
              }
            }}/>
            <p style={{ textAlign:"center",marginTop:12,fontSize:12,color:C.textMuted }}>
              One-time token | auto-expires in 3 min
            </p>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SCREEN 2 â€” PROJECT PICKER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ProjectPicker = ({ projects, onSelect, loading = false }) => {
  const [sel, setSel] = useState(null);
  const rows = projects?.length ? projects : PROJECTS;
  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column",
      background:`linear-gradient(165deg,${C.orange} 0%,#EA6C0A 30%,#C2560A 65%,#1E3A5F 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px 20px" }}>
        <Logo size={44}/>
        <h2 style={{ margin:"14px 0 4px",fontSize:24,fontWeight:800,color:"#fff" }}>Select Workspace</h2>
        <p style={{ margin:0,color:"rgba(255,255,255,0.7)",fontSize:13 }}>Choose a project to continue</p>
      </div>
      <div style={{ background:"#fff",borderRadius:"28px 28px 0 0",padding:"28px 20px 40px",boxShadow:"0 -8px 40px rgba(0,0,0,0.12)" }}>
        {rows.map(p=>{
          const a=sel===p.slug;
          return (
            <div key={p.slug} onClick={()=>setSel(p.slug)} style={{
              display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
              borderRadius:14, marginBottom:10, cursor:"pointer",
              border:`2px solid ${a?C.orange:C.divider}`,
              background:a?C.orangePale:"#fff", transition:"all 0.15s",
              boxShadow:a?`0 2px 12px ${C.orange}22`:"none",
            }}>
              <div style={{ width:46,height:46,borderRadius:12,background:a?C.orangeLight2:C.panelBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0 }}>{p.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700,fontSize:15,color:C.textMain }}>{p.name}</div>
                <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{p.role} | /{p.slug}</div>
              </div>
              {a&&<div style={{ width:24,height:24,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>}
            </div>
          );
        })}
        <button disabled={!sel || loading} onClick={()=>sel&&onSelect(rows.find(p=>p.slug===sel))} style={{
          width:"100%", padding:15, marginTop:8, borderRadius:14, border:"none",
          background:sel?`linear-gradient(135deg,${C.orange},${C.orangeLight})`:C.divider,
          color:sel?"#fff":C.textMuted, fontWeight:700, fontSize:16,
          cursor:sel && !loading?"pointer":"not-allowed", fontFamily:"inherit",
          boxShadow:sel?`0 6px 24px ${C.orange}55`:"none", transition:"all 0.2s",
          opacity: loading ? 0.82 : 1,
        }}>{loading ? "Continuing..." : "Continue ->"}</button>
      </div>
    </div>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN MOBILE APP
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function TextzyMobile() {
  const restored = (() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  const [screen, setScreen]   = useState("login");
  const [user, setUser]       = useState(restored.user || null);
  const [project, setProject] = useState(restored.project || null);
  const [projects, setProjects] = useState([]);
  const [session, setSession] = useState({
    accessToken: restored.accessToken || "",
    csrfToken: restored.csrfToken || "",
    tenantSlug: restored.tenantSlug || "",
  });
  const [contacts, setCons]   = useState([]);
  const [activeId, setAId]    = useState(null);
  const [input, setInput]     = useState("");
  const [search, setSearch]   = useState("");
  const [tab, setTab]         = useState("All");
  const [view, setView]       = useState("list"); // "list" | "chat" | "profile"
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [starred, setStarred] = useState({});
  const [notice, setNotice] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatRecipient, setNewChatRecipient] = useState("");
  const [newChatBody, setNewChatBody] = useState("Hello");
  const [showTransfer, setShowTransfer] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [transferAssignee, setTransferAssignee] = useState("");
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [labelsInput, setLabelsInput] = useState("");
  const [showQaModal, setShowQaModal] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [devices, setDevices] = useState([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => localStorage.getItem("textzy.mobile.notif.enabled") !== "0");
  const [settingsCompact, setSettingsCompact] = useState(() => localStorage.getItem("textzy.mobile.settings.compact") === "1");
  const [settingsSound, setSettingsSound] = useState(() => localStorage.getItem("textzy.mobile.settings.sound") !== "0");
  const [busy, setBusy] = useState({
    project: false,
    send: false,
    newChat: false,
    transfer: false,
    labels: false,
    devices: false,
  });
  const msgEnd  = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const active       = contacts.find(c=>c.id===activeId);
  const unreadCount  = contacts.filter(c=>c.unread>0).length;
  const authCtx = { token: session.accessToken, csrfToken: session.csrfToken, tenantSlug: session.tenantSlug };
  const activeRecipient = (() => {
    const raw = String(active?.customerPhone || active?.phone || "").trim();
    if (raw) return raw;
    const fromName = String(active?.name || "").replace(/[^\d+]/g, "");
    return fromName.length >= 8 ? fromName : "";
  })();

  const parseErrorText = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return "Something went wrong.";
    try {
      const obj = JSON.parse(text);
      if (obj?.error) return String(obj.error);
      const list = [];
      if (obj?.title) list.push(obj.title);
      if (obj?.errors && typeof obj.errors === "object") {
        Object.values(obj.errors).forEach((v) => {
          if (Array.isArray(v)) list.push(v.join(", "));
        });
      }
      return list.join(" | ") || text;
    } catch {
      return text;
    }
  };

  const withBusy = async (key, fn) => {
    if (busy[key]) return;
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      await fn();
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  useEffect(()=>{ msgEnd.current?.scrollIntoView({behavior:"smooth"}); },
    [active?.messages?.length, active?.typing]);

  useEffect(() => {
    localStorage.setItem("textzy.mobile.notif.enabled", notifEnabled ? "1" : "0");
  }, [notifEnabled]);

  useEffect(() => {
    localStorage.setItem("textzy.mobile.settings.compact", settingsCompact ? "1" : "0");
  }, [settingsCompact]);

  useEffect(() => {
    localStorage.setItem("textzy.mobile.settings.sound", settingsSound ? "1" : "0");
  }, [settingsSound]);

  const persistSession = (nextSession, nextUser = user, nextProject = project) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      accessToken: nextSession.accessToken,
      csrfToken: nextSession.csrfToken,
      tenantSlug: nextSession.tenantSlug || "",
      user: nextUser || null,
      project: nextProject || null,
    }));
  };

  const loadProjects = async (token) => {
    const { res } = await apiFetch("/api/auth/projects", { token });
    if (!res.ok) throw new Error(await res.text() || "Failed to load projects");
    const rows = await res.json();
    const mapped = (rows || []).map((p, idx) => ({
      slug: p.slug || p.Slug,
      name: p.name || p.Name,
      role: p.role || p.Role || "agent",
      icon: ["MA", "TC", "RH", "PR", "TM"][idx % 5],
    }));
    setProjects(mapped);
    return mapped;
  };

  const loadConversations = async (ctx = authCtx) => {
    if (!ctx.token || !ctx.tenantSlug) return;
    const { res } = await apiFetch("/api/inbox/conversations?take=100", {
      token: ctx.token,
      tenantSlug: ctx.tenantSlug,
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to load conversations");
    const rows = await res.json();
    setCons((rows || []).map(mapConversation));
  };

  const loadMessages = async (conversationId, ctx = authCtx) => {
    const { res } = await apiFetch(`/api/inbox/conversations/${conversationId}/messages?take=80`, {
      token: ctx.token,
      tenantSlug: ctx.tenantSlug,
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to load messages");
    const rows = await res.json();
    const mapped = (rows || []).map(mapMessage);
    setCons((prev) => prev.map((c) => (c.id === conversationId ? { ...c, messages: mapped } : c)));
  };

  const loadTeamMembers = async (ctx = authCtx) => {
    const { res } = await apiFetch("/api/auth/team-members", {
      token: ctx.token,
      tenantSlug: ctx.tenantSlug,
    });
    if (!res.ok) return [];
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) ? rows : [];
  };

  const loadDevices = async (ctx = authCtx) => {
    const { res } = await apiFetch("/api/auth/devices", {
      token: ctx.token,
      tenantSlug: ctx.tenantSlug,
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to load devices");
    const rows = await res.json().catch(() => []);
    setDevices(Array.isArray(rows) ? rows : []);
  };

  const isWithin24HourWindow = (conversation) => {
    if (!conversation) return true;
    const inbound = (conversation.messages || [])
      .filter((m) => !m.sent && typeof m.createdAtMs === "number")
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if (inbound.length === 0) return true;
    const age = Date.now() - inbound[0].createdAtMs;
    return age <= 24 * 60 * 60 * 1000;
  };

  const handleLogin = async (payload) => {
    if (payload?.mode === "qr") {
      const { res, nextTokenHeader, nextCsrfHeader } = await apiFetch("/api/public/mobile/pair/exchange", {
        method: "POST",
        body: {
          pairingToken: payload.pairingToken,
          installId: restored.installId || `web-mobile-${Date.now()}`,
          deviceName: "Textzy Mobile WebView",
          devicePlatform: "android",
          deviceModel: "webview",
          osVersion: "android",
          appVersion: "1.0.0",
        },
      });
      if (!res.ok) throw new Error(await res.text() || "Pairing code expired or invalid.");
      const json = await res.json().catch(() => ({}));
      const accessToken = json.accessToken || json.AccessToken || nextTokenHeader;
      const csrfToken = resolveCsrf(json.csrfToken || json.CsrfToken || nextCsrfHeader);
      const tenantSlug =
        json.tenantSlug ||
        json.TenantSlug ||
        json.projectSlug ||
        json.ProjectSlug ||
        json.project?.slug ||
        json.Project?.Slug ||
        json.tenant?.slug ||
        json.Tenant?.Slug ||
        "";
      const loggedUser = json.user || json.User || { email: "mobile@textzy.io" };
      const nextSession = { accessToken, csrfToken, tenantSlug };
      setSession(nextSession);
      setUser(loggedUser);
      const projList = await loadProjects(accessToken).catch(() => []);
      if (tenantSlug) {
        const selected = projList.find((p) => String(p.slug).toLowerCase() === String(tenantSlug).toLowerCase()) || {
          slug: tenantSlug,
          name: tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1),
          role: "agent",
          icon: "PR",
        };
        setProject(selected);
        setScreen("app");
        persistSession(nextSession, loggedUser, selected);
        await loadConversations(nextSession);
      } else {
        setScreen("project");
        persistSession(nextSession, loggedUser, null);
      }
      return;
    }

    const { res, nextTokenHeader, nextCsrfHeader } = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { email: payload.email, password: payload.password },
    });
    if (!res.ok) throw new Error(await res.text() || "Invalid credentials");
    const json = await res.json().catch(() => ({}));
    const accessToken = json.accessToken || json.AccessToken || nextTokenHeader;
    const csrfToken = resolveCsrf(json.csrfToken || json.CsrfToken || nextCsrfHeader);
    const nextSession = { accessToken, csrfToken, tenantSlug: "" };
    const nextUser = { email: payload.email };
    setSession(nextSession);
    setUser(nextUser);
    await loadProjects(accessToken);
    setScreen("project");
    persistSession(nextSession, nextUser, null);
  };

  const handleSelectProject = async (p) => {
    return withBusy("project", async () => {
    let workingToken = session.accessToken;
    let workingCsrf = resolveCsrf(session.csrfToken);

    // Always refresh before switch to ensure CSRF cookie/header are synced in WebView.
    const refreshed = await apiFetch("/api/auth/refresh", {
      method: "POST",
      token: workingToken,
    });
    if (refreshed.res.ok) {
      const refreshedBody = await refreshed.res.json().catch(() => ({}));
      workingToken = refreshedBody.accessToken || refreshedBody.AccessToken || refreshed.nextTokenHeader || workingToken;
      workingCsrf = resolveCsrf(refreshedBody.csrfToken || refreshedBody.CsrfToken || refreshed.nextCsrfHeader || workingCsrf);
      setSession((prev) => ({ ...prev, accessToken: workingToken, csrfToken: workingCsrf }));
    }

    const trySwitch = async (accessToken, csrfToken) => apiFetch("/api/auth/switch-project", {
      method: "POST",
      token: accessToken,
      csrfToken: resolveCsrf(csrfToken),
      body: { slug: p.slug },
    });

    let first = await trySwitch(workingToken, workingCsrf);
    let res = first.res;
    let nextTokenHeader = first.nextTokenHeader;
    let nextCsrfHeader = first.nextCsrfHeader;

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 403 && errText.toLowerCase().includes("csrf")) {
        const refreshed = await apiFetch("/api/auth/refresh", {
          method: "POST",
          token: session.accessToken,
        });
        if (refreshed.res.ok) {
          const refreshedBody = await refreshed.res.json().catch(() => ({}));
          const refreshedToken = refreshedBody.accessToken || refreshedBody.AccessToken || refreshed.nextTokenHeader || session.accessToken;
          const refreshedCsrf = resolveCsrf(refreshedBody.csrfToken || refreshedBody.CsrfToken || refreshed.nextCsrfHeader || session.csrfToken);
          setSession((prev) => ({ ...prev, accessToken: refreshedToken, csrfToken: refreshedCsrf }));
          first = await trySwitch(refreshedToken, refreshedCsrf);
          res = first.res;
          nextTokenHeader = first.nextTokenHeader || refreshedToken;
          nextCsrfHeader = first.nextCsrfHeader || refreshedCsrf;
        }
      }
      if (!res.ok) throw new Error((await res.text()) || "Project switch failed");
    }

    const json = await res.json().catch(() => ({}));
    const accessToken = json.accessToken || json.AccessToken || nextTokenHeader || session.accessToken;
    const csrfToken = resolveCsrf(nextCsrfHeader || session.csrfToken);
    const tenantSlug = json.tenantSlug || json.TenantSlug || p.slug;
    const selectedProject = { ...p, role: json.role || json.Role || p.role };
    const nextSession = { accessToken, csrfToken, tenantSlug };
    setSession(nextSession);
    setProject(selectedProject);
    setScreen("app");
    setAId(null);
    setInput("");
    persistSession(nextSession, user, selectedProject);
    await loadConversations(nextSession);
    });
  };

  const openChat = async (id) => {
    setAId(id); setView("chat");
    setCons(p=>p.map(c=>c.id===id?{...c,unread:0}:c));
    try {
      await loadMessages(id);
    } catch {
      // keep old local state
    }
    setTimeout(()=>inputRef.current?.focus(),150);
  };

  const handleEmoji = () => {
    setInput((prev) => `${prev}🙂`);
    setTimeout(()=>inputRef.current?.focus(), 60);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleMicInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setNotice("Voice input is not supported on this device.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const spoken = e?.results?.[0]?.[0]?.transcript || "";
      if (spoken) setInput((prev) => `${prev}${prev ? " " : ""}${spoken}`);
      setTimeout(()=>inputRef.current?.focus(), 60);
    };
    rec.onerror = () => {
      setNotice("Could not capture voice. Please try again.");
    };
    rec.start();
  };

  const handleAttachmentSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!activeId) {
      setNotice("Open a chat before attaching a file.");
      return;
    }
    if (!activeRecipient) {
      setNotice("Recipient phone is missing for this conversation.");
      return;
    }
    const formData = new FormData();
    formData.append("recipient", activeRecipient);
    formData.append("file", file);
    if (file.type.startsWith("image/")) formData.append("mediaType", "image");
    else if (file.type.startsWith("video/")) formData.append("mediaType", "video");
    else if (file.type.startsWith("audio/")) formData.append("mediaType", "audio");
    else formData.append("mediaType", "document");

    const { res } = await apiFetch("/api/messages/upload-whatsapp-media", {
      method: "POST",
      token: authCtx.token,
      tenantSlug: authCtx.tenantSlug,
      csrfToken: authCtx.csrfToken,
      body: formData,
      extraHeaders: { "Idempotency-Key": idempotencyKey() },
    });
    if (!res.ok) {
      const err = await res.text();
      setNotice(parseErrorText(err) || "Attachment send failed.");
      return;
    }
    await loadMessages(activeId);
    await loadConversations();
  };

  const send = async () => {
    await withBusy("send", async () => {
      const txt = input.trim();
      if (!txt||!activeId) return;
      if (!activeRecipient) {
        setNotice("Recipient phone is missing for this conversation.");
        return;
      }
      if (!isWithin24HourWindow(active)) {
        setNotice("24-hour WhatsApp session window is closed. Please use an approved template.");
        return;
      }
      const m = {id:Date.now(),text:txt,sent:true,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),status:"sent"};
      setCons(p=>p.map(c=>c.id===activeId?{...c,messages:[...c.messages,m],lastMsg:txt,time:m.time,unread:0}:c));
      setInput("");
      try {
        const { res } = await apiFetch("/api/messages/send", {
          method: "POST",
          token: authCtx.token,
          tenantSlug: authCtx.tenantSlug,
          csrfToken: authCtx.csrfToken,
          body: {
            recipient: activeRecipient,
            body: txt,
            channel: 2,
            idempotencyKey: idempotencyKey(),
          },
        });
        if (!res.ok) {
          const err = await res.text();
          setNotice(parseErrorText(err) || "Message send failed.");
          return;
        }
        await loadMessages(activeId);
        await loadConversations();
      } catch (e) {
        setNotice(e?.message || "Message send failed.");
      }
    });
  };

  const handleTransferConversation = async () => {
    if (!activeId) return;
    const members = await loadTeamMembers();
    setTeamMembers(members);
    setTransferAssignee("");
    setShowTransfer(true);
    setShowChatMenu(false);
  };

  const submitTransferConversation = async () => {
    await withBusy("transfer", async () => {
      const fallback = transferAssignee.trim();
      let picked = null;
      if (teamMembers.length > 0) {
        picked = teamMembers.find((m) => String(m.fullName || m.email || "").toLowerCase() === String(fallback || "").toLowerCase())
          || teamMembers.find((m) => String(m.email || "").toLowerCase() === String(fallback || "").toLowerCase());
      }
      const userName = picked?.fullName || picked?.name || fallback || "Agent";
      const userId = picked?.id || picked?.userId || null;
      const { res } = await apiFetch(`/api/inbox/conversations/${activeId}/transfer`, {
        method: "POST",
        token: authCtx.token,
        tenantSlug: authCtx.tenantSlug,
        csrfToken: authCtx.csrfToken,
        body: { userId, userName },
      });
      if (!res.ok) {
        setNotice(parseErrorText(await res.text()) || "Transfer failed");
        return;
      }
      await loadConversations();
      await loadMessages(activeId);
      setShowTransfer(false);
    });
  };

  const handleSetLabels = async () => {
    if (!activeId) return;
    setLabelsInput("");
    setShowLabelsModal(true);
    setShowChatMenu(false);
  };

  const submitLabels = async () => {
    await withBusy("labels", async () => {
      const labels = labelsInput.split(",").map((x) => x.trim()).filter(Boolean);
      const { res } = await apiFetch(`/api/inbox/conversations/${activeId}/labels`, {
        method: "POST",
        token: authCtx.token,
        tenantSlug: authCtx.tenantSlug,
        csrfToken: authCtx.csrfToken,
        body: { labels },
      });
      if (!res.ok) {
        setNotice(parseErrorText(await res.text()) || "Labels update failed");
        return;
      }
      await loadConversations();
      await loadMessages(activeId);
      setShowLabelsModal(false);
    });
  };

  const handleNewChat = async () => {
    setNewChatRecipient("");
    setNewChatBody("Hello");
    setShowNewChat(true);
  };

  const submitNewChat = async () => {
    await withBusy("newChat", async () => {
      const recipient = newChatRecipient.trim();
      if (!recipient) {
        setNotice("WhatsApp number is required.");
        return;
      }
      const body = newChatBody.trim() || "Hello";
      const { res } = await apiFetch("/api/messages/send", {
        method: "POST",
        token: authCtx.token,
        tenantSlug: authCtx.tenantSlug,
        csrfToken: authCtx.csrfToken,
        body: {
          recipient,
          body,
          channel: 2,
          idempotencyKey: idempotencyKey(),
        },
      });
      if (!res.ok) {
        setNotice(parseErrorText(await res.text()) || "Unable to start chat");
        return;
      }
      setShowNewChat(false);
      await loadConversations();
    });
  };

  const openProjectSwitch = async () => {
    setShowMainMenu(false);
    try {
      await loadProjects(authCtx.token);
      setScreen("project");
    } catch (e) {
      setNotice(e?.message || "Unable to load projects");
    }
  };

  const openDevicesModal = async () => {
    setShowMainMenu(false);
    setShowDevicesModal(true);
    await withBusy("devices", async () => {
      try {
        await loadDevices();
      } catch (e) {
        setNotice(e?.message || "Unable to load linked devices.");
      }
    });
  };

  const revokeDevice = async (deviceId) => {
    if (!deviceId) return;
    await withBusy("devices", async () => {
      const { res } = await apiFetch(`/api/auth/devices/${deviceId}`, {
        method: "DELETE",
        token: authCtx.token,
        tenantSlug: authCtx.tenantSlug,
        csrfToken: authCtx.csrfToken,
      });
      if (!res.ok) {
        setNotice(parseErrorText(await res.text()) || "Unable to revoke device.");
        return;
      }
      await loadDevices();
    });
  };

  const filtered = contacts.filter(c=>{
    const q=search.toLowerCase();
    const m=c.name.toLowerCase().includes(q)||c.lastMsg.toLowerCase().includes(q);
    if(tab==="Unread")   return m&&c.unread>0;
    if(tab==="Assigned") return m&&[1,3].includes(c.id);
    return m;
  });

  useEffect(() => {
    if (screen !== "app") return;
    if (!authCtx.token || !authCtx.tenantSlug) return;
    if (contacts.length > 0) return;
    loadConversations().catch(() => setCons(CONTACTS));
  }, [screen, authCtx.token, authCtx.tenantSlug]);

  useEffect(() => {
    if (!restored.accessToken) return;
    if (restored.tenantSlug) {
      setScreen("app");
      loadConversations({
        token: restored.accessToken,
        csrfToken: restored.csrfToken || "",
        tenantSlug: restored.tenantSlug,
      }).catch(() => setScreen("project"));
      return;
    }
    loadProjects(restored.accessToken)
      .then(() => setScreen("project"))
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
      });
  }, []);

  const Overlay = ({ children }) => (
    <div style={{
      position:"fixed", inset:0, zIndex:60, background:"rgba(15,23,42,0.45)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:18,
    }}>
      <div style={{
        width:"100%", maxWidth:420, background:"#fff", borderRadius:16,
        boxShadow:"0 16px 40px rgba(0,0,0,0.25)", padding:18,
      }}>
        {children}
      </div>
    </div>
  );

  const SharedDialogs = () => (
    <>
      {notice ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Textzy</h3>
          <p style={{ margin:"0 0 16px", color:C.textSub, lineHeight:1.45, whiteSpace:"pre-wrap" }}>{notice}</p>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setNotice("")} style={{ border:"none", borderRadius:10, padding:"10px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:"pointer" }}>OK</button>
          </div>
        </Overlay>
      ) : null}

      {showNewChat ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Start New Chat</h3>
          <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:6 }}>WhatsApp Number</label>
          <input value={newChatRecipient} onChange={(e)=>setNewChatRecipient(e.target.value)} placeholder="+91xxxxxxxxxx" style={{ width:"100%", border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", marginBottom:10 }} />
          <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:6 }}>Start Message</label>
          <textarea value={newChatBody} onChange={(e)=>setNewChatBody(e.target.value)} rows={3} style={{ width:"100%", border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", marginBottom:12, resize:"vertical" }} />
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={()=>setShowNewChat(false)} style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"9px 14px", background:"#fff", cursor:"pointer" }}>Cancel</button>
            <button disabled={busy.newChat} onClick={submitNewChat} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:busy.newChat?"not-allowed":"pointer", opacity:busy.newChat?0.8:1 }}>{busy.newChat ? "Starting..." : "Start"}</button>
          </div>
        </Overlay>
      ) : null}

      {showTransfer ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Transfer Chat</h3>
          <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:6 }}>Assignee Name or Email</label>
          <input value={transferAssignee} onChange={(e)=>setTransferAssignee(e.target.value)} placeholder="Enter assignee" style={{ width:"100%", border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", marginBottom:8 }} />
          {teamMembers.length > 0 ? (
            <div style={{ maxHeight:120, overflowY:"auto", border:`1px solid ${C.divider}`, borderRadius:10, marginBottom:12 }}>
              {teamMembers.slice(0, 10).map((m, idx) => {
                const label = m.fullName || m.name || m.email || `User ${idx+1}`;
                return <button key={`${label}-${idx}`} onClick={()=>setTransferAssignee(label)} style={{ width:"100%", textAlign:"left", border:"none", borderBottom: idx < Math.min(teamMembers.length,10)-1 ? `1px solid ${C.divider}` : "none", background:"#fff", padding:"8px 10px", cursor:"pointer" }}>{label}</button>;
              })}
            </div>
          ) : null}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={()=>setShowTransfer(false)} style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"9px 14px", background:"#fff", cursor:"pointer" }}>Cancel</button>
            <button disabled={busy.transfer} onClick={submitTransferConversation} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:busy.transfer?"not-allowed":"pointer", opacity:busy.transfer?0.8:1 }}>{busy.transfer ? "Transferring..." : "Transfer"}</button>
          </div>
        </Overlay>
      ) : null}

      {showLabelsModal ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Set Labels</h3>
          <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:6 }}>Comma separated labels</label>
          <input value={labelsInput} onChange={(e)=>setLabelsInput(e.target.value)} placeholder="support, priority-high" style={{ width:"100%", border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", marginBottom:12 }} />
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={()=>setShowLabelsModal(false)} style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"9px 14px", background:"#fff", cursor:"pointer" }}>Cancel</button>
            <button disabled={busy.labels} onClick={submitLabels} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:busy.labels?"not-allowed":"pointer", opacity:busy.labels?0.8:1 }}>{busy.labels ? "Saving..." : "Save"}</button>
          </div>
        </Overlay>
      ) : null}

      {showQaModal ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Select QA</h3>
          <div style={{ maxHeight:180, overflowY:"auto", border:`1px solid ${C.divider}`, borderRadius:10, marginBottom:12 }}>
            {QA_LIBRARY.map((q, i) => (
              <button key={i} onClick={()=>{ setInput((p)=> (p ? `${p}\n` : "") + q); setShowQaModal(false); setTimeout(()=>inputRef.current?.focus(),80); }} style={{ width:"100%", textAlign:"left", border:"none", borderBottom: i < QA_LIBRARY.length - 1 ? `1px solid ${C.divider}` : "none", background:"#fff", padding:"10px 12px", cursor:"pointer" }}>
                {q}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowQaModal(false)} style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"9px 14px", background:"#fff", cursor:"pointer" }}>Close</button>
          </div>
        </Overlay>
      ) : null}

      {showDevicesModal ? (
        <Overlay>
          <h3 style={{ margin:"0 0 10px", fontSize:18, color:C.textMain }}>Linked Devices</h3>
          <div style={{ maxHeight:220, overflowY:"auto", border:`1px solid ${C.divider}`, borderRadius:10, marginBottom:12 }}>
            {devices.length === 0 ? (
              <div style={{ padding:"14px 12px", color:C.textSub, fontSize:14 }}>No linked devices found.</div>
            ) : devices.map((d, idx) => {
              const id = d.id || d.Id || d.deviceId || d.DeviceId;
              const name = d.deviceName || d.DeviceName || "Mobile Device";
              const platform = d.devicePlatform || d.DevicePlatform || "";
              const model = d.deviceModel || d.DeviceModel || "";
              const detail = [platform, model].filter(Boolean).join(" | ");
              return (
                <div key={`${id || idx}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderBottom: idx < devices.length - 1 ? `1px solid ${C.divider}` : "none" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:C.textMain, fontWeight:600, fontSize:14 }}>{name}</div>
                    <div style={{ color:C.textSub, fontSize:12, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{detail || "Active session"}</div>
                  </div>
                  <button disabled={busy.devices} onClick={()=>revokeDevice(id)} style={{ border:`1px solid ${C.danger}33`, background:"#fff", color:C.danger, borderRadius:9, padding:"7px 10px", fontWeight:600, cursor:busy.devices?"not-allowed":"pointer", opacity:busy.devices?0.8:1 }}>Revoke</button>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
            <button disabled={busy.devices} onClick={openDevicesModal} style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"9px 14px", background:"#fff", cursor:busy.devices?"not-allowed":"pointer" }}>{busy.devices ? "Refreshing..." : "Refresh"}</button>
            <button onClick={()=>setShowDevicesModal(false)} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:"pointer" }}>Close</button>
          </div>
        </Overlay>
      ) : null}

      {showSettingsModal ? (
        <Overlay>
          <h3 style={{ margin:"0 0 12px", fontSize:18, color:C.textMain }}>Settings</h3>
          <div style={{ display:"grid", gap:10, marginBottom:14 }}>
            {[
              { label: "Compact chat layout", value: settingsCompact, setter: setSettingsCompact },
              { label: "Message send sound", value: settingsSound, setter: setSettingsSound },
            ].map((row) => (
              <label key={row.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", border:`1px solid ${C.divider}`, borderRadius:10 }}>
                <span style={{ color:C.textMain, fontSize:14 }}>{row.label}</span>
                <input type="checkbox" checked={row.value} onChange={(e)=>row.setter(e.target.checked)} />
              </label>
            ))}
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowSettingsModal(false)} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:"pointer" }}>Done</button>
          </div>
        </Overlay>
      ) : null}

      {showNotificationsModal ? (
        <Overlay>
          <h3 style={{ margin:"0 0 12px", fontSize:18, color:C.textMain }}>Notifications</h3>
          <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", border:`1px solid ${C.divider}`, borderRadius:10, marginBottom:12 }}>
            <span style={{ color:C.textMain, fontSize:14 }}>Enable push notifications</span>
            <input type="checkbox" checked={notifEnabled} onChange={(e)=>setNotifEnabled(e.target.checked)} />
          </label>
          <p style={{ margin:"0 0 12px", color:C.textSub, fontSize:12 }}>
            Notification preferences are stored on this device.
          </p>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button onClick={()=>setShowNotificationsModal(false)} style={{ border:"none", borderRadius:10, padding:"9px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:"pointer" }}>Done</button>
          </div>
        </Overlay>
      ) : null}
    </>
  );

  if (screen==="login")   return <><LoginScreen onLogin={handleLogin}/><SharedDialogs/></>;
  if (screen==="project") return <><ProjectPicker projects={projects} loading={busy.project} onSelect={async (p) => {
    try {
      await handleSelectProject(p);
    } catch (e) {
      setNotice(e?.message || "Project switch failed");
    }
  }}/><SharedDialogs/></>;

  const uname=(user?.email||"User").split("@")[0];

  /* â”€â”€ PROFILE PANEL â”€â”€ */
  if (view==="profile") return (
    <div style={{ minHeight:"100vh",fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#fff" }}>
      {/* header */}
      <div style={{
        background:`linear-gradient(135deg,${C.orange},${C.orangeLight})`,
        padding:"52px 20px 28px",
        display:"flex",alignItems:"flex-end",gap:14,
      }}>
        <button onClick={()=>setView("list")} style={{ position:"absolute",top:16,left:16,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex",backdropFilter:"blur(4px)" }}>
          <I.Back/>
        </button>
        <Avatar name={uname} color={C.headerBg} size={64} online/>
        <div>
          <div style={{ color:"#fff",fontWeight:800,fontSize:20 }}>{uname}</div>
          <div style={{ color:"rgba(255,255,255,0.8)",fontSize:13 }}>{user?.email}</div>
          <div style={{ color:"rgba(255,255,255,0.7)",fontSize:12,marginTop:3 }}>{project?.icon} {project?.name} | {project?.role}</div>
        </div>
      </div>

      {/* menu items */}
      <div style={{ padding:"8px 0" }}>
        {[
          {
            ic:<I.Star/>,
            label:"Starred Messages",
            onClick: ()=>{
              setView("list");
              setTab("All");
              const firstStarredId = Object.keys(starred).find((k)=>starred[k]);
              if (firstStarredId) setAId(Number(firstStarredId));
            },
          },
          { ic:<I.Tag/>, label:"Labels", onClick: handleSetLabels },
          { ic:<I.Device/>, label:"Linked Devices", onClick: openDevicesModal },
          { ic:<I.Cog/>, label:"Settings", onClick: ()=>setShowSettingsModal(true) },
          { ic:<I.Bell/>, label:"Notifications", onClick: ()=>setShowNotificationsModal(true) },
          { ic:<I.ArrowRight/>, label:"Switch Project", onClick: openProjectSwitch },
        ].map((item,i)=>(
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:14,padding:"16px 20px",
            borderBottom:`1px solid ${C.divider}`,cursor:"pointer",
          }}
            onClick={item.onClick}
            onMouseEnter={e=>e.currentTarget.style.background=C.orangePale}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
          >
            <div style={{ width:40,height:40,borderRadius:12,background:C.orangePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:C.orange }}>{item.ic}</div>
            <span style={{ fontWeight:500,fontSize:15,color:C.textMain }}>{item.label}</span>
            <svg style={{marginLeft:"auto"}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
        <div onClick={()=>{
          localStorage.removeItem(SESSION_KEY);
          setSession({ accessToken: "", csrfToken: "", tenantSlug: "" });
          setProjects([]);
          setProject(null);
          setUser(null);
          setCons([]);
          setAId(null);
          setInput("");
          setSearch("");
          setTab("All");
          setScreen("login");
          setView("list");
        }} style={{
          display:"flex",alignItems:"center",gap:14,padding:"16px 20px",cursor:"pointer",
        }}
          onMouseEnter={e=>e.currentTarget.style.background="#FFF1F1"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}
        >
          <div style={{ width:40,height:40,borderRadius:12,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",color:C.danger }}><I.Logout/></div>
          <span style={{ fontWeight:600,fontSize:15,color:C.danger }}>Log Out</span>
        </div>
      </div>
      <SharedDialogs/>
    </div>
  );

  /* â”€â”€ CHAT VIEW â”€â”€ */
  if (view==="chat" && active) return (
    <div style={{ height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.chatBg }}>
      {/* header */}
      <div style={{
        background:`linear-gradient(135deg,${C.headerBg},#16304F)`,
        padding:"10px 12px 10px",
        display:"flex",alignItems:"center",gap:10,flexShrink:0,
        boxShadow:"0 2px 12px rgba(30,58,95,0.3)",
        paddingTop:"calc(10px + env(safe-area-inset-top,0px))",
        position:"relative",
      }}>
        <button onClick={()=>setView("list")} style={{ background:"rgba(255,255,255,0.12)",border:"none",color:"#fff",padding:"7px 9px",borderRadius:10,cursor:"pointer",display:"flex",flexShrink:0 }}>
          <I.Back/>
        </button>
        <Avatar name={active.name} color={active.color} size={38} online={active.online}/>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ color:"#fff",fontWeight:700,fontSize:15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{active.name}</div>
          <div style={{ fontSize:12 }}>
            {active.typing
              ? <span style={{color:C.orangeLight,fontStyle:"italic"}}>typing...</span>
              : <span style={{color:"rgba(255,255,255,0.65)"}}>{active.online?"Online":"Last seen recently"}</span>}
          </div>
        </div>
        <button style={{ background:"rgba(255,255,255,0.12)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex" }}>
          <I.Phone/>
        </button>
        <button style={{ background:"rgba(255,255,255,0.12)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex" }}>
          <I.Video/>
        </button>
        <button onClick={()=>setShowChatMenu(v=>!v)} style={{ background:"rgba(255,255,255,0.12)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex" }}>
          <I.More/>
        </button>
            </div>
      {showChatMenu && (
        <div style={{ position:"absolute", top:"calc(10px + env(safe-area-inset-top,0px) + 58px)", right:12, zIndex:5, background:"#fff", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", overflow:"hidden" }}>
          {[
            { label: "Transfer", onClick: handleTransferConversation },
            { label: "Labels", onClick: handleSetLabels },
            { label: starred[activeId] ? "Unstar Chat" : "Star Chat", onClick: () => { setStarred((p)=>({ ...p, [activeId]: !p[activeId] })); setShowChatMenu(false);} },
            { label: "Insert QA", onClick: () => { setShowChatMenu(false); setShowQaModal(true); } },
          ].map((item)=> (
            <button key={item.label} onClick={item.onClick} style={{ display:"block", width:"100%", textAlign:"left", background:"#fff", border:"none", padding:"11px 14px", fontSize:14, cursor:"pointer" }}>{item.label}</button>
          ))}
        </div>
      )}

      {/* messages */}
      <div style={{
        flex:1,overflowY:"auto",padding:"14px 14px",
        background:C.chatBg,
        backgroundImage:`url("data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23F97316' fill-opacity='0.04'%3E%3Cpath d='M10 10h10v10H10zm22 0h10v10H32zm0 22h10v10H32zM10 32h10v10H10z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}>
        <div style={{ textAlign:"center",marginBottom:14 }}>
          <span style={{ background:"rgba(255,255,255,0.9)",color:C.textSub,fontSize:11,padding:"4px 14px",borderRadius:20,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",fontWeight:500 }}>TODAY</span>
        </div>

        {active.messages.map(msg=>(
          <div key={msg.id} style={{ display:"flex",justifyContent:msg.sent?"flex-end":"flex-start",marginBottom:5,animation:"fadeUp 0.18s ease-out" }}>
            <div style={{
              maxWidth:"78%", padding:"9px 13px 6px",
              background:msg.sent?C.bubbleSent:C.bubbleRecv,
              borderRadius:msg.sent?"16px 16px 3px 16px":"16px 16px 16px 3px",
              boxShadow:msg.sent?`0 2px 8px ${C.orange}22`:"0 1px 4px rgba(0,0,0,0.08)",
            }}>
              <p style={{ margin:0,fontSize:15,color:C.textMain,lineHeight:1.45,wordBreak:"break-word" }}>{msg.text}</p>
              <div style={{ display:"flex",justifyContent:"flex-end",alignItems:"center",gap:3,marginTop:4 }}>
                <span style={{ fontSize:11,color:C.textMuted }}>{msg.time}</span>
                {msg.sent&&(msg.status==="read"?<I.DblChk/>:<I.Check/>)}
              </div>
            </div>
          </div>
        ))}

        {active.typing && (
          <div style={{ display:"flex",justifyContent:"flex-start",marginBottom:5 }}>
            <div style={{ background:C.bubbleRecv,borderRadius:"16px 16px 16px 3px",boxShadow:"0 1px 4px rgba(0,0,0,0.08)" }}>
              <Typing/>
            </div>
          </div>
        )}
        <div ref={msgEnd}/>
      </div>

      {/* input bar */}
      <div style={{
        background:"#fff",padding:"10px 12px 10px",
        display:"flex",alignItems:"center",gap:8,flexShrink:0,
        borderTop:`1px solid ${C.divider}`,
        boxShadow:"0 -2px 12px rgba(0,0,0,0.06)",
        paddingBottom:"calc(10px + env(safe-area-inset-bottom,0px))",
      }}>
        <button onClick={handleEmoji} style={{ background:"none",border:"none",color:C.iconColor,cursor:"pointer",padding:"6px",display:"flex",borderRadius:"50%" }}>
          <I.Emoji/>
        </button>
        <button onClick={handleAttachClick} style={{ background:"none",border:"none",color:C.iconColor,cursor:"pointer",padding:"6px",display:"flex",borderRadius:"50%" }}>
          <I.Attach/>
        </button>
        <div style={{ flex:1,background:C.panelBg,borderRadius:22,padding:"11px 16px",border:`1.5px solid ${C.divider}`,display:"flex",alignItems:"center",transition:"border-color 0.2s" }}
          onFocusCapture={e=>e.currentTarget.style.borderColor=C.orange}
          onBlurCapture={e=>e.currentTarget.style.borderColor=C.divider}
        >
          <input ref={inputRef} value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="Type a message..."
            style={{ border:"none",outline:"none",flex:1,fontSize:15,color:C.textMain,background:"transparent",fontFamily:"inherit" }}
          />
        </div>
        <button disabled={busy.send} onClick={input.trim()?send:handleMicInput} style={{
          width:48,height:48,borderRadius:"50%",border:"none",flexShrink:0,
          background:input.trim()?`linear-gradient(135deg,${C.orange},${C.orangeLight})`:C.divider,
          color:input.trim()?"#fff":C.textSub,
          cursor:busy.send?"not-allowed":"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:input.trim()?`0 4px 16px ${C.orange}55`:"none",
          transition:"all 0.2s",
          opacity:busy.send?0.8:1,
        }}>
          {busy.send
            ? <span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.7)", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
            : (input.trim()?<I.Send/>:<I.Mic/>)}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display:"none" }}
          onChange={handleAttachmentSelected}
        />
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <SharedDialogs/>
    </div>
  );

  /* â”€â”€ INBOX LIST VIEW â”€â”€ */
  return (
    <div style={{ height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#fff" }}>
      {/* header */}
      <div style={{
        background:`linear-gradient(135deg,${C.orange} 0%,${C.orangeLight} 100%)`,
        padding:"10px 16px 14px",
        paddingTop:"calc(10px + env(safe-area-inset-top,0px))",
        flexShrink:0,
        boxShadow:"0 2px 16px rgba(249,115,22,0.35)",
        position:"relative",
      }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
          <button onClick={()=>setView("profile")} style={{ background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0 }}>
            <Avatar name={uname} color="rgba(255,255,255,0.3)" size={38} online/>
          </button>
          <div style={{ flex:1 }}>
            <div style={{ color:"#fff",fontWeight:800,fontSize:18 }}>Textzy</div>
            <div style={{ color:"rgba(255,255,255,0.75)",fontSize:12 }}>{project?.icon} {project?.name}</div>
          </div>
          <button style={{ background:"rgba(255,255,255,0.18)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex",backdropFilter:"blur(4px)" }}>
            <I.Search/>
          </button>
          <button onClick={()=>setShowMainMenu(v=>!v)} style={{ background:"rgba(255,255,255,0.18)",border:"none",color:"#fff",padding:"8px",borderRadius:10,cursor:"pointer",display:"flex",backdropFilter:"blur(4px)" }}>
            <I.More/>
          </button>
                </div>
        {showMainMenu && (
          <div style={{ position:"absolute", right:16, top:"calc(10px + env(safe-area-inset-top,0px) + 50px)", zIndex:6, background:"#fff", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.18)", overflow:"hidden", minWidth:170 }}>
            {[
              { label: "Switch Project", onClick: openProjectSwitch },
              { label: "Settings", onClick: ()=>{ setShowMainMenu(false); setView("profile"); } },
              { label: "Notifications", onClick: ()=>{ setShowMainMenu(false); setShowNotificationsModal(true); } },
            ].map(item => (
              <button key={item.label} onClick={item.onClick} style={{ display:"block", width:"100%", textAlign:"left", border:"none", background:"#fff", padding:"11px 14px", fontSize:14, cursor:"pointer" }}>{item.label}</button>
            ))}
          </div>
        )}

        {/* search bar */}
        <div style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.22)",borderRadius:12,padding:"9px 14px",backdropFilter:"blur(4px)" }}>
          <span style={{ color:"rgba(255,255,255,0.8)",display:"flex",flexShrink:0 }}><I.Search/></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations..."
            style={{ border:"none",outline:"none",flex:1,fontSize:14,color:"#fff",background:"transparent",fontFamily:"inherit" }}
          />
          {search&&<button onClick={()=>setSearch("")} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.7)",padding:0,display:"flex" }}><I.Close/></button>}
        </div>
      </div>

      {/* tabs */}
      <div style={{ display:"flex",background:"#fff",borderBottom:`2px solid ${C.divider}`,flexShrink:0 }}>
        {["All","Unread","Assigned"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1,padding:"11px 4px",border:"none",background:"none",
            fontWeight:tab===t?700:500, color:tab===t?C.orange:C.textSub,
            fontSize:14,cursor:"pointer",fontFamily:"inherit",
            borderBottom:`3px solid ${tab===t?C.orange:"transparent"}`,
            marginBottom:-2, transition:"all 0.15s",
          }}>
            {t}
            {t==="Unread"&&unreadCount>0&&(
              <span style={{ marginLeft:5,background:C.unread,color:"#fff",borderRadius:20,padding:"0 6px",fontSize:11,fontWeight:700 }}>
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* conversation list */}
      <div style={{ flex:1,overflowY:"auto" }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:"center",padding:"60px 20px",color:C.textMuted }}>
            <div style={{ fontSize:44,marginBottom:10 }}>...</div>
            <div style={{ fontSize:15,fontWeight:500 }}>No conversations found</div>
          </div>
        ) : filtered.map((c,i)=>(
          <div key={c.id} onClick={()=>openChat(c.id)} style={{
            display:"flex",alignItems:"center",gap:13,padding:"13px 16px",
            cursor:"pointer",borderBottom:`1px solid ${C.divider}`,
            background:"#fff",transition:"background 0.1s",
            animation:`fadeUp 0.2s ease-out ${i*0.04}s both`,
          }}
            onMouseEnter={e=>e.currentTarget.style.background=C.orangePale}
            onMouseLeave={e=>e.currentTarget.style.background="#fff"}
          >
            <Avatar name={c.name} color={c.color} size={52} online={c.online}/>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"baseline" }}>
                <span style={{ fontWeight:700,fontSize:15,color:C.textMain,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"65%" }}>{c.name}</span>
                <span style={{ fontSize:11,color:c.unread>0?C.orange:C.textMuted,flexShrink:0,fontWeight:c.unread>0?600:400 }}>{c.time}</span>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontSize:13,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"82%" }}>
                  {c.typing?<em style={{color:C.orange,fontStyle:"normal",fontWeight:500}}>typing...</em>:c.lastMsg}
                </span>
                {c.unread>0&&(
                  <span style={{ background:C.unread,color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:700,flexShrink:0,boxShadow:`0 2px 6px ${C.orange}44` }}>
                    {c.unread}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* fab */}
      <button onClick={handleNewChat} style={{
        position:"fixed",bottom:28,right:20,
        width:58,height:58,borderRadius:"50%",border:"none",
        background:`linear-gradient(135deg,${C.orange},${C.orangeLight})`,
        color:"#fff",cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:`0 6px 24px ${C.orange}66`,
        fontSize:26,fontWeight:300,
      }}><I.Plus/></button>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <SharedDialogs/>
    </div>
  );
}



