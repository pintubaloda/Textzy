import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const PlatformSettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "waba-master";
  const [gateway, setGateway] = useState("razorpay");

  const title = useMemo(
    () => (tab === "payment-gateway" ? "Payment Gateway Setup" : "Waba Master Config"),
    [tab],
  );

  const setTab = (next) => setSearchParams({ tab: next });

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
              <Input id="app-id" placeholder="Enter app id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-secret">Meta App Secret</Label>
              <Input id="app-secret" type="password" placeholder="Enter app secret" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-token">Webhook Verify Token</Label>
              <Input id="verify-token" placeholder="Enter verify token" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook Callback URL</Label>
              <Input id="webhook-url" placeholder="https://your-api.com/api/waba/webhook" />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => toast.success("WABA master config saved")}>
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
              <Select value={gateway} onValueChange={setGateway}>
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
              <Input id="merchant-id" placeholder="Enter merchant id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-id">Key ID</Label>
              <Input id="key-id" placeholder="Enter key id" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-secret">Key Secret</Label>
              <Input id="key-secret" type="password" placeholder="Enter key secret" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pg-webhook">Webhook Secret</Label>
              <Input id="pg-webhook" type="password" placeholder="Enter payment webhook secret" />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => toast.success("Payment gateway config saved")}>
                Save
              </Button>
              <Button variant="outline" onClick={() => toast.info("Payment gateway test initiated")}>
                Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PlatformSettingsPage;
