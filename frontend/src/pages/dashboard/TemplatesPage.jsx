import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Filter, MoreVertical, FileText, CheckCircle, XCircle, Clock, AlertCircle, Trash2, MessageSquare, Send } from "lucide-react";
import { apiDelete, apiGet, apiPost, listSmsSenders } from "@/lib/api";
import { toast } from "sonner";

const initialDraft = {
  name: "",
  body: "",
  channel: "whatsapp",
  category: "MARKETING",
  language: "en",
  dltEntityId: "",
  dltTemplateId: "",
  smsSenderId: "",
  headerType: "none",
  headerText: "",
  footerText: "",
  buttonsJson: "",
};

const TemplatesPage = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "sms" ? "sms" : "whatsapp";
  const [templates, setTemplates] = useState([]);
  const [smsSenders, setSmsSenders] = useState([]);
  const [draft, setDraft] = useState(initialDraft);
  const isSms = draft.channel === "sms";
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setDraft((p) => ({ ...p, channel: tab }));
  }, [tab]);

  const loadAll = async () => {
    try {
      const [tpl, senders] = await Promise.all([
        apiGet("/api/templates"),
        listSmsSenders().catch(() => []),
      ]);
      setTemplates(tpl || []);
      setSmsSenders(senders || []);
    } catch {
      setTemplates([]);
      setSmsSenders([]);
    }
  };

  const stats = [
    { title: "Total Templates", value: String(templates.filter((t) => (tab === "sms" ? Number(t.channel) === 1 : Number(t.channel) === 2)).length), status: "all" },
    { title: "Approved", value: String(templates.filter((t) => (tab === "sms" ? Number(t.channel) === 1 : Number(t.channel) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "approved").length), status: "approved" },
    { title: "Pending", value: String(templates.filter((t) => (tab === "sms" ? Number(t.channel) === 1 : Number(t.channel) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "pending").length), status: "pending" },
    { title: "Rejected", value: String(templates.filter((t) => (tab === "sms" ? Number(t.channel) === 1 : Number(t.channel) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "rejected").length), status: "rejected" },
  ];

  const templateVars = useMemo(() => {
    const matches = [...(draft.body || "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const unique = Array.from(new Set(matches)).sort((a, b) => a - b);
    return unique;
  }, [draft.body]);

  const validateDraft = () => {
    if (!draft.name.trim()) return "Template name is required.";
    if (!draft.body.trim()) return "Message body is required.";
    if (draft.channel === "whatsapp") {
      if (draft.body.length > 1024) return "WhatsApp template body max length is 1024.";
      for (let i = 0; i < templateVars.length; i += 1) {
        if (templateVars[i] !== i + 1) return "Variables must be sequential: {{1}}, {{2}}, {{3}}...";
      }
    }
    if (isSms) {
      if (!draft.dltEntityId.trim()) return "DLT Entity ID is required for SMS.";
      if (!draft.dltTemplateId.trim()) return "DLT Template ID is required for SMS.";
      if (!draft.smsSenderId.trim()) return "SMS Sender ID is required.";
      if (draft.smsSenderId.trim().length < 3 || draft.smsSenderId.trim().length > 6) return "SMS Sender ID must be 3-6 characters.";
    }
    return "";
  };

  const createTemplate = async () => {
    const error = validateDraft();
    if (error) {
      toast.error(error);
      return;
    }
    try {
      await apiPost("/api/templates", {
        name: draft.name.trim(),
        body: draft.body,
        channel: draft.channel === "sms" ? 1 : 2,
        category: (draft.category || "UTILITY").toUpperCase(),
        language: draft.language,
        dltEntityId: draft.dltEntityId.trim(),
        dltTemplateId: draft.dltTemplateId.trim(),
        smsSenderId: draft.smsSenderId.trim().toUpperCase(),
        headerType: draft.headerType,
        headerText: draft.headerText,
        footerText: draft.footerText,
        buttonsJson: draft.buttonsJson,
      });
      toast.success("Template created.");
      setDraft(initialDraft);
      setShowCreateDialog(false);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Template create failed.");
    }
  };

  const uploadSmsTemplates = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("CSV must include header + at least one row.");
      const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
      const idx = {
        name: header.indexOf("name"),
        body: header.indexOf("body"),
        dltentityid: header.indexOf("dltentityid"),
        dlttemplateid: header.indexOf("dlttemplateid"),
        smssenderid: header.indexOf("smssenderid"),
      };
      if (Object.values(idx).some((v) => v < 0)) throw new Error("CSV headers required: name,body,dltEntityId,dltTemplateId,smsSenderId");
      let created = 0;
      for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(",").map((x) => x.trim());
        if (!cols[idx.name] || !cols[idx.body]) continue;
        await apiPost("/api/templates", {
          name: cols[idx.name],
          body: cols[idx.body],
          channel: 1,
          category: "UTILITY",
          language: "en",
          dltEntityId: cols[idx.dltentityid] || "",
          dltTemplateId: cols[idx.dlttemplateid] || "",
          smsSenderId: (cols[idx.smssenderid] || "").toUpperCase(),
          headerType: "none",
          headerText: "",
          footerText: "",
          buttonsJson: "",
        });
        created += 1;
      }
      toast.success(`Uploaded ${created} SMS templates.`);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "SMS template upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeTemplate = async (id) => {
    await apiDelete(`/api/templates/${id}`);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  };

  const getStatusBadge = (statusRaw) => {
    const status = String(statusRaw || "").toLowerCase();
    if (status === "approved") return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
    return null;
  };

  const getCategoryBadge = (categoryRaw) => {
    const category = String(categoryRaw || "").toLowerCase();
    if (category === "marketing") return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Marketing</Badge>;
    if (category === "utility") return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Utility</Badge>;
    if (category === "authentication") return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Authentication</Badge>;
    return null;
  };

  return (
    <div className="space-y-6" data-testid="templates-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Templates</h1>
          <p className="text-slate-600">WhatsApp + SMS(DLT) compliant template management.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={tab === "whatsapp" ? "default" : "outline"} className={tab === "whatsapp" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setSearchParams({ tab: "whatsapp" })}>WhatsApp</Button>
          <Button variant={tab === "sms" ? "default" : "outline"} className={tab === "sms" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setSearchParams({ tab: "sms" })}>SMS</Button>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="create-template-btn">
              <Plus className="w-4 h-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-2 border-b bg-white">
              <DialogTitle>Create Template</DialogTitle>
              <DialogDescription>Build templates as per WhatsApp and India DLT requirements.</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-160px)] space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input placeholder="e.g., order_confirmation_v1" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={draft.language} onValueChange={(v) => setDraft((p) => ({ ...p, language: v }))}>
                    <SelectTrigger><SelectValue placeholder="Language" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ta">Tamil</SelectItem>
                      <SelectItem value="te">Telugu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={draft.channel} onValueChange={(v) => setDraft((p) => ({ ...p, channel: v }))}>
                    <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={String(draft.category).toLowerCase()} onValueChange={(v) => setDraft((p) => ({ ...p, category: v.toUpperCase() }))}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isSms && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
                  <p className="font-medium text-orange-800">DLT Registration (Required for SMS in India)</p>
                  <p className="text-sm text-orange-700">
                    Need to add Sender ID first? Go to{" "}
                    <Link className="underline font-medium" to="/dashboard/sms-setup">SMS Setup</Link>.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Sender ID</Label>
                      <Select value={draft.smsSenderId || undefined} onValueChange={(v) => {
                        const row = smsSenders.find((x) => x.senderId === v);
                        setDraft((p) => ({ ...p, smsSenderId: v, dltEntityId: row?.entityId || p.dltEntityId }));
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
                        <SelectContent>
                          {smsSenders.length === 0 ? <SelectItem value="none" disabled>No sender found</SelectItem> : null}
                          {smsSenders.map((s) => <SelectItem key={s.id} value={s.senderId}>{s.senderId}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>DLT Entity ID</Label>
                      <Input placeholder="e.g., 1101234567890" value={draft.dltEntityId} onChange={(e) => setDraft((p) => ({ ...p, dltEntityId: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>DLT Template ID</Label>
                      <Input placeholder="e.g., 1107161234567890123" value={draft.dltTemplateId} onChange={(e) => setDraft((p) => ({ ...p, dltTemplateId: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Header Type</Label>
                  <Select value={draft.headerType} onValueChange={(v) => setDraft((p) => ({ ...p, headerType: v }))}>
                    <SelectTrigger><SelectValue placeholder="Header" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Header Text</Label>
                  <Input placeholder="Optional header text" value={draft.headerText} onChange={(e) => setDraft((p) => ({ ...p, headerText: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Message Body</Label>
                <Textarea className="min-h-[140px]" placeholder="Use {{1}}, {{2}} for variables." value={draft.body} onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))} />
                <p className="text-xs text-slate-500">
                  {draft.channel === "whatsapp" ? "WhatsApp max 1024 chars." : "SMS as per DLT approved content."} Variables: {templateVars.length ? templateVars.map((v) => `{{${v}}}`).join(", ") : "none"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Footer Text</Label>
                <Input placeholder="Optional footer" value={draft.footerText} onChange={(e) => setDraft((p) => ({ ...p, footerText: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-white sticky bottom-0">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={createTemplate}>Save Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className={`border-slate-200 ${index === 0 ? "border-orange-500" : ""}`}>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600">{stat.title}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          {tab === "sms" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-sm text-slate-700">SMS onboarding: 1) Add Entity + Sender ID 2) Add Template or Upload CSV.</p>
              <Input type="file" accept=".csv" className="max-w-xs" onChange={(e) => uploadSmsTemplates(e.target.files?.[0])} disabled={uploading} />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Templates List</div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search templates..." className="pl-10 w-64" />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DLT ID</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                (tab === "sms" ? Number(template.channel) === 1 : Number(template.channel) === 2) ? (
                <TableRow key={template.id} className="table-row-hover">
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{template.name}</p>
                      <p className="text-sm text-slate-500 truncate max-w-xs">{template.body}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(template.category)}</TableCell>
                  <TableCell>
                    {Number(template.channel) === 2 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><MessageSquare className="w-3 h-3 mr-1" />WhatsApp</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200"><Send className="w-3 h-3 mr-1" />SMS</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getStatusBadge(template.status || template.lifecycleStatus)}
                      {template.rejectionReason && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{template.rejectionReason}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm font-mono">{template.dltTemplateId || "-"}</TableCell>
                  <TableCell className="text-slate-600 text-sm font-mono">{template.smsSenderId || "-"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled><FileText className="w-4 h-4 mr-2" />Preview</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => removeTemplate(template.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                ) : null
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TemplatesPage;
