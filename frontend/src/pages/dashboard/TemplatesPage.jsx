import { useState } from "react";
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

const TemplatesPage = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("marketing");

  const templates = [
    {
      id: 1,
      name: "Order Confirmation",
      category: "utility",
      channel: "whatsapp",
      status: "approved",
      language: "English",
      content: "Hi {{1}}, your order #{{2}} has been confirmed. Track your order at {{3}}",
      usageCount: 12456,
      lastUsed: "2 hours ago",
      dltTemplateId: "1107161234567890123",
    },
    {
      id: 2,
      name: "Summer Sale Promo",
      category: "marketing",
      channel: "whatsapp",
      status: "approved",
      language: "English",
      content: "🎉 Summer Sale is here! Get up to 50% off on all products. Shop now: {{1}}",
      usageCount: 8765,
      lastUsed: "1 day ago",
      dltTemplateId: "1107161234567890124",
    },
    {
      id: 3,
      name: "OTP Verification",
      category: "authentication",
      channel: "sms",
      status: "approved",
      language: "English",
      content: "Your OTP is {{1}}. Valid for 10 minutes. Do not share with anyone.",
      usageCount: 45678,
      lastUsed: "5 min ago",
      dltTemplateId: "1107161234567890125",
    },
    {
      id: 4,
      name: "New Arrival Alert",
      category: "marketing",
      channel: "whatsapp",
      status: "pending",
      language: "English",
      content: "🆕 New arrivals just dropped! Check out the latest collection: {{1}}",
      usageCount: 0,
      lastUsed: "Never",
      dltTemplateId: "1107161234567890126",
    },
    {
      id: 5,
      name: "Payment Reminder",
      category: "utility",
      channel: "sms",
      status: "rejected",
      language: "English",
      content: "Reminder: Your payment of ₹{{1}} is due on {{2}}. Pay now to avoid late fees.",
      usageCount: 2345,
      lastUsed: "3 days ago",
      dltTemplateId: "1107161234567890127",
      rejectionReason: "Template contains promotional content in utility category",
    },
    {
      id: 6,
      name: "Delivery Update",
      category: "utility",
      channel: "whatsapp",
      status: "approved",
      language: "Hindi",
      content: "नमस्ते {{1}}, आपका ऑर्डर #{{2}} डिलीवरी के लिए निकल चुका है। अनुमानित समय: {{3}}",
      usageCount: 5678,
      lastUsed: "1 hour ago",
      dltTemplateId: "1107161234567890128",
    },
  ];

  const stats = [
    { title: "Total Templates", value: "24", status: "all" },
    { title: "Approved", value: "18", status: "approved" },
    { title: "Pending", value: "4", status: "pending" },
    { title: "Rejected", value: "2", status: "rejected" },
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
                  <Input placeholder="e.g., Order Confirmation" />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select>
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
                  <Select>
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
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
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
              <Button className="bg-orange-500 hover:bg-orange-600">Submit for Approval</Button>
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
                      <p className="text-sm text-slate-500 truncate max-w-xs">{template.content}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getCategoryBadge(template.category)}</TableCell>
                  <TableCell>
                    {template.channel === "whatsapp" ? (
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
                      {getStatusBadge(template.status)}
                      {template.rejectionReason && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {template.rejectionReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm font-mono">{template.dltTemplateId}</TableCell>
                  <TableCell className="text-slate-600">{template.usageCount.toLocaleString()}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{template.lastUsed}</TableCell>
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
                        <DropdownMenuItem className="text-red-600">
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
