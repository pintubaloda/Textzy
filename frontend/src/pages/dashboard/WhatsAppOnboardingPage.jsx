import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  wabaStartOnboarding,
  wabaGetOnboardingStatus,
  wabaExchangeCode,
  wabaRecheckOnboarding,
} from "@/lib/api";

function loadFacebookSdk(appId) {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

const stateMap = {
  requested: "Requested",
  code_received: "Code Received",
  assets_linked: "Assets Linked",
  webhook_subscribed: "Webhook Subscribed",
  ready: "Connected / Ready",
};

export default function WhatsAppOnboardingPage() {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState({ state: "requested", readyToSend: false, isConnected: false });

  const facebookAppId = process.env.REACT_APP_FACEBOOK_APP_ID || "";
  const embeddedConfigId = process.env.REACT_APP_WABA_EMBEDDED_CONFIG_ID || "";

  const stateLabel = useMemo(() => stateMap[status.state] || status.state || "Requested", [status.state]);

  async function loadStatus() {
    setLoading(true);
    try {
      const payload = await wabaGetOnboardingStatus();
      setStatus(payload || {});
    } catch (e) {
      toast.error(e.message || "Failed to load onboarding status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleStart() {
    setStarting(true);
    try {
      await wabaStartOnboarding();
      await loadStatus();
      toast.success("Onboarding started");
    } catch (e) {
      toast.error(e.message || "Failed to start onboarding");
    } finally {
      setStarting(false);
    }
  }

  async function handleEmbeddedSignup() {
    if (!facebookAppId || !embeddedConfigId) {
      toast.error("Missing REACT_APP_FACEBOOK_APP_ID or REACT_APP_WABA_EMBEDDED_CONFIG_ID");
      return;
    }

    setConnecting(true);
    try {
      const FB = await loadFacebookSdk(facebookAppId);
      FB.login(async (response) => {
        if (!response || !response.authResponse) {
          setConnecting(false);
          toast.error("Embedded signup cancelled");
          return;
        }

        const code = response.authResponse.code;
        if (!code) {
          setConnecting(false);
          toast.error("Meta did not return authorization code. Strict code-only exchange is enforced.");
          return;
        }

        try {
          await wabaExchangeCode(code);
          await loadStatus();
          toast.success("Embedded signup exchange complete");
        } catch (e) {
          toast.error(e.message || "Code exchange failed");
        } finally {
          setConnecting(false);
        }
      }, {
        config_id: embeddedConfigId,
        response_type: "code",
        override_default_response_type: true,
        scope: "business_management,whatsapp_business_management,whatsapp_business_messaging",
      });
    } catch {
      setConnecting(false);
      toast.error("Failed to load Facebook SDK");
    }
  }

  async function handleRecheck() {
    setChecking(true);
    try {
      const payload = await wabaRecheckOnboarding();
      setStatus(payload || {});
      toast.success("Checks refreshed");
    } catch (e) {
      toast.error(e.message || "Failed to refresh checks");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="whatsapp-onboarding-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">WhatsApp Embedded Signup</h1>
          <p className="text-slate-600">Tech Partner onboarding with strict authorization-code exchange</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRecheck} disabled={checking || loading}>
            {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Recheck
          </Button>
          <Button onClick={handleStart} disabled={starting || loading} className="bg-orange-500 hover:bg-orange-600 text-white">
            {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Start Onboarding
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Onboarding Status</CardTitle>
              <CardDescription>Live state progression and readiness checks</CardDescription>
            </div>
            <Badge className={status.readyToSend ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
              {status.readyToSend ? "Ready to Send" : stateLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-slate-50"><b>Business:</b> {status.businessName || "Not linked"}</div>
            <div className="p-3 rounded-lg bg-slate-50"><b>Phone:</b> {status.phone || "Not linked"}</div>
            <div className="p-3 rounded-lg bg-slate-50"><b>WABA ID:</b> {status.wabaId || "Pending"}</div>
            <div className="p-3 rounded-lg bg-slate-50"><b>Phone Number ID:</b> {status.phoneNumberId || "Pending"}</div>
            <div className="p-3 rounded-lg bg-slate-50"><b>Business Verification:</b> {status.businessVerificationStatus || "Unknown"}</div>
            <div className="p-3 rounded-lg bg-slate-50"><b>Quality / Name:</b> {status.phoneQualityRating || "Unknown"} / {status.phoneNameStatus || "Unknown"}</div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {status.permissionAuditPassed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
            Permission Audit: {status.permissionAuditPassed ? "Passed" : "Missing required scopes"}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {status.webhookSubscribed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
            Webhook Subscription: {status.webhookSubscribed ? "Active" : "Not verified"}
          </div>

          {status.lastError ? (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Onboarding Warning</AlertTitle>
              <AlertDescription>{status.lastError}</AlertDescription>
            </Alert>
          ) : null}

          {status.lastGraphError ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Graph Error Payload</AlertTitle>
              <AlertDescription className="break-all">{status.lastGraphError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="pt-2">
            <Button onClick={handleEmbeddedSignup} disabled={connecting || loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Continue with Facebook
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
