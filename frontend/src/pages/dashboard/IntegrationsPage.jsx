import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BadgeCheck,
  BookOpenText,
  CreditCard,
  ExternalLink,
  FileText,
  Key,
  LockKeyhole,
  Plug,
  QrCode,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  disableAuthenticator,
  getAuthenticatorStatus,
  getIntegrationCatalog,
  getPlatformSettings,
  getSession,
  savePlatformSettings,
  setupAuthenticator,
  ensureStepUp,
  verifyAuthenticator,
} from "@/lib/api";

const CATEGORY_META = {
  all: { title: "All Integrations", hint: "Everything available to this tenant right now." },
  security: { title: "Security", hint: "Protect account access with authenticator-based 2FA." },
  payments: { title: "Payments", hint: "Billing, invoicing, and payment event connections." },
  "e-commerce": { title: "E-commerce", hint: "Order and cart workflows from storefront platforms." },
  automation: { title: "Automation", hint: "External workflow bridges and orchestration tools." },
  crm: { title: "CRM", hint: "Customer sync and pipeline integrations." },
  marketing: { title: "Marketing", hint: "Audience sync and campaign distribution tools." },
  general: { title: "General", hint: "Platform utilities and shared services." },
};

const PROVIDER_LABEL = {
  google_authenticator: "Google Authenticator",
  microsoft_authenticator: "Microsoft Authenticator",
};

function priceLabel(item) {
  if (String(item.pricingType || "free").toLowerCase() !== "paid") return "Free";
  const amount = `₹${Number(item.price || 0).toLocaleString()}`;
  const frequency = String(item.billingFrequency || "monthly").toLowerCase() === "one_time" ? "one-time" : "/month";
  const tax = String(item.taxMode || "exclusive").toLowerCase() === "inclusive" ? " incl. GST" : " + GST";
  return `${amount} ${frequency}${tax}`;
}

function categoryBadge(category) {
  return CATEGORY_META[category]?.title || category;
}

