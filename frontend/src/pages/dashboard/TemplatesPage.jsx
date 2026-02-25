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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Filter, MoreVertical, FileText, CheckCircle, XCircle, Clock, AlertCircle, Trash2, MessageSquare, Send, Image as ImageIcon, Video, Paperclip, RefreshCw, Upload } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPostForm, listSmsSenders } from "@/lib/api";
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
  headerMediaId: "",
  headerMediaName: "",
  footerText: "",
  buttonsJson: "",
};

function normalizeListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function channelValue(x) {
  const raw = x?.channel;
  if (typeof raw === "number") return raw;
  const text = String(raw || "").trim().toLowerCase();
  if (text === "whatsapp") return 2;
  if (text === "sms") return 1;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

const categoryGuide = {
  MARKETING: {
    title: "Marketing",
    color: "text-purple-700",
    hint: "Promotions, offers, product discovery, re-engagement.",
    must: "Use clear promotional copy. Prefer CTA/Quick replies.",
  },
  UTILITY: {
    title: "Utility",
    color: "text-blue-700",
    hint: "Transactional updates for opted-in users (order/account/service).",
    must: "Message should be service-oriented and contextual.",
  },
  AUTHENTICATION: {
    title: "Authentication",
    color: "text-orange-700",
    hint: "OTP/login verification and security auth messages.",
    must: "Should include auth code variable (typically {{1}}).",
  },
};

function parseButtons(buttonsJson) {
  try {
    const parsed = JSON.parse(buttonsJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TemplatePreviewCard = ({ template }) => {
  const buttons = parseButtons(template?.buttonsJson || template?.ButtonsJson || "[]");
  const body = template?.body || template?.Body || "";
  const headerType = (template?.headerType || template?.HeaderType || "none").toLowerCase();
  const headerText = template?.headerText || template?.HeaderText || "";
  const footerText = template?.footerText || template?.FooterText || "";
  const headerMediaName = template?.headerMediaName || template?.HeaderMediaName || "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mx-auto w-full max-w-sm rounded-2xl border bg-[#efeae2] p-3">
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          {(headerType === "text" && headerText) ? (
            <div className="px-3 pt-3 text-sm font-semibold text-slate-800">{headerText}</div>
          ) : null}

          {(headerType === "image" || headerType === "video" || headerType === "document") ? (
            <div className="mx-3 mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex items-center gap-2">
              {headerType === "image" ? <ImageIcon className="w-4 h-4" /> : null}
              {headerType === "video" ? <Video className="w-4 h-4" /> : null}
              {headerType === "document" ? <Paperclip className="w-4 h-4" /> : null}
              <span>{headerMediaName || `${headerType} header attached`}</span>
            </div>
          ) : null}

          <div className="px-3 py-3 text-[15px] leading-6 text-slate-900 whitespace-pre-wrap">{body || "Template body preview"}</div>
          {footerText ? <div className="px-3 pb-2 text-xs text-slate-500">{footerText}</div> : null}

          {buttons.length > 0 ? (
            <div className="border-t border-slate-200">
              {buttons.map((b, i) => (
                <div key={i} className="px-3 py-2 text-sm text-blue-700 border-b last:border-b-0 border-slate-100">
                  {b?.text || "Button"}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const TemplatesPage = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "sms" ? "sms" : "whatsapp";

  const [templates, setTemplates] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [libraryError, setLibraryError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("ALL");
  const [smsSenders, setSmsSenders] = useState([]);
  const [draft, setDraft] = useState(initialDraft);
  const [tableSearch, setTableSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isSms = draft.channel === "sms";
  const isMediaHeader = ["image", "video", "document"].includes((draft.headerType || "none").toLowerCase());

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
      setTemplates(normalizeListPayload(tpl));
      setSmsSenders(senders || []);
      try {
        const lib = await apiGet("/api/templates/library");
        setLibraryItems(normalizeListPayload(lib));
        setLibraryError("");
      } catch (e) {
        setLibraryItems([]);
        const message = e?.message || "";
        if (message.toLowerCase().includes("unexpected end of json input")) {
          setLibraryError("");
        } else {
          setLibraryError(message || "Library fetch failed");
        }
      }
    } catch (e) {
      setTemplates([]);
      setSmsSenders([]);
      setLibraryItems([]);
      setLibraryError(e?.message || "Data load failed");
    }
  };

  const stats = [
    { title: "Total Templates", value: String(templates.filter((t) => (tab === "sms" ? channelValue(t) === 1 : channelValue(t) === 2)).length) },
    { title: "Approved", value: String(templates.filter((t) => (tab === "sms" ? channelValue(t) === 1 : channelValue(t) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "approved").length) },
    { title: "Pending", value: String(templates.filter((t) => (tab === "sms" ? channelValue(t) === 1 : channelValue(t) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "pending").length) },
    { title: "Rejected", value: String(templates.filter((t) => (tab === "sms" ? channelValue(t) === 1 : channelValue(t) === 2) && String(t.status || t.lifecycleStatus || "").toLowerCase() === "rejected").length) },
  ];

  const templateVars = useMemo(() => {
    const matches = [...(draft.body || "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return Array.from(new Set(matches)).sort((a, b) => a - b);
  }, [draft.body]);

  const filteredTemplates = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return templates.filter((template) => {
      const inTab = tab === "sms" ? channelValue(template) === 1 : channelValue(template) === 2;
      if (!inTab) return false;
      if (!q) return true;
      return String(template.name || "").toLowerCase().includes(q) || String(template.body || "").toLowerCase().includes(q);
    });
  }, [templates, tab, tableSearch]);

  const filteredLibraryItems = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return libraryItems.filter((x) => {
      const byCategory = libraryCategory === "ALL" || String(x.category || "").toUpperCase() === libraryCategory;
      if (!byCategory) return false;
      if (!q) return true;
      return String(x.name || "").toLowerCase().includes(q) || String(x.body || "").toLowerCase().includes(q);
    });
  }, [libraryItems, librarySearch, libraryCategory]);

  const validateDraft = () => {
    if (!draft.name.trim()) return "Template name is required.";
    if (!draft.body.trim()) return "Message body is required.";
    if (draft.channel === "whatsapp") {
      if (draft.body.length > 1024) return "WhatsApp template body max length is 1024.";
      for (let i = 0; i < templateVars.length; i += 1) {
        if (templateVars[i] !== i + 1) return "Variables must be sequential: {{1}}, {{2}}, {{3}}...";
      }
      if (String(draft.category).toUpperCase() === "AUTHENTICATION" && !draft.body.includes("{{1}}")) {
        return "Authentication category must include auth variable ({{1}}).";
      }
      if (isMediaHeader && !draft.headerMediaId.trim()) {
        return "Please upload header media for selected media header type.";
      }
      if (draft.headerType === "text" && draft.headerText.trim().length > 60) return "Header text max length is 60.";
      if (draft.footerText.trim().length > 60) return "Footer text max length is 60.";
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
        headerMediaId: draft.headerMediaId,
        headerMediaName: draft.headerMediaName,
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

  const uploadHeaderMedia = async (file) => {
    if (!file) return;
    if (!isMediaHeader) {
      toast.error("Select media header type first.");
      return;
    }
    try {
      setUploading(true);
      const form = new FormData();
      form.append("file", file);
      form.append("mediaType", draft.headerType);
      const out = await apiPostForm("/api/messages/upload-whatsapp-asset", form);
      setDraft((p) => ({ ...p, headerMediaId: out?.mediaId || "", headerMediaName: out?.fileName || file.name }));
      toast.success("Header media uploaded.");
    } catch (e) {
      toast.error(e?.message || "Header media upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const applyLibraryTemplate = (item) => {
    setDraft((p) => ({
      ...p,
      name: `${item.name}_custom`,
      channel: "whatsapp",
      category: (item.category || "UTILITY").toUpperCase(),
      language: item.language || "en",
      headerType: item.headerType || "none",
      headerText: item.headerText || "",
      body: item.body || "",
      footerText: item.footerText || "",
      buttonsJson: item.buttonsJson || "",
      headerMediaId: "",
      headerMediaName: "",
    }));
    setShowCreateDialog(true);
  };

  const syncLibrary = async () => {
    try {
      setSyncingLibrary(true);
      const out = await apiPost("/api/templates/library/sync", {});
      toast.success(`Template library synced. Meta templates: ${out?.sourceCount ?? 0}, upserted: ${out?.upserted ?? 0}`);
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Library sync failed.");
    } finally {
      setSyncingLibrary(false);
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
          headerMediaId: "",
          headerMediaName: "",
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

  const removeTemplate = async () => {
    if (!deleteTarget?.id || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await apiDelete(`/api/templates/${deleteTarget.id}`);
      setTemplates((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("Template deleted");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const syncWhatsAppTemplates = async () => {
    try {
      await apiPost("/api/template-lifecycle/sync", {});
      toast.success("WhatsApp templates synced from Meta.");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Sync failed.");
    }
  };

  const submitTemplateToMeta = async (id) => {
    try {
      await apiPost(`/api/template-lifecycle/${id}/submit`, {});
      toast.success("Template submitted to Meta.");
      await loadAll();
    } catch (e) {
      toast.error(e?.message || "Submit failed.");
    }
  };

  const getStatusBadge = (statusRaw) => {
    const status = String(statusRaw || "").toLowerCase();
    if (status === "approved") return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
    return <Badge variant="outline">{statusRaw || "draft"}</Badge>;
  };

  const getCategoryBadge = (categoryRaw) => {
    const category = String(categoryRaw || "").toLowerCase();
    if (category === "marketing") return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Marketing</Badge>;
    if (category === "utility") return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Utility</Badge>;
    if (category === "authentication") return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Authentication</Badge>;
    return <Badge variant="outline">{categoryRaw}</Badge>;
  };

  const guide = categoryGuide[(draft.category || "UTILITY").toUpperCase()] || categoryGuide.UTILITY;

  return (
    <>
      <div className="space-y-6" data-testid="templates-page">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">Templates</h1>
            <p className="text-slate-600">WhatsApp + SMS(DLT) compliant template management.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant={tab === "whatsapp" ? "default" : "outline"} className={tab === "whatsapp" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setSearchParams({ tab: "whatsapp" })}>WhatsApp</Button>
            <Button variant={tab === "sms" ? "default" : "outline"} className={tab === "sms" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setSearchParams({ tab: "sms" })}>SMS</Button>
            {tab === "whatsapp" && (
              <>
                <Button variant="outline" onClick={syncWhatsAppTemplates}>Sync Meta</Button>
                <Button variant="outline" onClick={syncLibrary} disabled={syncingLibrary}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncingLibrary ? "animate-spin" : ""}`} />
                  Sync Library
                </Button>
              </>
            )}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="create-template-btn">
                  <Plus className="w-4 h-4" />
                  Create Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[92vh] p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2 border-b bg-white">
                  <DialogTitle>Create Template</DialogTitle>
                  <DialogDescription>Build templates as per WhatsApp and India DLT requirements.</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
                  <div className="lg:col-span-3 px-6 py-4 overflow-y-auto max-h-[calc(92vh-170px)] space-y-4 border-r">
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

                    {draft.channel === "whatsapp" && (
                      <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-1">
                        <div className={`font-semibold ${guide.color}`}>{guide.title}</div>
                        <div className="text-slate-700">{guide.hint}</div>
                        <div className="text-slate-600">{guide.must}</div>
                      </div>
                    )}

                    {isSms && (
                      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
                        <p className="font-medium text-orange-800">DLT Registration (Required for SMS in India)</p>
                        <p className="text-sm text-orange-700">
                          Need to add Sender ID first? Go to <Link className="underline font-medium" to="/dashboard/sms-setup">SMS Setup</Link>.
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
                        <Input placeholder="Optional header text" disabled={isMediaHeader} value={draft.headerText} onChange={(e) => setDraft((p) => ({ ...p, headerText: e.target.value }))} />
                      </div>
                    </div>

                    {isMediaHeader && (
                      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                        <div className="text-sm font-medium text-slate-700">Header Media ({draft.headerType})</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input readOnly value={draft.headerMediaId || "No media uploaded"} className="max-w-lg text-xs" />
                          <label className="inline-flex items-center gap-2">
                            <input type="file" className="hidden" onChange={(e) => uploadHeaderMedia(e.target.files?.[0])} />
                            <Button type="button" variant="outline" disabled={uploading}>
                              <Upload className="w-4 h-4 mr-2" />{uploading ? "Uploading..." : "Upload"}
                            </Button>
                          </label>
                        </div>
                        {draft.headerMediaName ? <div className="text-xs text-slate-500">{draft.headerMediaName}</div> : null}
                      </div>
                    )}

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

                    <div className="space-y-2">
                      <Label>Buttons JSON (Optional)</Label>
                      <Textarea className="min-h-[90px] font-mono text-xs" placeholder='[{"type":"quick_reply","text":"Track"}]' value={draft.buttonsJson} onChange={(e) => setDraft((p) => ({ ...p, buttonsJson: e.target.value }))} />
                    </div>
                  </div>

                  <div className="lg:col-span-2 px-6 py-4 overflow-y-auto max-h-[calc(92vh-170px)] space-y-2">
                    <div className="text-sm font-semibold text-slate-800">Template preview</div>
                    <TemplatePreviewCard template={draft} />
                  </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-white sticky bottom-0">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                  <Button className="bg-orange-500 hover:bg-orange-600" onClick={createTemplate}>Save Template</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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

        {tab === "whatsapp" && (
          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Shared Template Library</div>
                  <div className="text-xs text-slate-500">Synced library is saved in DB and visible across all projects.</div>
                </div>
                <div className="flex gap-2">
                  <Select value={libraryCategory} onValueChange={setLibraryCategory}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="UTILITY">Utility</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Search library" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} className="w-52" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {libraryError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {libraryError}
                </div>
              ) : null}
              {filteredLibraryItems.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No templates in shared library yet. Click <b>Sync Library</b> to fetch from Meta and save to DB.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredLibraryItems.slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-900 truncate">{item.name}</div>
                      {getCategoryBadge(item.category)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{item.body}</div>
                    <div className="mt-3 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => applyLibraryTemplate(item)}>Use template</Button>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                  <Input placeholder="Search templates..." className="pl-10 w-64" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
                </div>
                <Button variant="outline" size="icon"><Filter className="w-4 h-4" /></Button>
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
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id} className="table-row-hover">
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{template.name}</p>
                        <p className="text-sm text-slate-500 truncate max-w-xs">{template.body}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryBadge(template.category)}</TableCell>
                    <TableCell>
                      {channelValue(template) === 2 ? (
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
                          <DropdownMenuItem onClick={() => { setPreviewTemplate(template); setShowPreviewDialog(true); }}>
                            <FileText className="w-4 h-4 mr-2" />Preview
                          </DropdownMenuItem>
                          {channelValue(template) === 2 && (
                            <DropdownMenuItem onClick={() => submitTemplateToMeta(template.id)}>
                              <Send className="w-4 h-4 mr-2" />Submit to Meta
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(template)}>
                            <Trash2 className="w-4 h-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name || "Template preview"}</DialogTitle>
            <DialogDescription>
              {previewTemplate ? `${previewTemplate.category || ""} · ${previewTemplate.language || "en"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <TemplatePreviewCard template={previewTemplate || {}} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {Number(deleteTarget?.channel) === 2
                ? "This will delete the WhatsApp template from Meta and from your project database. This action cannot be undone."
                : "This will delete the SMS template from your project database. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={removeTemplate} disabled={deleteBusy}>
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TemplatesPage;
