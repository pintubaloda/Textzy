import { useState, useRef, useEffect, useMemo } from "react";
import { getPublicAppUpdateManifest } from "./lib/api";
import TextzyWindowsDesktop from "./textzy-windows-desktop";

/* ═══════════════════════════════════
   TEXTZY BRAND COLOURS (from logo)
   Orange #F97316 · Navy #111827
═══════════════════════════════════ */
const C = {
  orange:      "#F97316",
  orangeHover: "#EA6C0A",
  orangeDark:  "#C2560A",
  orangePale:  "#FFF7ED",
  orangeLight: "#FFEDD5",
  orangeMid:   "#FB923C",
  navy:        "#111827",
  navyMid:     "#1F2937",
  navyLight:   "#374151",
  sidebarBg:   "#FFFFFF",
  chatBg:      "#F3F4F6",
  headerBg:    "#111827",
  bubbleSent:  "#FFEDD5",
  bubbleRecv:  "#FFFFFF",
  inputBg:     "#FFFFFF",
  panelBg:     "#F9FAFB",
  textMain:    "#111827",
  textSub:     "#6B7280",
  textLight:   "#FFFFFF",
  textMuted:   "#9CA3AF",
  divider:     "#E5E7EB",
  hover:       "#F9FAFB",
  selected:    "#FFF7ED",
  unread:      "#F97316",
  online:      "#22C55E",
  iconGrey:    "#6B7280",
  danger:      "#EF4444",
};

const API_BASE =
  (typeof window !== "undefined" && window.__APP_CONFIG__?.API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  process.env.VITE_API_BASE ||
  "https://textzy-backend-production.up.railway.app";

const SESSION_KEY = "textzy.desktop.session";

const idempotencyKey = () =>
  `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const mapConversation = (x) => {
  const id = x.id ?? x.Id ?? "";
  const customerName = x.customerName ?? x.CustomerName ?? "";
  const customerPhone = x.customerPhone ?? x.CustomerPhone ?? "";
  const status = x.status ?? x.Status ?? "";
  const lastMessageAtUtc = x.lastMessageAtUtc ?? x.LastMessageAtUtc ?? null;
  const createdAtUtc = x.createdAtUtc ?? x.CreatedAtUtc ?? null;
  const assignedUserName = x.assignedUserName ?? x.AssignedUserName ?? "";
  const labelsCsv = x.labelsCsv ?? x.LabelsCsv ?? "";
  return {
    id,
    customerPhone,
    name: customerName || customerPhone || "Conversation",
    color: "#F97316",
    online: false,
    unread: Number(x.unreadCount ?? x.UnreadCount ?? 0),
    time: lastMessageAtUtc
      ? new Date(lastMessageAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : (createdAtUtc ? new Date(createdAtUtc).toLocaleDateString() : ""),
    lastMsg: status || "Conversation",
    typing: false,
    assignedUserName,
    labelsCsv,
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
    text,
    time: createdAt
      ? new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "now",
    status: rawStatus || "sent",
  };
};

async function apiFetch(path, { method = "GET", token = "", tenantSlug = "", csrfToken = "", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantSlug && !path.startsWith("/api/auth/") && !path.startsWith("/api/public/")) headers["X-Tenant-Slug"] = tenantSlug;
  if (body != null) headers["Content-Type"] = "application/json";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  const nextTokenHeader = res.headers.get("x-access-token") || "";
  const nextCsrfHeader = res.headers.get("x-csrf-token") || "";
  return { res, nextTokenHeader, nextCsrfHeader };
}

/* ── MOCK DATA ── */
const MOCK_CONTACTS = [
  { id:1, name:"Alice Johnson", color:"#7C3AED", online:true, unread:2, time:"10:42 AM",
    lastMsg:"Sure, I'll send the report by EOD 👍", typing:false,
    messages:[
      {id:1,text:"Hey! Did you review the Q3 report?",sent:false,time:"10:30 AM",status:"read"},
      {id:2,text:"Yes, looks great! Just a few numbers to double-check.",sent:true,time:"10:35 AM",status:"read"},
      {id:3,text:"Which ones? I can fix right now.",sent:false,time:"10:38 AM",status:"read"},
      {id:4,text:"Pages 4 and 7 — revenue projections seem off.",sent:true,time:"10:40 AM",status:"read"},
      {id:5,text:"Sure, I'll send the report by EOD 👍",sent:false,time:"10:42 AM",status:"read"},
    ]},
  { id:2, name:"Bob Martinez", color:"#DC2626", online:false, unread:0, time:"9:15 AM",
    lastMsg:"Meeting rescheduled to 3 PM", typing:false,
    messages:[
      {id:1,text:"Are we still on for the 2 PM sync?",sent:false,time:"8:50 AM",status:"read"},
      {id:2,text:"Let me check with the team.",sent:true,time:"8:55 AM",status:"read"},
      {id:3,text:"Meeting rescheduled to 3 PM",sent:false,time:"9:15 AM",status:"read"},
    ]},
  { id:3, name:"Customer Support", color:"#0891B2", online:true, unread:1, time:"Yesterday",
    lastMsg:"Ticket #4821 has been resolved ✅", typing:true,
    messages:[
      {id:1,text:"Hello, I need help with my subscription.",sent:true,time:"Yesterday",status:"read"},
      {id:2,text:"Hi! Happy to help. Share your account email?",sent:false,time:"Yesterday",status:"read"},
      {id:3,text:"user@example.com",sent:true,time:"Yesterday",status:"read"},
      {id:4,text:"Ticket #4821 has been resolved ✅",sent:false,time:"Yesterday",status:"read"},
    ]},
  { id:4, name:"Dev Team 🛠️", color:"#059669", online:true, unread:0, time:"Yesterday",
    lastMsg:"Deployment to prod is done 🚀", typing:false,
    messages:[
      {id:1,text:"Starting prod deployment...",sent:false,time:"Yesterday",status:"read"},
      {id:2,text:"Pipeline passed all checks 🟢",sent:false,time:"Yesterday",status:"read"},
      {id:3,text:"Deployment to prod is done 🚀",sent:false,time:"Yesterday",status:"read"},
    ]},
  { id:5, name:"Sarah Patel", color:"#7C3AED", online:false, unread:0, time:"Mon",
    lastMsg:"Can you review my PR?", typing:false,
    messages:[
      {id:1,text:"Just pushed my feature branch.",sent:false,time:"Mon",status:"read"},
      {id:2,text:"Looks good from the summary!",sent:true,time:"Mon",status:"read"},
      {id:3,text:"Can you review my PR?",sent:false,time:"Mon",status:"read"},
    ]},
  { id:6, name:"Marketing Hub", color:"#D97706", online:false, unread:3, time:"Sun",
    lastMsg:"New campaign brief is ready 📎", typing:false,
    messages:[
      {id:1,text:"Q4 campaign planning has started!",sent:false,time:"Sun",status:"read"},
      {id:2,text:"New campaign brief is ready 📎",sent:false,time:"Sun",status:"read"},
    ]},
];

const MOCK_PROJECTS = [
  {slug:"moneyart",  name:"MoneyArt",  icon:"💰", role:"Agent"},
  {slug:"techcorp",  name:"TechCorp",  icon:"🖥️", role:"Admin"},
  {slug:"retailhub", name:"RetailHub", icon:"🛒", role:"Agent"},
];

const AUTO_REPLIES = [
  "Got it, thanks! 👍","Sure thing!","I'll check and get back to you.",
  "Sounds good!","On it 🚀","Thanks for the update!","Will do ✅",
  "Let me look into this.","Perfect! 🙌","Noted!",
];

/* ════════════════════════════════
   DETECT DEVICE TYPE
════════════════════════════════ */
const getDeviceType = () => {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|tablet|(android(?!.*mobile))/.test(ua);
  const isMobile = /iphone|ipod|android.*mobile|mobile/.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  if (isTablet || (isSmallScreen && !isMobile)) return "tablet";
  if (isMobile || isSmallScreen) return "mobile";
  return "desktop";
};

/* ════════════════════════════════
   TEXTZY LOGO
════════════════════════════════ */
const TextzyLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="#F97316"/>
    <path d="M8 12C8 10.343 9.343 9 11 9H29C30.657 9 32 10.343 32 12V22C32 23.657 30.657 25 29 25H22L16 31V25H11C9.343 25 8 23.657 8 22V12Z" fill="white"/>
  </svg>
);

/* ════════════════════════════════
   QR CODE SVG (decorative grid)
════════════════════════════════ */
const QRCodeDisplay = ({ token = "textzy-pair-token", size = 200 }) => {
  const seed = token.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells = 21;
  const cs = size / cells;
  const grid = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      // Finder patterns (corners)
      if ((r < 7 && c < 7) || (r < 7 && c > 13) || (r > 13 && c < 7)) return true;
      if (r === 0 || r === 6 || c === 0 || c === 6) return false;
      if ((r >= 14 && (r === 14 || r === 20)) || (c >= 14 && (c === 14 || c === 20))) return true;
      if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
      if (r >= 2 && r <= 4 && c >= 16 && c <= 18) return true;
      if (r >= 16 && r <= 18 && c >= 2 && c <= 4) return true;
      const h = (seed * r * 31 + c * 17 + r + c) % 7;
      return h < 3;
    })
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx="10"/>
      {grid.map((row, r) => row.map((on, c) =>
        on && <rect key={`${r}-${c}`} x={c*cs+1} y={r*cs+1} width={cs-1} height={cs-1} fill="#111827" rx="1"/>
      ))}
      {/* Center Textzy logo overlay */}
      <rect x={size/2-18} y={size/2-18} width="36" height="36" rx="8" fill="white"/>
      <rect x={size/2-14} y={size/2-14} width="28" height="28" rx="7" fill="#F97316"/>
      <path d={`M${size/2-8} ${size/2-5}h11a2.5 2.5 0 010 5h-3v5h-4v-5h-4z`} fill="white"/>
    </svg>
  );
};

/* ════════════════════════════════
   MOBILE QR SCANNER VIEW
   (Camera viewfinder simulation)
════════════════════════════════ */
const MobileQRScanner = ({ onScanned }) => {
  const [scanning, setScanning] = useState(true);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    // Simulate scan progress
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setFound(true);
          setTimeout(() => onScanned({ email: "mobile-qr@textzy.io" }), 1000);
          return 100;
        }
        return p + 2;
      });
    }, 60);
    return () => clearInterval(interval);
  }, [scanning]);

  return (
    <div style={{ position:"relative", width:"100%", aspectRatio:"1/1", borderRadius:20, overflow:"hidden", background:"#000" }}>
      {/* Camera feed simulation */}
      <div style={{
        position:"absolute", inset:0,
        background: found
          ? "linear-gradient(135deg, #052e16, #14532d)"
          : "linear-gradient(135deg, #0c1445 0%, #111827 40%, #1a0a00 100%)",
        transition:"background 0.5s",
      }}/>

      {/* Scan line animation */}
      {!found && (
        <div style={{
          position:"absolute", left:"15%", right:"15%", height:2,
          background:`linear-gradient(90deg, transparent, ${C.orange}, transparent)`,
          top:`${15 + (progress * 0.7)}%`,
          boxShadow:`0 0 12px ${C.orange}`,
          transition:"top 0.1s linear",
        }}/>
      )}

      {/* Corner brackets */}
      {!found && ["tl","tr","bl","br"].map(pos => (
        <div key={pos} style={{
          position:"absolute",
          ...(pos.includes("t") ? {top:"14%"} : {bottom:"14%"}),
          ...(pos.includes("l") ? {left:"14%"} : {right:"14%"}),
          width:32, height:32,
          borderTop:   pos.includes("t") ? `3px solid ${C.orange}` : "none",
          borderBottom:pos.includes("b") ? `3px solid ${C.orange}` : "none",
          borderLeft:  pos.includes("l") ? `3px solid ${C.orange}` : "none",
          borderRight: pos.includes("r") ? `3px solid ${C.orange}` : "none",
          borderRadius: pos==="tl"?"6px 0 0 0": pos==="tr"?"0 6px 0 0": pos==="bl"?"0 0 0 6px":"0 0 6px 0",
        }}/>
      ))}

      {/* QR target zone */}
      <div style={{
        position:"absolute", top:"14%", left:"14%", right:"14%", bottom:"14%",
        border:`1px dashed ${found ? C.online : "rgba(249,115,22,0.35)"}`,
        borderRadius:12, transition:"border-color 0.3s",
      }}/>

      {/* Success overlay */}
      {found && (
        <div style={{
          position:"absolute", inset:0, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:10,
          animation:"fadeUp 0.3s ease-out",
        }}>
          <div style={{
            width:64, height:64, borderRadius:"50%", background:C.online,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 0 24px ${C.online}88`,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ color:"#fff", fontWeight:700, fontSize:16, margin:0 }}>QR Code Detected!</p>
          <p style={{ color:"rgba(255,255,255,0.7)", fontSize:13, margin:0 }}>Verifying with server…</p>
        </div>
      )}

      {/* Bottom label */}
      {!found && (
        <div style={{
          position:"absolute", bottom:16, left:0, right:0,
          textAlign:"center",
        }}>
          <p style={{ color:"rgba(255,255,255,0.85)", fontSize:13, fontWeight:500, margin:0 }}>
            Point camera at the QR on your computer
          </p>
          <p style={{ color:"rgba(249,115,22,0.8)", fontSize:11, margin:"4px 0 0" }}>
            Scanning… {progress}%
          </p>
        </div>
      )}
    </div>
  );
};

