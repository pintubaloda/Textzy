import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  MessageSquare,
  Users,
  AlertTriangle,
} from "lucide-react";
import { changeBillingPlan, cancelBillingSubscription, getBillingInvoices, getBillingPlans, getBillingUsage, getCurrentBillingPlan } from "@/lib/api";
import { toast } from "sonner";

const BillingPage = () => {
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [usageValues, setUsageValues] = useState({});
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, c, u, i] = await Promise.all([
          getBillingPlans(),
          getCurrentBillingPlan(),
          getBillingUsage(),
          getBillingInvoices()
        ]);
        setPlans(Array.isArray(p) ? p : []);
        setSub(c || null);
        setUsageValues(u?.values || {});
        setInvoices(Array.isArray(i) ? i : []);
      } catch (e) {
        toast.error(e.message || "Failed to load billing");
      }
    })();
  }, []);

  const currentPlan = sub?.plan || null;
  const limits = currentPlan?.limits || {};
  const pct = (used, limit) => !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const usage = useMemo(() => ({
    whatsapp: { used: usageValues.whatsappMessages || 0, limit: limits.whatsappMessages || 0, percentage: pct(usageValues.whatsappMessages || 0, limits.whatsappMessages || 0) },
    sms: { used: usageValues.smsCredits || 0, limit: limits.smsCredits || 0, percentage: pct(usageValues.smsCredits || 0, limits.smsCredits || 0) },
    contacts: { used: usageValues.contacts || 0, limit: limits.contacts || 0, percentage: pct(usageValues.contacts || 0, limits.contacts || 0) },
    team: { used: usageValues.teamMembers || 0, limit: limits.teamMembers || 0, percentage: pct(usageValues.teamMembers || 0, limits.teamMembers || 0) }
  }), [usageValues, limits]);

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
                            await changeBillingPlan(plan.code, "monthly");
                            toast.success("Plan changed");
                            setSub(await getCurrentBillingPlan());
                            setShowUpgradeDialog(false);
                          } catch {
                            toast.error("Failed to change plan");
                          }
                        }}
                      >
                        {currentPlan?.code === plan.code ? "Current Plan" : plan.code === "enterprise" ? "Contact Sales" : "Upgrade"}
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

      {/* Usage Section */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Current Usage</CardTitle>
          <CardDescription>Your usage for this billing period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-slate-700">WhatsApp Messages</span>
                </div>
                <span className="text-sm text-slate-600">{usage.whatsapp.percentage}%</span>
              </div>
              <Progress value={usage.whatsapp.percentage} className="h-2" />
              <p className="text-xs text-slate-500">
                {usage.whatsapp.used.toLocaleString()} / {usage.whatsapp.limit.toLocaleString()} messages
              </p>
              {usage.whatsapp.percentage > 80 && (
                <div className="flex items-center gap-1 text-xs text-yellow-600">
                  <AlertTriangle className="w-3 h-3" />
                  Running low
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-slate-700">SMS Credits</span>
                </div>
                <span className="text-sm text-slate-600">{usage.sms.percentage}%</span>
              </div>
              <Progress value={usage.sms.percentage} className="h-2" />
              <p className="text-xs text-slate-500">
                {usage.sms.used.toLocaleString()} / {usage.sms.limit.toLocaleString()} credits
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">Contacts</span>
                </div>
                <span className="text-sm text-slate-600">{usage.contacts.percentage}%</span>
              </div>
              <Progress value={usage.contacts.percentage} className="h-2" />
              <p className="text-xs text-slate-500">
                {usage.contacts.used.toLocaleString()} / {usage.contacts.limit.toLocaleString()} contacts
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-slate-700">Team Members</span>
                </div>
                <span className="text-sm text-slate-600">{usage.team.percentage}%</span>
              </div>
              <Progress value={usage.team.percentage} className="h-2" />
              <p className="text-xs text-slate-500">
                {usage.team.used} / {usage.team.limit} members
              </p>
            </div>
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
              <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center text-white text-xs font-bold">
                VISA
              </div>
              <div>
                <p className="font-medium text-slate-900">•••• •••• •••• 4242</p>
                <p className="text-sm text-slate-500">Expires 12/26</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" data-testid="update-payment-btn">
              Update Payment Method
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
              <p className="font-medium text-slate-900">TechStart India Pvt. Ltd.</p>
              <p>123 Business Park, Sector 5</p>
              <p>Mumbai, Maharashtra 400001</p>
              <p>India</p>
              <p className="pt-2">GSTIN: 27XXXXX1234X1Z5</p>
            </div>
            <Button variant="outline" className="w-full" data-testid="update-address-btn">
              Update Address
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
            <Button variant="outline" className="gap-2" data-testid="download-all-invoices-btn">
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
                    <Button variant="ghost" size="sm" className="gap-1" data-testid={`download-invoice-${invoice.invoiceNo || invoice.id}`}>
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
