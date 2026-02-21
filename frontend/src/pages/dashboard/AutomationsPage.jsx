import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus,
  Save,
  Trash2,
  UploadCloud,
  MessageCircle,
  ImageIcon,
  FileText,
  Bot,
  HelpCircle,
  List,
  Type,
  GitBranch,
  Timer,
  CornerUpRight,
  UserCheck,
  Tags,
  Webhook,
  OctagonX,
  MapPin,
  Link as LinkIcon,
} from "lucide-react";

const FLOW_COLORS = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-700",
};

const NODE_LIBRARY = [
  { section: "Message", color: "border-emerald-300 bg-emerald-50", items: ["text", "media", "template", "bot_reply", "cta_url"] },
  { section: "User Input", color: "border-sky-300 bg-sky-50", items: ["ask_question", "buttons", "list", "capture_input", "location", "form"] },
  { section: "Logic", color: "border-orange-300 bg-orange-50", items: ["condition", "delay", "jump"] },
  { section: "System", color: "border-violet-300 bg-violet-50", items: ["handoff", "request_intervention", "tag_user", "webhook", "end"] },
];

const NODE_META = {
  text: { label: "Text", icon: MessageCircle, hint: "Plain reply" },
  media: { label: "Media", icon: ImageIcon, hint: "Image/video/doc" },
  template: { label: "Template", icon: FileText, hint: "Outside 24h" },
  bot_reply: { label: "Bot Reply", icon: Bot, hint: "Simple/media/advanced" },
  cta_url: { label: "CTA URL", icon: LinkIcon, hint: "Text + URL buttons" },
  ask_question: { label: "Ask Question", icon: HelpCircle, hint: "Capture intent" },
  buttons: { label: "Buttons", icon: Type, hint: "Interactive options" },
  list: { label: "List", icon: List, hint: "Interactive list" },
  capture_input: { label: "Capture Input", icon: Type, hint: "Save user value" },
  location: { label: "Location", icon: MapPin, hint: "Ask location" },
  form: { label: "Form", icon: FileText, hint: "Multi-field capture" },
  condition: { label: "Condition", icon: GitBranch, hint: "True / False path" },
  delay: { label: "Delay", icon: Timer, hint: "Wait then continue" },
  jump: { label: "Jump", icon: CornerUpRight, hint: "Go to node" },
  handoff: { label: "Assign Agent", icon: UserCheck, hint: "Human transfer" },
  request_intervention: { label: "Request Intervention", icon: UserCheck, hint: "Escalate to team" },
  tag_user: { label: "Tag User", icon: Tags, hint: "Apply labels" },
  webhook: { label: "Webhook / API", icon: Webhook, hint: "External integration" },
  end: { label: "End", icon: OctagonX, hint: "Stop flow" },
};

