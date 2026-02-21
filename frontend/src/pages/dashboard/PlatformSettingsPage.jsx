import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getPlatformSettings, savePlatformSettings, getPlatformWebhookLogs, listPaymentWebhooks, autoCreatePaymentWebhook, upsertPaymentWebhook, listPlatformBillingPlans, createPlatformBillingPlan, updatePlatformBillingPlan, archivePlatformBillingPlan } from "@/lib/api";

const FEATURE_CATALOG = [
  "WhatsApp Business API",
  "SMS Broadcast",
  "Unified Inbox",
  "Automation Builder",
  "Flow Builder",
  "Template Manager",
  "Analytics Dashboard",
  "Priority Support",
  "Dedicated Manager",
  "API Access",
  "Webhook Access",
  "Custom Integrations",
  "Team Collaboration",
  "Role-based Access",
];

const DEFAULT_LIMITS = {
  contacts: 50000,
  teamMembers: 10,
  smsCredits: 50000,
  whatsappMessages: 10000,
  chatbots: 5,
  flows: 50,
  apiCalls: 100000,
};

const PlatformSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "waba-master";
  const [gateway, setGateway] = useState("razorpay");
  const [waba, setWaba] = useState({ appId: "", appSecret: "", verifyToken: "", webhookUrl: "" });
  const [payment, setPayment] = useState({ provider: "razorpay", merchantId: "", keyId: "", keySecret: "", webhookSecret: "" });
  const [webhookItems, setWebhookItems] = useState([]);
  const [webhookEdit, setWebhookEdit] = useState({ provider: "razorpay", endpointUrl: "", webhookId: "", eventsCsv: "" });
  const [logs, setLogs] = useState([]);
  const [logProvider, setLogProvider] = useState("");
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState({
    id: "",
    code: "",
    name: "",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "INR",
    isActive: true,
    sortOrder: 1,
    features: [],
    customFeature: "",
    limits: { ...DEFAULT_LIMITS }
  });
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (tab === "payment-gateway" ? "Payment Gateway Setup" : tab === "webhook-logs" ? "Webhook Logs" : tab === "billing-plans" ? "Billing Plans" : "Waba Master Config"),
    [tab],
  );

  const setTab = (next) => setSearchParams({ tab: next });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        if (tab === "waba-master") {
          const res = await getPlatformSettings("waba-master");
          const values = res?.values || {};
          if (!active) return;
          setWaba({
            appId: values.appId || "",
            appSecret: values.appSecret || "",
            verifyToken: values.verifyToken || "",
            webhookUrl: values.webhookUrl || "",
          });
        } else if (tab === "payment-gateway") {
          const res = await getPlatformSettings("payment-gateway");
          const values = res?.values || {};
          if (!active) return;
          const p = values.provider || "razorpay";
          setGateway(p);
          setPayment({
            provider: p,
            merchantId: values.merchantId || "",
            keyId: values.keyId || "",
            keySecret: values.keySecret || "",
            webhookSecret: values.webhookSecret || "",
          });
          const hooks = await listPaymentWebhooks().catch(() => []);
          if (!active) return;
          setWebhookItems(hooks || []);
          const selected = (hooks || []).find((x) => x.provider === p) || null;
          setWebhookEdit({
            provider: p,
            endpointUrl: selected?.endpointUrl || "",
            webhookId: selected?.webhookId || "",
            eventsCsv: selected?.eventsCsv || "payment.captured,payment.failed",
          });
        } else {
          if (tab === "billing-plans") {
            const rows = await listPlatformBillingPlans();
            if (!active) return;
            setPlans(rows || []);
          } else {
            const res = await getPlatformWebhookLogs({ provider: logProvider, limit: 100 });
            if (!active) return;
            setLogs(res || []);
          }
        }
      } catch {
        if (active) toast.error("Failed to load platform settings");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [tab, logProvider]);

  return (
    <div className="space-y-4" data-testid="platform-settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">Platform owner level global configuration.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "waba-master" ? "default" : "outline"}
            className={tab === "waba-master" ? "bg-orange-500 hover:bg-orange-600" : ""}
            onClick={() => setTab("waba-master")}
          >
            Waba Master Config
          </Button>
          <Button
            variant={tab === "payment-gateway" ? "default" : "outline"}
            className={tab === "payment-gateway" ? "bg-orange-500 hover:bg-orange-600" : ""}
            onClick={() => setTab("payment-gateway")}
          >
            Payment Gateway Setup
          </Button>
          <Button
            variant={tab === "webhook-logs" ? "default" : "outline"}
            className={tab === "webhook-logs" ? "bg-orange-500 hover:bg-orange-600" : ""}
            onClick={() => setTab("webhook-logs")}
          >
            Webhook Logs
          </Button>
          <Button
            variant={tab === "billing-plans" ? "default" : "outline"}
            className={tab === "billing-plans" ? "bg-orange-500 hover:bg-orange-600" : ""}
            onClick={() => setTab("billing-plans")}
          >
            Billing Plans
          </Button>
        </div>
      </div>

      {tab === "waba-master" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Meta App Credentials</CardTitle>
            <CardDescription>Used for embedded signup and tenant onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="app-id">Meta App ID</Label>
              <Input id="app-id" placeholder="Enter app id" value={waba.appId} onChange={(e) => setWaba((p) => ({ ...p, appId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-secret">Meta App Secret</Label>
              <Input id="app-secret" type="password" placeholder="Enter app secret" value={waba.appSecret} onChange={(e) => setWaba((p) => ({ ...p, appSecret: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-token">Webhook Verify Token</Label>
              <Input id="verify-token" placeholder="Enter verify token" value={waba.verifyToken} onChange={(e) => setWaba((p) => ({ ...p, verifyToken: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook Callback URL</Label>
              <Input id="webhook-url" placeholder="https://your-api.com/api/waba/webhook" value={waba.webhookUrl} onChange={(e) => setWaba((p) => ({ ...p, webhookUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" disabled={loading} onClick={async () => {
                try {
                  setLoading(true);
                  await savePlatformSettings("waba-master", waba);
                  toast.success("WABA master config saved");
                } catch {
                  toast.error("Failed to save WABA settings");
                } finally {
                  setLoading(false);
                }
              }}>
                Save
              </Button>
              <Button variant="outline" onClick={() => toast.info("Webhook verification requested")}>
                Test Webhook
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "payment-gateway" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Gateway Credentials</CardTitle>
            <CardDescription>Configure payments for subscription and usage billing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={gateway} onValueChange={(v) => {
                setGateway(v);
                const selected = (webhookItems || []).find((x) => x.provider === v) || null;
                setWebhookEdit({
                  provider: v,
                  endpointUrl: selected?.endpointUrl || "",
                  webhookId: selected?.webhookId || "",
                  eventsCsv: selected?.eventsCsv || "payment.captured,payment.failed",
                });
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="razorpay">Razorpay</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="cashfree">Cashfree</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-id">Merchant ID</Label>
              <Input id="merchant-id" placeholder="Enter merchant id" value={payment.merchantId} onChange={(e) => setPayment((p) => ({ ...p, merchantId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-id">Key ID</Label>
              <Input id="key-id" placeholder="Enter key id" value={payment.keyId} onChange={(e) => setPayment((p) => ({ ...p, keyId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-secret">Key Secret</Label>
              <Input id="key-secret" type="password" placeholder="Enter key secret" value={payment.keySecret} onChange={(e) => setPayment((p) => ({ ...p, keySecret: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pg-webhook">Webhook Secret</Label>
              <Input id="pg-webhook" type="password" placeholder="Enter payment webhook secret" value={payment.webhookSecret} onChange={(e) => setPayment((p) => ({ ...p, webhookSecret: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" disabled={loading} onClick={async () => {
                try {
                  setLoading(true);
                  await savePlatformSettings("payment-gateway", { ...payment, provider: gateway });
                  toast.success("Payment gateway config saved");
                } catch {
                  toast.error("Failed to save payment settings");
                } finally {
                  setLoading(false);
                }
              }}>
                Save
              </Button>
              <Button variant="outline" onClick={() => toast.info("Payment gateway test initiated")}>
                Test Connection
              </Button>
            </div>
            <div className="md:col-span-2 rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">Webhook Auto-Create</p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const res = await autoCreatePaymentWebhook(gateway);
                      const cfg = res?.config;
                      if (cfg) {
                        setWebhookEdit({
                          provider: cfg.provider || gateway,
                          endpointUrl: cfg.endpointUrl || "",
                          webhookId: cfg.webhookId || "",
                          eventsCsv: cfg.eventsCsv || "",
                        });
                      }
                      const hooks = await listPaymentWebhooks();
                      setWebhookItems(hooks || []);
                      toast.success(res?.exists ? "Webhook already exists." : "Webhook endpoint auto-created.");
                    } catch {
                      toast.error("Failed to auto-create webhook.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Auto Create Webhook
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Endpoint URL</Label>
                  <Input value={webhookEdit.endpointUrl} onChange={(e) => setWebhookEdit((p) => ({ ...p, endpointUrl: e.target.value }))} placeholder="https://api.yourapp.com/api/payments/webhook/razorpay" />
                </div>
                <div className="space-y-2">
                  <Label>Webhook ID (if created in gateway)</Label>
                  <Input value={webhookEdit.webhookId} onChange={(e) => setWebhookEdit((p) => ({ ...p, webhookId: e.target.value }))} placeholder="wh_..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subscribed Events (comma-separated)</Label>
                <Input value={webhookEdit.eventsCsv} onChange={(e) => setWebhookEdit((p) => ({ ...p, eventsCsv: e.target.value }))} placeholder="payment.captured,payment.failed,refund.processed" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await upsertPaymentWebhook({ ...webhookEdit, provider: gateway });
                      setWebhookItems(await listPaymentWebhooks());
                      toast.success("Webhook config saved.");
                    } catch {
                      toast.error("Failed to save webhook config.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Save Webhook Details
                </Button>
              </div>
              <div className="rounded-md border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Provider</th>
                      <th className="px-2 py-1.5 text-left">Endpoint</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookItems.map((w) => (
                      <tr key={`${w.provider}-${w.endpointUrl}`} className="border-t border-slate-100">
                        <td className="px-2 py-1.5">{w.provider}</td>
                        <td className="px-2 py-1.5 truncate max-w-[420px]">{w.endpointUrl || "-"}</td>
                        <td className="px-2 py-1.5">{w.isAutoCreated ? "Auto" : "Manual"}</td>
                      </tr>
                    ))}
                    {webhookItems.length === 0 ? (
                      <tr><td className="px-2 py-2 text-slate-500" colSpan={3}>No webhook configured yet.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "webhook-logs" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Unified Webhook Logs</CardTitle>
            <CardDescription>WABA + Payment webhook events in one stream.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={logProvider || "all"} onValueChange={(v) => setLogProvider(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="meta">Meta / WABA</SelectItem>
                  <SelectItem value="razorpay">Razorpay</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="cashfree">Cashfree</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={async () => setLogs(await getPlatformWebhookLogs({ provider: logProvider, limit: 100 }))}>Refresh</Button>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Action</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((x) => (
                    <tr key={x.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 text-slate-900">{x.action}</td>
                      <td className="px-3 py-2 text-slate-600">{x.details}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">No webhook logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "billing-plans" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Plan Management</CardTitle>
            <CardDescription>Create and manage platform plans with limits for contacts, team, sms, chatbot, flowbuilder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Code</Label><Input value={planForm.code} onChange={(e) => setPlanForm((p) => ({ ...p, code: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Name</Label><Input value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Currency</Label><Input value={planForm.currency} onChange={(e) => setPlanForm((p) => ({ ...p, currency: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Monthly Price</Label><Input type="number" value={planForm.priceMonthly} onChange={(e) => setPlanForm((p) => ({ ...p, priceMonthly: Number(e.target.value || 0) }))} /></div>
              <div className="space-y-1"><Label>Yearly Price</Label><Input type="number" value={planForm.priceYearly} onChange={(e) => setPlanForm((p) => ({ ...p, priceYearly: Number(e.target.value || 0) }))} /></div>
              <div className="space-y-1"><Label>Sort Order</Label><Input type="number" value={planForm.sortOrder} onChange={(e) => setPlanForm((p) => ({ ...p, sortOrder: Number(e.target.value || 1) }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Features</Label>
              <div className="grid gap-2 md:grid-cols-3">
                {FEATURE_CATALOG.map((feature) => {
                  const selected = planForm.features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-orange-300 bg-orange-50 text-orange-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-orange-200"
                      }`}
                      onClick={() =>
                        setPlanForm((p) => ({
                          ...p,
                          features: selected ? p.features.filter((f) => f !== feature) : [...p.features, feature],
                        }))
                      }
                    >
                      {feature}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom feature"
                  value={planForm.customFeature}
                  onChange={(e) => setPlanForm((p) => ({ ...p, customFeature: e.target.value }))}
                />
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    const value = (planForm.customFeature || "").trim();
                    if (!value) return;
                    if (planForm.features.includes(value)) {
                      setPlanForm((p) => ({ ...p, customFeature: "" }));
                      return;
                    }
                    setPlanForm((p) => ({ ...p, features: [...p.features, value], customFeature: "" }));
                  }}
                >
                  Add
                </Button>
              </div>
              {planForm.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {planForm.features.map((f) => (
                    <span key={f} className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700">
                      {f}
                      <button
                        type="button"
                        className="text-orange-500 hover:text-orange-700"
                        onClick={() => setPlanForm((p) => ({ ...p, features: p.features.filter((x) => x !== f) }))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Plan Limits</Label>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Contacts</Label>
                  <Input type="number" value={planForm.limits.contacts ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, contacts: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Team Members</Label>
                  <Input type="number" value={planForm.limits.teamMembers ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, teamMembers: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">SMS Credits</Label>
                  <Input type="number" value={planForm.limits.smsCredits ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, smsCredits: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">WhatsApp Messages</Label>
                  <Input type="number" value={planForm.limits.whatsappMessages ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, whatsappMessages: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Chatbots</Label>
                  <Input type="number" value={planForm.limits.chatbots ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, chatbots: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Flows</Label>
                  <Input type="number" value={planForm.limits.flows ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, flows: Number(e.target.value || 0) } }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">API Calls</Label>
                  <Input type="number" value={planForm.limits.apiCalls ?? 0} onChange={(e) => setPlanForm((p) => ({ ...p, limits: { ...p.limits, apiCalls: Number(e.target.value || 0) } }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={async () => {
                try {
                  const payload = {
                    code: planForm.code,
                    name: planForm.name,
                    priceMonthly: planForm.priceMonthly,
                    priceYearly: planForm.priceYearly,
                    currency: planForm.currency,
                    isActive: planForm.isActive,
                    sortOrder: planForm.sortOrder,
                    features: (planForm.features || []).filter(Boolean),
                    limits: planForm.limits || {}
                  };
                  if (planForm.id) await updatePlatformBillingPlan(planForm.id, payload);
                  else await createPlatformBillingPlan(payload);
                  toast.success("Plan saved");
                  setPlans(await listPlatformBillingPlans());
                  setPlanForm({ id: "", code: "", name: "", priceMonthly: 0, priceYearly: 0, currency: "INR", isActive: true, sortOrder: 1, features: [], customFeature: "", limits: { ...DEFAULT_LIMITS } });
                } catch {
                  toast.error("Failed to save plan");
                }
              }}>{planForm.id ? "Update Plan" : "Create Plan"}</Button>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Monthly</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{p.code}</td>
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">{p.currency} {Number(p.priceMonthly || 0).toLocaleString()}</td>
                      <td className="px-3 py-2">{p.isActive ? "Active" : "Archived"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" className="mr-2" onClick={() => setPlanForm({
                          id: p.id,
                          code: p.code,
                          name: p.name,
                          priceMonthly: p.priceMonthly || 0,
                          priceYearly: p.priceYearly || 0,
                          currency: p.currency || "INR",
                          isActive: !!p.isActive,
                          sortOrder: p.sortOrder || 1,
                          features: Array.isArray(p.features) ? p.features : [],
                          customFeature: "",
                          limits: { ...DEFAULT_LIMITS, ...(p.limits || {}) }
                        })}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={async () => {
                          try { await archivePlatformBillingPlan(p.id); setPlans(await listPlatformBillingPlans()); toast.success("Plan archived"); } catch { toast.error("Archive failed"); }
                        }}>Archive</Button>
                      </td>
                    </tr>
                  ))}
                  {plans.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No plans</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PlatformSettingsPage;
