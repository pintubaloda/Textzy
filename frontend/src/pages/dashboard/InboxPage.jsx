import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { apiGet, apiPost, wabaGetOnboardingStatus } from "@/lib/api";
import { toast } from "sonner";

const InboxPage = () => {
  const [selectedConversation, setSelectedConversation] = useState(0);
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

  useEffect(() => {
    Promise.all([
      apiGet("/api/inbox/conversations"),
      apiGet("/api/contacts"),
      apiGet("/api/auth/team-members").catch(() => []),
      apiGet("/api/auth/me").catch(() => null),
      apiGet("/api/templates").catch(() => []),
      wabaGetOnboardingStatus().catch(() => null),
    ])
      .then(([c, ct, tm, meData, tpl, waba]) => {
        setConversations(
          (c || []).map((x) => ({
            id: x.id,
            name: x.customerName || x.customerPhone,
            phone: x.customerPhone,
            lastMessage: x.status || "Conversation",
            time: x.lastMessageAtUtc || x.createdAtUtc || null,
            unread: 0,
            starred: false,
            channel: "whatsapp",
            avatar: (x.customerName || x.customerPhone || "U").slice(0, 2).toUpperCase(),
            assignedUserId: x.assignedUserId || "",
            assignedUserName: x.assignedUserName || "",
            labels: (x.labelsCsv || "").split(",").map((z) => z.trim()).filter(Boolean),
            canReply: !!x.canReply,
            hoursSinceInbound: Number(x.hoursSinceInbound || 999),
          }))
        );
        setMessages([]);
        setContacts(ct || []);
        setTeamMembers(tm || []);
        setMe(meData);
        setTemplates((tpl || []).filter((x) => String(x.status || "").toLowerCase() === "approved" && Number(x.channel) === 2));
        setWabaDetails(waba);
      })
      .catch(() => {
        setConversations([]);
        setMessages([]);
      });
  }, []);

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

  const selectedChat = filteredConversations[selectedConversation] || {
    avatar: "NA",
    name: "No conversation",
    phone: "-",
    labels: [],
    canReply: false,
    assignedUserName: "",
  };
  const canReplyInSession = !!selectedChat.canReply;
  const selectedContact = contacts.find((x) => x.phone === selectedChat.phone);

  useEffect(() => {
    if (!selectedChat?.id) {
      setMessages([]);
      return;
    }
    apiGet(`/api/inbox/conversations/${selectedChat.id}/messages`)
      .then((rows) => {
        setMessages((rows || []).map((x) => ({
          id: x.id,
          sender: String(x.status || "").toLowerCase() === "received" ? "customer" : "agent",
          text: x.body,
          time: x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now",
          status: String(x.status || "").toLowerCase() === "received" ? "received" : "read",
        })));
      })
      .catch(() => setMessages([]));
  }, [selectedChat?.id]);

  const handleSendMessage = () => {
    if (!canReplyInSession) {
      toast.error("24-hour session expired. Send an approved template first.");
      return;
    }
    if (message.trim()) {
      apiPost("/api/messages/send", { recipient: selectedChat.phone || "+910000000000", body: message, channel: 2 }).catch(() => {});
      setMessage("");
      apiGet(`/api/inbox/conversations/${selectedChat.id}/messages`).then((rows) => {
        setMessages((rows || []).map((x) => ({
          id: x.id,
          sender: String(x.status || "").toLowerCase() === "received" ? "customer" : "agent",
          text: x.body,
          time: x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now",
          status: String(x.status || "").toLowerCase() === "received" ? "received" : "read",
        })));
      }).catch(() => {});
    }
  };

  const handleSendTemplateFallback = async () => {
    const tpl = templates[0];
    if (!tpl || !selectedChat?.phone) {
      toast.error("No approved WhatsApp template available.");
      return;
    }
    try {
      await apiPost("/api/messages/send", {
        recipient: selectedChat.phone,
        body: tpl.body || "Template message",
        channel: 2,
        useTemplate: true,
        templateName: tpl.name,
        templateLanguageCode: tpl.language || "en",
        templateParameters: [],
      });
      toast.success(`Template sent: ${tpl.name}`);
      apiGet(`/api/inbox/conversations/${selectedChat.id}/messages`).then((rows) => {
        setMessages((rows || []).map((x) => ({
          id: x.id,
          sender: String(x.status || "").toLowerCase() === "received" ? "customer" : "agent",
          text: x.body,
          time: x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now",
          status: String(x.status || "").toLowerCase() === "received" ? "received" : "read",
        })));
      }).catch(() => {});
    } catch (e) {
      toast.error(e?.message || "Template send failed");
    }
  };

  const handleAssign = async (member) => {
    if (!selectedChat.id) return;
    try {
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/assign`, {
        userId: String(member.id),
        userName: member.name,
      });
      setConversations((prev) =>
        prev.map((x) => (x.id === selectedChat.id ? { ...x, assignedUserId: updated.assignedUserId, assignedUserName: updated.assignedUserName } : x))
      );
      toast.success(`Assigned to ${member.name}`);
    } catch {
      toast.error("Failed to assign");
    }
  };

  const handleTransfer = async (member) => {
    if (!selectedChat.id) return;
    try {
      const updated = await apiPost(`/api/inbox/conversations/${selectedChat.id}/transfer`, {
        userId: String(member.id),
        userName: member.name,
      });
      setConversations((prev) =>
        prev.map((x) => (x.id === selectedChat.id ? { ...x, assignedUserId: updated.assignedUserId, assignedUserName: updated.assignedUserName } : x))
      );
      toast.success(`Transferred to ${member.name}`);
    } catch {
      toast.error("Failed to transfer chat");
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

  const getStatusIcon = (status) => {
    switch (status) {
      case "read":
        return <CheckCheck className="w-4 h-4 text-blue-500" />;
      case "delivered":
        return <CheckCheck className="w-4 h-4 text-slate-400" />;
      case "sent":
        return <Check className="w-4 h-4 text-slate-400" />;
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
          {filteredConversations.map((conversation, index) => (
            <div key={conversation.id} className={`p-4 border-b border-slate-100 cursor-pointer transition-colors ${selectedConversation === index ? "bg-orange-50 border-l-4 border-l-orange-500" : "hover:bg-slate-50"}`} onClick={() => setSelectedConversation(index)}>
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
          {!canReplyInSession ? (
            <div className="hidden 2xl:flex items-center gap-2">
              <div className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800 max-w-[220px] truncate">24h session closed. Customer must reply first.</div>
              <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSendTemplateFallback}>Send Template</Button>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="rounded-xl h-9 px-3 border-slate-200 bg-white text-slate-800 hover:bg-slate-50"><UserPlus className="w-4 h-4 mr-1.5" />Assign</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">{teamMembers.length === 0 ? <DropdownMenuItem disabled>No members</DropdownMenuItem> : teamMembers.map((member) => <DropdownMenuItem key={member.id} onClick={() => handleAssign(member)}>{member.name} ({member.role})</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="rounded-xl h-9 px-3 border-slate-200 bg-white text-slate-800 hover:bg-slate-50">Transfer</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">{teamMembers.length === 0 ? <DropdownMenuItem disabled>No members</DropdownMenuItem> : teamMembers.map((member) => <DropdownMenuItem key={member.id} onClick={() => handleTransfer(member)}>{member.name} ({member.role})</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><Phone className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><Video className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><Info className="w-4 h-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 text-slate-700"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem><Star className="w-4 h-4 mr-2" /> Star conversation</DropdownMenuItem>
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
            {messages.map((msg) => <div key={msg.id} className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"}`}><div className={`max-w-[70%] ${msg.sender === "agent" ? "chat-bubble-sent text-slate-900" : "chat-bubble-received text-slate-900"} px-4 py-3`}><p className="text-sm">{msg.text}</p><div className={`flex items-center gap-1 mt-1 ${msg.sender === "agent" ? "justify-end" : ""}`}><span className="text-xs text-slate-500">{msg.time}</span>{msg.sender === "agent" && getStatusIcon(msg.status)}</div></div></div>)}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500"><Paperclip className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="text-slate-500"><Image className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="text-slate-500"><FileText className="w-5 h-5" /></Button>
            </div>
            <div className="flex-1 relative rounded-2xl border border-slate-200 bg-white">
              <Textarea
                placeholder={canReplyInSession ? "Type a message..." : "24h session closed. Use template message flow."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[70px] max-h-40 resize-none pr-12 text-base leading-6 border-0 focus-visible:ring-0 rounded-2xl bg-transparent text-slate-900 placeholder:text-slate-400"
                disabled={!canReplyInSession}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button variant="ghost" size="icon" className="absolute right-2 bottom-3 text-slate-500"><Smile className="w-5 h-5" /></Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500"><Mic className="w-5 h-5" /></Button>
              <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl h-12 w-14 shadow-md shadow-orange-500/30" onClick={handleSendMessage} disabled={!canReplyInSession}><Send className="w-5 h-5" /></Button>
            </div>
          </div>
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
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Display Number</span><span className="text-slate-900 font-medium">{wabaDetails?.displayPhoneNumber || "-"}</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Status</span><Badge className={wabaDetails?.readyToSend ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>{wabaDetails?.readyToSend ? "Ready" : (wabaDetails?.state || "Pending")}</Badge></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxPage;
