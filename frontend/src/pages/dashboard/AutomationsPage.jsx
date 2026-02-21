import { useEffect, useMemo, useState } from "react";
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
import {
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Image,
  Languages,
  MessageCircle,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  UserRound,
  Webhook,
  XCircle,
} from "lucide-react";

const TRIGGERS = ["keyword", "intent", "webhook", "schedule", "tag", "user_event"];

const FLOW_COLORS = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-700",
};

const NODE_LIBRARY = [
  {
    section: "Message Nodes",
    color: "border-emerald-300 bg-emerald-50 text-emerald-700",
    items: [
      { type: "text", label: "Text Message", icon: MessageCircle, defaults: { body: "Welcome to our service 👋", typing: true } },
      { type: "media", label: "Media Message", icon: Image, defaults: { mediaType: "image", mediaUrl: "", caption: "" } },
      { type: "template", label: "Template Message", icon: FileText, defaults: { templateName: "", languageCode: "en", parameters: [] } },
    ],
  },
  {
    section: "User Interaction",
    color: "border-sky-300 bg-sky-50 text-sky-700",
    items: [
      { type: "ask_question", label: "Ask Question", icon: MessageCircle, defaults: { question: "How can I help you?" } },
      { type: "buttons", label: "Quick Reply Buttons", icon: CheckCircle2, defaults: { body: "Please choose", buttons: ["Yes", "No"] } },
      { type: "list", label: "List Message", icon: FileText, defaults: { headerText: "Select an option", sections: [{ name: "Plans", items: ["Basic", "Premium", "Enterprise"] }] } },
      { type: "capture_input", label: "Capture Input", icon: MessageCircle, defaults: { variable: "message" } },
    ],
  },
  {
    section: "Logic Nodes",
    color: "border-orange-300 bg-orange-50 text-orange-700",
    items: [
      { type: "condition", label: "Condition", icon: GitBranch, defaults: { field: "message", operator: "contains", value: "support" } },
      { type: "delay", label: "Delay", icon: Clock3, defaults: { seconds: 2 } },
      { type: "jump", label: "Jump", icon: GitBranch, defaults: {} },
    ],
  },
  {
    section: "System Nodes",
    color: "border-violet-300 bg-violet-50 text-violet-700",
    items: [
      { type: "handoff", label: "Assign to Agent", icon: UserRound, defaults: { queue: "support" } },
      { type: "tag_user", label: "Tag User", icon: Languages, defaults: { tag: "vip" } },
      { type: "webhook", label: "Webhook/API Call", icon: Webhook, defaults: { url: "", method: "POST" } },
      { type: "end", label: "End Flow", icon: XCircle, defaults: {} },
    ],
  },
];