function uid(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function createNode(type) {
  const base = { id: uid(type), type, name: type, next: "", onTrue: "", onFalse: "", config: {} };
  if (type === "text") base.config = { body: "Welcome 👋", typing: true };
  if (type === "media") base.config = { body: "", mediaType: "image", mediaUrl: "" };
  if (type === "template") base.config = { templateName: "", languageCode: "en", parameters: [] };
  if (type === "buttons") base.config = { body: "Please choose", buttons: ["Support", "Sales", "Accounts"] };
  if (type === "list") base.config = { headerText: "Select an option", sections: [{ name: "Options", items: ["A", "B"] }] };
  if (type === "ask_question") base.config = { question: "How can I help you?" };
  if (type === "capture_input") base.config = { variable: "user_input", validation: "text" };
  if (type === "condition") base.config = { field: "message", operator: "contains", value: "support" };
  if (type === "delay") base.config = { seconds: 2 };
  if (type === "handoff") base.config = { queue: "support" };
  if (type === "location") base.config = { prompt: "Please share your location." };
  if (type === "form") base.config = { title: "Lead Form", fields: [{ key: "name", label: "Full Name", type: "text", required: true }, { key: "phone", label: "Phone", type: "phone", required: true }] };
  if (type === "tag_user") base.config = { tags: ["new-lead"] };
  if (type === "webhook") base.config = { method: "POST", url: "", body: "{\"phone\":\"{{phone}}\"}" };
  if (type === "request_intervention") base.config = { queue: "support", message: "Our team will connect with you shortly." };
  if (type === "cta_url") base.config = { body: "Choose an option", ctaButtons: [{ text: "Visit Website", url: "https://" }] };
  if (type === "bot_reply") base.config = { replyMode: "simple", simpleText: "How can I help you?", mediaText: "", mediaUrl: "", advancedType: "quick_reply", buttons: ["Sales", "Support", "Accounts"], ctaButtons: [{ text: "Website", url: "https://" }], listHeader: "Select", listItems: [{ title: "FAQ", subtitle: "Help" }] };
  return base;
}

function buildSupportDefinition(company = "your company") {
  return {
    trigger: { type: "keyword", keywords: ["hi", "hello", "HI", "Hello"] },
    startNodeId: "start_1",
    nodes: [
      { id: "start_1", type: "start", name: "Start", next: "welcome_1", config: {} },
      { id: "welcome_1", type: "bot_reply", name: "Welcome Reply", next: "route_1", config: { replyMode: "advanced", advancedType: "quick_reply", simpleText: `Welcome {{name}} to ${company}. How can I help you today?`, buttons: ["Support", "Sales", "Accounts"] } },
      { id: "route_1", type: "condition", name: "Support?", config: { field: "message", operator: "contains", value: "support" }, onTrue: "support_1", onFalse: "route_2" },
      { id: "route_2", type: "condition", name: "Sales?", config: { field: "message", operator: "contains", value: "sales" }, onTrue: "sales_1", onFalse: "faq_1" },
      { id: "support_1", type: "text", name: "Support Intro", next: "handoff_1", config: { body: "Transferring to Support Agent. Tell me your query." } },
      { id: "sales_1", type: "text", name: "Sales Intro", next: "handoff_2", config: { body: "Transferring to Sales Agent. Tell me your requirement." } },
      { id: "faq_1", type: "condition", name: "FAQ Found?", config: { field: "faq_answer", operator: "not_equals", value: "" }, onTrue: "faq_ans", onFalse: "fallback" },
      { id: "faq_ans", type: "text", name: "FAQ Answer", next: "end_1", config: { body: "{{faq_answer}}" } },
      { id: "fallback", type: "text", name: "Fallback", next: "handoff_1", config: { body: "Ohh, I am not able to solve this. Transferring to real human agent." } },
      { id: "handoff_1", type: "handoff", name: "Assign Support", next: "end_1", config: { queue: "support" } },
      { id: "handoff_2", type: "handoff", name: "Assign Sales", next: "end_1", config: { queue: "sales" } },
      { id: "end_1", type: "end", name: "End", next: "", config: {} },
    ],
    edges: [],
  };
}

function normalizeButtons(config) {
  return Array.isArray(config.buttons) ? config.buttons : [];
}

function WhatsAppNodePreview({ node }) {
  const config = node?.config || {};
  const type = node?.type;
  const isBotReply = type === "bot_reply";
  const replyMode = config.replyMode || "simple";
  const advancedType = config.advancedType || "quick_reply";
  const text =
    replyMode === "media" ? (config.mediaText || "Media message") : (config.simpleText || config.body || "Preview");
  const buttons = normalizeButtons(config).filter((b) => String(b || "").trim());
  const ctaButtons = (Array.isArray(config.ctaButtons) ? config.ctaButtons : []).filter((b) => b?.text);
  const listItems = (Array.isArray(config.listItems) ? config.listItems : []).filter((i) => i?.title);

  const showQuickReply = isBotReply && replyMode === "advanced" && advancedType === "quick_reply" && buttons.length;
  const showCta = isBotReply && replyMode === "advanced" && advancedType === "cta" && ctaButtons.length;
  const showList = isBotReply && replyMode === "advanced" && advancedType === "list" && listItems.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-[#ece8de] p-3">
      <div className="mx-auto max-w-[320px] rounded-2xl border border-slate-300 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200">
          <div className="text-lg font-semibold text-slate-900">{node?.name || "Bot Reply"}</div>
          <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{text}</p>
          <div className="mt-1 text-right text-xs text-slate-500">4:06 PM</div>
        </div>

        {showQuickReply &&
          buttons.map((label, idx) => (
            <button
              key={`qr-${idx}`}
              type="button"
              className="w-full border-t border-slate-200 px-3 py-2 text-center text-[15px] font-medium text-emerald-700 hover:bg-emerald-50"
            >
              ↩ {label}
            </button>
          ))}

        {showCta &&
          ctaButtons.slice(0, 2).map((btn, idx) => (
            <button
              key={`cta-${idx}`}
              type="button"
              className="w-full border-t border-slate-200 px-3 py-2 text-center text-[15px] font-medium text-blue-700 hover:bg-blue-50"
            >
              {btn.text}
            </button>
          ))}

        {showList && (
          <>
            <div className="border-t border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              {config.listHeader || "Select an option"}
            </div>
            {listItems.slice(0, 4).map((item, idx) => (
              <div key={`li-${idx}`} className="border-t border-slate-200 px-3 py-2">
                <div className="text-sm font-medium text-slate-900">{item.title}</div>
                {item.subtitle && <div className="text-xs text-slate-500">{item.subtitle}</div>}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function CanvasNodePreview({ node }) {
  const config = node?.config || {};
  const type = node?.type;
  const text = config.simpleText || config.body || config.prompt || "Configure node";
  const buttons = normalizeButtons(config).filter((b) => String(b || "").trim());
  const ctaButtons = (Array.isArray(config.ctaButtons) ? config.ctaButtons : []).filter((b) => b?.text).slice(0, 2);
  const listItems = (Array.isArray(config.listItems) ? config.listItems : []).filter((i) => i?.title).slice(0, 4);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-[#ece8de] p-2">
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-2.5 py-2 text-xs text-slate-800 whitespace-pre-wrap">{text}</div>

        {(type === "buttons" || (type === "bot_reply" && config.replyMode === "advanced" && config.advancedType === "quick_reply")) &&
          buttons.map((b, i) => (
            <div key={i} className="border-t border-slate-200 px-2 py-1.5 text-center text-[12px] font-medium text-emerald-700">
              ↩ {b}
            </div>
          ))}

        {(type === "cta_url" || (type === "bot_reply" && config.replyMode === "advanced" && config.advancedType === "cta")) &&
          ctaButtons.map((b, i) => (
            <div key={i} className="border-t border-slate-200 px-2 py-1.5 text-center text-[12px] font-medium text-blue-700">
              {b.text}
            </div>
          ))}

        {(type === "list" || (type === "bot_reply" && config.replyMode === "advanced" && config.advancedType === "list")) && (
          <>
            <div className="border-t border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700">
              {config.listHeader || config.headerText || "Select an option"}
            </div>
            {listItems.map((item, i) => (
              <div key={i} className="border-t border-slate-200 px-2 py-1.5">
                <div className="text-[11px] font-medium text-slate-900">{item.title}</div>
                {item.subtitle && <div className="text-[10px] text-slate-500">{item.subtitle}</div>}
              </div>
            ))}
          </>
        )}
        {type === "form" && (
          <>
            <div className="border-t border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700">{config.title || "Form"}</div>
            {(Array.isArray(config.fields) ? config.fields : []).slice(0, 4).map((f, i) => (
              <div key={i} className="border-t border-slate-200 px-2 py-1.5 text-[11px] text-slate-700">
                {f.label || f.key} {f.required ? "*" : ""}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function extractTemplateVars(text) {
  const src = String(text || "");
  const matches = [...src.matchAll(/\{\{(\d+)\}\}/g)];
  const uniq = [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b);
  return uniq;
}

function getNodeColor(type) {
  if (["text", "media", "template", "bot_reply"].includes(type)) return "border-emerald-300 bg-emerald-50";
  if (["ask_question", "buttons", "list", "capture_input"].includes(type)) return "border-sky-300 bg-sky-50";
  if (["condition", "delay", "jump"].includes(type)) return "border-orange-300 bg-orange-50";
  if (["handoff", "tag_user", "webhook"].includes(type)) return "border-violet-300 bg-violet-50";
  if (type === "end") return "border-red-300 bg-red-50";
  return "border-slate-300 bg-slate-50";
}

function computeEdges(nodes) {
  const out = [];
  nodes.forEach((n) => {
    if (n.next) out.push({ from: n.id, to: n.next, label: "next" });
    if (n.onTrue) out.push({ from: n.id, to: n.onTrue, label: "true" });
    if (n.onFalse) out.push({ from: n.id, to: n.onFalse, label: "false" });
  });
  return out;
}

export default function AutomationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname.endsWith("/workflow") ? "workflow" : location.pathname.endsWith("/qa") ? "qa" : "overview";

  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [versions, setVersions] = useState([]);
  const [limits, setLimits] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", companyName: "" });

  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [outside24h, setOutside24h] = useState(false);
  const [triggerKeywords, setTriggerKeywords] = useState("hi,hello,HI,Hello");

  const [faqItems, setFaqItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", isActive: true });

  const canvasRef = useRef(null);
  const nodeRefs = useRef({});
  const [edgeLines, setEdgeLines] = useState([]);
  const [dragConnect, setDragConnect] = useState(null);

  const selectedFlow = useMemo(
    () => flows.find((f) => String(f.id) === String(selectedFlowId)) || null,
    [flows, selectedFlowId]
  );
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const loadAll = async () => {
    try {
      const [f, l, q] = await Promise.all([apiGet("/api/automation/flows"), apiGet("/api/automation/limits"), apiGet("/api/automation/faq")]);
      setFlows(f || []);
      setLimits(l || null);
      setFaqItems(q || []);
      if (!selectedFlowId && f?.length) setSelectedFlowId(String(f[0].id));
    } catch {
      toast.error("Failed to load automation data");
    }
  };

  const loadFlowDetails = async (flowId) => {
    if (!flowId) return;
    try {
      const [vers] = await Promise.all([apiGet(`/api/automation/flows/${flowId}/versions`)]);
      setVersions(vers || []);
      if (vers?.[0]?.definitionJson) {
        const def = JSON.parse(vers[0].definitionJson);
        const loadedNodes = Array.isArray(def.nodes) ? def.nodes : [];
        setNodes(loadedNodes);
        setSelectedNodeId(loadedNodes[0]?.id || "");
      } else {
        setNodes([]);
      }
    } catch {
      toast.error("Failed to load selected workflow");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedFlowId) loadFlowDetails(selectedFlowId);
  }, [selectedFlowId]);

  useEffect(() => {
    if (!selectedFlow?.triggerConfigJson) return;
    try {
      const cfg = JSON.parse(selectedFlow.triggerConfigJson);
      if (Array.isArray(cfg.keywords) && cfg.keywords.length) {
        setTriggerKeywords(cfg.keywords.join(","));
      }
    } catch {
      // ignore malformed json
    }
  }, [selectedFlow]);

  const createFlow = async () => {
    try {
      const payload = {
        name: createForm.name,
        description: createForm.description,
        channel: "waba",
        triggerType: "keyword",
        triggerConfigJson: JSON.stringify({ keywords: ["hi", "hello", "HI", "Hello"] }),
        definitionJson: JSON.stringify(buildSupportDefinition(createForm.companyName || "your company")),
      };
      const res = await apiPost("/api/automation/flows", payload);
      toast.success("Bot created");
      setShowCreate(false);
      setCreateForm({ name: "", description: "", companyName: "" });
      await loadAll();
      if (res?.flow?.id) {
        setSelectedFlowId(String(res.flow.id));
        navigate("/dashboard/automations/workflow");
      }
    } catch (e) {
      toast.error(e?.message || "Create failed");
    }
  };

  const saveDraft = async () => {
    if (!selectedFlowId) return;
    try {
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions`, {
        changeNote: "Saved from flow builder",
        definitionJson: JSON.stringify({ trigger: { type: "keyword" }, startNodeId: nodes.find((n) => n.type === "start")?.id || nodes[0]?.id || "", nodes, edges: computeEdges(nodes) }),
      });
      toast.success("Workflow saved");
      await loadFlowDetails(selectedFlowId);
    } catch (e) {
      toast.error(e?.message || "Save failed");
    }
  };

  const saveTriggerKeywords = async () => {
    if (!selectedFlowId || !selectedFlow) return;
    try {
      const keywords = triggerKeywords
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      await apiPut(`/api/automation/flows/${selectedFlowId}`, {
        name: selectedFlow.name || "",
        description: selectedFlow.description || "",
        channel: selectedFlow.channel || "waba",
        triggerType: selectedFlow.triggerType || "keyword",
        isActive: !!selectedFlow.isActive,
        triggerConfigJson: JSON.stringify({ keywords }),
      });
      toast.success("Bot trigger keywords saved");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to save trigger keywords");
    }
  };

  const publish = async (flowId = selectedFlowId) => {
    if (!flowId) return;
    try {
      if (String(flowId) === String(selectedFlowId)) {
        const hasStart = nodes.some((n) => n.type === "start") || nodes.length > 0;
        if (!hasStart) return toast.error("Add at least one node before publish");
        const templateNode = nodes.find((n) => n.type === "template");
        if (templateNode) {
          const vars = extractTemplateVars(templateNode.config?.body);
          const params = Array.isArray(templateNode.config?.parameters) ? templateNode.config.parameters : [];
          const missing = vars.filter((v) => !params.some((p) => Number(p?.index) === v));
          if (missing.length) return toast.error(`Template mapping missing: ${missing.map((v) => `{{${v}}}`).join(", ")}`);
        }
      }
      const vers = String(flowId) === String(selectedFlowId) ? versions : await apiGet(`/api/automation/flows/${flowId}/versions`);
      if (!vers?.length) return toast.error("No version found");
      await apiPost(`/api/automation/flows/${flowId}/versions/${vers[0].id}/publish`, { requireApproval: false });
      toast.success("Published");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Publish failed");
    }
  };

  const unpublish = async (flowId = selectedFlowId) => {
    if (!flowId) return;
    try {
      await apiPost(`/api/automation/flows/${flowId}/unpublish`, {});
      toast.success("Unpublished");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Unpublish failed");
    }
  };

  const deleteFlow = async (flowId = selectedFlowId) => {
    if (!flowId || !window.confirm("Delete this bot?")) return;
    try {
      await apiDelete(`/api/automation/flows/${flowId}`);
      toast.success("Deleted");
      await loadAll();
      if (String(selectedFlowId) === String(flowId)) {
        setSelectedFlowId("");
        setNodes([]);
      }
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    }
  };

  const updateNode = (id, patch) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const addNode = (type) => {
    const node = createNode(type);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };
  const removeNode = (id) => {
    setNodes((prev) => prev.filter((n) => n.id !== id).map((n) => ({ ...n, next: n.next === id ? "" : n.next, onTrue: n.onTrue === id ? "" : n.onTrue, onFalse: n.onFalse === id ? "" : n.onFalse })));
    if (selectedNodeId === id) setSelectedNodeId("");
  };

  useEffect(() => {
    const compute = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const edges = computeEdges(nodes).map((e) => {
        const fromEl = nodeRefs.current[e.from];
        const toEl = nodeRefs.current[e.to];
        if (!fromEl || !toEl) return null;
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();
        const x1 = fr.right - canvasRect.left;
        const y1 = fr.top + fr.height / 2 - canvasRect.top;
        const x2 = tr.left - canvasRect.left;
        const y2 = tr.top + tr.height / 2 - canvasRect.top;
        return { ...e, x1, y1, x2, y2 };
      }).filter(Boolean);
      setEdgeLines(edges);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [nodes]);

  const onStartConnect = (nodeId, ev) => {
    ev.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDragConnect({ from: nodeId, x1: ev.clientX - rect.left, y1: ev.clientY - rect.top, x2: ev.clientX - rect.left, y2: ev.clientY - rect.top });
  };

  const onCanvasMouseMove = (ev) => {
    if (!dragConnect) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragConnect((d) => ({ ...d, x2: ev.clientX - rect.left, y2: ev.clientY - rect.top }));
  };

  const onConnectToNode = (targetId) => {
    if (!dragConnect || dragConnect.from === targetId) return;
    const source = nodes.find((n) => n.id === dragConnect.from);
    if (!source) {
      setDragConnect(null);
      return;
    }
    if (source.type === "condition") {
      if (!source.onTrue) updateNode(source.id, { onTrue: targetId });
      else updateNode(source.id, { onFalse: targetId });
    } else {
      updateNode(source.id, { next: targetId });
    }
    setDragConnect(null);
  };

  const saveFaq = async () => {
    try {
      if (!faqForm.question.trim() || !faqForm.answer.trim()) return toast.error("Question and answer required");
      await apiPost("/api/automation/faq", faqForm);
      setFaqForm({ question: "", answer: "", category: "", isActive: true });
      await loadAll();
      toast.success("Q&A added");
    } catch (e) {
      toast.error(e?.message || "Failed");
    }
  };

  const deleteFaq = async (id) => {
    try {
      await apiDelete(`/api/automation/faq/${id}`);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    }
  };

  const automationTabs = [
    { key: "overview", label: "Automations", href: "/dashboard/automations" },
    { key: "workflow", label: "Work Flow", href: "/dashboard/automations/workflow" },
    { key: "qa", label: "Q&A", href: "/dashboard/automations/qa" },
  ];

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Total Bots</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{flows.length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Runs Today</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{limits?.usage?.runsToday ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Active Bots</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{flows.filter((x) => x.lifecycleStatus === "published").length}</CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button className="bg-orange-500 hover:bg-orange-600 text-white"><Plus className="w-4 h-4 mr-2" />Create Bot</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Bot</DialogTitle><DialogDescription>Create professional chatbot with trigger and starter workflow.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              <div><Label>Bot Name</Label><Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Company Name</Label><Input value={createForm.companyName} onChange={(e) => setCreateForm((p) => ({ ...p, companyName: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} /></div>
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={createFlow}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Bot List</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-slate-600"><th className="text-left py-2">Name</th><th className="text-left py-2">Status</th><th className="text-left py-2">Date</th><th className="text-left py-2">Actions</th></tr></thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.id} className="border-b">
                  <td className="py-3 font-semibold">{f.name}</td>
                  <td className="py-3"><Badge className={FLOW_COLORS[f.lifecycleStatus] || "bg-slate-100 text-slate-700"}>{f.lifecycleStatus}</Badge></td>
                  <td className="py-3">{f.updatedAtUtc ? new Date(f.updatedAtUtc).toLocaleString() : "-"}</td>
                  <td className="py-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedFlowId(String(f.id)); navigate("/dashboard/automations/workflow"); }}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedFlowId(String(f.id)); navigate("/dashboard/automations/workflow"); }}>Workflow</Button>
                      <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => publish(f.id)}>Publish</Button>
                      <Button size="sm" variant="outline" onClick={() => unpublish(f.id)}>Unpublish</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteFlow(f.id)}><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!flows.length && <tr><td colSpan={4} className="py-6 text-slate-500">No bot found. Create bot first.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );

  const renderWorkflow = () => (
    <div className="space-y-4">
      {!selectedFlowId && <Card><CardContent className="py-8 text-center text-slate-600">No workflow selected. Go to Automations and click <span className="font-semibold">Workflow</span> in bot list.</CardContent></Card>}
      {selectedFlowId && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
              <SelectTrigger className="w-[320px]"><SelectValue /></SelectTrigger>
              <SelectContent>{flows.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={saveDraft}><Save className="w-4 h-4 mr-2" />Save</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => publish(selectedFlowId)}><UploadCloud className="w-4 h-4 mr-2" />Publish</Button>
            <label className="ml-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={outside24h} onChange={(e) => setOutside24h(e.target.checked)} />Outside 24h session</label>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bot Trigger</CardTitle>
              <CardDescription>Bot starts when incoming message contains any of these words.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-2">
              <Input
                value={triggerKeywords}
                onChange={(e) => setTriggerKeywords(e.target.value)}
                placeholder="hi, hello, support, pricing"
              />
              <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveTriggerKeywords}>
                Save Trigger
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <Card className="xl:col-span-9 overflow-hidden">
              <div className="h-14 border-b bg-white px-4 flex items-center justify-between">
                <div className="font-semibold text-slate-900">{selectedFlow?.name || "Untitled Flow"}</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={saveDraft}>Save Changes</Button>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => publish(selectedFlowId)}>Publish</Button>
                </div>
              </div>
              <div
                ref={canvasRef}
                className="relative min-h-[680px]"
                style={{
                  backgroundColor: "#f8fafc",
                  backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={() => setDragConnect(null)}
              >
                <div className="absolute left-4 top-4 w-[260px] rounded-xl border bg-white p-3 shadow-sm z-30 pointer-events-auto">
                  <div className="text-xs font-bold tracking-wide text-slate-500 mb-2">CONTENTS</div>
                  <div className="max-h-[calc(100vh-260px)] min-h-[560px] overflow-y-auto pr-1">
                    {NODE_LIBRARY.map((s) => (
                      <div key={s.section} className="mb-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{s.section}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {s.items.map((type) => (
                            <button
                              key={type}
                              className="rounded-lg border bg-slate-50 hover:bg-slate-100 px-2 py-2 text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                addNode(type);
                              }}
                              type="button"
                            >
                              <div className="flex items-start gap-2">
                                {(() => {
                                  const Icon = NODE_META[type]?.icon || MessageCircle;
                                  return <Icon className="h-3.5 w-3.5 mt-0.5 text-slate-600" />;
                                })()}
                                <div>
                                  <div className="text-[11px] font-medium text-slate-900 leading-tight">{NODE_META[type]?.label || type.replaceAll("_", " ")}</div>
                                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{NODE_META[type]?.hint || "Node"}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <svg className="pointer-events-none absolute inset-0 w-full h-full z-10">
                  {edgeLines.map((e, i) => (
                    <g key={i}>
                      <path d={`M ${e.x1} ${e.y1} C ${e.x1 + 60} ${e.y1}, ${e.x2 - 60} ${e.y2}, ${e.x2} ${e.y2}`} fill="none" stroke="#14b8a6" strokeWidth="2" strokeDasharray="5 4" />
                    </g>
                  ))}
                  {dragConnect && <path d={`M ${dragConnect.x1} ${dragConnect.y1} C ${dragConnect.x1 + 60} ${dragConnect.y1}, ${dragConnect.x2 - 60} ${dragConnect.y2}, ${dragConnect.x2} ${dragConnect.y2}`} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" />}
                </svg>

                <div className="relative z-20 pl-[300px] pr-4 pt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    {nodes.map((n) => (
                      <div
                        key={n.id}
                        ref={(el) => { nodeRefs.current[n.id] = el; }}
                        className={`rounded-xl border border-emerald-200 bg-white p-3 shadow-sm cursor-pointer ${selectedNodeId === n.id ? "ring-2 ring-emerald-400" : ""}`}
                        onClick={() => setSelectedNodeId(n.id)}
                        onMouseUp={() => onConnectToNode(n.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-8 rounded bg-emerald-500" />
                            <div>
                              <div className="text-xs text-slate-500">{n.type}</div>
                              <div className="font-semibold text-slate-900">{n.name || (NODE_META[n.type]?.label ?? n.id)}</div>
                            </div>
                          </div>
                          <button className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-white" onMouseDown={(ev) => onStartConnect(n.id, ev)} title="Drag to connect" />
                        </div>
                        <CanvasNodePreview node={n} />
                      </div>
                    ))}
                    {!nodes.length && <div className="text-sm text-slate-500">No nodes yet. Add from CONTENTS palette.</div>}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="xl:col-span-3">
              <CardHeader><CardTitle>Interactions</CardTitle><CardDescription>Node configuration + live preview</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {!selectedNode && <p className="text-sm text-slate-500">Select a node.</p>}
                {selectedNode && (
                  <>
                    <div><Label>Name</Label><Input value={selectedNode.name || ""} onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })} /></div>

                    {selectedNode.type === "text" && (
                      <div><Label>Message</Label><Textarea rows={3} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                    )}
                    {selectedNode.type === "ask_question" && (
                      <div><Label>Question</Label><Textarea rows={2} value={selectedNode.config?.question || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, question: e.target.value } })} /></div>
                    )}
                    {selectedNode.type === "capture_input" && (
                      <>
                        <div><Label>Variable Name</Label><Input value={selectedNode.config?.variable || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, variable: e.target.value } })} /></div>
                        <div>
                          <Label>Validation</Label>
                          <Select value={selectedNode.config?.validation || "text"} onValueChange={(v) => updateNode(selectedNode.id, { config: { ...selectedNode.config, validation: v } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="phone">Phone</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {selectedNode.type === "form" && (
                      <>
                        <div><Label>Form Title</Label><Input value={selectedNode.config?.title || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, title: e.target.value } })} /></div>
                        <div className="space-y-2">
                          <Label>Fields (JSON)</Label>
                          <Textarea
                            rows={6}
                            value={JSON.stringify(selectedNode.config?.fields || [], null, 2)}
                            onChange={(e) => {
                              try {
                                const fields = JSON.parse(e.target.value || "[]");
                                updateNode(selectedNode.id, { config: { ...selectedNode.config, fields } });
                              } catch {}
                            }}
                          />
                        </div>
                      </>
                    )}
                    {selectedNode.type === "media" && (
                      <>
                        <div><Label>Caption</Label><Textarea rows={2} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                        <div>
                          <Label>Media Type</Label>
                          <Select value={selectedNode.config?.mediaType || "image"} onValueChange={(v) => updateNode(selectedNode.id, { config: { ...selectedNode.config, mediaType: v } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="video">Video</SelectItem>
                              <SelectItem value="document">Document</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Media URL</Label><Input value={selectedNode.config?.mediaUrl || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, mediaUrl: e.target.value } })} /></div>
                      </>
                    )}
                    {selectedNode.type === "template" && (
                      <>
                        <div><Label>Template Name</Label><Input placeholder="approved_template_name" value={selectedNode.config?.templateName || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, templateName: e.target.value } })} /></div>
                        <div><Label>Language Code</Label><Input placeholder="en" value={selectedNode.config?.languageCode || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, languageCode: e.target.value } })} /></div>
                        <div className="space-y-2">
                          <Label>{"Template Body (use {{1}}, {{2}}...)"}</Label>
                          <Textarea rows={3} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Parameter Mapping (JSON)</Label>
                          <Textarea
                            rows={4}
                            value={JSON.stringify(selectedNode.config?.parameters || [], null, 2)}
                            onChange={(e) => {
                              try {
                                const parameters = JSON.parse(e.target.value || "[]");
                                updateNode(selectedNode.id, { config: { ...selectedNode.config, parameters } });
                              } catch {}
                            }}
                          />
                        </div>
                        {(() => {
                          const vars = extractTemplateVars(selectedNode.config?.body);
                          const params = Array.isArray(selectedNode.config?.parameters) ? selectedNode.config.parameters : [];
                          const missing = vars.filter((v) => !params.some((p) => Number(p?.index) === v));
                          return missing.length ? (
                            <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs p-2">
                              Missing template variables mapping: {missing.map((n) => `{{${n}}}`).join(", ")}
                            </div>
                          ) : (
                            <div className="rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs p-2">Template variables mapping looks valid.</div>
                          );
                        })()}
                      </>
                    )}
                    {selectedNode.type === "buttons" && (
                      <div className="space-y-2">
                        <Label>Buttons</Label>
                        <Textarea
                          rows={4}
                          value={JSON.stringify(selectedNode.config?.buttons || [], null, 2)}
                          onChange={(e) => {
                            try {
                              const arr = JSON.parse(e.target.value || "[]");
                              updateNode(selectedNode.id, { config: { ...selectedNode.config, buttons: arr } });
                            } catch {}
                          }}
                        />
                      </div>
                    )}
                    {selectedNode.type === "list" && (
                      <>
                        <div><Label>Header</Label><Input value={selectedNode.config?.headerText || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, headerText: e.target.value } })} /></div>
                        <div>
                          <Label>Sections (JSON)</Label>
                          <Textarea
                            rows={4}
                            value={JSON.stringify(selectedNode.config?.sections || [], null, 2)}
                            onChange={(e) => {
                              try {
                                const sections = JSON.parse(e.target.value || "[]");
                                updateNode(selectedNode.id, { config: { ...selectedNode.config, sections } });
                              } catch {}
                            }}
                          />
                        </div>
                      </>
                    )}
                    {selectedNode.type === "location" && (
                      <div><Label>Prompt</Label><Textarea rows={2} value={selectedNode.config?.prompt || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, prompt: e.target.value } })} /></div>
                    )}
                    {selectedNode.type === "cta_url" && (
                      <>
                        <div><Label>Message</Label><Textarea rows={2} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                        <div><Label>CTA Buttons (JSON)</Label><Textarea rows={4} value={JSON.stringify(selectedNode.config?.ctaButtons || [], null, 2)} onChange={(e) => { try { updateNode(selectedNode.id, { config: { ...selectedNode.config, ctaButtons: JSON.parse(e.target.value || "[]") } }); } catch {} }} /></div>
                      </>
                    )}

                    {selectedNode.type === "bot_reply" && (
                      <>
                        <div>
                          <Label>Reply Type</Label>
                          <Select value={selectedNode.config?.replyMode || "simple"} onValueChange={(v) => updateNode(selectedNode.id, { config: { ...selectedNode.config, replyMode: v } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="simple">Simple</SelectItem>
                              <SelectItem value="media">Media</SelectItem>
                              <SelectItem value="advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(selectedNode.config?.replyMode === "simple") && <div><Label>Text Reply</Label><Textarea rows={3} value={selectedNode.config?.simpleText || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, simpleText: e.target.value } })} /></div>}
                        {(selectedNode.config?.replyMode === "media") && (
                          <>
                            <div><Label>Text</Label><Textarea rows={2} value={selectedNode.config?.mediaText || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, mediaText: e.target.value } })} /></div>
                            <div><Label>Image URL</Label><Input value={selectedNode.config?.mediaUrl || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, mediaUrl: e.target.value } })} /></div>
                          </>
                        )}
                        {(selectedNode.config?.replyMode === "advanced") && (
                          <>
                            <div>
                              <Label>Advanced Type</Label>
                              <Select value={selectedNode.config?.advancedType || "quick_reply"} onValueChange={(v) => updateNode(selectedNode.id, { config: { ...selectedNode.config, advancedType: v } })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="quick_reply">Text + Buttons</SelectItem>
                                  <SelectItem value="cta">Text + CTA URL Buttons</SelectItem>
                                  <SelectItem value="list">Text + List Message</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div><Label>Text</Label><Textarea rows={2} value={selectedNode.config?.simpleText || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, simpleText: e.target.value } })} /></div>
                            {selectedNode.config?.advancedType === "quick_reply" && (
                              <div className="space-y-2">
                                <Label>Buttons</Label>
                                <Textarea
                                  rows={4}
                                  value={JSON.stringify(selectedNode.config?.buttons || [], null, 2)}
                                  onChange={(e) => {
                                    try {
                                      const arr = JSON.parse(e.target.value || "[]");
                                      updateNode(selectedNode.id, { config: { ...selectedNode.config, buttons: arr } });
                                    } catch {}
                                  }}
                                />
                              </div>
                            )}
                            {selectedNode.config?.advancedType === "cta" && (
                              <div className="space-y-2">
                                <Label>CTA Buttons (JSON)</Label>
                                <Textarea rows={3} value={JSON.stringify(selectedNode.config?.ctaButtons || [], null, 2)} onChange={(e) => { try { updateNode(selectedNode.id, { config: { ...selectedNode.config, ctaButtons: JSON.parse(e.target.value || "[]") } }); } catch {} }} />
                              </div>
                            )}
                            {selectedNode.config?.advancedType === "list" && (
                              <div className="space-y-2">
                                <Label>List Header</Label>
                                <Input value={selectedNode.config?.listHeader || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, listHeader: e.target.value } })} />
                                <Label>List Items (JSON)</Label>
                                <Textarea rows={3} value={JSON.stringify(selectedNode.config?.listItems || [], null, 2)} onChange={(e) => { try { updateNode(selectedNode.id, { config: { ...selectedNode.config, listItems: JSON.parse(e.target.value || "[]") } }); } catch {} }} />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {selectedNode.type === "condition" && (
                      <>
                        <div><Label>Variable</Label><Input value={selectedNode.config?.field || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, field: e.target.value } })} /></div>
                        <div><Label>Operator</Label><Input value={selectedNode.config?.operator || "contains"} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, operator: e.target.value } })} /></div>
                        <div><Label>Value</Label><Input value={selectedNode.config?.value || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, value: e.target.value } })} /></div>
                      </>
                    )}
                    {selectedNode.type === "delay" && (
                      <div><Label>Delay Seconds</Label><Input type="number" value={String(selectedNode.config?.seconds ?? 1)} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, seconds: Number(e.target.value || "1") } })} /></div>
                    )}
                    {selectedNode.type === "handoff" && (
                      <div><Label>Assign Queue</Label><Input value={selectedNode.config?.queue || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, queue: e.target.value } })} /></div>
                    )}
                    {selectedNode.type === "request_intervention" && (
                      <>
                        <div><Label>Queue</Label><Input value={selectedNode.config?.queue || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, queue: e.target.value } })} /></div>
                        <div><Label>Message</Label><Textarea rows={2} value={selectedNode.config?.message || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, message: e.target.value } })} /></div>
                      </>
                    )}
                    {selectedNode.type === "tag_user" && (
                      <div><Label>Tags (comma separated)</Label><Input value={(selectedNode.config?.tags || []).join(", ")} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} /></div>
                    )}
                    {selectedNode.type === "webhook" && (
                      <>
                        <div><Label>Method</Label><Input value={selectedNode.config?.method || "POST"} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, method: e.target.value } })} /></div>
                        <div><Label>URL</Label><Input value={selectedNode.config?.url || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, url: e.target.value } })} /></div>
                        <div><Label>Body (JSON)</Label><Textarea rows={3} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                      </>
                    )}
                    {selectedNode.type === "jump" && (
                      <div>
                        <Label>Go To Node</Label>
                        <Select value={selectedNode.next || ""} onValueChange={(v) => updateNode(selectedNode.id, { next: v })}>
                          <SelectTrigger><SelectValue placeholder="Select target node" /></SelectTrigger>
                          <SelectContent>
                            {nodes.filter((n) => n.id !== selectedNode.id).map((n) => <SelectItem key={n.id} value={n.id}>{n.name || n.id}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {outside24h && ["text", "bot_reply"].includes(selectedNode.type) && <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs p-2">⚠ Outside 24h session, use template message.</div>}

                    <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                      <div className="text-xs text-slate-500 mb-2">WhatsApp Preview</div>
                      <WhatsAppNodePreview node={selectedNode} />
                    </div>

                    <Button variant="destructive" className="w-full" onClick={() => removeNode(selectedNode.id)}>Delete Node</Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );

  const renderQa = () => (
    <Card>
      <CardHeader><CardTitle>Q&A Knowledge Base</CardTitle><CardDescription>Bot uses this Q&A before human transfer.</CardDescription></CardHeader>
      <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div><Label>Question</Label><Input value={faqForm.question} onChange={(e) => setFaqForm((p) => ({ ...p, question: e.target.value }))} /></div>
          <div><Label>Answer</Label><Textarea rows={3} value={faqForm.answer} onChange={(e) => setFaqForm((p) => ({ ...p, answer: e.target.value }))} /></div>
          <div><Label>Category</Label><Input value={faqForm.category} onChange={(e) => setFaqForm((p) => ({ ...p, category: e.target.value }))} /></div>
          <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveFaq}>Add Q&A</Button>
        </div>
        <ScrollArea className="h-[320px] pr-2">
          {faqItems.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 mb-2">
              <div className="font-medium">{item.question}</div>
              <div className="text-sm text-slate-600 mt-1">{item.answer}</div>
              <div className="text-xs text-slate-500 mt-1">{item.category || "-"}</div>
              <Button variant="destructive" size="sm" className="mt-2" onClick={() => deleteFaq(item.id)}>Delete</Button>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {automationTabs.map((t) => (
          <Link key={t.key} to={t.href} className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${mode === t.key ? "bg-orange-100 text-orange-700 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{t.label}</Link>
        ))}
      </div>

      {mode === "overview" && renderOverview()}
      {mode === "workflow" && renderWorkflow()}
      {mode === "qa" && renderQa()}
    </div>
  );
}