const IntegrationsPage = () => {
  const session = getSession();
  const isSuperAdmin = String(session?.role || "").toLowerCase() === "super_admin";
  const [apiConfig, setApiConfig] = useState({
    enabled: false,
    apiUsername: "",
    apiPassword: "",
    apiKey: "",
    ipWhitelist: "",
  });
  const [savingApiConfig, setSavingApiConfig] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [authenticator, setAuthenticator] = useState({ enabled: false, provider: "", enrolledAtUtc: "" });
  const [setupState, setSetupState] = useState({ provider: "", qrUrl: "", code: "", busy: false });
  const [category, setCategory] = useState("all");
  const [showApiUsername, setShowApiUsername] = useState(false);
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [docViewer, setDocViewer] = useState({ open: false, type: "sms" });

  const categories = useMemo(() => {
    const values = new Set(["all"]);
    for (const item of catalog) values.add(String(item.category || "general").toLowerCase());
    return Array.from(values);
  }, [catalog]);

  const visibleItems = useMemo(() => {
    const rows = (catalog || []).filter((item) => item?.isVisible !== false);
    if (category === "all") return rows;
    return rows.filter((item) => String(item.category || "general").toLowerCase() === category);
  }, [catalog, category]);

  const kpis = useMemo(() => {
    const rows = catalog || [];
    return {
      active: rows.filter((x) => x?.isActive !== false).length,
      paid: rows.filter((x) => String(x?.pricingType || "").toLowerCase() === "paid").length,
      security: rows.filter((x) => String(x?.category || "").toLowerCase() === "security").length,
      enabledSecurity: authenticator?.enabled ? 1 : 0,
    };
  }, [catalog, authenticator]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setCatalogBusy(true);
        const [catalogRows, authStatus] = await Promise.all([
          getIntegrationCatalog().catch(() => []),
          getAuthenticatorStatus().catch(() => ({ enabled: false, provider: "", enrolledAtUtc: "" })),
        ]);
        if (!alive) return;
        setCatalog(Array.isArray(catalogRows) ? catalogRows : []);
        setAuthenticator(authStatus || { enabled: false, provider: "", enrolledAtUtc: "" });
      } catch (e) {
        if (!alive) return;
        toast.error(e?.message || "Failed to load integrations");
      } finally {
        if (alive) setCatalogBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isSuperAdmin) return;
      try {
        const res = await getPlatformSettings("api-integration");
        if (!alive) return;
        const values = res?.values || {};
        setApiConfig({
          enabled: String(values.enabled || "false").toLowerCase() === "true",
          apiUsername: String(values.apiUsername || values.apiUser || "").trim(),
          apiPassword: String(values.apiPassword || "").trim(),
          apiKey: String(values.apiKey || "").trim(),
          ipWhitelist: String(values.ipWhitelist || "").trim(),
        });
      } catch {
        if (!alive) return;
      }
    })();
    return () => {
      alive = false;
    };
  }, [isSuperAdmin]);

  const regenerateToken = (prefix, length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = prefix;
    for (let i = 0; i < length; i += 1) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  };

  const regenerateProtectedToken = async (label, apply) => {
    if (!isSuperAdmin) return;
    try {
      await ensureStepUp({
        action: "api_credentials_regenerate",
        title: "Verify credential regeneration",
        message: `Enter your authenticator code to regenerate ${label}.`,
      });
      apply();
      toast.success(`${label} regenerated locally. Save to persist the new credential.`);
    } catch (e) {
      toast.error(e?.message || `Failed to regenerate ${label}.`);
    }
  };

  const saveApiIntegration = async () => {
    if (!isSuperAdmin) return toast.error("Public API credentials are managed by platform owner.");
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

  const handleCopy = async (label, value) => {
    if (!value) return toast.error(`${label} is empty`);
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const beginAuthenticatorSetup = async (provider) => {
    try {
      setSetupState((prev) => ({ ...prev, busy: true, provider, code: "" }));
      const res = await setupAuthenticator(provider);
      setSetupState({ provider, qrUrl: res?.qrUrl || "", code: "", busy: false });
      toast.success(`${PROVIDER_LABEL[res?.provider || provider] || "Authenticator"} QR generated`);
    } catch (e) {
      setSetupState({ provider: "", qrUrl: "", code: "", busy: false });
      toast.error(e?.message || "Failed to initialize authenticator");
    }
  };

  const submitAuthenticatorCode = async () => {
    try {
      setSetupState((prev) => ({ ...prev, busy: true }));
      const res = await verifyAuthenticator(setupState.code);
      setAuthenticator(res || { enabled: true, provider: setupState.provider });
      setSetupState({ provider: "", qrUrl: "", code: "", busy: false });
      toast.success("Authenticator enabled");
    } catch (e) {
      setSetupState((prev) => ({ ...prev, busy: false }));
      toast.error(e?.message || "Invalid authenticator code");
    }
  };

  const removeAuthenticator = async () => {
    try {
      await disableAuthenticator();
      setAuthenticator({ enabled: false, provider: "", enrolledAtUtc: "" });
      setSetupState({ provider: "", qrUrl: "", code: "", busy: false });
      toast.success("Authenticator disabled");
    } catch (e) {
      toast.error(e?.message || "Failed to disable authenticator");
    }
  };

  return (
    <div className="space-y-6" data-testid="integrations-page">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Integrations</h1>
          <p className="text-slate-600">Platform-managed add-ons, security connectors, and public API access for project <strong>{session?.tenantSlug || "n/a"}</strong>.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full border-slate-200 px-3 py-1 text-slate-700">
            Tenant slug: {session?.tenantSlug || "n/a"}
          </Badge>
          <Button variant="outline" onClick={() => setDocViewer({ open: true, type: "sms" })}>
            <BookOpenText className="mr-2 h-4 w-4" />
            View API Docs
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {[
          { title: "Active Integrations", value: kpis.active, hint: "Currently visible and enabled", icon: Plug, tone: "bg-orange-50 text-orange-600" },
          { title: "Paid Add-ons", value: kpis.paid, hint: "Commercial integrations with pricing", icon: CreditCard, tone: "bg-blue-50 text-blue-600" },
          { title: "Security Options", value: kpis.security, hint: "Security category integrations", icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600" },
          { title: "2FA Enabled", value: kpis.enabledSecurity, hint: authenticator?.enabled ? `Using ${PROVIDER_LABEL[authenticator.provider] || authenticator.provider}` : "No authenticator enrolled", icon: LockKeyhole, tone: "bg-violet-50 text-violet-600" },
        ].map((item) => (
          <Card key={item.title} className="border-slate-200 shadow-sm">
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.title}</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{item.value}</p>
                <p className="mt-1 text-sm text-slate-500">{item.hint}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.4fr_1fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Integration Catalog</CardTitle>
            <CardDescription>{CATEGORY_META[category]?.hint || "Platform-managed integrations available to this tenant."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={category} onValueChange={setCategory}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                {categories.map((item) => (
                  <TabsTrigger key={item} value={item} className="rounded-full border border-slate-200 bg-white px-4 py-2 data-[state=active]:border-orange-200 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-600">
                    {categoryBadge(item)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={category} className="mt-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  {visibleItems.map((item) => {
                    const slug = String(item.slug || "");
                    const isSecurity = String(item.category || "").toLowerCase() === "security";
                    const isCurrentProvider = authenticator?.enabled && (
                      (slug === "google-authenticator" && authenticator.provider === "google_authenticator") ||
                      (slug === "microsoft-authenticator" && authenticator.provider === "microsoft_authenticator")
                    );
                    return (
                      <Card key={slug} className="border-slate-200 shadow-sm">
                        <CardContent className="p-5 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isSecurity ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-700"}`}>
                                {isSecurity ? <Shield className="h-5 w-5" /> : <Plug className="h-5 w-5" />}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-950">{item.name}</p>
                                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                              </div>
                            </div>
                            <Badge variant={item.isActive ? "outline" : "secondary"} className={item.isActive ? "border-emerald-200 text-emerald-700" : ""}>
                              {item.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{categoryBadge(item.category)}</Badge>
                            <Badge className={String(item.pricingType || "free") === "paid" ? "bg-orange-50 text-orange-700 hover:bg-orange-50" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"}>
                              {priceLabel(item)}
                            </Badge>
                          </div>

                          {isSecurity ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              {isCurrentProvider ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium text-slate-900">Authenticator enabled</p>
                                      <p className="text-sm text-slate-500">{PROVIDER_LABEL[authenticator.provider] || authenticator.provider}</p>
                                    </div>
                                    <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Enabled</Badge>
                                  </div>
                                  <Button variant="outline" className="w-full" onClick={removeAuthenticator}>Disable Authenticator</Button>
                                </div>
                              ) : setupState.provider === (slug === "google-authenticator" ? "google_authenticator" : "microsoft_authenticator") ? (
                                <div className="space-y-4">
                                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
                                    {setupState.qrUrl ? (
                                      <img src={setupState.qrUrl} alt="Authenticator QR" className="mx-auto h-56 w-56 object-contain" />
                                    ) : (
                                      <div className="flex h-56 items-center justify-center"><QrCode className="h-10 w-10 text-slate-400" /></div>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Verify 6-digit code</Label>
                                    <Input
                                      inputMode="numeric"
                                      maxLength={6}
                                      placeholder="Enter authenticator code"
                                      value={setupState.code}
                                      onChange={(e) => setSetupState((prev) => ({ ...prev, code: e.target.value }))}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button className="bg-orange-500 hover:bg-orange-600" disabled={setupState.busy} onClick={submitAuthenticatorCode}>Verify & Enable</Button>
                                    <Button variant="outline" disabled={setupState.busy} onClick={() => setSetupState({ provider: "", qrUrl: "", code: "", busy: false })}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <p className="text-sm text-slate-600">Scan a QR in {item.name} and verify the 6-digit code. Manual secret entry is not required.</p>
                                  <Button className="bg-orange-500 hover:bg-orange-600" disabled={setupState.busy || item.isActive === false} onClick={() => beginAuthenticatorSetup(slug === "google-authenticator" ? "google_authenticator" : "microsoft_authenticator")}>
                                    {setupState.busy ? "Preparing..." : `Set up ${item.name}`}
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div>
                                <p className="font-medium text-slate-900">{String(item.pricingType || "free") === "paid" ? "Commercial add-on" : "Included with platform"}</p>
                                <p className="text-sm text-slate-500">
                                  {String(item.pricingType || "free") === "paid"
                                    ? `Commercialized by platform owner as ${String(item.billingFrequency || "monthly").replace("_", " ")} add-on.`
                                    : "Activation and support are managed from the platform side."}
                                </p>
                              </div>
                              <ExternalLink className="h-5 w-5 text-slate-400" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {!catalogBusy && visibleItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No integrations available in this category.</div>
                ) : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Security Summary</CardTitle>
              <CardDescription>2FA enrollment and enforcement posture for this user session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">Authenticator status</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {authenticator?.enabled
                        ? `${PROVIDER_LABEL[authenticator.provider] || authenticator.provider} is active for this account.`
                        : "No authenticator is currently enabled."}
                    </p>
                  </div>
                  {authenticator?.enabled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <Shield className="h-5 w-5 text-slate-400" />}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">QR based onboarding</p>
                  <p className="mt-2 font-semibold text-slate-950">Enabled</p>
                  <p className="mt-1 text-sm text-slate-500">No manual secret display in the default flow.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Provider support</p>
                  <p className="mt-2 font-semibold text-slate-950">Google + Microsoft</p>
                  <p className="mt-1 text-sm text-slate-500">Both apps can scan the generated TOTP QR.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Documentation Center</CardTitle>
              <CardDescription>Professional API references for SMS and WhatsApp integrations, available directly inside the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">SMS API Reference</p>
                      <p className="mt-1 text-sm text-slate-500">Simple URL mode, DLT mapping, Tata flow, sender registry, template registry, webhook model, and production checklist.</p>
                    </div>
                    <FileText className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setDocViewer({ open: true, type: "sms" })}>Read in App</Button>
                    <Button variant="outline" onClick={() => window.open("/docs/sms-api-reference.html", "_blank", "noopener,noreferrer")}>Open Full Page</Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">WhatsApp API Reference</p>
                      <p className="mt-1 text-sm text-slate-500">Messaging, templates, media, webhook, flow builder, automation, smoke testing, diagnostics, and production operations.</p>
                    </div>
                    <FileText className="h-5 w-5 text-sky-500" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => setDocViewer({ open: true, type: "whatsapp" })}>Read in App</Button>
                    <Button variant="outline" onClick={() => window.open("/docs/whatsapp-api-reference.html", "_blank", "noopener,noreferrer")}>Open Full Page</Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">Documentation Index</p>
                      <p className="mt-1 text-slate-500">Use the documentation landing page for quick access to HTML references, markdown source, and Postman import files.</p>
                    </div>
                    <Button variant="outline" onClick={() => window.open("/docs/index.html", "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Index
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Public API Access</CardTitle>
              <CardDescription>Simple URL-based API credentials managed at platform level.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isSuperAdmin ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Public API credentials are controlled by platform owner. You can use project slug <strong>{session?.tenantSlug || "n/a"}</strong> and the documented URL format once credentials are shared with you.
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div>
                  <Label className="font-medium text-slate-900">Enable Public API</Label>
                  <p className="mt-1 text-sm text-slate-500">When disabled, public send endpoints reject requests.</p>
                </div>
                <Switch checked={apiConfig.enabled} onCheckedChange={(checked) => setApiConfig((prev) => ({ ...prev, enabled: checked }))} disabled={!isSuperAdmin} />
              </div>
              <div className="grid gap-4">
                {[
                  { label: "API Username", key: "apiUsername", visible: showApiUsername, setVisible: setShowApiUsername, regenerate: () => regenerateProtectedToken("API Username", () => setApiConfig((prev) => ({ ...prev, apiUsername: regenerateToken("tx_user_", 10) }))) },
                  { label: "API Password", key: "apiPassword", visible: showApiPassword, setVisible: setShowApiPassword, regenerate: () => regenerateProtectedToken("API Password", () => setApiConfig((prev) => ({ ...prev, apiPassword: regenerateToken("tx_pw_", 32) }))) },
                  { label: "API Key", key: "apiKey", visible: showApiKey, setVisible: setShowApiKey, regenerate: () => regenerateProtectedToken("API Key", () => setApiConfig((prev) => ({ ...prev, apiKey: regenerateToken("tx_live_sk_", 36) }))) },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{item.label}</Label>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={!isSuperAdmin} onClick={item.regenerate}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                        <Button size="sm" variant="outline" disabled={!apiConfig[item.key]} onClick={() => handleCopy(item.label, apiConfig[item.key])}><Key className="mr-2 h-4 w-4" />Copy</Button>
                        <Button size="icon" variant="outline" onClick={() => item.setVisible((prev) => !prev)}>{item.visible ? <BadgeCheck className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}</Button>
                      </div>
                    </div>
                    <Input
                      type={item.visible ? "text" : "password"}
                      value={apiConfig[item.key]}
                      onChange={(e) => setApiConfig((prev) => ({ ...prev, [item.key]: e.target.value }))}
                      disabled={!isSuperAdmin}
                    />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>IP Whitelist (optional)</Label>
                  <Input value={apiConfig.ipWhitelist} onChange={(e) => setApiConfig((prev) => ({ ...prev, ipWhitelist: e.target.value }))} disabled={!isSuperAdmin} placeholder="203.0.113.10, 198.51.100.0/24" />
                </div>
              </div>
              {isSuperAdmin ? (
                <Button className="w-full bg-orange-500 hover:bg-orange-600" disabled={savingApiConfig} onClick={saveApiIntegration}>
                  {savingApiConfig ? "Saving..." : "Save Public API Settings"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={docViewer.open} onOpenChange={(open) => setDocViewer((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-6xl border-slate-200 p-0 overflow-hidden">
          <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_60%,#f8fafc_100%)] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-950">
                  {docViewer.type === "sms" ? "SMS API Reference" : "WhatsApp API Reference"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-slate-600">
                  {docViewer.type === "sms"
                    ? "Reference for SMS public API, DLT registry, Tata mapping, sender setup, webhook flow, and production rollout."
                    : "Reference for WhatsApp messaging, templates, media, flow builder, webhook processing, diagnostics, and operational readiness."}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={docViewer.type === "sms" ? "default" : "outline"} className={docViewer.type === "sms" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setDocViewer({ open: true, type: "sms" })}>
                  SMS API
                </Button>
                <Button variant={docViewer.type === "whatsapp" ? "default" : "outline"} className={docViewer.type === "whatsapp" ? "bg-orange-500 hover:bg-orange-600" : ""} onClick={() => setDocViewer({ open: true, type: "whatsapp" })}>
                  WhatsApp API
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      docViewer.type === "sms" ? "/docs/sms-api-reference.html" : "/docs/whatsapp-api-reference.html",
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Full Page
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="h-[78vh] bg-slate-50">
            <iframe
              title={docViewer.type === "sms" ? "SMS API Reference" : "WhatsApp API Reference"}
              src={docViewer.type === "sms" ? "/docs/sms-api-reference.html" : "/docs/whatsapp-api-reference.html"}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsPage;