function uid(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function flattenLibrary() {
  return NODE_LIBRARY.flatMap((s) => s.items);
}

function createNode(type) {
  const lib = flattenLibrary().find((x) => x.type === type);
  return {
    id: uid(type),
    type,
    name: lib?.label || type,
    next: "",
    onTrue: "",
    onFalse: "",
    config: lib?.defaults || {},
  };
}

function buildSupportBotDefinition(companyName = "your company") {
  return {
    trigger: { type: "keyword", keywords: ["hi", "hello", "HI", "Hello"] },
    startNodeId: "start_1",
    nodes: [
      { id: "start_1", type: "start", name: "Start", next: "welcome_1", config: {} },
      {
        id: "welcome_1",
        type: "text",
        name: "Welcome",
        next: "menu_1",
        config: {
          body: `Welcome {{name}} to ${companyName}. How can I help you today? Please select Support, Sales or Accounts.`,
          typing: true,
          recipient: "{{recipient}}",
        },
      },
      {
        id: "menu_1",
        type: "buttons",
        name: "Main Menu",
        next: "route_1",
        config: { body: "Please choose one option", buttons: ["Support", "Sales", "Accounts"] },
      },
      {
        id: "route_1",
        type: "condition",
        name: "Support selected?",
        config: { field: "message", operator: "contains", value: "support" },
        onTrue: "support_reply",
        onFalse: "route_2",
      },
      {
        id: "route_2",
        type: "condition",
        name: "Sales selected?",
        config: { field: "message", operator: "contains", value: "sales" },
        onTrue: "sales_reply",
        onFalse: "route_3",
      },
      {
        id: "route_3",
        type: "condition",
        name: "Accounts selected?",
        config: { field: "message", operator: "contains", value: "accounts" },
        onTrue: "accounts_reply",
        onFalse: "faq_match",
      },
      { id: "support_reply", type: "text", name: "Support Intro", next: "handoff_support", config: { body: "Transferring to Support Agent. Please tell me your query." } },
      { id: "sales_reply", type: "text", name: "Sales Intro", next: "handoff_sales", config: { body: "Transferring to Sales Agent. Please share your requirement." } },
      { id: "accounts_reply", type: "text", name: "Accounts Intro", next: "handoff_accounts", config: { body: "Transferring to Accounts Agent. Please share your query." } },
      { id: "faq_match", type: "condition", name: "FAQ Found?", config: { field: "faq_answer", operator: "not_equals", value: "" }, onTrue: "faq_answer", onFalse: "fallback" },
      { id: "faq_answer", type: "text", name: "FAQ Answer", next: "end_1", config: { body: "{{faq_answer}}" } },
      { id: "fallback", type: "text", name: "Human Fallback", next: "handoff_support", config: { body: "Ohh, I am not able to solve this. Transferring to a real human agent." } },
      { id: "handoff_support", type: "handoff", name: "Assign Support", next: "end_1", config: { queue: "support" } },
      { id: "handoff_sales", type: "handoff", name: "Assign Sales", next: "end_1", config: { queue: "sales" } },
      { id: "handoff_accounts", type: "handoff", name: "Assign Accounts", next: "end_1", config: { queue: "accounts" } },
      { id: "end_1", type: "end", name: "End", next: "", config: {} },
    ],
    edges: [],
  };
}

function getNodeColor(type) {
  if (["text", "media", "template"].includes(type)) return "border-emerald-300 bg-emerald-50";
  if (["ask_question", "buttons", "list", "capture_input"].includes(type)) return "border-sky-300 bg-sky-50";
  if (["condition", "delay", "jump"].includes(type)) return "border-orange-300 bg-orange-50";
  if (["webhook", "handoff", "tag_user"].includes(type)) return "border-violet-300 bg-violet-50";
  if (type === "end") return "border-red-300 bg-red-50";
  return "border-slate-300 bg-slate-50";
}

function normalizeButtons(config) {
  const arr = Array.isArray(config.buttons) ? config.buttons : [];
  return arr.slice(0, 3);
}

function buildEdges(nodes) {
  const edges = [];
  nodes.forEach((n) => {
    if (n.next) edges.push({ from: n.id, to: n.next, label: "next" });
    if (n.onTrue) edges.push({ from: n.id, to: n.onTrue, label: "true" });
    if (n.onFalse) edges.push({ from: n.id, to: n.onFalse, label: "false" });
  });
  return edges;
}

function validateFlow(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const warnings = [];
  if (!nodes.length) warnings.push("Flow has no nodes.");

  const incoming = new Map();
  nodes.forEach((n) => incoming.set(n.id, 0));

  nodes.forEach((n) => {
    [n.next, n.onTrue, n.onFalse].forEach((t) => {
      if (!t) return;
      if (!ids.has(t)) warnings.push(`Node ${n.name}: target '${t}' does not exist.`);
      else incoming.set(t, (incoming.get(t) || 0) + 1);
    });

    if (n.type === "buttons") {
      const count = normalizeButtons(n.config).length;
      if (count > 3) warnings.push(`Node ${n.name}: WhatsApp quick replies max 3.`);
    }

    if (n.type === "template") {
      const vars = Array.isArray(n.config.parameters) ? n.config.parameters : [];
      if (!n.config.templateName) warnings.push(`Node ${n.name}: template name is required.`);
      if (vars.some((v) => !String(v).trim())) warnings.push(`Node ${n.name}: all template variables must be filled.`);
    }
  });

  const starts = nodes.filter((n) => n.type === "start");
  if (!starts.length) warnings.push("Flow should have a start node.");

  nodes.forEach((n) => {
    if (n.type !== "start" && (incoming.get(n.id) || 0) === 0) warnings.push(`Orphan node: ${n.name}`);
  });

  return warnings;
}

export default function AutomationsPage() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [versions, setVersions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [limits, setLimits] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", channel: "waba", triggerType: "keyword", companyName: "" });
  const [builderNodes, setBuilderNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [outside24h, setOutside24h] = useState(false);
  const [faqItems, setFaqItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", isActive: true });

  const selectedFlow = useMemo(() => flows.find((x) => String(x.id) === String(selectedFlowId)) || null, [flows, selectedFlowId]);
  const selectedNode = useMemo(() => builderNodes.find((n) => n.id === selectedNodeId) || null, [builderNodes, selectedNodeId]);
  const warnings = useMemo(() => validateFlow(builderNodes), [builderNodes]);

  const loadAll = async () => {
    try {
      const [flowsRes, limitsRes, faqRes] = await Promise.all([
        apiGet("/api/automation/flows"),
        apiGet("/api/automation/limits"),
        apiGet("/api/automation/faq"),
      ]);
      setFlows(flowsRes || []);
      setLimits(limitsRes || null);
      setFaqItems(faqRes || []);
      if (!selectedFlowId && flowsRes?.length) setSelectedFlowId(String(flowsRes[0].id));
    } catch {
      toast.error("Failed to load automation module");
    }
  };

  const loadFlowDetails = async (flowId) => {
    if (!flowId) return;
    try {
      const [vers, runRows] = await Promise.all([
        apiGet(`/api/automation/flows/${flowId}/versions`),
        apiGet(`/api/automation/runs?flowId=${flowId}&limit=30`),
      ]);
      setVersions(vers || []);
      setRuns(runRows || []);
      if (vers?.[0]?.definitionJson) {
        const def = JSON.parse(vers[0].definitionJson);
        const nodes = Array.isArray(def.nodes) ? def.nodes : [];
        setBuilderNodes(nodes);
        setSelectedNodeId(nodes[0]?.id || "");
      } else {
        setBuilderNodes([]);
        setSelectedNodeId("");
      }
    } catch {
      toast.error("Failed to load flow details");
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
      const def = buildSupportBotDefinition(createForm.companyName || "your company");
      const payload = {
        name: createForm.name,
        description: createForm.description,
        channel: createForm.channel,
        triggerType: createForm.triggerType,
        triggerConfigJson: JSON.stringify({ keywords: ["hi", "hello", "HI", "Hello"] }),
        definitionJson: JSON.stringify(def),
      };
      const res = await apiPost("/api/automation/flows", payload);
      toast.success("Workflow created");
      setShowCreate(false);
      setCreateForm({ name: "", description: "", channel: "waba", triggerType: "keyword", companyName: "" });
      await loadAll();
      if (res?.flow?.id) setSelectedFlowId(String(res.flow.id));
    } catch (e) {
      toast.error(e?.message || "Create flow failed");
    }
  };

  const updateFlowNode = (id, patch) => {
    setBuilderNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const addNode = (type) => {
    const node = createNode(type);
    setBuilderNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const deleteNode = (id) => {
    setBuilderNodes((prev) => prev.filter((n) => n.id !== id).map((n) => ({
      ...n,
      next: n.next === id ? "" : n.next,
      onTrue: n.onTrue === id ? "" : n.onTrue,
      onFalse: n.onFalse === id ? "" : n.onFalse,
    })));
    if (selectedNodeId === id) setSelectedNodeId("");
  };

  const saveDraftVersion = async () => {
    if (!selectedFlowId) return;
    try {
      const edges = buildEdges(builderNodes);
      const body = {
        changeNote: "Updated in visual flow builder",
        definitionJson: JSON.stringify({
          trigger: { type: selectedFlow?.triggerType || "keyword" },
          startNodeId: builderNodes.find((n) => n.type === "start")?.id || builderNodes[0]?.id || "",
          nodes: builderNodes,
          edges,
        }),
      };
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions`, body);
      toast.success("Draft saved");
      await loadFlowDetails(selectedFlowId);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Save failed");
    }
  };

  const publishLatest = async () => {
    if (!selectedFlowId || !versions.length) return;
    try {
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions/${versions[0].id}/publish`, { requireApproval: false });
      toast.success("Flow published");
      await loadAll();
      await loadFlowDetails(selectedFlowId);
    } catch (e) {
      toast.error(e?.message || "Publish failed");
    }
  };

  const unpublishFlow = async () => {
    if (!selectedFlowId) return;
    try {
      await apiPost(`/api/automation/flows/${selectedFlowId}/unpublish`, {});
      toast.success("Flow unpublished");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Unpublish failed");
    }
  };

  const deleteFlow = async () => {
    if (!selectedFlowId) return;
    if (!window.confirm("Delete selected flow?")) return;
    try {
      await apiDelete(`/api/automation/flows/${selectedFlowId}`);
      toast.success("Flow deleted");
      setSelectedFlowId("");
      setBuilderNodes([]);
      setVersions([]);
      setRuns([]);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    }
  };

  const simulateFlow = async () => {
    if (!selectedFlowId) return;
    try {
      await apiPost(`/api/automation/flows/${selectedFlowId}/simulate`, {
        triggerType: selectedFlow?.triggerType || "keyword",
        triggerPayloadJson: JSON.stringify({
          recipient: "+919999999999",
          name: "Rakesh",
          message: "support",
        }),
      });
      toast.success("Test run completed");
      await loadFlowDetails(selectedFlowId);
    } catch (e) {
      toast.error(e?.message || "Simulation failed");
    }
  };

  const saveFaq = async () => {
    try {
      if (!faqForm.question.trim() || !faqForm.answer.trim()) {
        toast.error("Question and answer are required");
        return;
      }
      await apiPost("/api/automation/faq", faqForm);
      toast.success("FAQ added");
      setFaqForm({ question: "", answer: "", category: "", isActive: true });
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to save FAQ");
    }
  };

  const removeFaq = async (id) => {
    try {
      await apiDelete(`/api/automation/faq/${id}`);
      toast.success("FAQ removed");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Delete FAQ failed");
    }
  };

  const allNodeIds = builderNodes.map((n) => n.id);

  return (
    <div className="space-y-6" data-testid="automations-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">WhatsApp Flow Builder</h1>
          <p className="text-slate-600">Create, edit, publish, unpublish and test chatbot workflows with WhatsApp-safe node validation.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white"><Plus className="w-4 h-4 mr-2" />Create Workflow</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>Creates a professional support bot starter flow (Hi/Hello -> menu -> team handoff).</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder="Support Bot" /></div>
                <div><Label>Company Name</Label><Input value={createForm.companyName} onChange={(e) => setCreateForm((p) => ({ ...p, companyName: e.target.value }))} placeholder="Moneyart" /></div>
                <div><Label>Description</Label><Textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel</Label>
                    <Select value={createForm.channel} onValueChange={(v) => setCreateForm((p) => ({ ...p, channel: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="waba">WABA</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Trigger</Label>
                    <Select value={createForm.triggerType} onValueChange={(v) => setCreateForm((p) => ({ ...p, triggerType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={createFlow}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Total Workflows</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{flows.length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Runs Today</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{limits?.usage?.runsToday ?? 0} / {limits?.limits?.runsPerDay ?? "-"}</CardContent></Card>
        <Card><CardHeader><CardTitle>API Calls Today</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{limits?.usage?.apiCallsToday ?? 0} / {limits?.limits?.apiCallsPerDay ?? "-"}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow List</CardTitle>
          <CardDescription>Select one workflow to open in builder.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-slate-600"><th className="text-left py-2">Name</th><th className="text-left py-2">Status</th><th className="text-left py-2">Trigger</th><th className="text-left py-2">Updated</th></tr></thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.id} className={`border-b cursor-pointer ${String(flow.id) === String(selectedFlowId) ? "bg-orange-50/70" : ""}`} onClick={() => setSelectedFlowId(String(flow.id))}>
                  <td className="py-3 font-semibold">{flow.name}</td>
                  <td className="py-3"><Badge className={FLOW_COLORS[flow.lifecycleStatus] || "bg-slate-100 text-slate-700"}>{flow.lifecycleStatus}</Badge></td>
                  <td className="py-3">{flow.channel?.toUpperCase()} / {flow.triggerType}</td>
                  <td className="py-3">{flow.updatedAtUtc ? new Date(flow.updatedAtUtc).toLocaleString() : "-"}</td>
                </tr>
              ))}
              {!flows.length && <tr><td className="py-5 text-slate-500" colSpan={4}>No workflows found.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={simulateFlow}>Test Flow</Button>
        <Button variant="outline" onClick={saveDraftVersion}><Save className="w-4 h-4 mr-2" />Save Draft</Button>
        <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={publishLatest}><UploadCloud className="w-4 h-4 mr-2" />Publish</Button>
        <Button variant="outline" onClick={unpublishFlow}>Unpublish</Button>
        <Button variant="destructive" onClick={deleteFlow}><Trash2 className="w-4 h-4 mr-2" />Delete</Button>
        <label className="ml-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={outside24h} onChange={(e) => setOutside24h(e.target.checked)} />
          Outside 24h session (WhatsApp)
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Node Palette</CardTitle>
            <CardDescription>WhatsApp-valid nodes only.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[640px] pr-2">
              {NODE_LIBRARY.map((group) => (
                <div key={group.section} className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">{group.section}</h4>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.type} className={`w-full rounded-lg border px-3 py-2 text-left ${group.color}`} onClick={() => addNode(item.type)}>
                          <div className="flex items-center gap-2 text-sm font-medium"><Icon className="w-4 h-4" />{item.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle>Canvas Area</CardTitle>
            <CardDescription>Start → welcome → question → condition → response branches.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[640px] pr-2">
              <div className="grid md:grid-cols-2 gap-3">
                {builderNodes.map((node) => (
                  <div key={node.id} className={`rounded-xl border p-3 cursor-pointer ${getNodeColor(node.type)} ${selectedNodeId === node.id ? "ring-2 ring-orange-400" : ""}`} onClick={() => setSelectedNodeId(node.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500">{node.type}</div>
                        <div className="font-semibold text-slate-900">{node.name || node.id}</div>
                        <div className="text-xs text-slate-500">ID: {node.id}</div>
                      </div>
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-300" title="input" />
                        <span className="w-2 h-2 rounded-full bg-orange-400" title="output" />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-600 space-y-1">
                      {node.next && <div>Next: <span className="font-medium">{node.next}</span></div>}
                      {node.onTrue && <div>True: <span className="font-medium">{node.onTrue}</span></div>}
                      {node.onFalse && <div>False: <span className="font-medium">{node.onFalse}</span></div>}
                    </div>
                  </div>
                ))}
                {!builderNodes.length && <p className="text-sm text-slate-500">Select workflow and add nodes from palette.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Properties + Preview</CardTitle>
            <CardDescription>Dynamic node configuration and WhatsApp checks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[640px] pr-2">
              {!selectedNode && <p className="text-sm text-slate-500">Select any node in canvas.</p>}
              {selectedNode && (
                <div className="space-y-3">
                  <div>
                    <Label>Node Name</Label>
                    <Input value={selectedNode.name || ""} onChange={(e) => updateFlowNode(selectedNode.id, { name: e.target.value })} />
                  </div>

                  <div>
                    <Label>Next Node</Label>
                    <Select value={selectedNode.next || ""} onValueChange={(v) => updateFlowNode(selectedNode.id, { next: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select next" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {allNodeIds.filter((id) => id !== selectedNode.id).map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedNode.type === "condition" && (
                    <>
                      <div><Label>Variable</Label><Input value={selectedNode.config?.field || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, field: e.target.value } })} placeholder="message / plan / language" /></div>
                      <div><Label>Operator</Label><Select value={selectedNode.config?.operator || "equals"} onValueChange={(v) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, operator: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="equals">equals</SelectItem><SelectItem value="contains">contains</SelectItem><SelectItem value="not_equals">not equals</SelectItem><SelectItem value="regex">regex</SelectItem></SelectContent></Select></div>
                      <div><Label>Value</Label><Input value={selectedNode.config?.value || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, value: e.target.value } })} /></div>
                      <div>
                        <Label>TRUE Branch</Label>
                        <Select value={selectedNode.onTrue || ""} onValueChange={(v) => updateFlowNode(selectedNode.id, { onTrue: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="Select node" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">None</SelectItem>{allNodeIds.filter((id) => id !== selectedNode.id).map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>FALSE Branch</Label>
                        <Select value={selectedNode.onFalse || ""} onValueChange={(v) => updateFlowNode(selectedNode.id, { onFalse: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="Select node" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">None</SelectItem>{allNodeIds.filter((id) => id !== selectedNode.id).map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {selectedNode.type === "text" && (
                    <>
                      <div><Label>Message Text</Label><Textarea rows={4} value={selectedNode.config?.body || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!selectedNode.config?.typing} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, typing: e.target.checked } })} />Show typing indicator</label>
                    </>
                  )}

                  {selectedNode.type === "buttons" && (
                    <>
                      <div><Label>Body</Label><Textarea rows={3} value={selectedNode.config?.body || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, body: e.target.value } })} /></div>
                      <div className="space-y-2">
                        <Label>Quick Reply Buttons (Max 3)</Label>
                        {normalizeButtons(selectedNode.config || {}).map((btn, idx) => (
                          <Input key={idx} value={btn} onChange={(e) => {
                            const arr = normalizeButtons(selectedNode.config || {});
                            arr[idx] = e.target.value;
                            updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, buttons: arr.slice(0, 3) } });
                          }} />
                        ))}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled={normalizeButtons(selectedNode.config || {}).length >= 3} onClick={() => {
                            const arr = normalizeButtons(selectedNode.config || {});
                            updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, buttons: [...arr, ""] } });
                          }}>+ Add Button</Button>
                          {normalizeButtons(selectedNode.config || {}).length >= 3 && <span className="text-xs text-red-600">WhatsApp allows max 3 quick replies.</span>}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedNode.type === "list" && (
                    <>
                      <div><Label>Header Text</Label><Input value={selectedNode.config?.headerText || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, headerText: e.target.value } })} /></div>
                      <div><Label>Sections JSON</Label><Textarea rows={5} value={JSON.stringify(selectedNode.config?.sections || [], null, 2)} onChange={(e) => {
                        try {
                          updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, sections: JSON.parse(e.target.value || "[]") } });
                        } catch {}
                      }} /></div>
                    </>
                  )}

                  {selectedNode.type === "template" && (
                    <>
                      <div><Label>Template Name</Label><Input value={selectedNode.config?.templateName || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, templateName: e.target.value } })} /></div>
                      <div><Label>Language</Label><Input value={selectedNode.config?.languageCode || "en"} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, languageCode: e.target.value } })} /></div>
                      <div><Label>Variables (JSON array)</Label><Textarea rows={3} value={JSON.stringify(selectedNode.config?.parameters || [], null, 2)} onChange={(e) => { try { updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, parameters: JSON.parse(e.target.value || "[]") } }); } catch {} }} /></div>
                    </>
                  )}

                  {selectedNode.type === "delay" && (
                    <div><Label>Delay Seconds</Label><Input type="number" value={selectedNode.config?.seconds ?? 1} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, seconds: Number(e.target.value || 1) } })} /></div>
                  )}

                  {selectedNode.type === "handoff" && (
                    <div><Label>Assign Queue</Label><Input value={selectedNode.config?.queue || "support"} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, queue: e.target.value } })} /></div>
                  )}

                  {selectedNode.type === "webhook" && (
                    <>
                      <div><Label>Webhook URL</Label><Input value={selectedNode.config?.url || ""} onChange={(e) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, url: e.target.value } })} /></div>
                      <div><Label>Method</Label><Select value={selectedNode.config?.method || "POST"} onValueChange={(v) => updateFlowNode(selectedNode.id, { config: { ...selectedNode.config, method: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="POST">POST</SelectItem><SelectItem value="GET">GET</SelectItem><SelectItem value="PUT">PUT</SelectItem></SelectContent></Select></div>
                    </>
                  )}

                  {outside24h && selectedNode.type === "text" && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">⚠ WhatsApp requires template messages outside 24-hour session window.</div>
                  )}

                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 mb-2">WhatsApp Preview</div>
                    <div className="rounded-xl bg-white border p-3 text-sm">
                      <div className="font-semibold text-slate-900 mb-1">Bot</div>
                      {selectedNode.type === "buttons" ? (
                        <div className="space-y-1">
                          <div>{selectedNode.config?.body || "Please choose"}</div>
                          {normalizeButtons(selectedNode.config || {}).map((btn, i) => (
                            <button key={i} className="block w-full rounded border px-2 py-1 text-left text-xs">{btn || `Button ${i + 1}`}</button>
                          ))}
                        </div>
                      ) : (
                        <div>{selectedNode.config?.body || selectedNode.config?.question || "Preview"}</div>
                      )}
                    </div>
                  </div>

                  <Button variant="destructive" className="w-full" onClick={() => deleteNode(selectedNode.id)}>Delete Node</Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Builder Safeguards</CardTitle>
          <CardDescription>No orphan nodes, missing targets, button/template checks.</CardDescription>
        </CardHeader>
        <CardContent>
          {warnings.length === 0 ? <div className="text-sm text-green-700">All checks passed.</div> : (
            <ul className="space-y-1 text-sm text-amber-700">
              {warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAQ Knowledge Base</CardTitle>
          <CardDescription>Bot uses this Q&A before human transfer.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div><Label>Question</Label><Input value={faqForm.question} onChange={(e) => setFaqForm((p) => ({ ...p, question: e.target.value }))} /></div>
            <div><Label>Answer</Label><Textarea rows={3} value={faqForm.answer} onChange={(e) => setFaqForm((p) => ({ ...p, answer: e.target.value }))} /></div>
            <div><Label>Category</Label><Input value={faqForm.category} onChange={(e) => setFaqForm((p) => ({ ...p, category: e.target.value }))} placeholder="support/sales/accounts" /></div>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveFaq}>Add Q&A</Button>
          </div>
          <ScrollArea className="h-[220px] pr-2">
            {faqItems.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 mb-2">
                <div className="font-medium">{item.question}</div>
                <div className="text-sm text-slate-600 mt-1">{item.answer}</div>
                <div className="text-xs text-slate-500 mt-1">{item.category || "-"}</div>
                <Button variant="destructive" size="sm" className="mt-2" onClick={() => removeFaq(item.id)}>Delete</Button>
              </div>
            ))}
            {!faqItems.length && <div className="text-sm text-slate-500">No Q&A added.</div>}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="rounded border p-2 text-xs">
                <div className="font-semibold">v{v.versionNumber}</div>
                <div>{v.status}</div>
                <div className="text-slate-500">{v.changeNote || "-"}</div>
              </div>
            ))}
            {!versions.length && <div className="text-sm text-slate-500">No versions.</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between"><span>{r.mode}</span><Badge className={r.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{r.status}</Badge></div>
                <div className="text-slate-500">{r.failureReason || r.triggerType || "-"}</div>
              </div>
            ))}
            {!runs.length && <div className="text-sm text-slate-500">No runs yet.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
