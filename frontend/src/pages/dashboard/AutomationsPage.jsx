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
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "sonner";
import { Play, Plus, Rocket, Save, UploadCloud } from "lucide-react";

const TRIGGERS = [
  "keyword",
  "intent",
  "webhook",
  "schedule",
  "tag",
  "user_event",
];

const FLOW_COLORS = {
  published: "bg-green-100 text-green-700",
  draft: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

function uid(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function AutomationsPage() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [versions, setVersions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [limits, setLimits] = useState(null);
  const [nodeTypes, setNodeTypes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    channel: "waba",
    triggerType: "keyword",
  });
  const [builderNodes, setBuilderNodes] = useState([]);
  const [dragType, setDragType] = useState("");

  const selectedFlow = useMemo(
    () => flows.find((x) => String(x.id) === String(selectedFlowId)) || null,
    [flows, selectedFlowId]
  );

  const loadAll = async () => {
    try {
      const [flowsRes, limitsRes, typesRes] = await Promise.all([
        apiGet("/api/automation/flows"),
        apiGet("/api/automation/limits"),
        apiGet("/api/automation/catalogs/node-types"),
      ]);
      setFlows(flowsRes || []);
      setLimits(limitsRes || null);
      setNodeTypes(typesRes || []);
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
      const payload = {
        ...createForm,
        triggerConfigJson: JSON.stringify({}),
        definitionJson: JSON.stringify({
          trigger: { type: createForm.triggerType },
          startNodeId: "start_1",
          nodes: [
            { id: "start_1", type: "start", name: "Start", next: "text_1", config: {} },
            { id: "text_1", type: "text", name: "Welcome", next: "end_1", config: { body: "Hi {{name}}", recipient: "{{recipient}}" } },
            { id: "end_1", type: "end", name: "End", next: "", config: {} },
          ],
          edges: [],
        }),
      };
      const res = await apiPost("/api/automation/flows", payload);
      toast.success("Flow created");
      setShowCreate(false);
      setCreateForm({ name: "", description: "", channel: "waba", triggerType: "keyword" });
      await loadAll();
      const flowId = res?.flow?.id;
      if (flowId) setSelectedFlowId(String(flowId));
    } catch (e) {
      toast.error(e?.message || "Create flow failed");
    }
  };

  const saveDraftVersion = async () => {
    if (!selectedFlowId) return;
    try {
      const body = {
        changeNote: "Updated from visual builder",
        definitionJson: JSON.stringify({
          trigger: { type: selectedFlow?.triggerType || "keyword" },
          startNodeId: builderNodes[0]?.id || "",
          nodes: builderNodes,
          edges: [],
        }),
      };
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions`, body);
      toast.success("Draft version saved");
      await loadFlowDetails(selectedFlowId);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Save draft failed");
    }
  };

  const publishLatest = async () => {
    if (!selectedFlowId || !versions.length) return;
    try {
      await apiPost(`/api/automation/flows/${selectedFlowId}/versions/${versions[0].id}/publish`, { requireApproval: false });
      toast.success("Flow published");
      await loadFlowDetails(selectedFlowId);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Publish failed");
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
          language: "en",
          source: "simulator",
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
    const newNode = {
      id: uid(rawType),
      type: rawType,
      name: rawType.replaceAll("_", " "),
      next: "",
      config: {},
    };
    setBuilderNodes((prev) => [...prev, newNode]);
  };

  const updateNode = (id, patch) => {
    setBuilderNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  return (
    <div className="space-y-6" data-testid="automations-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Advanced Chatbot + Flow Builder</h1>
          <p className="text-slate-600">Versioned automations with simulation, publish control and runtime debugger.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <Plus className="w-4 h-4" /> New Flow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Flow</DialogTitle>
              <DialogDescription>Set trigger and channel. You can build nodes after creation.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Flow Name</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
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
              <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={createFlow}>Create Flow</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Flows</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{flows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Runs Today</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{limits?.usage?.runsToday ?? 0} / {limits?.limits?.runsPerDay ?? "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>API Calls Today</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{limits?.usage?.apiCallsToday ?? 0} / {limits?.limits?.apiCallsPerDay ?? "-"}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Flows</CardTitle>
            <CardDescription>Select a flow to edit and publish.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ScrollArea className="h-[440px] pr-3">
              {flows.map((flow) => (
                <button
                  key={flow.id}
                  className={`w-full text-left border rounded-lg p-3 mb-2 ${String(flow.id) === String(selectedFlowId) ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}
                  onClick={() => setSelectedFlowId(String(flow.id))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">{flow.name}</div>
                    <Badge className={FLOW_COLORS[flow.lifecycleStatus] || "bg-slate-100 text-slate-700"}>{flow.lifecycleStatus}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{flow.channel?.toUpperCase()} • {flow.triggerType}</div>
                  <div className="text-xs text-slate-500 mt-1">v{flow.latestVersion || 0} • {flow.runs || 0} runs</div>
                </button>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="xl:col-span-6">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Visual Builder</CardTitle>
                <CardDescription>Drag node type to canvas. Save as draft version before publish.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={simulateFlow}><Play className="w-4 h-4 mr-2" />Simulate</Button>
                <Button variant="outline" onClick={saveDraftVersion}><Save className="w-4 h-4 mr-2" />Save Draft</Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={publishLatest}><UploadCloud className="w-4 h-4 mr-2" />Publish</Button>
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
            <div
              className="border border-dashed border-slate-300 rounded-xl p-3 min-h-[320px] bg-slate-50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropNode}
            >
              {builderNodes.length === 0 ? (
                <div className="text-sm text-slate-500">Drop nodes here to build the flow graph.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {builderNodes.map((node, idx) => (
                    <div key={node.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs text-slate-500 mb-1">#{idx + 1} • {node.type}</div>
                      <Input
                        value={node.name || ""}
                        onChange={(e) => updateNode(node.id, { name: e.target.value })}
                        placeholder="Node name"
                        className="mb-2"
                      />
                      <Input
                        value={node.next || ""}
                        onChange={(e) => updateNode(node.id, { next: e.target.value })}
                        placeholder="Next node id (optional)"
                        className="mb-2"
                      />
                      <Textarea
                        rows={3}
                        value={JSON.stringify(node.config || {}, null, 2)}
                        onChange={(e) => {
                          try {
                            updateNode(node.id, { config: JSON.parse(e.target.value || "{}") });
                          } catch {
                            // keep editing until valid JSON
                          }
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

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Versions & Debugger</CardTitle>
            <CardDescription>Draft/test/published history with latest runs.</CardDescription>
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
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={simulateFlow}>
              <Rocket className="w-4 h-4 mr-2" /> Run Simulator
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