/* ════════════════════════════════
   ICONS
════════════════════════════════ */
const Ico = {
  Search:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Send:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>,
  Attach:  ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
  Emoji:   ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  Mic:     ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  More:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>,
  NewChat: ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>,
  Phone:   ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>,
  Video:   ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  Info:    ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Back:    ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Logout:  ()=><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Close:   ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Camera:  ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Monitor: ()=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  Check:   ()=><svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5L4.5 8.5L12 1" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  DblChk:  ()=><svg width="18" height="11" viewBox="0 0 18 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 5.5L10.5 9L17 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* ════════════════════════════════
   AVATAR
════════════════════════════════ */
const Avatar = ({ name, color, size=44, online=false }) => (
  <div style={{ position:"relative", flexShrink:0 }}>
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background:`linear-gradient(135deg,${color}DD,${color}88)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.35, fontWeight:700, color:"#fff",
      boxShadow:"0 1px 4px rgba(0,0,0,0.15)",
    }}>
      {name.replace(/[^\w\s]/gi,"").trim().split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?"}
    </div>
    {online && <div style={{ position:"absolute", bottom:1, right:1, width:size*0.27, height:size*0.27, borderRadius:"50%", background:C.online, border:"2px solid #fff" }}/>}
  </div>
);

/* ════════════════════════════════
   ICON BUTTON
════════════════════════════════ */
const IBtn = ({ children, onClick, col=C.iconGrey, hov=C.divider, light=false }) => {
  const [h,setH]=useState(false);
  return (
    <button onClick={onClick} style={{
      background:h?(light?"rgba(255,255,255,0.15)":hov):"none", border:"none",
      color:light?"rgba(255,255,255,0.85)":col, cursor:"pointer",
      padding:"7px", borderRadius:"50%", display:"flex", alignItems:"center",
      justifyContent:"center", transition:"background 0.15s", flexShrink:0,
    }} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}>
      {children}
    </button>
  );
};

/* ════════════════════════════════
   TYPING DOTS
════════════════════════════════ */
const Typing = () => (
  <div style={{ display:"flex", gap:4, alignItems:"center", padding:"10px 14px" }}>
    {[0,1,2].map(i=>(
      <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:C.textMuted,
        animation:`tdot 1.2s ease-in-out ${i*0.2}s infinite` }}/>
    ))}
  </div>
);

/* ════════════════════════════════════════════════════
   SCREEN 1A — LOGIN (DESKTOP / LAPTOP)
   Shows: email/password form
   QR tab shows: QR generated from backend for mobile to scan
════════════════════════════════════════════════════ */
const DesktopLogin = ({ onPasswordLogin, onCreatePairQr, qrState, onRequestEmailOtp, onVerifyEmailOtp }) => {
  const [tab, setTab]     = useState("password");
  const [email, setEmail] = useState("admin@textzy.io");
  const [pass, setPass]   = useState("password123");
  const [otp, setOtp]     = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [loading, setLoad]= useState(false);
  const [err, setErr]     = useState("");
  const [qrTimer, setQT]  = useState(180);
  const [qrActive, setQA] = useState(false);

  useEffect(() => {
    if (tab !== "qr") {
      setQA(false);
      return;
    }
    let alive = true;
    setErr("");
    onCreatePairQr?.().catch((e) => alive && setErr(e?.message || "Failed to generate QR"));
    return () => {
      alive = false;
    };
  }, [tab, onCreatePairQr]);

  useEffect(() => {
    if (!qrState?.expiresAtUtc) return;
    const tick = () => {
      const ms = new Date(qrState.expiresAtUtc).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(ms / 1000));
      setQT(secs);
      setQA(secs > 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [qrState?.expiresAtUtc]);

  const submit = async () => {
    if (!email || !pass) { setErr("Please fill all fields."); return; }
    if (!otpVerified) { setErr("Please verify your email OTP first."); return; }
    setLoad(true);
    setErr("");
    try {
      await onPasswordLogin?.({ email, password: pass, emailVerificationId: verificationId });
    } catch (e) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoad(false);
    }
  };

  const requestOtp = async () => {
    if (!email) { setErr("Enter email first."); return; }
    setErr("");
    setOtpBusy(true);
    try {
      const data = await onRequestEmailOtp?.(email);
      setVerificationId(data?.verificationId || "");
      setVerificationCode(data?.verificationCode || "");
      setOtpSent(true);
      setOtpVerified(false);
    } catch (e) {
      setErr(e?.message || "Failed to send OTP.");
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!verificationId || !otp) { setErr("Enter OTP first."); return; }
    setErr("");
    setVerifyBusy(true);
    try {
      await onVerifyEmailOtp?.({ email, verificationId, otp });
      setOtpVerified(true);
    } catch (e) {
      setErr(e?.message || "Invalid OTP.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:`linear-gradient(150deg, ${C.navy} 0%, ${C.navyMid} 55%, #1c2e40 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif", position:"relative", overflow:"hidden",
    }}>
      {/* bg blobs */}
      <div style={{ position:"absolute",top:-100,right:-80,width:360,height:360,borderRadius:"50%",background:"rgba(249,115,22,0.07)",pointerEvents:"none" }}/>
      <div style={{ position:"absolute",bottom:-120,left:-60,width:420,height:420,borderRadius:"50%",background:"rgba(249,115,22,0.05)",pointerEvents:"none" }}/>

      <div style={{
        background:"#fff", borderRadius:24, padding:"40px 38px 32px",
        width:"100%", maxWidth:420, boxShadow:"0 32px 80px rgba(0,0,0,0.4)",
        position:"relative", zIndex:1,
      }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:6 }}>
            <TextzyLogo size={40}/>
            <span style={{ fontSize:28, fontWeight:800, color:C.navy, letterSpacing:"-0.5px" }}>Textzy</span>
          </div>
          <p style={{ margin:0, color:C.textSub, fontSize:13 }}>WhatsApp Business Inbox</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display:"flex", background:C.panelBg, borderRadius:10, padding:4, marginBottom:24 }}>
          {[["password","🔑 Password"],["qr","📱 Link Mobile"]].map(([m,label]) => (
            <button key={m} onClick={()=>{setTab(m);setErr("");}} style={{
              flex:1, padding:"9px 0", border:"none", borderRadius:8,
              background:tab===m?"#fff":"transparent",
              color:tab===m?C.orange:C.textSub,
              fontWeight:tab===m?700:500, fontSize:13, cursor:"pointer",
              boxShadow:tab===m?"0 1px 4px rgba(0,0,0,0.1)":"none",
              transition:"all 0.2s", fontFamily:"inherit",
            }}>{label}</button>
          ))}
        </div>

        {tab === "password" ? (
          /* ── PASSWORD FORM ── */
          <>
            {[{l:"Email",v:email,s:setEmail,t:"email",p:"you@company.com"},{l:"Password",v:pass,s:setPass,t:"password",p:"••••••••"}].map(f=>(
              <div key={f.l} style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.7px" }}>{f.l}</label>
                <input type={f.t} value={f.v} placeholder={f.p}
                  onChange={e=>{
                    f.s(e.target.value);
                    setErr("");
                    if (f.l === "Email") {
                      setOtpSent(false);
                      setOtpVerified(false);
                      setOtp("");
                      setVerificationId("");
                      setVerificationCode("");
                    }
                  }}
                  onKeyDown={e=>e.key==="Enter"&&submit()}
                  style={{ width:"100%",padding:"11px 14px",borderRadius:10,boxSizing:"border-box",border:`1.5px solid ${C.divider}`,fontSize:14,color:C.textMain,outline:"none",fontFamily:"inherit",transition:"border-color 0.2s" }}
                  onFocus={e=>e.target.style.borderColor=C.orange}
                  onBlur={e=>e.target.style.borderColor=C.divider}
                />
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <button onClick={requestOtp} disabled={otpBusy} style={{ flex:1,padding:"10px 12px",borderRadius:10,border:`1px solid ${C.divider}`,background:"#fff",fontWeight:700,color:C.textMain,cursor:otpBusy?"not-allowed":"pointer" }}>
                {otpBusy ? "Sending..." : "Verify Email"}
              </button>
              <input
                value={otp}
                onChange={(e)=>setOtp(e.target.value)}
                placeholder="Enter OTP"
                style={{ width:140,padding:"10px 12px",borderRadius:10,border:`1px solid ${C.divider}`,fontSize:13 }}
              />
              <button onClick={verifyOtp} disabled={verifyBusy || !otpSent} style={{ padding:"10px 12px",borderRadius:10,border:"none",background:C.orange,color:"#fff",fontWeight:700,cursor:(verifyBusy || !otpSent)?"not-allowed":"pointer",opacity:(verifyBusy || !otpSent)?0.8:1 }}>
                {verifyBusy ? "..." : "Verify"}
              </button>
            </div>
            {otpSent && (
              <p style={{ fontSize:12, color: otpVerified ? C.online : C.textSub, margin:"0 0 8px" }}>
                {otpVerified ? "Email verified successfully." : `Mail sent. Verification code: ${verificationCode || "-"}`}
              </p>
            )}
            {err && <p style={{ color:C.danger,fontSize:13,marginBottom:10,textAlign:"center" }}>{err}</p>}
            <button onClick={submit} style={{
              width:"100%",padding:13,borderRadius:10,border:"none",
              background:`linear-gradient(135deg,${C.orange},${C.orangeMid})`,
              color:"#fff",fontWeight:700,fontSize:15,cursor:loading?"not-allowed":"pointer",
              fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              boxShadow:`0 4px 20px ${C.orange}44`,opacity:loading?0.85:1,transition:"opacity 0.2s",
            }}>
              {loading
                ? <><div style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>Signing in…</>
                : "Sign In →"}
            </button>
          </>
        ) : (
          /* ── QR DISPLAY (desktop shows QR for mobile to scan) ── */
          <div style={{ textAlign:"center" }}>
            {/* Instruction steps */}
            <div style={{ background:C.panelBg,borderRadius:12,padding:"12px 14px",marginBottom:18,textAlign:"left" }}>
              {[
                ["1","Open Textzy app on your phone or tablet"],
                ["2","Tap  Settings → Connect to Web"],
                ["3","Point your camera at this QR code"],
              ].map(([n,t]) => (
                <div key={n} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:n==="3"?0:8 }}>
                  <div style={{ width:22,height:22,borderRadius:"50%",background:C.orange,color:"#fff",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{n}</div>
                  <span style={{ fontSize:13,color:C.textMain }}>{t}</span>
                </div>
              ))}
            </div>

            {/* QR Code */}
            <div style={{
              display:"inline-block", padding:12, background:"#fff",
              borderRadius:16, boxShadow:`0 0 0 3px ${qrActive ? C.orange : C.divider}66, 0 6px 24px rgba(0,0,0,0.1)`,
              transition:"box-shadow 0.4s", position:"relative",
              filter: qrTimer===0 ? "blur(5px) grayscale(1)" : "none",
            }}>
              {qrState?.qrImageDataUrl ? (
                <img src={qrState.qrImageDataUrl} alt="Textzy Pair QR" style={{ width: 184, height: 184, borderRadius: 8 }} />
              ) : (
                <QRCodeDisplay token={qrState?.pairingToken || "textzy-web-session-demo"} size={184} />
              )}
            </div>

            {qrTimer === 0 ? (
              <div style={{ marginTop:14 }}>
                <p style={{ color:C.danger,fontWeight:600,fontSize:13,marginBottom:8 }}>⏱ QR expired</p>
                <button onClick={()=>onCreatePairQr?.()} style={{ padding:"8px 20px",borderRadius:8,border:"none",background:C.orange,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer" }}>Refresh QR</button>
              </div>
            ) : (
              <div style={{ marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                <div style={{ width:8,height:8,borderRadius:"50%",background:C.online,animation:"pulse 1.5s ease-in-out infinite" }}/>
                <span style={{ fontSize:12,color:C.textSub }}>
                  Waiting for mobile scan · expires <strong style={{ color:qrTimer<30?C.danger:C.textMain }}>{fmt(qrTimer)}</strong>
                </span>
              </div>
            )}

            <p style={{ fontSize:11,color:C.textMuted,marginTop:10 }}>
              🔒 One-time token · HTTPS only · Auto-expires
            </p>
          </div>
        )}

        <div style={{ display:"flex",alignItems:"center",gap:10,margin:"20px 0 0" }}>
          <div style={{ flex:1,height:1,background:C.divider }}/>
          <span style={{ fontSize:11,color:C.textMuted }}>TEXTZY · Secure Session</span>
          <div style={{ flex:1,height:1,background:C.divider }}/>
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  );
};

/* ════════════════════════════════════════════════════
   SCREEN 1B — LOGIN (MOBILE / TABLET)
   Shows: email/password  OR  QR Scanner camera view
   NO QR display — mobile SCANS the QR from desktop
════════════════════════════════════════════════════ */
const MobileLogin = ({ onPasswordLogin, onPairTokenScanned, deviceType, onRequestEmailOtp, onVerifyEmailOtp }) => {
  const [tab, setTab]     = useState("password");
  const [email, setEmail] = useState("admin@textzy.io");
  const [pass, setPass]   = useState("password123");
  const [otp, setOtp]     = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [loading, setLoad]= useState(false);
  const [err, setErr]     = useState("");

  const submit = async () => {
    if (!email || !pass) { setErr("Please fill all fields."); return; }
    if (!otpVerified) { setErr("Please verify email OTP first."); return; }
    setLoad(true);
    setErr("");
    try {
      await onPasswordLogin?.({ email, password: pass, emailVerificationId: verificationId });
    } catch (e) {
      setErr(e?.message || "Login failed.");
    } finally {
      setLoad(false);
    }
  };

  const requestOtp = async () => {
    if (!email) { setErr("Enter email first."); return; }
    setErr("");
    setOtpBusy(true);
    try {
      const data = await onRequestEmailOtp?.(email);
      setVerificationId(data?.verificationId || "");
      setVerificationCode(data?.verificationCode || "");
      setOtpSent(true);
      setOtpVerified(false);
    } catch (e) {
      setErr(e?.message || "Failed to send OTP.");
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!verificationId || !otp) { setErr("Enter OTP first."); return; }
    setErr("");
    setVerifyBusy(true);
    try {
      await onVerifyEmailOtp?.({ email, verificationId, otp });
      setOtpVerified(true);
    } catch (e) {
      setErr(e?.message || "Invalid OTP.");
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:"24px 20px",
      background:`linear-gradient(170deg, ${C.navy} 0%, ${C.navyMid} 55%, #1c2e40 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:6 }}>
          <TextzyLogo size={42}/>
          <span style={{ fontSize:30, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" }}>Textzy</span>
        </div>
        <p style={{ margin:0, color:"rgba(255,255,255,0.55)", fontSize:13 }}>WhatsApp Business · {deviceType==="tablet"?"Tablet":"Mobile"} App</p>
      </div>

      <div style={{
        background:"#fff", borderRadius:24, padding:"28px 24px",
        width:"100%", maxWidth:400, boxShadow:"0 24px 64px rgba(0,0,0,0.4)",
      }}>
        {/* Tabs */}
        <div style={{ display:"flex", background:C.panelBg, borderRadius:10, padding:4, marginBottom:22 }}>
          {[["password","🔑 Password"],["qr","📷 Scan QR"]].map(([m,label]) => (
            <button key={m} onClick={()=>{setTab(m);setErr("");}} style={{
              flex:1, padding:"9px 0", border:"none", borderRadius:8,
              background:tab===m?"#fff":"transparent",
              color:tab===m?C.orange:C.textSub,
              fontWeight:tab===m?700:500, fontSize:13, cursor:"pointer",
              boxShadow:tab===m?"0 1px 4px rgba(0,0,0,0.1)":"none",
              transition:"all 0.2s", fontFamily:"inherit",
            }}>{label}</button>
          ))}
        </div>

        {tab === "password" ? (
          /* ── PASSWORD FORM ── */
          <>
            {[{l:"Email",v:email,s:setEmail,t:"email",p:"you@company.com"},{l:"Password",v:pass,s:setPass,t:"password",p:"••••••••"}].map(f=>(
              <div key={f.l} style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:11,fontWeight:700,color:C.textSub,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.7px" }}>{f.l}</label>
                <input type={f.t} value={f.v} placeholder={f.p}
                  onChange={e=>{
                    f.s(e.target.value);
                    setErr("");
                    if (f.l === "Email") {
                      setOtpSent(false);
                      setOtpVerified(false);
                      setOtp("");
                      setVerificationId("");
                      setVerificationCode("");
                    }
                  }}
                  onKeyDown={e=>e.key==="Enter"&&submit()}
                  style={{ width:"100%",padding:"12px 14px",borderRadius:10,boxSizing:"border-box",border:`1.5px solid ${C.divider}`,fontSize:15,color:C.textMain,outline:"none",fontFamily:"inherit",transition:"border-color 0.2s" }}
                  onFocus={e=>e.target.style.borderColor=C.orange}
                  onBlur={e=>e.target.style.borderColor=C.divider}
                />
              </div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 110px 90px", gap:8, marginBottom:10 }}>
              <button onClick={requestOtp} disabled={otpBusy} style={{ padding:"10px 12px",borderRadius:10,border:`1px solid ${C.divider}`,background:"#fff",fontWeight:700,color:C.textMain,cursor:otpBusy?"not-allowed":"pointer" }}>
                {otpBusy ? "Sending..." : "Verify Email"}
              </button>
              <input
                value={otp}
                onChange={(e)=>setOtp(e.target.value)}
                placeholder="OTP"
                style={{ padding:"10px 12px",borderRadius:10,border:`1px solid ${C.divider}`,fontSize:13 }}
              />
              <button onClick={verifyOtp} disabled={verifyBusy || !otpSent} style={{ padding:"10px 12px",borderRadius:10,border:"none",background:C.orange,color:"#fff",fontWeight:700,cursor:(verifyBusy || !otpSent)?"not-allowed":"pointer",opacity:(verifyBusy || !otpSent)?0.8:1 }}>
                {verifyBusy ? "..." : "Verify"}
              </button>
            </div>
            {otpSent && (
              <p style={{ fontSize:12, color: otpVerified ? C.online : C.textSub, margin:"0 0 8px" }}>
                {otpVerified ? "Email verified successfully." : `Mail sent. Code: ${verificationCode || "-"}`}
              </p>
            )}
            {err && <p style={{ color:C.danger,fontSize:13,marginBottom:10,textAlign:"center" }}>{err}</p>}
            <button onClick={submit} style={{
              width:"100%",padding:14,borderRadius:10,border:"none",
              background:`linear-gradient(135deg,${C.orange},${C.orangeMid})`,
              color:"#fff",fontWeight:700,fontSize:16,cursor:loading?"not-allowed":"pointer",
              fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              boxShadow:`0 4px 20px ${C.orange}44`,
            }}>
              {loading
                ? <><div style={{ width:20,height:20,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite" }}/>Signing in…</>
                : "Sign In →"}
            </button>
          </>
        ) : (
          /* ── QR SCANNER (mobile/tablet SCANS from desktop) ── */
          <div>
            {/* Context banner */}
            <div style={{
              background:C.navyMid, borderRadius:10, padding:"10px 14px",
              marginBottom:16, display:"flex", alignItems:"center", gap:10,
            }}>
              <Ico.Monitor/>
              <div>
                <div style={{ color:"#fff",fontWeight:700,fontSize:13 }}>Scan from your computer</div>
                <div style={{ color:"rgba(255,255,255,0.55)",fontSize:11 }}>Go to Textzy web → Link Mobile → show QR</div>
              </div>
            </div>

            {/* Camera / Scanner */}
            <MobileQRScanner onScanned={onPairTokenScanned}/>

            <div style={{ marginTop:14,textAlign:"center" }}>
              <p style={{ fontSize:12,color:C.textSub,margin:0 }}>
                🔒 Secure one-time pairing · HTTPS encrypted
              </p>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
};

/* ════════════════════════════════
   SCREEN 2 — PROJECT PICKER
════════════════════════════════ */
const ProjectPicker = ({ projects, onSelect, isMobileDevice }) => {
  const [sel, setSel] = useState(null);
  const list = projects || [];
  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      padding:"20px", background:`linear-gradient(150deg,${C.navy} 0%,${C.navyMid} 55%,#1c2e40 100%)`,
      fontFamily:"'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{ background:"#fff",borderRadius:24,padding:"36px 32px",width:"100%",maxWidth:420,boxShadow:"0 32px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
          <TextzyLogo size={30}/>
          <span style={{ fontSize:20,fontWeight:800,color:C.navy }}>Select Workspace</span>
        </div>
        <p style={{ margin:"0 0 20px 40px",color:C.textSub,fontSize:13 }}>Choose your project to continue</p>

        {list.map(p => {
          const a = sel === p.slug;
          return (
            <div key={p.slug} onClick={()=>setSel(p.slug)} style={{
              display:"flex",alignItems:"center",gap:14,padding:"13px 16px",
              borderRadius:12,marginBottom:10,cursor:"pointer",
              border:`2px solid ${a?C.orange:C.divider}`,
              background:a?C.orangePale:"#fff",transition:"all 0.15s",
            }}>
              <div style={{ width:44,height:44,borderRadius:10,background:a?`${C.orange}22`:C.panelBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24 }}>{p.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700,fontSize:15,color:C.textMain }}>{p.name}</div>
                <div style={{ fontSize:12,color:C.textSub,marginTop:2 }}>{p.role} · /{p.slug}</div>
              </div>
              {a && <div style={{ width:22,height:22,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>}
            </div>
          );
        })}

        <button disabled={!sel} onClick={()=>sel&&onSelect(list.find(p=>p.slug===sel))} style={{
          width:"100%",padding:13,marginTop:6,borderRadius:10,border:"none",
          background:sel?`linear-gradient(135deg,${C.orange},${C.orangeMid})`:C.divider,
          color:sel?"#fff":C.textMuted,fontWeight:700,fontSize:15,
          cursor:sel?"pointer":"not-allowed",fontFamily:"inherit",
          boxShadow:sel?`0 4px 18px ${C.orange}44`:"none",transition:"all 0.2s",
        }}>Continue →</button>
      </div>
    </div>
  );
};

/* ════════════════════════════════
   MAIN APP
════════════════════════════════ */
export default function TextzyApp() {
  const [screen, setScreen]   = useState("login");
  const [user, setUser]       = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [contacts, setCons]   = useState([]);
  const [activeId, setAId]    = useState(null);
  const [input, setInput]     = useState("");
  const [search, setSearch]   = useState("");
  const [tab, setTab]         = useState("All");
  const [profileOpen, setPO]  = useState(false);
  const [mobileView, setMV]   = useState("list");
  const [deviceType, setDT]   = useState("desktop");
  const [session, setSession] = useState({ accessToken: "", csrfToken: "", tenantSlug: "" });
  const [updatePrompt, setUpdatePrompt] = useState(null);
  const [qrState, setQrState] = useState({ pairingToken: "", expiresAtUtc: "", qrImageDataUrl: "" });
  const msgEnd  = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const dt = getDeviceType();
    setDT(dt);
    const onResize = () => setDT(getDeviceType());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const platform = /mac/i.test(navigator.userAgent || "") ? "macos" : "windows";
    const appVersion = "1.0.0";
    getPublicAppUpdateManifest({ platform, appVersion })
      .then((manifest) => {
        const current = manifest?.current || null;
        const node = manifest?.platforms?.[platform] || {};
        if (!current?.updateAvailable) return;
        setUpdatePrompt({
          forceUpdate: !!current.forceUpdate,
          appVersion,
          latestVersion: node?.latestVersion || "",
          downloadUrl: node?.downloadUrl || "",
        });
      })
      .catch(() => {});
  }, []);

  const isMobileDevice = deviceType === "mobile" || deviceType === "tablet";
  const active = contacts.find(c => c.id === activeId);
  const unreadCount = contacts.filter(c => c.unread > 0).length;

  const authCtx = useMemo(() => ({
    token: session.accessToken,
    csrfToken: session.csrfToken,
    tenantSlug: session.tenantSlug,
  }), [session.accessToken, session.csrfToken, session.tenantSlug]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.accessToken) return;
      setSession({
        accessToken: parsed.accessToken || "",
        csrfToken: parsed.csrfToken || "",
        tenantSlug: parsed.tenantSlug || "",
      });
      setUser(parsed.user || null);
      if (parsed.project) {
        setProject(parsed.project);
        setScreen("app");
      } else {
        setScreen("project");
      }
    } catch {
      // ignore invalid local state
    }
  }, []);

  const persistSession = (next) => {
    const payload = {
      accessToken: next.accessToken,
      csrfToken: next.csrfToken,
      tenantSlug: next.tenantSlug,
      user,
      project,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession({ accessToken: "", csrfToken: "", tenantSlug: "" });
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setProject(null);
    setProjects([]);
    setCons([]);
    setAId(null);
    setScreen("login");
    setPO(false);
  };

  const loadProjects = async (token) => {
    const { res } = await apiFetch("/api/auth/projects", { token });
    if (!res.ok) throw new Error(await res.text() || "Failed to load projects");
    const rows = await res.json();
    const mapped = (rows || []).map((p, idx) => ({
      slug: p.slug || p.Slug,
      name: p.name || p.Name,
      role: p.role || p.Role || "agent",
      icon: ["💼", "🖥️", "🛒", "🏢", "🧩"][idx % 5],
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

  const handlePasswordLogin = async ({ email, password, emailVerificationId }) => {
    const { res, nextTokenHeader, nextCsrfHeader } = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { email, password, emailVerificationId: emailVerificationId || "" },
    });
    if (!res.ok) throw new Error(await res.text() || "Invalid credentials");
    const json = await res.json().catch(() => ({}));
    const accessToken = json.accessToken || json.AccessToken || nextTokenHeader;
    const csrfToken = nextCsrfHeader;
    const nextSession = { accessToken, csrfToken, tenantSlug: "" };
    setSession(nextSession);
    setUser({ email });
    await loadProjects(accessToken);
    setScreen("project");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...nextSession, user: { email }, project: null }));
  };

  const requestEmailOtp = async (email) => {
    const { res } = await apiFetch("/api/auth/email-verification/request", {
      method: "POST",
      body: { email },
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to send OTP.");
    return await res.json();
  };

  const verifyEmailOtp = async ({ email, verificationId, otp }) => {
    const { res } = await apiFetch("/api/auth/email-verification/verify", {
      method: "POST",
      body: { email, verificationId, otp },
    });
    if (!res.ok) throw new Error(await res.text() || "OTP verification failed.");
    return await res.json();
  };

  const handleSelectProject = async (p) => {
    const { res, nextTokenHeader, nextCsrfHeader } = await apiFetch("/api/auth/switch-project", {
      method: "POST",
      token: session.accessToken,
      csrfToken: session.csrfToken,
      body: { slug: p.slug },
    });
    if (!res.ok) throw new Error(await res.text() || "Project switch failed");
    const json = await res.json().catch(() => ({}));
    const accessToken = json.accessToken || json.AccessToken || nextTokenHeader || session.accessToken;
    const csrfToken = nextCsrfHeader || session.csrfToken;
    const tenantSlug = json.tenantSlug || json.TenantSlug || p.slug;
    const nextProject = { ...p, role: json.role || json.Role || p.role };
    const next = { accessToken, csrfToken, tenantSlug };
    setProject(nextProject);
    setSession(next);
    setScreen("app");
    setAId(null);
    setCons([]);
    setInput("");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...next, user, project: nextProject }));
    await loadConversations(next);
  };

  const createPairQr = async () => {
    if (!session.accessToken) throw new Error("Please login first.");
    const { res } = await apiFetch("/api/auth/devices/pair-qr", {
      method: "POST",
      token: session.accessToken,
      csrfToken: session.csrfToken,
      body: { buildHint: "windows-desktop" },
    });
    if (!res.ok) throw new Error(await res.text() || "Failed to create QR");
    const payload = await res.json();
    const token = payload.pairingToken || "";
    const expiresAtUtc = payload.expiresAtUtc || "";
    let qrImageDataUrl = "";
    if (token) {
      const imgRes = await apiFetch(`/api/auth/devices/pair-qr-image?pairingToken=${encodeURIComponent(token)}`, {
        token: session.accessToken,
      });
      if (imgRes.res.ok) {
        const svg = await imgRes.res.text();
        qrImageDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      }
    }
    setQrState({ pairingToken: token, expiresAtUtc, qrImageDataUrl });
  };

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior:"smooth" });
  }, [active?.messages?.length, active?.typing]);

  const openChat = async (id) => {
    setAId(id);
    setMV("chat");
    setCons(p => p.map(c => c.id===id ? {...c, unread:0} : c));
    try {
      await loadMessages(id);
    } catch {
      // keep existing list view even if messages fail
    }
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const send = async () => {
    const txt = input.trim();
    if (!txt || !activeId) return;
    const m = {id:Date.now(),text:txt,sent:true,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),status:"sent"};
    setCons(p => p.map(c => c.id===activeId ? {...c,messages:[...c.messages,m],lastMsg:txt,time:m.time,unread:0} : c));
    setInput("");
    try {
      await apiFetch("/api/messages/send", {
        method: "POST",
        token: authCtx.token,
        tenantSlug: authCtx.tenantSlug,
        csrfToken: authCtx.csrfToken,
        body: {
          recipient: active?.customerPhone || "",
          body: txt,
          channel: "whatsapp",
          idempotencyKey: idempotencyKey(),
        },
      });
      await loadMessages(activeId);
      await loadConversations();
    } catch {
      // optimistic message already shown
    }
  };

  useEffect(() => {
    if (screen !== "app") return;
    if (!authCtx.token || !authCtx.tenantSlug) return;
    if (contacts.length > 0) return;
    loadConversations().catch(() => {});
  }, [screen, authCtx.token, authCtx.tenantSlug]);

  useEffect(() => {
    if (!activeId) return;
    const activeContact = contacts.find((c) => c.id === activeId);
    if (activeContact && (!activeContact.messages || activeContact.messages.length === 0)) {
      loadMessages(activeId).catch(() => {});
    }
  }, [activeId, contacts]);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const match = String(c.name || "").toLowerCase().includes(q) || String(c.lastMsg || "").toLowerCase().includes(q);
    if (tab==="Unread")   return match && c.unread > 0;
    if (tab==="Assigned") return match && [1,3].includes(c.id);
    return match;
  });

  /* ── Routing ── */
  if (screen === "login") {
    return isMobileDevice
      ? <MobileLogin onPasswordLogin={handlePasswordLogin} onPairTokenScanned={async ()=>{}} deviceType={deviceType} onRequestEmailOtp={requestEmailOtp} onVerifyEmailOtp={verifyEmailOtp}/>
      : <DesktopLogin onPasswordLogin={handlePasswordLogin} onCreatePairQr={createPairQr} qrState={qrState} onRequestEmailOtp={requestEmailOtp} onVerifyEmailOtp={verifyEmailOtp}/>;
  }
  if (screen === "project") {
    return <ProjectPicker projects={projects} onSelect={handleSelectProject} isMobileDevice={isMobileDevice}/>;
  }

  const uname = (user?.email || "User").split("@")[0];

  if (!isMobileDevice) {
    return (
      <TextzyWindowsDesktop
        userName={uname}
        projectName={project?.name || ""}
        contacts={contacts}
        activeId={activeId}
        setActiveId={setAId}
        search={search}
        setSearch={setSearch}
        input={input}
        setInput={setInput}
        send={send}
        msgEndRef={msgEnd}
        onLogout={handleLogout}
        onOpenChat={openChat}
      />
    );
  }

  /* ── Mobile layout: full-screen list OR full-screen chat ── */
  if (isMobileDevice) {
    return (
      <div style={{ height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.chatBg }}>

        {mobileView === "list" ? (
          /* ── MOBILE CONVERSATION LIST ── */
          <div style={{ height:"100vh",display:"flex",flexDirection:"column",background:"#fff" }}>
            {/* Header */}
            <div style={{ background:C.headerBg,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
              <div onClick={()=>setPO(!profileOpen)} style={{ cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
                <Avatar name={uname} color={C.orange} size={36} online/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ color:"#fff",fontWeight:700,fontSize:15 }}>Textzy</div>
                <div style={{ color:"rgba(255,255,255,0.55)",fontSize:11 }}>{project?.icon} {project?.name}</div>
              </div>
              <IBtn light><Ico.Search/></IBtn>
              <IBtn light><Ico.More/></IBtn>
            </div>

            {/* Search */}
            <div style={{ padding:"8px 12px",background:C.panelBg,flexShrink:0 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,background:"#fff",borderRadius:20,padding:"8px 14px",border:`1px solid ${C.divider}` }}>
                <span style={{ color:C.iconGrey,display:"flex",flexShrink:0 }}><Ico.Search/></span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations"
                  style={{ border:"none",outline:"none",flex:1,fontSize:14,color:C.textMain,background:"transparent",fontFamily:"inherit" }}/>
                {search && <button onClick={()=>setSearch("")} style={{ background:"none",border:"none",cursor:"pointer",color:C.textMuted,padding:0,display:"flex" }}><Ico.Close/></button>}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex",borderBottom:`1px solid ${C.divider}`,background:"#fff",flexShrink:0 }}>
              {["All","Unread","Assigned"].map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{
                  flex:1,padding:"10px 4px",border:"none",background:"none",
                  fontWeight:tab===t?700:500,color:tab===t?C.orange:C.textSub,
                  fontSize:13,cursor:"pointer",fontFamily:"inherit",
                  borderBottom:`2.5px solid ${tab===t?C.orange:"transparent"}`,transition:"all 0.15s",
                }}>
                  {t}{t==="Unread"&&unreadCount>0&&<span style={{ marginLeft:4,background:C.unread,color:"#fff",borderRadius:10,padding:"0 5px",fontSize:10,fontWeight:700 }}>{unreadCount}</span>}
                </button>
              ))}
            </div>

            {/* List */}
            <div style={{ flex:1,overflowY:"auto" }}>
              {filtered.map(c=>(
                <div key={c.id} onClick={()=>openChat(c.id)} style={{
                  display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
                  cursor:"pointer",borderBottom:`1px solid ${C.divider}`,background:"#fff",
                  transition:"background 0.1s",
                }}>
                  <Avatar name={c.name} color={c.color} size={50} online={c.online}/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"baseline" }}>
                      <span style={{ fontWeight:600,fontSize:15,color:C.textMain }}>{c.name}</span>
                      <span style={{ fontSize:11,color:c.unread>0?C.orange:C.textSub,flexShrink:0 }}>{c.time}</span>
                    </div>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:13,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"82%" }}>
                        {c.typing?<em style={{color:C.orange}}>typing…</em>:c.lastMsg}
                      </span>
                      {c.unread>0&&<span style={{ background:C.unread,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700,flexShrink:0 }}>{c.unread}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── MOBILE CHAT VIEW ── */
          <div style={{ height:"100vh",display:"flex",flexDirection:"column" }}>
            {/* Chat header */}
            <div style={{ background:C.headerBg,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0,boxShadow:"0 2px 6px rgba(0,0,0,0.2)" }}>
              <IBtn light onClick={()=>setMV("list")}><Ico.Back/></IBtn>
              {active && <Avatar name={active.name} color={active.color} size={36} online={active.online}/>}
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:"#fff",fontWeight:700,fontSize:15 }}>{active?.name}</div>
                <div style={{ color:"rgba(255,255,255,0.65)",fontSize:12 }}>
                  {active?.typing?<span style={{color:C.orangeMid}}>typing…</span>:active?.online?"Online":"Last seen recently"}
                </div>
              </div>
              <IBtn light><Ico.Phone/></IBtn>
              <IBtn light><Ico.Video/></IBtn>
              <IBtn light><Ico.More/></IBtn>
            </div>

            {/* Messages */}
            <div style={{
              flex:1,overflowY:"auto",padding:"14px 14px",
              background:C.chatBg,
              backgroundImage:`url("data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23F97316' fill-opacity='0.04'%3E%3Cpath d='M10 10h10v10H10zm22 0h10v10H32zm0 22h10v10H32zM10 32h10v10H10zM21 21h10v10H21z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}>
              <div style={{ textAlign:"center",marginBottom:12 }}>
                <span style={{ background:"rgba(255,255,255,0.85)",color:C.textSub,fontSize:11,padding:"4px 14px",borderRadius:8 }}>TODAY</span>
              </div>
              {active?.messages.map(msg=>(
                <div key={msg.id} style={{ display:"flex",justifyContent:msg.sent?"flex-end":"flex-start",marginBottom:4,animation:"fadeUp 0.18s ease-out" }}>
                  <div style={{
                    maxWidth:"75%",padding:"9px 13px 6px",
                    background:msg.sent?C.bubbleSent:C.bubbleRecv,
                    borderRadius:msg.sent?"14px 14px 2px 14px":"14px 14px 14px 2px",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.09)",
                  }}>
                    <p style={{ margin:0,fontSize:15,color:C.textMain,lineHeight:1.45,wordBreak:"break-word" }}>{msg.text}</p>
                    <div style={{ display:"flex",justifyContent:"flex-end",alignItems:"center",gap:3,marginTop:3 }}>
                      <span style={{ fontSize:11,color:C.textMuted }}>{msg.time}</span>
                      {msg.sent&&(msg.status==="read"?<Ico.DblChk/>:<Ico.Check/>)}
                    </div>
                  </div>
                </div>
              ))}
              {active?.typing && (
                <div style={{ display:"flex",justifyContent:"flex-start",marginBottom:4 }}>
                  <div style={{ background:C.bubbleRecv,borderRadius:"14px 14px 14px 2px",boxShadow:"0 1px 3px rgba(0,0,0,0.09)" }}>
                    <Typing/>
                  </div>
                </div>
              )}
              <div ref={msgEnd}/>
            </div>

            {/* Input */}
            <div style={{ background:C.panelBg,padding:"8px 10px",display:"flex",alignItems:"center",gap:6,flexShrink:0,borderTop:`1px solid ${C.divider}` }}>
              <IBtn><Ico.Emoji/></IBtn>
              <IBtn><Ico.Attach/></IBtn>
              <div style={{ flex:1,background:C.inputBg,borderRadius:22,padding:"10px 16px",border:`1px solid ${C.divider}`,display:"flex",alignItems:"center" }}>
                <input ref={inputRef} value={input}
                  onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                  placeholder="Type a message"
                  style={{ border:"none",outline:"none",flex:1,fontSize:15,color:C.textMain,background:"transparent",fontFamily:"inherit" }}
                />
              </div>
              <button onClick={input.trim()?send:undefined} style={{
                width:46,height:46,borderRadius:"50%",border:"none",flexShrink:0,
                background:input.trim()?`linear-gradient(135deg,${C.orange},${C.orangeMid})`:C.iconGrey,
                color:"#fff",cursor:input.trim()?"pointer":"default",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:input.trim()?`0 2px 12px ${C.orange}55`:"none",transition:"all 0.2s",
              }}>
                {input.trim()?<Ico.Send/>:<Ico.Mic/>}
              </button>
            </div>
          </div>
        )}

        <style>{`
          *{box-sizing:border-box;margin:0;padding:0;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        `}</style>
      </div>
    );
  }

  /* ════════════════════════════════
     DESKTOP APP (sidebar + chat)
  ════════════════════════════════ */
  return (
    <div style={{ display:"flex",height:"100vh",overflow:"hidden",fontFamily:"'Segoe UI',system-ui,sans-serif" }}
      onClick={()=>profileOpen&&setPO(false)}>
      {updatePrompt ? (
        <div style={{
          position:"fixed",
          inset:0,
          zIndex:500,
          background:"rgba(15,23,42,0.45)",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          padding:20,
        }}>
          <div style={{
            width:"100%",
            maxWidth:430,
            background:"#fff",
            borderRadius:16,
            boxShadow:"0 16px 40px rgba(0,0,0,0.25)",
            padding:18,
          }}>
            <h3 style={{ margin:"0 0 10px", fontSize:20, color:C.textMain }}>Update Available</h3>
            <p style={{ margin:"0 0 8px", color:C.textSub, lineHeight:1.45 }}>
              Current version: {updatePrompt.appVersion}
              <br />
              Latest version: {updatePrompt.latestVersion || "latest"}
            </p>
            <p style={{ margin:"0 0 16px", color:C.textSub, lineHeight:1.45 }}>
              {updatePrompt.forceUpdate ? "This update is required to continue." : "A newer desktop app version is available."}
            </p>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              {!updatePrompt.forceUpdate ? (
                <button
                  onClick={() => setUpdatePrompt(null)}
                  style={{ border:`1px solid ${C.divider}`, borderRadius:10, padding:"10px 14px", background:"#fff", cursor:"pointer" }}
                >
                  Later
                </button>
              ) : null}
              <button
                onClick={() => {
                  if (updatePrompt.downloadUrl) window.location.assign(updatePrompt.downloadUrl);
                }}
                style={{ border:"none", borderRadius:10, padding:"10px 14px", background:C.orange, color:"#fff", fontWeight:700, cursor:"pointer" }}
              >
                Update Now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── SIDEBAR ── */}
      <div style={{ width:360,minWidth:360,height:"100vh",display:"flex",flexDirection:"column",background:"#fff",borderRight:`1px solid ${C.divider}`,position:"relative" }}>
        {/* Header */}
        <div style={{ background:C.headerBg,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
          <div onClick={()=>setPO(!profileOpen)} style={{ cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
            <Avatar name={uname} color={C.orange} size={38} online/>
            <div>
              <div style={{ color:"#fff",fontWeight:700,fontSize:14,lineHeight:1.2 }}>{uname}</div>
              <div style={{ color:"rgba(255,255,255,0.55)",fontSize:11 }}>{project?.icon} {project?.name} · {project?.role}</div>
            </div>
          </div>
          <div style={{ flex:1 }}/>
          <IBtn light><Ico.NewChat/></IBtn>
          <IBtn light><Ico.More/></IBtn>
        </div>

        {/* Search */}
        <div style={{ padding:"8px 10px",background:C.panelBg,flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,background:"#fff",borderRadius:20,padding:"8px 14px",border:`1px solid ${C.divider}` }}>
            <span style={{ color:C.iconGrey,display:"flex",flexShrink:0 }}><Ico.Search/></span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations"
              style={{ border:"none",outline:"none",flex:1,fontSize:13,color:C.textMain,background:"transparent",fontFamily:"inherit" }}/>
            {search&&<button onClick={()=>setSearch("")} style={{ background:"none",border:"none",cursor:"pointer",color:C.textMuted,padding:0,display:"flex" }}><Ico.Close/></button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex",borderBottom:`1px solid ${C.divider}`,background:"#fff",flexShrink:0 }}>
          {["All","Unread","Assigned"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,padding:"9px 4px",border:"none",background:"none",
              fontWeight:tab===t?700:500,color:tab===t?C.orange:C.textSub,
              fontSize:13,cursor:"pointer",fontFamily:"inherit",
              borderBottom:`2.5px solid ${tab===t?C.orange:"transparent"}`,transition:"all 0.15s",
            }}>
              {t}{t==="Unread"&&unreadCount>0&&<span style={{ marginLeft:5,background:C.unread,color:"#fff",borderRadius:10,padding:"0 5px",fontSize:10,fontWeight:700 }}>{unreadCount}</span>}
            </button>
          ))}
        </div>

        {/* Contacts */}
        <div style={{ flex:1,overflowY:"auto" }}>
          {filtered.map(c=>(
            <div key={c.id} onClick={()=>openChat(c.id)} style={{
              display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
              cursor:"pointer",background:activeId===c.id?C.selected:"transparent",
              borderBottom:`1px solid ${C.divider}`,transition:"background 0.1s",
            }}
              onMouseEnter={e=>{if(activeId!==c.id)e.currentTarget.style.background=C.hover;}}
              onMouseLeave={e=>{if(activeId!==c.id)e.currentTarget.style.background="transparent";}}
            >
              <Avatar name={c.name} color={c.color} size={46} online={c.online}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"baseline" }}>
                  <span style={{ fontWeight:600,fontSize:14,color:C.textMain,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"65%" }}>{c.name}</span>
                  <span style={{ fontSize:11,color:c.unread>0?C.orange:C.textSub,flexShrink:0 }}>{c.time}</span>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:13,color:C.textSub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"82%" }}>
                    {c.typing?<em style={{color:C.orange}}>typing…</em>:c.lastMsg}
                  </span>
                  {c.unread>0&&<span style={{ background:C.unread,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700,flexShrink:0 }}>{c.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Profile dropdown */}
        {profileOpen && (
          <div onClick={e=>e.stopPropagation()} style={{
            position:"absolute",top:60,left:10,zIndex:200,
            background:"#fff",borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.18)",
            minWidth:210,overflow:"hidden",border:`1px solid ${C.divider}`,
          }}>
            <div style={{ padding:"12px 16px",borderBottom:`1px solid ${C.divider}`,background:C.orangePale }}>
              <div style={{ fontWeight:700,fontSize:14,color:C.textMain }}>{uname}</div>
              <div style={{ fontSize:12,color:C.textSub }}>{user?.email}</div>
            </div>
            {[["⭐","Starred"],["🏷️","Labels"],["⚙️","Settings"],["📱","Linked Devices"]].map(([ic,lb],i)=>(
              <div key={i} onClick={()=>setPO(false)} style={{ display:"flex",alignItems:"center",gap:12,padding:"11px 16px",cursor:"pointer",color:C.textMain,fontSize:13 }}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              ><span style={{fontSize:16}}>{ic}</span>{lb}</div>
            ))}
            <div style={{ height:1,background:C.divider }}/>
            <div onClick={()=>{clearSession();setUser(null);setProject(null);setProjects([]);setCons([]);setAId(null);setScreen("login");setPO(false);}} style={{ display:"flex",alignItems:"center",gap:12,padding:"11px 16px",cursor:"pointer",color:C.danger,fontSize:13 }}
              onMouseEnter={e=>e.currentTarget.style.background="#FFF0F0"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            ><Ico.Logout/>Log out</div>
          </div>
        )}
      </div>

      {/* ── CHAT PANEL ── */}
      <div style={{ flex:1,height:"100vh",display:"flex",flexDirection:"column" }}>
        {!active ? (
          <div style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            background:C.chatBg,
            backgroundImage:`url("data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23F97316' fill-opacity='0.04'%3E%3Cpath d='M10 10h10v10H10zm22 0h10v10H32zm0 22h10v10H32zM10 32h10v10H10zM21 21h10v10H21z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}>
            <div style={{ width:110,height:110,borderRadius:"50%",background:`${C.orange}18`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:22 }}>
              <TextzyLogo size={56}/>
            </div>
            <h2 style={{ margin:"0 0 8px",fontSize:20,fontWeight:700,color:C.textMain }}>Textzy Inbox</h2>
            <p style={{ margin:0,color:C.textSub,fontSize:13,textAlign:"center",maxWidth:250,lineHeight:1.6 }}>
              Select a conversation to start messaging
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div style={{ background:C.headerBg,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.25)" }}>
              <Avatar name={active.name} color={active.color} size={38} online={active.online}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ color:"#fff",fontWeight:700,fontSize:15 }}>{active.name}</div>
                <div style={{ color:"rgba(255,255,255,0.65)",fontSize:12 }}>
                  {active.typing?<span style={{color:C.orangeMid}}>typing…</span>:active.online?"Online":"Last seen recently"}
                </div>
              </div>
              <IBtn light><Ico.Phone/></IBtn>
              <IBtn light><Ico.Video/></IBtn>
              <IBtn light><Ico.Info/></IBtn>
              <IBtn light><Ico.More/></IBtn>
            </div>

            {/* Messages */}
            <div style={{
              flex:1,overflowY:"auto",padding:"14px 7%",background:C.chatBg,
              backgroundImage:`url("data:image/svg+xml,%3Csvg width='52' height='52' viewBox='0 0 52 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23F97316' fill-opacity='0.035'%3E%3Cpath d='M10 10h10v10H10zm22 0h10v10H32zm0 22h10v10H32zM10 32h10v10H10zM21 21h10v10H21z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}>
              <div style={{ textAlign:"center",marginBottom:14 }}>
                <span style={{ background:"rgba(255,255,255,0.85)",color:C.textSub,fontSize:11,padding:"4px 14px",borderRadius:8 }}>TODAY</span>
              </div>
              {active.messages.map(msg=>(
                <div key={msg.id} style={{ display:"flex",justifyContent:msg.sent?"flex-end":"flex-start",marginBottom:3,animation:"fadeUp 0.18s ease-out" }}>
                  <div style={{
                    maxWidth:"65%",padding:"8px 12px 5px",
                    background:msg.sent?C.bubbleSent:C.bubbleRecv,
                    borderRadius:msg.sent?"14px 14px 2px 14px":"14px 14px 14px 2px",
                    boxShadow:"0 1px 3px rgba(0,0,0,0.09)",
                  }}>
                    <p style={{ margin:0,fontSize:14,color:C.textMain,lineHeight:1.45,wordBreak:"break-word" }}>{msg.text}</p>
                    <div style={{ display:"flex",justifyContent:"flex-end",alignItems:"center",gap:3,marginTop:3 }}>
                      <span style={{ fontSize:11,color:C.textMuted }}>{msg.time}</span>
                      {msg.sent&&(msg.status==="read"?<Ico.DblChk/>:<Ico.Check/>)}
                    </div>
                  </div>
                </div>
              ))}
              {active.typing&&(
                <div style={{ display:"flex",justifyContent:"flex-start",marginBottom:3 }}>
                  <div style={{ background:C.bubbleRecv,borderRadius:"14px 14px 14px 2px",boxShadow:"0 1px 3px rgba(0,0,0,0.09)" }}>
                    <Typing/>
                  </div>
                </div>
              )}
              <div ref={msgEnd}/>
            </div>

            {/* Input */}
            <div style={{ background:C.panelBg,padding:"8px 10px",display:"flex",alignItems:"center",gap:6,flexShrink:0,borderTop:`1px solid ${C.divider}` }}>
              <IBtn><Ico.Emoji/></IBtn>
              <IBtn><Ico.Attach/></IBtn>
              <div style={{ flex:1,background:C.inputBg,borderRadius:22,padding:"10px 16px",border:`1px solid ${C.divider}`,display:"flex",alignItems:"center" }}>
                <input ref={inputRef} value={input}
                  onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                  placeholder="Type a message"
                  style={{ border:"none",outline:"none",flex:1,fontSize:14,color:C.textMain,background:"transparent",fontFamily:"inherit" }}
                />
              </div>
              <button onClick={input.trim()?send:undefined} style={{
                width:44,height:44,borderRadius:"50%",border:"none",flexShrink:0,
                background:input.trim()?`linear-gradient(135deg,${C.orange},${C.orangeMid})`:C.iconGrey,
                color:"#fff",cursor:input.trim()?"pointer":"default",
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:input.trim()?`0 2px 12px ${C.orange}55`:"none",transition:"all 0.2s",
              }}>
                {input.trim()?<Ico.Send/>:<Ico.Mic/>}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px;}
        ::-webkit-scrollbar-thumb:hover{background:#bbb;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>
    </div>
  );
}
