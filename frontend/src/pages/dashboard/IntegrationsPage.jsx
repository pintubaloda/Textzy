import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Plug,
  Globe,
  Key,
  Webhook,
  ShoppingCart,
  CreditCard,
  Mail,
  Database,
  Code,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  XCircle,
  ExternalLink,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const IntegrationsPage = () => {
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const apiKey = "tx_live_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  const integrations = [
    {
      name: "Shopify",
      description: "Sync orders and send automated notifications",
      icon: ShoppingCart,
      status: "connected",
      category: "e-commerce",
    },
    {
      name: "WooCommerce",
      description: "WordPress e-commerce integration",
      icon: ShoppingCart,
      status: "available",
      category: "e-commerce",
    },
    {
      name: "Razorpay",
      description: "Payment notifications and receipts",
      icon: CreditCard,
      status: "connected",
      category: "payments",
    },
    {
      name: "Stripe",
      description: "Payment gateway integration",
      icon: CreditCard,
      status: "available",
      category: "payments",
    },
    {
      name: "Mailchimp",
      description: "Sync contacts and campaigns",
      icon: Mail,
      status: "available",
      category: "marketing",
    },
    {
      name: "HubSpot",
      description: "CRM and marketing automation",
      icon: Database,
      status: "available",
      category: "crm",
    },
    {
      name: "Salesforce",
      description: "Enterprise CRM integration",
      icon: Database,
      status: "available",
      category: "crm",
    },
    {
      name: "Zapier",
      description: "Connect with 5000+ apps",
      icon: Plug,
      status: "connected",
      category: "automation",
    },
  ];

  const webhooks = [
    {
      id: 1,
      name: "Order Created",
      url: "https://api.yourstore.com/webhooks/order",
      events: ["message.sent", "message.delivered"],
      status: "active",
      lastTriggered: "5 min ago",
    },
    {
      id: 2,
      name: "Lead Capture",
      url: "https://api.yourcrm.com/webhooks/leads",
      events: ["contact.created", "contact.updated"],
      status: "active",
      lastTriggered: "1 hour ago",
    },
    {
      id: 3,
      name: "Campaign Analytics",
      url: "https://analytics.example.com/track",
      events: ["campaign.completed"],
      status: "inactive",
      lastTriggered: "2 days ago",
    },
  ];

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  return (
    <div className="space-y-6" data-testid="integrations-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Integrations</h1>
          <p className="text-slate-600">Connect Textzy with your favorite tools</p>
        </div>
      </div>

      {/* API & Webhooks Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* API Keys */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Key className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">API Keys</CardTitle>
                  <CardDescription>Access the Textzy API</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Live API Key</Label>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)} data-testid="toggle-api-key">
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCopyApiKey} data-testid="copy-api-key">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" className="gap-2" data-testid="regenerate-key-btn">
                <RefreshCw className="w-4 h-4" />
                Regenerate Key
              </Button>
              <Button variant="outline" className="gap-2" data-testid="view-docs-btn">
                <Code className="w-4 h-4" />
                View API Docs
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Webhooks */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Webhook className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Webhooks</CardTitle>
                  <CardDescription>Receive real-time notifications</CardDescription>
                </div>
              </div>
              <Dialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-1" data-testid="add-webhook-btn">
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Webhook</DialogTitle>
                    <DialogDescription>
                      Set up a webhook endpoint to receive events
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Webhook Name</Label>
                      <Input placeholder="e.g., Order Notifications" />
                    </div>
                    <div className="space-y-2">
                      <Label>Endpoint URL</Label>
                      <Input placeholder="https://your-server.com/webhooks" />
                    </div>
                    <div className="space-y-2">
                      <Label>Events</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {["message.sent", "message.delivered", "message.read", "contact.created", "campaign.completed"].map((event) => (
                          <div key={event} className="flex items-center space-x-2">
                            <input type="checkbox" id={event} className="rounded border-slate-300" />
                            <label htmlFor={event} className="text-sm">{event}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowWebhookDialog(false)}>Cancel</Button>
                    <Button className="bg-orange-500 hover:bg-orange-600">Create Webhook</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {webhooks.slice(0, 2).map((webhook) => (
                <div key={webhook.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-900 text-sm">{webhook.name}</span>
                    <Badge className={webhook.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>
                      {webhook.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{webhook.url}</p>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-orange-500">
                View All Webhooks
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Available Integrations */}
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Available Integrations</CardTitle>
              <CardDescription>Connect with popular tools and services</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search integrations..." className="pl-10 w-64" data-testid="search-integrations" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="mb-6">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="connected">Connected</TabsTrigger>
              <TabsTrigger value="e-commerce">E-commerce</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="crm">CRM</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {integrations.map((integration, index) => (
                  <Card
                    key={index}
                    className={`border-slate-200 cursor-pointer transition-all hover:border-orange-200 ${
                      integration.status === "connected" ? "border-green-200 bg-green-50/30" : ""
                    }`}
                    data-testid={`integration-${integration.name.toLowerCase()}`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                          <integration.icon className="w-6 h-6 text-slate-600" />
                        </div>
                        {integration.status === "connected" ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline">Available</Badge>
                        )}
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">{integration.name}</h4>
                      <p className="text-sm text-slate-500 mb-4">{integration.description}</p>
                      <Button
                        variant={integration.status === "connected" ? "outline" : "default"}
                        size="sm"
                        className={`w-full ${integration.status !== "connected" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                      >
                        {integration.status === "connected" ? "Manage" : "Connect"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Code Example */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Send your first message using the API</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-slate-300">
              <code>{`curl -X POST https://api.textzy.in/v1/messages \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+919876543210",
    "channel": "whatsapp",
    "template": "order_confirmation",
    "variables": {
      "1": "John",
      "2": "ORD-12345",
      "3": "https://track.example.com/12345"
    }
  }'`}</code>
            </pre>
          </div>
          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Copy className="w-4 h-4" />
              Copy Code
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Full Documentation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsPage;
