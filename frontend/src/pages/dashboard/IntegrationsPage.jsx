import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Plug,
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
  Clock3,
  ExternalLink,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { getPlatformSettings, getSession, savePlatformSettings } from "@/lib/api";

const IntegrationsPage = () => {
  const [showApiUsername, setShowApiUsername] = useState(false);
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiConfig, setSavingApiConfig] = useState(false);
  const [apiConfig, setApiConfig] = useState({
    enabled: false,
    apiUsername: "",
    apiPassword: "",
    apiKey: "",
    ipWhitelist: "",
  });
  const session = getSession();
  const isSuperAdmin = String(session?.role || "").toLowerCase() === "super_admin";

  const generateToken = (length = 32) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  };

  const regenerateApiUsername = () => {
    setApiConfig((p) => ({ ...p, apiUsername: `tx_user_${generateToken(10)}` }));
    toast.success("API username regenerated");
  };

  const regenerateApiPassword = () => {
    setApiConfig((p) => ({ ...p, apiPassword: `tx_pw_${generateToken(32)}` }));
    toast.success("API password regenerated");
  };

  const regenerateApiKey = () => {
    setApiConfig((p) => ({ ...p, apiKey: `tx_live_sk_${generateToken(36)}` }));
    toast.success("API key regenerated");
  };

  const integrations = [
    {
      name: "Shopify",
      description: "Sync orders and send automated notifications",
      icon: ShoppingCart,
      status: "planned",
      category: "e-commerce",
    },
    {
      name: "WooCommerce",
      description: "WordPress e-commerce integration",
      icon: ShoppingCart,
      status: "planned",
      category: "e-commerce",
    },
    {
      name: "Razorpay",
      description: "Payment notifications and receipts",
      icon: CreditCard,
      status: "planned",
      category: "payments",
    },
    {
      name: "Stripe",
      description: "Payment gateway integration",
      icon: CreditCard,
      status: "planned",
      category: "payments",
    },
    {
      name: "Mailchimp",
      description: "Sync contacts and campaigns",
      icon: Mail,
      status: "planned",
      category: "marketing",
    },
    {
      name: "HubSpot",
      description: "CRM and marketing automation",
      icon: Database,
      status: "planned",
      category: "crm",
    },
    {
      name: "Salesforce",
      description: "Enterprise CRM integration",
      icon: Database,
      status: "planned",
      category: "crm",
    },
    {
      name: "Zapier",
      description: "Connect with 5000+ apps",
      icon: Plug,
      status: "planned",
      category: "automation",
    },
  ];

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isSuperAdmin) {
        if (!active) return;
        setApiConfig({
          enabled: false,
          apiUsername: "",
          apiPassword: "",
          apiKey: "",
          ipWhitelist: "",
        });
        return;
      }
      try {
        const res = await getPlatformSettings("api-integration");
        if (!active) return;
        const values = res?.values || {};
        setApiConfig({
          enabled: String(values.enabled || "false").toLowerCase() === "true",
          apiUsername: String(values.apiUsername || values.apiUser || "").trim(),
          apiPassword: String(values.apiPassword || "").trim(),
          apiKey: String(values.apiKey || "").trim(),
          ipWhitelist: String(values.ipWhitelist || "").trim(),
        });
      } catch {
        if (!active) return;
        toast.error("Failed to load public API integration settings");
      }
    })();
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  const handleCopyApiKey = () => {
    if (!apiConfig.apiKey) {
      toast.error("API key is empty");
      return;
    }
    navigator.clipboard.writeText(apiConfig.apiKey);
    toast.success("API key copied to clipboard");
  };

  const handleCopyApiUsername = () => {
    if (!apiConfig.apiUsername) {
      toast.error("API username is empty");
      return;
    }
    navigator.clipboard.writeText(apiConfig.apiUsername);
    toast.success("API username copied");
  };

  const handleCopyApiPassword = () => {
    if (!apiConfig.apiPassword) {
      toast.error("API password is empty");
      return;
    }
    navigator.clipboard.writeText(apiConfig.apiPassword);
    toast.success("API password copied");
  };

  const saveApiIntegration = async () => {
    if (!isSuperAdmin) {
      toast.error("Public API credentials are managed by platform owner.");
      return;
    }
    try {
      setSavingApiConfig(true);
      await savePlatformSettings("api-integration", {
        enabled: apiConfig.enabled ? "true" : "false",
        apiUsername: apiConfig.apiUsername || "",
        apiPassword: apiConfig.apiPassword || "",
        apiKey: apiConfig.apiKey || "",
        ipWhitelist: apiConfig.ipWhitelist || "",
      });
      toast.success("Public API integration settings saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save public API integration settings");
    } finally {
      setSavingApiConfig(false);
    }
  };

  const openApiDocs = () => {
    window.open("/docs/api-integration.html", "_blank", "noopener,noreferrer");
  };

  const openFullDocs = () => {
    window.open("/docs/index.html", "_blank", "noopener,noreferrer");
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
                  <CardTitle className="text-lg">Public API Integration</CardTitle>
                  <CardDescription>Configure simple URL API access (username/password/key + optional IP whitelist)</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isSuperAdmin ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Public API credentials are managed by platform owner. Tenant users can use project slug and API documentation, but cannot view or edit platform credentials here.
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <Label className="text-sm font-medium">Enable Public API</Label>
                <p className="text-xs text-slate-500">When disabled, `/api/public/messages/send` returns 403.</p>
              </div>
              <Switch
                checked={apiConfig.enabled}
                onCheckedChange={(checked) => setApiConfig((p) => ({ ...p, enabled: checked }))}
                data-testid="public-api-enabled-switch"
                disabled={!isSuperAdmin}
              />
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <div className="text-xs font-semibold text-slate-700">Current Login Project</div>
              <div className="mt-1 text-sm text-slate-900">{session.projectName || session.tenantSlug || "Not selected"}</div>
              <div className="mt-2 text-xs text-slate-500">
                Tenant Slug: <span className="font-mono text-slate-700">{session.tenantSlug || "-"}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">API Credentials</Label>
                <Badge className={apiConfig.enabled ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                  {apiConfig.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Username</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showApiUsername ? "text" : "password"}
                      value={apiConfig.apiUsername}
                      onChange={(e) => setApiConfig((p) => ({ ...p, apiUsername: e.target.value }))}
                      placeholder="MONEYART"
                      disabled={!isSuperAdmin}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setShowApiUsername((v) => !v)} data-testid="toggle-api-username" disabled={!apiConfig.apiUsername}>
                      {showApiUsername ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCopyApiUsername} data-testid="copy-api-username" disabled={!apiConfig.apiUsername}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={regenerateApiUsername} data-testid="regen-api-username" disabled={!isSuperAdmin}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Password</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showApiPassword ? "text" : "password"}
                      value={apiConfig.apiPassword}
                      onChange={(e) => setApiConfig((p) => ({ ...p, apiPassword: e.target.value }))}
                      placeholder="Enter API password"
                      disabled={!isSuperAdmin}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setShowApiPassword((v) => !v)} data-testid="toggle-api-password" disabled={!apiConfig.apiPassword}>
                      {showApiPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCopyApiPassword} data-testid="copy-api-password" disabled={!apiConfig.apiPassword}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={regenerateApiPassword} data-testid="regen-api-password" disabled={!isSuperAdmin}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiConfig.apiKey}
                      onChange={(e) => setApiConfig((p) => ({ ...p, apiKey: e.target.value }))}
                      className="font-mono text-sm"
                      placeholder="tx_live_sk_xxxxx"
                      disabled={!isSuperAdmin}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)} data-testid="toggle-api-key" disabled={!apiConfig.apiKey}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCopyApiKey} data-testid="copy-api-key" disabled={!apiConfig.apiKey}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={regenerateApiKey} data-testid="regen-api-key" disabled={!isSuperAdmin}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-600">IP Whitelist (optional)</Label>
                  <Textarea
                    rows={2}
                    value={apiConfig.ipWhitelist}
                    onChange={(e) => setApiConfig((p) => ({ ...p, ipWhitelist: e.target.value }))}
                    placeholder={"203.0.113.10\n203.0.113.0/24"}
                    disabled={!isSuperAdmin}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" className="gap-2" onClick={saveApiIntegration} disabled={savingApiConfig || !isSuperAdmin} data-testid="save-public-api-btn">
                <RefreshCw className={`w-4 h-4 ${savingApiConfig ? "animate-spin" : ""}`} />
                {savingApiConfig ? "Saving..." : isSuperAdmin ? "Save Settings" : "Managed by Platform"}
              </Button>
              <Button variant="outline" className="gap-2" data-testid="view-docs-btn" onClick={openApiDocs}>
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
                  <CardDescription>Tenant-managed webhook UI is not live yet</CardDescription>
                </div>
              </div>
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Planned</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                  <Clock3 className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Webhook management is not wired for tenant dashboard yet.</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Incoming provider callbacks are handled in backend. Tenant-facing create/edit webhook UI will be added only after those endpoints are fully exposed.
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Current recommendation: use API documentation for callback format and let platform owner manage provider-level webhook routing.
              </div>
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
                    className="border-slate-200 transition-all hover:border-orange-200"
                    data-testid={`integration-${integration.name.toLowerCase()}`}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                          <integration.icon className="w-6 h-6 text-slate-600" />
                        </div>
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                          Planned
                        </Badge>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">{integration.name}</h4>
                      <p className="text-sm text-slate-500 mb-4">{integration.description}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled
                      >
                        Coming Soon
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
              <code>{`curl -X POST https://textzy-backend-production.up.railway.app/api/messages/send \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "X-API-Secret: YOUR_API_SECRET" \\
  -H "X-Tenant-Slug: moneyart" \\
  -H "Idempotency-Key: your-unique-id-123" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipient": "919876543210",
    "channel": "WhatsApp",
    "body": "Hello from integration",
    "useTemplate": false
  }'`}</code>
            </pre>
          </div>
          <div className="flex items-center justify-between mt-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Copy className="w-4 h-4" />
              Copy Code
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={openFullDocs}>
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
