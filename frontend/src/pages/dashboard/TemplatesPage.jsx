import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  Filter,
  MoreVertical,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Copy,
  Trash2,
  Edit,
  Eye,
  Send,
  MessageSquare,
  Image,
  Video,
  File,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";

const TemplatesPage = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("marketing");
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState({ name: "", body: "", channel: "whatsapp", category: "MARKETING", language: "en" });

  useEffect(() => {
    apiGet("/api/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const stats = [
    { title: "Total Templates", value: String(templates.length), status: "all" },
    { title: "Approved", value: String(templates.filter((t) => (t.lifecycleStatus || "").toLowerCase() === "approved").length), status: "approved" },
    { title: "Pending", value: String(templates.filter((t) => (t.lifecycleStatus || "").toLowerCase() === "pending").length), status: "pending" },
    { title: "Rejected", value: String(templates.filter((t) => (t.lifecycleStatus || "").toLowerCase() === "rejected").length), status: "rejected" },
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1">
            <CheckCircle className="w-3 h-3" />
            Approved
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  const createTemplate = async () => {
    if (!draft.name.trim() || !draft.body.trim()) return;
    await apiPost("/api/templates", {
      name: draft.name,
      body: draft.body,
      channel: draft.channel === "sms" ? 1 : 2,
      category: draft.category,
      language: draft.language,
    });
    setTemplates(await apiGet("/api/templates"));
    setShowCreateDialog(false);
    setDraft({ name: "", body: "", channel: "whatsapp", category: "MARKETING", language: "en" });
  };

  const removeTemplate = async (id) => {
    await apiDelete(`/api/templates/${id}`);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case "marketing":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Marketing</Badge>;
      case "utility":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Utility</Badge>;
      case "authentication":
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Authentication</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="templates-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Templates</h1>
          <p className="text-slate-600">Manage your WhatsApp and SMS message templates</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="create-template-btn">
              <Plus className="w-4 h-4" />
              Create Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>
                Create a new message template for WhatsApp or SMS campaigns
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input placeholder="e.g., Order Confirmation" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={draft.language} onValueChange={(v) => setDraft((p) => ({ ...p, language: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ta">Tamil</SelectItem>
                      <SelectItem value="te">Telugu</SelectItem>
                      <SelectItem value="mr">Marathi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={draft.channel} onValueChange={(v) => setDraft((p) => ({ ...p, channel: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setDraft((p) => ({ ...p, category: v.toUpperCase() })); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* DLT Fields for SMS */}
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm font-medium text-orange-800 mb-3">DLT Registration (Required for SMS in India)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">DLT Entity ID</Label>
                    <Input placeholder="e.g., 1101234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">DLT Template ID</Label>
                    <Input placeholder="e.g., 1107161234567890123" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Header (Optional)</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1">
                    <FileText className="w-4 h-4" /> Text
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Image className="w-4 h-4" /> Image
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Video className="w-4 h-4" /> Video
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    <File className="w-4 h-4" /> Document
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Message Body</Label>
                <Textarea
                  placeholder="Type your message here. Use {{1}}, {{2}}, etc. for variables."
                  className="min-h-[120px]"
                  value={draft.body}
                  onChange={(e) => setDraft((p) => ({ ...p, body: e.target.value }))}
                />
                <p className="text-xs text-slate-500">
                  Use {"{{1}}"}, {"{{2}}"}, etc. for dynamic variables. Max 1024 characters for WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Footer (Optional)</Label>
                <Input placeholder="e.g., Reply STOP to unsubscribe" />
              </div>

              <div className="space-y-2">
                <Label>Buttons (Optional)</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">+ Quick Reply</Button>
                  <Button variant="outline" size="sm">+ Call to Action</Button>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-3">Preview</p>
                <div className="bg-white p-4 rounded-lg border border-slate-200 max-w-sm">
                  <div className="chat-bubble-received p-3">
                    <p className="text-sm text-slate-900">
                      Hi [Customer Name], your order #[Order ID] has been confirmed. Track your order at [Link]
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button variant="outline">Save as Draft</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={createTemplate}>Submit for Approval</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className={`border-slate-200 cursor-pointer transition-all hover:border-orange-300 ${
            index === 0 ? "border-orange-500" : ""
          }`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stat.status === "approved" ? "bg-green-100" :
                  stat.status === "pending" ? "bg-yellow-100" :
                  stat.status === "rejected" ? "bg-red-100" : "bg-slate-100"
                }`}>
                  {stat.status === "approved" && <CheckCircle className="w-5 h-5 text-green-600" />}
                  {stat.status === "pending" && <Clock className="w-5 h-5 text-yellow-600" />}
                  {stat.status === "rejected" && <XCircle className="w-5 h-5 text-red-600" />}
                  {stat.status === "all" && <FileText className="w-5 h-5 text-slate-600" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Templates Table */}
      <Card className="border-slate-200">
        <CardHeader>
          <Tabs defaultValue="all">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="all">All Templates</TabsTrigger>
                <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                <TabsTrigger value="sms">SMS</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search templates..." className="pl-10 w-64" data-testid="search-templates" />
                </div>
                <Button variant="outline" size="icon" data-testid="filter-templates-btn">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>DLT Template ID</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} className="table-row-hover">
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900">{template.name}</p>
                      <p className="text-sm text-slate-500 truncate max-w-xs">{template.content || template.body}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(template.category)}</TableCell>
                  <TableCell>
                    {template.channel === "whatsapp" || template.channel === 2 ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        WhatsApp
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        <Send className="w-3 h-3 mr-1" />
                        SMS
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getStatusBadge(template.status || template.lifecycleStatus)}
                      {template.rejectionReason && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {template.rejectionReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm font-mono">{template.dltTemplateId || "-"}</TableCell>
                  <TableCell className="text-slate-600">{(template.usageCount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{template.lastUsed || "-"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`template-menu-${template.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Send className="w-4 h-4 mr-2" />
                          Use in Campaign
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => removeTemplate(template.id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
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
  );
};

export default TemplatesPage;
