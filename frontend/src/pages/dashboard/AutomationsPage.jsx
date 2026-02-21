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
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { toast } from "sonner";
import { Pencil, Play, Plus, Save, Trash2, UploadCloud } from "lucide-react";

const TRIGGERS = ["keyword", "intent", "webhook", "schedule", "tag", "user_event"];

const FLOW_COLORS = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-700",
};

function uid(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
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
        next: "route_support",
        config: {
          body: `Welcome {{name}} to ${companyName}. How can I help you today? Please select: Support, Sales, Accounts`,
          recipient: "{{recipient}}",
        },
      },
      {
        id: "route_support",
        type: "condition",
        name: "Support selected?",
        onTrue: "support_reply",
        onFalse: "route_sales",
        config: { field: "message", operator: "contains", value: "support" },
      },
      {
        id: "route_sales",
        type: "condition",
        name: "Sales selected?",
        onTrue: "sales_reply",
        onFalse: "route_accounts",
        config: { field: "message", operator: "contains", value: "sales" },
      },
      {
        id: "route_accounts",
        type: "condition",
        name: "Accounts selected?",
        onTrue: "accounts_reply",
        onFalse: "faq_match",
        config: { field: "message", operator: "contains", value: "accounts" },
      },
      {
        id: "support_reply",
        type: "text",
        name: "Support handoff message",
        next: "handoff_support",
        config: {
          body: "Transferring to Support Agent. Please tell me your query.",
          recipient: "{{recipient}}",
        },
      },
      {
        id: "sales_reply",
        type: "text",
        name: "Sales handoff message",
        next: "handoff_sales",
        config: {
          body: "Transferring to Sales Agent. Please share your requirement.",
          recipient: "{{recipient}}",
        },
      },
      {
        id: "accounts_reply",
        type: "text",
        name: "Accounts handoff message",
        next: "handoff_accounts",
        config: {
          body: "Transferring to Accounts Agent. Please share your query.",
          recipient: "{{recipient}}",
        },
      },
      {
        id: "faq_match",
        type: "condition",
        name: "FAQ answer found?",
        onTrue: "faq_reply",
        onFalse: "fallback_human",
        config: { field: "faq_answer", operator: "not_equals", value: "" },
      },
      {
        id: "faq_reply",
        type: "text",
        name: "FAQ auto reply",
        next: "end_1",
        config: {
          body: "{{faq_answer}}",
          recipient: "{{recipient}}",
        },
      },
      {
        id: "fallback_human",
        type: "text",
        name: "Human fallback",
        next: "handoff_support",
        config: {
          body: "I am not able to solve this. Transferring to a real human agent now.",
          recipient: "{{recipient}}",
        },
      },
      { id: "handoff_support", type: "handoff", name: "Handoff support", next: "end_1", config: { queue: "support" } },
      { id: "handoff_sales", type: "handoff", name: "Handoff sales", next: "end_1", config: { queue: "sales" } },
      { id: "handoff_accounts", type: "handoff", name: "Handoff accounts", next: "end_1", config: { queue: "accounts" } },
      { id: "end_1", type: "end", name: "End", next: "", config: {} },
    ],
    edges: [],
  };
}

