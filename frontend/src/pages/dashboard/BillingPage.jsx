import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreditCard,
  Download,
  Check,
  Zap,
  MessageSquare,
  Users,
  BarChart3,
  ArrowRight,
  Calendar,
  Receipt,
  AlertTriangle,
} from "lucide-react";

const BillingPage = () => {
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const currentPlan = {
    name: "Growth",
    price: "₹9,999",
    period: "month",
    renewalDate: "Feb 15, 2024",
  };

  const usage = {
    whatsapp: { used: 7234, limit: 10000, percentage: 72 },
    sms: { used: 32100, limit: 50000, percentage: 64 },
    contacts: { used: 8456, limit: 50000, percentage: 17 },
    team: { used: 6, limit: 10, percentage: 60 },
  };

  const invoices = [
    { id: "INV-2024-001", date: "Jan 15, 2024", amount: "₹9,999", status: "paid" },
    { id: "INV-2023-012", date: "Dec 15, 2023", amount: "₹9,999", status: "paid" },
    { id: "INV-2023-011", date: "Nov 15, 2023", amount: "₹9,999", status: "paid" },
    { id: "INV-2023-010", date: "Oct 15, 2023", amount: "₹2,999", status: "paid" },
    { id: "INV-2023-009", date: "Sep 15, 2023", amount: "₹2,999", status: "paid" },
  ];

  const plans = [
    {
      name: "Starter",
      price: "₹2,999",
      period: "/month",
      features: [
        "1,000 WhatsApp messages",
        "5,000 SMS credits",
        "2 Team members",
        "Basic analytics",
        "Email support",
      ],
      current: false,
    },
    {
      name: "Growth",
      price: "₹9,999",
      period: "/month",
      features: [
        "10,000 WhatsApp messages",
        "50,000 SMS credits",
        "10 Team members",
        "Advanced analytics",
        "Priority support",
        "Automation builder",
        "Custom templates",
      ],
      current: true,
      popular: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      features: [
        "Unlimited messages",
        "Custom SMS rates",
        "Unlimited team members",
        "Dedicated account manager",
        "SLA guarantee",
        "Custom integrations",
        "On-premise deployment",
      ],
      current: false,
    },
  ];

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
                      plan.current ? "border-2 border-orange-500" : ""
                    } ${plan.popular ? "shadow-glow" : ""}`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-orange-500 text-white hover:bg-orange-500">Most Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="pt-8">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="mt-2">
                        <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                        <span className="text-slate-500">{plan.period}</span>
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
                          plan.current
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-orange-500 hover:bg-orange-600 text-white"
                        }`}
                        disabled={plan.current}
                      >
                        {plan.current ? "Current Plan" : plan.name === "Enterprise" ? "Contact Sales" : "Upgrade"}
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
                  <h3 className="text-xl font-semibold text-slate-900">{currentPlan.name} Plan</h3>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                </div>
                <p className="text-slate-600">
                  {currentPlan.price}/{currentPlan.period} • Renews on {currentPlan.renewalDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" data-testid="change-plan-btn">Change Plan</Button>
              <Button variant="outline" className="text-red-600 hover:text-red-700" data-testid="cancel-plan-btn">
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
              <span className="font-medium text-slate-900">₹9,999</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Additional SMS</span>
              <span className="font-medium text-slate-900">₹0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Taxes (18% GST)</span>
              <span className="font-medium text-slate-900">₹1,800</span>
            </div>
            <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
              <span className="font-medium text-slate-900">Total</span>
              <span className="text-xl font-bold text-slate-900">₹11,799</span>
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
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.id}</TableCell>
                  <TableCell className="text-slate-600">{invoice.date}</TableCell>
                  <TableCell className="text-slate-900">{invoice.amount}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="gap-1" data-testid={`download-invoice-${invoice.id}`}>
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
