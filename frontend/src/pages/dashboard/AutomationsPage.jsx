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
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Save, Trash2, UploadCloud } from "lucide-react";

const FLOW_COLORS = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-700",
};

const NODE_LIBRARY = [
  { section: "Message", color: "border-emerald-300 bg-emerald-50", items: ["text", "media", "template", "bot_reply"] },
  { section: "User Input", color: "border-sky-300 bg-sky-50", items: ["ask_question", "buttons", "list", "capture_input"] },
  { section: "Logic", color: "border-orange-300 bg-orange-50", items: ["condition", "delay", "jump"] },
  { section: "System", color: "border-violet-300 bg-violet-50", items: ["handoff", "tag_user", "webhook", "end"] },
];

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
  if (type === "condition") base.config = { field: "message", operator: "contains", value: "support" };
  if (type === "delay") base.config = { seconds: 2 };
  if (type === "handoff") base.config = { queue: "support" };
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
  return (Array.isArray(config.buttons) ? config.buttons : []).slice(0, 3);
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

  const [faqItems, setFaqItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", isActive: true });

  const canvasRef = useRef(null);
  const nodeRefs = useRef({});
  const [edgeLines, setEdgeLines] = useState([]);
  const [dragConnect, setDragConnect] = useState(null);

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

  const publish = async (flowId = selectedFlowId) => {
    if (!flowId) return;
    try {
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

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <Card className="xl:col-span-3">
              <CardHeader><CardTitle>Node Palette</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  <div className="font-semibold mb-1">Trigger Message</div>
                  <div>This bot reacts on: <span className="font-medium">Hi, hello, HI, Hello</span></div>
                </div>
                <ScrollArea className="h-[620px] pr-2">
                  {NODE_LIBRARY.map((s) => (
                    <div key={s.section} className="mb-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{s.section}</p>
                      <div className="space-y-1">
                        {s.items.map((type) => (
                          <button key={type} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${s.color}`} onClick={() => addNode(type)}>{type}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="xl:col-span-6">
              <CardHeader><CardTitle>Canvas Area</CardTitle><CardDescription>Drag connector from output dot to another node to create edges.</CardDescription></CardHeader>
              <CardContent>
                <div ref={canvasRef} className="relative border rounded-xl bg-slate-50 min-h-[640px] p-3" onMouseMove={onCanvasMouseMove} onMouseUp={() => setDragConnect(null)}>
                  <svg className="pointer-events-none absolute inset-0 w-full h-full">
                    {edgeLines.map((e, i) => (
                      <g key={i}>
                        <path d={`M ${e.x1} ${e.y1} C ${e.x1 + 60} ${e.y1}, ${e.x2 - 60} ${e.y2}, ${e.x2} ${e.y2}`} fill="none" stroke="#f97316" strokeWidth="2" />
                        <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 4} fill="#64748b" fontSize="10">{e.label}</text>
                      </g>
                    ))}
                    {dragConnect && <path d={`M ${dragConnect.x1} ${dragConnect.y1} C ${dragConnect.x1 + 60} ${dragConnect.y1}, ${dragConnect.x2 - 60} ${dragConnect.y2}, ${dragConnect.x2} ${dragConnect.y2}`} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" />}
                  </svg>

                  <div className="grid md:grid-cols-2 gap-3 relative z-10">
                    {nodes.map((n) => (
                      <div
                        key={n.id}
                        ref={(el) => { nodeRefs.current[n.id] = el; }}
                        className={`rounded-xl border p-3 cursor-pointer ${getNodeColor(n.type)} ${selectedNodeId === n.id ? "ring-2 ring-orange-400" : ""}`}
                        onClick={() => setSelectedNodeId(n.id)}
                        onMouseUp={() => onConnectToNode(n.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-slate-500">{n.type}</div>
                            <div className="font-semibold text-slate-900">{n.name || n.id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            <button className="w-3 h-3 rounded-full bg-orange-500" onMouseDown={(ev) => onStartConnect(n.id, ev)} title="Drag to connect" />
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 mt-2">{n.next ? `Next: ${n.next}` : n.onTrue || n.onFalse ? `True: ${n.onTrue || "-"} | False: ${n.onFalse || "-"}` : "No connection"}</div>
                      </div>
                    ))}
                    {!nodes.length && <div className="text-sm text-slate-500">No nodes yet. Add from palette.</div>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-3">
              <CardHeader><CardTitle>Properties</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!selectedNode && <p className="text-sm text-slate-500">Select a node.</p>}
                {selectedNode && (
                  <>
                    <div><Label>Name</Label><Input value={selectedNode.name || ""} onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })} /></div>

                    {selectedNode.type === "text" && (
                      <div><Label>Message</Label><Textarea rows={3} value={selectedNode.config?.body || ""} onChange={(e) => updateNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
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
                                <Label>Buttons (max 3)</Label>
                                {normalizeButtons(selectedNode.config).map((b, i) => <Input key={i} value={b} onChange={(e) => {
                                  const arr = normalizeButtons(selectedNode.config);
                                  arr[i] = e.target.value;
                                  updateNode(selectedNode.id, { config: { ...selectedNode.config, buttons: arr.slice(0, 3) } });
                                }} />)}
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

                    {outside24h && ["text", "bot_reply"].includes(selectedNode.type) && <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs p-2">⚠ Outside 24h session, use template message.</div>}

                    <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                      <div className="text-xs text-slate-500 mb-1">Preview</div>
                      <div className="rounded-lg bg-white border p-2">{selectedNode.config?.simpleText || selectedNode.config?.body || "Preview"}</div>
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
