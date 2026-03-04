import { useMemo } from "react";

const C = {
  orange: "#F97316",
  orangeLight: "#FB923C",
  orangePale: "#FFF7ED",
  headerBg: "#1E3A5F",
  chatBg: "#F1F5F9",
  bubbleSent: "#FFEDD5",
  bubbleRecv: "#FFFFFF",
  textMain: "#1E3A5F",
  textSub: "#64748B",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  hover: "#F8FAFC",
  unread: "#F97316",
  online: "#22C55E",
  iconColor: "#64748B",
};

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="#F97316" />
    <path d="M8 12C8 10.343 9.343 9 11 9H29C30.657 9 32 10.343 32 12V22C32 23.657 30.657 25 29 25H22L16 31V25H11C9.343 25 8 23.657 8 22V12Z" fill="white" />
  </svg>
);

const I = {
  Send: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>,
  Search: () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Close: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  Phone: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.07 6.07l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>,
  Video: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>,
  More: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>,
  Attach: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>,
  Emoji: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
  DblChk: () => <svg width="18" height="11" viewBox="0 0 18 11" fill="none"><path d="M1 5.5L4.5 9L11 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 5.5L10.5 9L17 1.5" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

const Avatar = ({ name, color, size = 46, online = false }) => (
  <div style={{ position: "relative", flexShrink: 0 }}>
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg,${color}EE,${color}88)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 700, color: "#fff",
      boxShadow: `0 2px 8px ${color}44`,
    }}>
      {String(name || "").replace(/[^\w\s]/gi, "").trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
    </div>
    {online ? <div style={{
      position: "absolute", bottom: 1, right: 1, width: size * 0.27, height: size * 0.27, borderRadius: "50%",
      background: C.online, border: "2.5px solid #fff", boxShadow: `0 0 0 1px ${C.online}44`,
    }} /> : null}
  </div>
);

const Typing = () => (
  <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "11px 15px" }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: C.orange, opacity: 0.7, animation: `tdot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
    ))}
  </div>
);

export default function TextzyWindowsDesktop({
  userName,
  projectName,
  contacts,
  activeId,
  setActiveId,
  search,
  setSearch,
  input,
  setInput,
  send,
  msgEndRef,
  onLogout,
  onOpenChat,
}) {
  const active = useMemo(() => contacts.find((c) => c.id === activeId), [contacts, activeId]);
  const filtered = useMemo(
    () => contacts.filter((c) => String(c.name || "").toLowerCase().includes(search.toLowerCase()) || String(c.lastMsg || "").toLowerCase().includes(search.toLowerCase())),
    [contacts, search]
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI','Microsoft Sans Serif',sans-serif", background: C.chatBg }}>
      <div style={{ width: 360, background: "#fff", borderRight: `1px solid ${C.divider}`, display: "flex", flexDirection: "column", boxShadow: "2px 0 8px rgba(0,0,0,0.06)" }}>
        <div style={{ padding: "16px", background: `linear-gradient(135deg,${C.orange},${C.orangeLight})`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Logo size={32} />
            <div style={{ fontWeight: 800, fontSize: 18 }}>Textzy</div>
            <button onClick={onLogout} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Logout</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.95, marginBottom: 10 }}>{userName} | {projectName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 12px" }}>
            <I.Search />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." style={{ border: "none", outline: "none", flex: 1, fontSize: 13, color: "#fff", background: "transparent", fontFamily: "inherit" }} />
            {search ? <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}><I.Close /></button> : null}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map((c) => (
            <div key={c.id} onClick={() => { setActiveId(c.id); onOpenChat?.(c.id); }} style={{
              padding: "12px 12px", cursor: "pointer", background: activeId === c.id ? C.orangePale : "#fff",
              borderLeft: `3px solid ${activeId === c.id ? C.orange : "transparent"}`, transition: "all 0.15s",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}
              onMouseEnter={(e) => activeId !== c.id && (e.currentTarget.style.background = C.hover)}
              onMouseLeave={(e) => activeId !== c.id && (e.currentTarget.style.background = "#fff")}
            >
              <Avatar name={c.name} color={c.color || "#F97316"} size={44} online={!!c.online} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.textMain }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.typing ? <em style={{ color: C.orange, fontStyle: "normal", fontWeight: 500 }}>typing...</em> : c.lastMsg}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{c.time}</div>
              </div>
              {Number(c.unread || 0) > 0 ? <span style={{ background: C.orange, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{c.unread}</span> : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff" }}>
        {active ? (
          <>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
              <Avatar name={active.name} color={active.color || "#F97316"} size={40} online={!!active.online} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: C.textMain }}>{active.name}</div>
                <div style={{ fontSize: 12, color: C.textSub }}>{active.online ? "Online" : "Offline"}</div>
              </div>
              <button style={{ background: "none", border: "none", color: C.iconColor, padding: "6px 10px", cursor: "pointer", display: "flex", borderRadius: 6 }}><I.Phone /></button>
              <button style={{ background: "none", border: "none", color: C.iconColor, padding: "6px 10px", cursor: "pointer", display: "flex", borderRadius: 6 }}><I.Video /></button>
              <button style={{ background: "none", border: "none", color: C.iconColor, padding: "6px 10px", cursor: "pointer", display: "flex", borderRadius: 6 }}><I.More /></button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: C.chatBg }}>
              {(active.messages || []).map((msg) => (
                <div key={msg.id} style={{ display: "flex", justifyContent: msg.sent ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div style={{
                    maxWidth: "55%", padding: "10px 14px 8px",
                    background: msg.sent ? C.bubbleSent : C.bubbleRecv,
                    borderRadius: msg.sent ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                  }}>
                    <p style={{ margin: 0, fontSize: 14, color: C.textMain, lineHeight: 1.45 }}>{msg.text}</p>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 5 }}>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{msg.time}</span>
                      {msg.sent && msg.status === "read" ? <I.DblChk /> : null}
                    </div>
                  </div>
                </div>
              ))}
              {active.typing ? (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                  <div style={{ background: C.bubbleRecv, borderRadius: "8px 8px 8px 2px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                    <Typing />
                  </div>
                </div>
              ) : null}
              <div ref={msgEndRef} />
            </div>

            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.divider}`, background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <button style={{ background: "none", border: "none", color: C.iconColor, cursor: "pointer", display: "flex", padding: "8px" }}><I.Emoji /></button>
              <button style={{ background: "none", border: "none", color: C.iconColor, cursor: "pointer", display: "flex", padding: "8px" }}><I.Attach /></button>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: C.chatBg, borderRadius: 20, padding: "8px 14px", border: `1px solid ${C.divider}` }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Type a message..."
                  style={{ border: "none", outline: "none", flex: 1, fontSize: 14, color: C.textMain, background: "transparent", fontFamily: "inherit" }}
                />
              </div>
              <button onClick={send} style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: C.orange, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 2px 8px ${C.orange}44` }}>
                <I.Send />
              </button>
            </div>
          </>
        ) : null}
      </div>

      <style>{`@keyframes tdot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
    </div>
  );
}
