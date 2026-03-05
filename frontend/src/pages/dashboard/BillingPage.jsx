import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CreditCard,
  Download,
  Check,
  Zap,
} from "lucide-react";
import {
  changeBillingPlan,
  cancelBillingSubscription,
  createRazorpayOrder,
  downloadAllBillingInvoices,
  downloadBillingInvoice,
  getBillingInvoices,
  getBillingDunningStatus,
  getBillingPaymentConfig,
  getBillingPlans,
  getBillingUsage,
  getPlatformSettings,
  getSession,
  getCompanySettings,
  getCurrentBillingPlan,
  verifyRazorpayPayment
} from "@/lib/api";
import { toast } from "sonner";

const BillingPage = () => {
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [usageValues, setUsageValues] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [dunningStatus, setDunningStatus] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [company, setCompany] = useState(null);
  const [platformBranding, setPlatformBranding] = useState(null);
  const [payingCode, setPayingCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, c, u, i, d] = await Promise.all([
          getBillingPlans(),
          getCurrentBillingPlan(),
          getBillingUsage(),
          getBillingInvoices(),
          getBillingDunningStatus().catch(() => null)
        ]);
        const companyCfg = await getCompanySettings().catch(() => null);
        const paymentCfg = await getBillingPaymentConfig().catch(() => null);
        const role = String(getSession()?.role || "").toLowerCase();
        const platformBrandingCfg = role === "super_admin"
          ? await getPlatformSettings("platform-branding").catch(() => null)
          : null;
        setPlans(Array.isArray(p) ? p : []);
        setSub(c || null);
        setUsageValues(u?.values || {});
        setInvoices(Array.isArray(i) ? i : []);
        setDunningStatus(d || null);
        setCompany(companyCfg || null);
        setPaymentConfig(paymentCfg);
        setPlatformBranding(platformBrandingCfg?.values || null);
      } catch (e) {
        toast.error(e.message || "Failed to load billing");
      }
    })();
  }, []);

  const currentPlan = sub?.plan || null;
  const companyName =
    String(company?.companyName || "").trim() ||
    String(platformBranding?.legalName || "").trim() ||
    String(platformBranding?.platformName || "").trim() ||
    "Your company";
  const billingAddressText =
    String(company?.address || "").trim() ||
    String(platformBranding?.address || "").trim();
  const billingEmail =
    String(company?.billingEmail || "").trim() ||
    String(platformBranding?.billingEmail || "").trim();
  const billingPhone =
    String(company?.billingPhone || "").trim() ||
    String(platformBranding?.billingPhone || "").trim();
  const gstin =
    String(company?.gstin || "").trim() ||
    String(platformBranding?.gstin || "").trim();
  const pct = (used, limit) => !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const usage = useMemo(() => {
    const limits = currentPlan?.limits || {};
    return {
      whatsapp: { used: usageValues.whatsappMessages || 0, limit: limits.whatsappMessages || 0, percentage: pct(usageValues.whatsappMessages || 0, limits.whatsappMessages || 0) },
      sms: { used: usageValues.smsCredits || 0, limit: limits.smsCredits || 0, percentage: pct(usageValues.smsCredits || 0, limits.smsCredits || 0) },
      contacts: { used: usageValues.contacts || 0, limit: limits.contacts || 0, percentage: pct(usageValues.contacts || 0, limits.contacts || 0) },
      team: { used: usageValues.teamMembers || 0, limit: limits.teamMembers || 0, percentage: pct(usageValues.teamMembers || 0, limits.teamMembers || 0) },
      flows: { used: usageValues.flows || 0, limit: limits.flows || 0, percentage: pct(usageValues.flows || 0, limits.flows || 0) },
      chatbots: { used: usageValues.chatbots || 0, limit: limits.chatbots || 0, percentage: pct(usageValues.chatbots || 0, limits.chatbots || 0) },
      apiCalls: { used: usageValues.apiCalls || 0, limit: limits.apiCalls || 0, percentage: pct(usageValues.apiCalls || 0, limits.apiCalls || 0) }
    };
  }, [currentPlan, usageValues]);
  const usageGroups = useMemo(() => ([
    {
      key: "messaging",
      title: "Messaging Usage",
      subtitle: "WhatsApp and SMS consumption",
      action: "Upgrade Plan",
      items: [
        { key: "whatsapp", label: "WhatsApp Messages", suffix: "messages" },
        { key: "sms", label: "SMS Credits", suffix: "credits" },
      ],
    },
    {
      key: "platform",
      title: "Platform Usage",
      subtitle: "Team and automation resources",
      action: "Contact Sales",
      items: [
        { key: "contacts", label: "Contacts", suffix: "contacts" },
        { key: "team", label: "Team Members", suffix: "members" },
        { key: "flows", label: "Flows", suffix: "flows" },
        { key: "chatbots", label: "Chatbots", suffix: "bots" },
        { key: "apiCalls", label: "API Calls", suffix: "calls" },
      ],
    },
  ]), []);

  const dunningBadgeClass = useMemo(() => {
    const status = String(dunningStatus?.subscription?.status || "").toLowerCase();
    if (status === "active") return "bg-green-100 text-green-700 hover:bg-green-100";
    if (status === "past_due") return "bg-yellow-100 text-yellow-700 hover:bg-yellow-100";
    if (status === "suspended") return "bg-red-100 text-red-700 hover:bg-red-100";
    return "bg-slate-100 text-slate-700 hover:bg-slate-100";
  }, [dunningStatus]);

  const ensureRazorpayScript = async () => {
    if (window.Razorpay) return true;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-razorpay-sdk="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpaySdk = "1";
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
      document.body.appendChild(script);
    });
    return !!window.Razorpay;
  };

  const refreshBillingData = async () => {
    const [c, u, i] = await Promise.all([
      getCurrentBillingPlan(),
      getBillingUsage(),
      getBillingInvoices()
    ]);
    setSub(c || null);
    setUsageValues(u?.values || {});
    setInvoices(Array.isArray(i) ? i : []);
  };

  const upgradeWithRazorpay = async (plan) => {
    setPayingCode(plan.code);
    try {
      const cfg = paymentConfig;
      if (!cfg?.razorpay?.enabled || !cfg?.razorpay?.keyId) throw new Error("Razorpay is not configured.");
      const order = await createRazorpayOrder(plan.code, "monthly");
      await ensureRazorpayScript();

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          order_id: order.orderId,
          name: "Textzy",
          description: `${plan.name} plan upgrade`,
          handler: async function (resp) {
            try {
              await verifyRazorpayPayment({
                planCode: plan.code,
                billingCycle: "monthly",
                razorpayOrderId: resp.razorpay_order_id,
                razorpayPaymentId: resp.razorpay_payment_id,
                razorpaySignature: resp.razorpay_signature
              });
              resolve(true);
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled."))
          },
          theme: { color: "#f97316" }
        });
        rzp.open();
      });

      toast.success("Payment successful. Plan updated.");
      await refreshBillingData();
      setShowUpgradeDialog(false);
    } catch (e) {
      toast.error(e?.message || "Payment failed");
    } finally {
      setPayingCode("");
    }
  };

  const triggerBlobDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadInvoice = async (invoice) => {
    try {
      const blob = await downloadBillingInvoice(invoice.id);
      const name = `${invoice.invoiceNo || invoice.id || "invoice"}.html`;
      triggerBlobDownload(blob, name);
    } catch (e) {
      toast.error(e?.message || "Failed to download invoice");
    }
  };

  const handleDownloadAllInvoices = async () => {
    try {
      const blob = await downloadAllBillingInvoices();
      triggerBlobDownload(blob, "textzy-invoices.csv");
    } catch (e) {
      toast.error(e?.message || "Failed to download invoices");
    }
  };

  return (
    <div className="space-y-6" data-testid="billing-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Billing</h1>
          <p className="text-slate-600">Manage your subscription and billing details</p>
        </div>
        <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="upgrade-plan-btn">
              <Zap className="w-4 h-4" />
              Upgrade Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Choose Your Plan</DialogTitle>
              <DialogDescription>
                Select the plan that best fits your needs
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="grid md:grid-cols-3 gap-4">
                {plans.map((plan, index) => (
                  <Card
                    key={index}
                    className={`border-slate-200 relative ${
                      currentPlan?.code === plan.code ? "border-2 border-orange-500" : ""
                    } ${index === 1 ? "shadow-glow" : ""}`}
                  >
                    {index === 1 && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-orange-500 text-white hover:bg-orange-500">Most Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="pt-8">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="mt-2">
                        <span className="text-3xl font-bold text-slate-900">₹{Number(plan.priceMonthly || 0).toLocaleString()}</span>
                        <span className="text-slate-500">/month</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 mb-6">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                            <Check className="w-4 h-4 text-green-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full ${
                          currentPlan?.code === plan.code
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-orange-500 hover:bg-orange-600 text-white"
                        }`}
                        disabled={currentPlan?.code === plan.code}
                        onClick={async () => {
                          if (currentPlan?.code === plan.code) return;
                          if (plan.code === "enterprise") return toast.info("Contact sales for enterprise.");
                          try {
                            if ((paymentConfig?.provider || "").toLowerCase() === "razorpay" && paymentConfig?.razorpay?.enabled) {
                              await upgradeWithRazorpay(plan);
                              return;
                            }
                            await changeBillingPlan(plan.code, "monthly");
                            toast.success("Plan changed");
                            await refreshBillingData();
                            setShowUpgradeDialog(false);
                          } catch (e) {
                            toast.error(e?.message || "Failed to change plan");
                          }
                        }}
                      >
                        {currentPlan?.code === plan.code
                          ? "Current Plan"
                          : plan.code === "enterprise"
                          ? "Contact Sales"
                          : payingCode === plan.code
                          ? "Processing..."
                          : (paymentConfig?.provider || "").toLowerCase() === "razorpay" && paymentConfig?.razorpay?.enabled
                          ? "Pay & Upgrade"
                          : "Upgrade"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Plan Card */}
      <Card className="border-slate-200 border-l-4 border-l-orange-500">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-orange-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-slate-900">{currentPlan?.name || "Plan"} Plan</h3>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                </div>
                <p className="text-slate-600">
                  ₹{Number(currentPlan?.priceMonthly || 0).toLocaleString()}/month • Renews on {sub?.subscription?.renewAtUtc ? new Date(sub.subscription.renewAtUtc).toLocaleDateString() : "-"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" data-testid="change-plan-btn" onClick={() => setShowUpgradeDialog(true)}>Change Plan</Button>
              <Button variant="outline" className="text-red-600 hover:text-red-700" data-testid="cancel-plan-btn" onClick={async () => {
                try {
                  await cancelBillingSubscription();
                  toast.success("Subscription cancelled");
                  setSub(await getCurrentBillingPlan());
                } catch {
                  toast.error("Failed to cancel subscription");
                }
              }}>
                Cancel Subscription
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dunning Status */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Billing Health</CardTitle>
          <CardDescription>Renewal and grace timeline</CardDescription>
        </CardHeader>
        <CardContent>
          {!dunningStatus?.hasSubscription ? (
            <div className="text-sm text-slate-600">No active subscription record found.</div>
          ) : (
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">Status</div>
                <Badge className={dunningBadgeClass}>{dunningStatus?.subscription?.status || "unknown"}</Badge>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">Days To Renewal</div>
                <div className="text-xl font-semibold text-slate-900">{Number(dunningStatus?.dunning?.daysToRenew || 0)}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">Past Due Days</div>
                <div className="text-xl font-semibold text-slate-900">{Number(dunningStatus?.dunning?.daysPastDue || 0)}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 mb-2">Grace Days Left</div>
                <div className="text-xl font-semibold text-slate-900">{Number(dunningStatus?.dunning?.graceDaysLeft || 0)}</div>
              </div>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 md:col-span-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-600">Next Action:</span>
                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                  {dunningStatus?.dunning?.nextAction || "none"}
                </Badge>
                <span className="text-xs text-slate-600">
                  Renew At: {dunningStatus?.subscription?.renewAtUtc ? new Date(dunningStatus.subscription.renewAtUtc).toLocaleString() : "-"}
                </span>
                <span className="text-xs text-slate-600">
                  Grace Deadline: {dunningStatus?.dunning?.graceDeadlineUtc ? new Date(dunningStatus.dunning.graceDeadlineUtc).toLocaleString() : "-"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Section */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>Your usage for this billing period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {usageGroups.map((group) => (
              <div key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="mb-3">
                  <h4 className="text-xl font-semibold text-slate-900">{group.title}</h4>
                  <p className="text-sm text-slate-500">{group.subtitle}</p>
                </div>
                <div className="space-y-4">
                  {group.items.map((item) => {
                    const row = usage[item.key];
                    const used = Number(row?.used || 0);
                    const limit = Number(row?.limit || 0);
                    const ratio = Math.max(0, Math.min(100, Number(row?.percentage || 0)));
                    const limitLabel = limit > 0 ? limit.toLocaleString() : "8";
                    return (
                      <div key={`${group.key}-${item.key}`}>
                        <div className="flex items-end justify-between gap-3">
                          <div className="text-[15px] leading-5 font-medium text-slate-800">{item.label}</div>
                          <div className="text-right text-[22px] leading-6 font-semibold text-slate-900">
                            {used.toLocaleString()} / {limitLabel}
                          </div>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all duration-300"
                            style={{ width: `${Math.max(2, ratio)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" className="mt-5 w-full rounded-xl border-slate-300 bg-slate-100 hover:bg-slate-200">
                  {group.action}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-orange-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-medium text-slate-900">Need more capacity?</p>
                <p className="text-sm text-slate-600">Upgrade to Enterprise for unlimited messages</p>
              </div>
            </div>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              Contact Sales
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method & Invoices */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Payment Method */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Your default payment method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg flex items-center gap-4">
              <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center text-white text-xs font-bold uppercase">
                {(paymentConfig?.provider || "na").slice(0, 4)}
              </div>
              <div>
                <p className="font-medium text-slate-900">
                  {(paymentConfig?.provider || "Not configured").toUpperCase()}
                  {paymentConfig?.razorpay?.keyId ? " | Key configured" : " | Key missing"}
                </p>
                <p className="text-sm text-slate-500">
                  Mode: {(paymentConfig?.mode || "test").toUpperCase()}
                </p>
              </div>
            </div>
            <Button variant="outline" className="w-full" data-testid="update-payment-btn" onClick={() => toast.info("Open Platform Settings -> Payment Gateway")}>
              Open Payment Setup
            </Button>
          </CardContent>
        </Card>

        {/* Billing Address */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Billing Address</CardTitle>
            <CardDescription>Your billing information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-600 space-y-1">
              <p className="font-medium text-slate-900">{companyName}</p>
              <p>{billingAddressText || "Address not configured"}</p>
              <p>{billingEmail || "Billing email not configured"}</p>
              <p>{billingPhone || "Billing phone not configured"}</p>
              <p className="pt-2">GSTIN: {gstin || "-"}</p>
            </div>
            <Button variant="outline" className="w-full" data-testid="update-address-btn" onClick={() => toast.info("Open Dashboard Settings -> Company")}>
              Open Company Settings
            </Button>
          </CardContent>
        </Card>
        {/* Quick Stats */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>This Month</CardTitle>
            <CardDescription>Current billing period stats</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Plan Cost</span>
              <span className="font-medium text-slate-900">₹{Number(currentPlan?.priceMonthly || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Additional SMS</span>
              <span className="font-medium text-slate-900">₹0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Taxes (18% GST)</span>
              <span className="font-medium text-slate-900">₹{Math.round(Number(currentPlan?.priceMonthly || 0) * 0.18).toLocaleString()}</span>
            </div>
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
              <span className="font-medium text-slate-900">Total</span>
              <span className="text-xl font-bold text-slate-900">₹{Math.round(Number(currentPlan?.priceMonthly || 0) * 1.18).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices */}
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>Download your past invoices</CardDescription>
            </div>
            <Button variant="outline" className="gap-2" data-testid="download-all-invoices-btn" onClick={handleDownloadAllInvoices}>
              <Download className="w-4 h-4" />
              Download All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id || invoice.invoiceNo}>
                  <TableCell className="font-medium">{invoice.invoiceNo || invoice.id}</TableCell>
                  <TableCell className="text-slate-600">{invoice.createdAtUtc ? new Date(invoice.createdAtUtc).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="text-slate-900">₹{Number(invoice.total || 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1" data-testid={`download-invoice-${invoice.invoiceNo || invoice.id}`} onClick={() => handleDownloadInvoice(invoice)}>
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
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

export default BillingPage;