export default function AutomationsPage() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [versions, setVersions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [limits, setLimits] = useState(null);
  const [nodeTypes, setNodeTypes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    channel: "waba",
    triggerType: "keyword",
    companyName: "",
    useSupportTemplate: true,
  });
  const [editForm, setEditForm] = useState({ name: "", description: "", channel: "waba", triggerType: "keyword", isActive: true });
  const [builderNodes, setBuilderNodes] = useState([]);
  const [dragType, setDragType] = useState("");
  const [faqItems, setFaqItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", category: "", isActive: true });
  const [editingFaqId, setEditingFaqId] = useState("");

  const selectedFlow = useMemo(
    () => flows.find((x) => String(x.id) === String(selectedFlowId)) || null,
    [flows, selectedFlowId]
  );

  const loadAll = async () => {
    try {
      const [flowsRes, limitsRes, typesRes, faqRes] = await Promise.all([
        apiGet("/api/automation/flows"),
        apiGet("/api/automation/limits"),
        apiGet("/api/automation/catalogs/node-types"),
        apiGet("/api/automation/faq"),
      ]);
      setFlows(flowsRes || []);
      setLimits(limitsRes || null);
      setNodeTypes(typesRes || []);
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
        try {
          const def = JSON.parse(vers[0].definitionJson);
          setBuilderNodes(Array.isArray(def.nodes) ? def.nodes : []);
        } catch {
          setBuilderNodes([]);
        }
      } else {
        setBuilderNodes([]);
      }
    } catch {
      toast.error("Failed to load selected flow");
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
      const definition = createForm.useSupportTemplate
        ? buildSupportBotDefinition(createForm.companyName || "your company")
        : {
            trigger: { type: createForm.triggerType },
            startNodeId: "start_1",
            nodes: [
              { id: "start_1", type: "start", name: "Start", next: "text_1", config: {} },
              { id: "text_1", type: "text", name: "Welcome", next: "end_1", config: { body: "Hi {{name}}", recipient: "{{recipient}}" } },
              { id: "end_1", type: "end", name: "End", next: "", config: {} },
            ],
            edges: [],
          };

      const payload = {
        name: createForm.name,
        description: createForm.description,
        channel: createForm.channel,
        triggerType: createForm.triggerType,
        triggerConfigJson: JSON.stringify({ keywords: ["hi", "hello", "HI", "Hello"] }),
        definitionJson: JSON.stringify(definition),
      };

      const res = await apiPost("/api/automation/flows", payload);
      toast.success("Workflow created");
      setShowCreate(false);
      setCreateForm({ name: "", description: "", channel: "waba", triggerType: "keyword", companyName: "", useSupportTemplate: true });
      await loadAll();
      const flowId = res?.flow?.id;
      if (flowId) setSelectedFlowId(String(flowId));
    } catch (e) {
      toast.error(e?.message || "Create flow failed");
    }
  };

  const openEdit = (flow = selectedFlow) => {
    if (!flow) return;
    setEditForm({
      name: flow.name || "",
      description: flow.description || "",
      channel: flow.channel || "waba",
      triggerType: flow.triggerType || "keyword",
      isActive: !!flow.isActive,
    });
    setShowEdit(true);
  };

  const updateFlowMeta = async () => {
    if (!selectedFlowId) return;
    try {
      await apiPut(`/api/automation/flows/${selectedFlowId}`, {
        ...editForm,
        triggerConfigJson: JSON.stringify({ keywords: ["hi", "hello", "HI", "Hello"] }),
      });
      toast.success("Workflow updated");
      setShowEdit(false);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Update failed");
    }
  };

  const saveDraftVersion = async () => {
    if (!selectedFlowId) return;
    try {
      const body = {
        changeNote: "Updated from flow builder",
        definitionJson: JSON.stringify({
          trigger: { type: selectedFlow?.triggerType || "keyword" },
          startNodeId: builderNodes[0]?.id || "",
          nodes: builderNodes,
          edges: [],
        }),
      };
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions`, body);
      toast.success("Draft saved");
      await loadFlowDetails(selectedFlowId);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Save draft failed");
    }
  };

  const publishLatest = async (flowId = selectedFlowId) => {
    if (!flowId) return;
    try {
      const vers = String(flowId) === String(selectedFlowId) && versions.length
        ? versions
        : await apiGet(`/api/automation/flows/${flowId}/versions`);
      if (!vers?.length) {
        toast.error("No version found to publish");
        return;
      }
      await apiPost(`/api/automation/flows/${flowId}/versions/${vers[0].id}/publish`, { requireApproval: false });
      toast.success("Workflow published");
      await loadFlowDetails(flowId);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Publish failed");
    }
  };

  const unpublishFlow = async (flowId) => {
    try {
      await apiPost(`/api/automation/flows/${flowId}/unpublish`, {});
      toast.success("Workflow unpublished");
      await loadAll();
      if (String(selectedFlowId) === String(flowId)) await loadFlowDetails(flowId);
    } catch (e) {
      toast.error(e?.message || "Unpublish failed");
    }
  };

  const deleteFlow = async (flowId) => {
    if (!window.confirm("Delete this workflow permanently?")) return;
    try {
      await apiDelete(`/api/automation/flows/${flowId}`);
      toast.success("Workflow deleted");
      const next = flows.find((f) => String(f.id) !== String(flowId));
      setSelectedFlowId(next ? String(next.id) : "");
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
          name: "Test User",
          message: "support",
          faq_answer: "",
        }),
      });
      toast.success("Simulation completed");
      await loadFlowDetails(selectedFlowId);
    } catch (e) {
      toast.error(e?.message || "Simulation failed");
    }
  };

  const onDropNode = (e) => {
    e.preventDefault();
    const rawType = dragType || e.dataTransfer.getData("text/plain");
    if (!rawType) return;
    const newNode = { id: uid(rawType), type: rawType, name: rawType.replaceAll("_", " "), next: "", config: {} };
    setBuilderNodes((prev) => [...prev, newNode]);
  };

  const updateNode = (id, patch) => {
    setBuilderNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const startEditFaq = (item) => {
    setEditingFaqId(String(item.id));
    setFaqForm({
      question: item.question || "",
      answer: item.answer || "",
      category: item.category || "",
      isActive: !!item.isActive,
    });
  };

  const resetFaqForm = () => {
    setEditingFaqId("");
    setFaqForm({ question: "", answer: "", category: "", isActive: true });
  };

  const saveFaq = async () => {
    try {
      if (!faqForm.question.trim() || !faqForm.answer.trim()) {
        toast.error("Question and answer are required");
        return;
      }
      if (editingFaqId) {
        await apiPut(`/api/automation/faq/${editingFaqId}`, faqForm);
        toast.success("Q&A updated");
      } else {
        await apiPost("/api/automation/faq", faqForm);
        toast.success("Q&A added");
      }
      resetFaqForm();
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to save Q&A");
    }
  };

  const removeFaq = async (id) => {
    if (!window.confirm("Delete this Q&A item?")) return;
    try {
      await apiDelete(`/api/automation/faq/${id}`);
      toast.success("Q&A deleted");
      if (String(editingFaqId) === String(id)) resetFaqForm();
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Failed to delete Q&A");
    }
  };

  return (
    <div className="space-y-6" data-testid="automations-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Workflow Automation</h1>
          <p className="text-slate-600">Create chatbot workflow, publish/unpublish, edit, delete, and manage runtime from one screen.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2"><Plus className="w-4 h-4" /> Create Workflow</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Professional Chatbot Workflow</DialogTitle>
                <DialogDescription>Includes greeting, menu options (Support/Sales/Accounts), FAQ fallback and human handoff.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Workflow Name</Label>
                  <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder="Support Bot" />
                </div>
                <div>
                  <Label>Company Name</Label>
                  <Input value={createForm.companyName} onChange={(e) => setCreateForm((p) => ({ ...p, companyName: e.target.value }))} placeholder="Your company name in welcome message" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea rows={2} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel</Label>
                    <Select value={createForm.channel} onValueChange={(v) => setCreateForm((p) => ({ ...p, channel: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waba">WABA</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
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
                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={createFlow}>Create Workflow</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showEdit} onOpenChange={setShowEdit}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Workflow</DialogTitle>
                <DialogDescription>Update metadata and trigger settings.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
                <div><Label>Description</Label><Textarea rows={2} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel</Label>
                    <Select value={editForm.channel} onValueChange={(v) => setEditForm((p) => ({ ...p, channel: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="waba">WABA</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Trigger</Label>
                    <Select value={editForm.triggerType} onValueChange={(v) => setEditForm((p) => ({ ...p, triggerType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={updateFlowMeta}>Save Changes</Button>
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
          <CardDescription>Name, status, last update, and quick actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Trigger</th>
                  <th className="text-left py-2">Updated</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => (
                  <tr key={flow.id} className={`border-b ${String(flow.id) === String(selectedFlowId) ? "bg-orange-50/60" : ""}`}>
                    <td className="py-3">
                      <button className="font-semibold text-slate-900 hover:text-orange-600" onClick={() => setSelectedFlowId(String(flow.id))}>{flow.name}</button>
                      <div className="text-xs text-slate-500">v{flow.latestVersion || 0} • {flow.runs || 0} runs</div>
                    </td>
                    <td className="py-3"><Badge className={FLOW_COLORS[flow.lifecycleStatus] || "bg-slate-100 text-slate-700"}>{flow.lifecycleStatus}</Badge></td>
                    <td className="py-3">{flow.channel?.toUpperCase()} / {flow.triggerType}</td>
                    <td className="py-3">{flow.updatedAtUtc ? new Date(flow.updatedAtUtc).toLocaleString() : "-"}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedFlowId(String(flow.id)); openEdit(flow); }}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedFlowId(String(flow.id))}>Flow Builder</Button>
                        <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => { setSelectedFlowId(String(flow.id)); publishLatest(flow.id); }}><UploadCloud className="w-3 h-3 mr-1" />Publish</Button>
                        <Button size="sm" variant="outline" onClick={() => unpublishFlow(flow.id)}>Unpublish</Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteFlow(flow.id)}><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {flows.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">No workflow found. Create your first workflow.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-8">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Flow Builder</CardTitle>
                <CardDescription>Edit node logic for selected workflow.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={simulateFlow}><Play className="w-4 h-4 mr-2" />Test Run</Button>
                <Button variant="outline" onClick={saveDraftVersion}><Save className="w-4 h-4 mr-2" />Save Draft</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {nodeTypes.map((n) => (
                <Badge
                  key={n.type}
                  draggable
                  onDragStart={(e) => { setDragType(n.type); e.dataTransfer.setData("text/plain", n.type); }}
                  className="cursor-grab bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  {n.type}
                </Badge>
              ))}
            </div>
            <div className="border border-dashed border-slate-300 rounded-xl p-3 min-h-[320px] bg-slate-50" onDragOver={(e) => e.preventDefault()} onDrop={onDropNode}>
              {builderNodes.length === 0 ? (
                <div className="text-sm text-slate-500">Select a workflow and drop nodes here to build chatbot flow.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {builderNodes.map((node, idx) => (
                    <div key={node.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs text-slate-500 mb-1">#{idx + 1} • {node.type}</div>
                      <Input value={node.name || ""} onChange={(e) => updateNode(node.id, { name: e.target.value })} placeholder="Node name" className="mb-2" />
                      <Input value={node.next || ""} onChange={(e) => updateNode(node.id, { next: e.target.value })} placeholder="Next node id" className="mb-2" />
                      <Textarea
                        rows={3}
                        value={JSON.stringify(node.config || {}, null, 2)}
                        onChange={(e) => {
                          try { updateNode(node.id, { config: JSON.parse(e.target.value || "{}") }); } catch {}
                        }}
                        placeholder='{"body":"Hello {{name}}","recipient":"{{recipient}}"}'
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Versions & Runtime</CardTitle>
            <CardDescription>Publish history and recent run status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm mb-2">Versions</h4>
              <ScrollArea className="h-[170px] pr-2">
                {versions.map((v) => (
                  <div key={v.id} className="text-xs border rounded p-2 mb-2">
                    <div className="font-semibold">v{v.versionNumber}</div>
                    <div className="text-slate-500">{v.status}</div>
                    <div className="text-slate-500">{v.changeNote || "-"}</div>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">Recent Runs</h4>
              <ScrollArea className="h-[170px] pr-2">
                {runs.map((r) => (
                  <div key={r.id} className="text-xs border rounded p-2 mb-2">
                    <div className="flex items-center justify-between">
                      <span>{r.mode}</span>
                      <Badge className={r.status === "completed" ? "bg-green-100 text-green-700" : r.status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}>{r.status}</Badge>
                    </div>
                    <div className="text-slate-500 mt-1">{r.failureReason || r.triggerType || "-"}</div>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Q&A Knowledge Base</CardTitle>
          <CardDescription>Bot answers from this Q&A first, then handoff to human if no match.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <Label>Question</Label>
              <Input value={faqForm.question} onChange={(e) => setFaqForm((p) => ({ ...p, question: e.target.value }))} placeholder="e.g. What are your business hours?" />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea rows={4} value={faqForm.answer} onChange={(e) => setFaqForm((p) => ({ ...p, answer: e.target.value }))} placeholder="e.g. We are open Monday-Saturday, 9 AM to 8 PM." />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Input value={faqForm.category} onChange={(e) => setFaqForm((p) => ({ ...p, category: e.target.value }))} placeholder="support / sales / accounts" />
            </div>
            <div className="flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={saveFaq}>{editingFaqId ? "Update Q&A" : "Add Q&A"}</Button>
              {editingFaqId && <Button variant="outline" onClick={resetFaqForm}>Cancel Edit</Button>}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Saved Q&A</h4>
            <ScrollArea className="h-[320px] pr-2">
              {faqItems.map((item) => (
                <div key={item.id} className="border rounded-lg p-3 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{item.question}</p>
                    <Badge className={item.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}>{item.isActive ? "active" : "inactive"}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{item.answer}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.category || "-"}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => startEditFaq(item)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => removeFaq(item.id)}>Delete</Button>
                  </div>
                </div>
              ))}
              {faqItems.length === 0 && <p className="text-sm text-slate-500">No Q&A added yet.</p>}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
