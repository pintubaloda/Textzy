import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getPlatformSettings,
  savePlatformSettings,
  testPlatformSmtp,
  diagnosePlatformSmtp,
  getPlatformEmailReport,
  getPlatformWebhookLogs,
  getPlatformRequestLogs,
  listPaymentWebhooks,
  autoCreatePaymentWebhook,
  upsertPaymentWebhook,
  listPlatformBillingPlans,
  createPlatformBillingPlan,
  updatePlatformBillingPlan,
  archivePlatformBillingPlan,
  getPlatformQueueHealth,
  getPlatformMobileTelemetry,
  listWabaErrorPolicies,
  upsertWabaErrorPolicy,
  deactivateWabaErrorPolicy,
  getPlatformWebhookAnalytics,
  getPlatformSecuritySignals,
  resolvePlatformSecuritySignal,
  getPlatformSecurityControls,
  upsertPlatformSecurityControls,
  purgePlatformQueue,
  getPlatformCustomers,
  getPlatformIdempotencyDiagnostics,
  getPlatformWabaOnboardingSummary,
  cancelPlatformWabaRequest,
  getPlatformWabaLifecycle,
  reissuePlatformWabaToken,
  deactivatePlatformWabaLifecycle,
  platformLookupByPhone,
  platformLookupByWaba,
  getWabaDebugTenantProbe,
  getWabaDebugWebhookHealth,
  exportPlatformSqlBackup
} from "@/lib/api";

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
  const [waba, setWaba] = useState({ appId: "", appSecret: "", embeddedConfigId: "", verifyToken: "", webhookUrl: "", systemUserAccessToken: "" });
  const [appConfig, setAppConfig] = useState({
    appName: "Textzy",
    baseDomain: "",
    apiBaseUrl: "",
    hubPath: "/hubs/inbox",
    supportUrl: "",
    termsUrl: "",
    privacyUrl: "",
    webPushPublicKey: "",
    firebaseApiKey: "",
    firebaseAuthDomain: "",
    firebaseProjectId: "",
    firebaseStorageBucket: "",
    firebaseMessagingSenderId: "",
    firebaseAppId: "",
    firebaseMeasurementId: "",
    enforceApiAllowList: false,
    maxDevicesPerUser: "3",
    pairCodeTtlSeconds: "180",
    minSupportedAppVersion: "",
    pairSchemaVersion: "1",
    androidApkUrl: "",
    androidVersionName: "",
    androidVersionCode: "",
    androidMinSupportedVersion: "",
    androidForceUpdate: false,
    androidReleaseNotesUrl: "",
    iosDownloadUrl: "",
    iosStoreUrl: "",
    iosVersionName: "",
    iosBuildNumber: "",
    iosMinSupportedVersion: "",
    iosForceUpdate: false,
    iosReleaseNotesUrl: "",
    windowsDownloadUrl: "",
    windowsVersionName: "",
    windowsVersionCode: "",
    windowsMinSupportedVersion: "",
    windowsForceUpdate: false,
    windowsReleaseNotesUrl: "",
    macosDownloadUrl: "",
    macosVersionName: "",
    macosVersionCode: "",
    macosMinSupportedVersion: "",
    macosForceUpdate: false,
    macosReleaseNotesUrl: "",
    webUrl: "",
    webVersionName: "",
    webVersionCode: "",
    webMinSupportedVersion: "",
    webForceUpdate: false,
    webReleaseNotesUrl: "",
    webhookAllowedHosts: "",
    allowedApiPrefixes: "/api/auth\n/api/inbox\n/api/messages\n/hubs/inbox",
    apiCatalog: "/api/auth/login\n/api/auth/refresh\n/api/auth/logout\n/api/auth/me\n/api/auth/projects\n/api/auth/switch-project\n/api/auth/app-bootstrap\n/api/inbox/conversations\n/api/inbox/conversations/{id}/messages\n/api/inbox/conversations/{id}/assign\n/api/inbox/conversations/{id}/transfer\n/api/inbox/conversations/{id}/labels\n/api/inbox/conversations/{id}/notes\n/api/inbox/typing\n/api/inbox/sla\n/api/messages/send\n/api/messages/media/{mediaId}\n/hubs/inbox",
  });
  const [payment, setPayment] = useState({ provider: "razorpay", mode: "test", merchantId: "", keyId: "", keySecret: "", webhookSecret: "", webhookAllowedIps: "" });
  const [smtp, setSmtp] = useState({
    provider: "smtp",
    host: "smtppro.zoho.in",
    port: "587",
    timeoutMs: "15000",
    enableSsl: true,
    username: "",
    password: "",
    fromEmail: "",
    fromName: "Textzy",
    resendApiKey: "",
    resendWebhookSecret: "",
    resendFromEmail: "",
    resendFromName: "Textzy",
    testEmail: "",
  });
  const [smsGateway, setSmsGateway] = useState({
    provider: "tata",
    tataBaseUrl: "https://smsgw.tatatel.co.in:9095/campaignService/campaigns/qs",
    tataUsername: "",
    tataPassword: "",
    defaultSenderAddress: "",
    defaultPeId: "",
    defaultTemplateId: "",
    timeoutMs: "15000",
  });
  const [smtpDiag, setSmtpDiag] = useState(null);
  const [emailReport, setEmailReport] = useState(null);
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
  const [exportingSql, setExportingSql] = useState(false);
  const [queueHealth, setQueueHealth] = useState(null);
  const [wabaPolicies, setWabaPolicies] = useState([]);
  const [policyForm, setPolicyForm] = useState({ code: "", classification: "permanent", description: "", isActive: true });
  const [analytics, setAnalytics] = useState(null);
  const [analyticsTenantId, setAnalyticsTenantId] = useState("");
  const [analyticsDays, setAnalyticsDays] = useState("7");
  const [tenants, setTenants] = useState([]);
  const [idemTenantId, setIdemTenantId] = useState("");
  const [idemStatus, setIdemStatus] = useState("all");
  const [idemStaleMinutes, setIdemStaleMinutes] = useState("30");
  const [idemData, setIdemData] = useState(null);
  const [onboardingSummary, setOnboardingSummary] = useState(null);
  const [lifecycleTenantId, setLifecycleTenantId] = useState("");
  const [lifecycleData, setLifecycleData] = useState(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [wabaLookupTenantId, setWabaLookupTenantId] = useState("");
  const [lookupPhoneId, setLookupPhoneId] = useState("");
  const [lookupWabaId, setLookupWabaId] = useState("");
  const [lookupByPhoneData, setLookupByPhoneData] = useState(null);
  const [lookupByWabaData, setLookupByWabaData] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [securitySignals, setSecuritySignals] = useState([]);
  const [securityTenantId, setSecurityTenantId] = useState("");
  const [securityControls, setSecurityControls] = useState({ circuitBreakerEnabled: false, ratePerMinuteOverride: 0, reason: "" });
  const [securityStatusFilter, setSecurityStatusFilter] = useState("open");
  const [requestLogs, setRequestLogs] = useState([]);
  const [wabaWebhookHealth, setWabaWebhookHealth] = useState(null);
  const [wabaTenantProbe, setWabaTenantProbe] = useState(null);
  const [mobileTelemetryRows, setMobileTelemetryRows] = useState([]);
  const [mobileTelemetryDays, setMobileTelemetryDays] = useState("1");
  const [requestLogFilters, setRequestLogFilters] = useState({
    tenantId: "",
    method: "",
    statusCode: "",
    pathContains: "",
    limit: "200",
  });

  const title = useMemo(
    () => (
      tab === "payment-gateway"
        ? "Payment Gateway Setup"
        : tab === "webhook-logs"
        ? "Webhook Logs"
        : tab === "request-logs"
        ? "Request Logs"
        : tab === "billing-plans"
        ? "Billing Plans"
        : tab === "smtp-settings"
        ? "SMTP Settings"
        : tab === "sms-gateway"
        ? "SMS Gateway Settings"
        : tab === "waba-onboarding"
        ? "WABA Onboarding Summary"
        : tab === "waba-lookup"
        ? "WABA ID / Phone ID Lookup"
        : tab === "security-ops"
        ? "Security Operations"
        : tab === "idempotency-diagnostics"
        ? "Idempotency Diagnostics"
        : tab === "app-settings"
        ? "Mobile App Base Settings"
        : tab === "waba-policies"
        ? "WABA Error Policies"
        : "Waba Master Config"
    ),
    [tab],
  );

  const setTab = (next) => setSearchParams({ tab: next });
  const saveMobileAppSettings = async () => {
    await savePlatformSettings("mobile-app", {
      appName: appConfig.appName || "",
      baseDomain: appConfig.baseDomain || "",
      apiBaseUrl: appConfig.apiBaseUrl || "",
      hubPath: appConfig.hubPath || "/hubs/inbox",
      supportUrl: appConfig.supportUrl || "",
      termsUrl: appConfig.termsUrl || "",
      privacyUrl: appConfig.privacyUrl || "",
      webPushPublicKey: appConfig.webPushPublicKey || "",
      firebaseApiKey: appConfig.firebaseApiKey || "",
      firebaseAuthDomain: appConfig.firebaseAuthDomain || "",
      firebaseProjectId: appConfig.firebaseProjectId || "",
      firebaseStorageBucket: appConfig.firebaseStorageBucket || "",
      firebaseMessagingSenderId: appConfig.firebaseMessagingSenderId || "",
      firebaseAppId: appConfig.firebaseAppId || "",
      firebaseMeasurementId: appConfig.firebaseMeasurementId || "",
      enforceApiAllowList: appConfig.enforceApiAllowList ? "true" : "false",
      maxDevicesPerUser: appConfig.maxDevicesPerUser || "3",
      pairCodeTtlSeconds: appConfig.pairCodeTtlSeconds || "180",
      minSupportedAppVersion: appConfig.minSupportedAppVersion || "",
      pairSchemaVersion: appConfig.pairSchemaVersion || "1",
      androidApkUrl: appConfig.androidApkUrl || "",
      androidVersionName: appConfig.androidVersionName || "",
      androidVersionCode: appConfig.androidVersionCode || "",
      androidMinSupportedVersion: appConfig.androidMinSupportedVersion || "",
      androidForceUpdate: appConfig.androidForceUpdate ? "true" : "false",
      androidReleaseNotesUrl: appConfig.androidReleaseNotesUrl || "",
      iosDownloadUrl: appConfig.iosDownloadUrl || "",
      iosStoreUrl: appConfig.iosStoreUrl || "",
      iosVersionName: appConfig.iosVersionName || "",
      iosBuildNumber: appConfig.iosBuildNumber || "",
      iosMinSupportedVersion: appConfig.iosMinSupportedVersion || "",
      iosForceUpdate: appConfig.iosForceUpdate ? "true" : "false",
      iosReleaseNotesUrl: appConfig.iosReleaseNotesUrl || "",
      windowsDownloadUrl: appConfig.windowsDownloadUrl || "",
      windowsVersionName: appConfig.windowsVersionName || "",
      windowsVersionCode: appConfig.windowsVersionCode || "",
      windowsMinSupportedVersion: appConfig.windowsMinSupportedVersion || "",
      windowsForceUpdate: appConfig.windowsForceUpdate ? "true" : "false",
      windowsReleaseNotesUrl: appConfig.windowsReleaseNotesUrl || "",
      macosDownloadUrl: appConfig.macosDownloadUrl || "",
      macosVersionName: appConfig.macosVersionName || "",
      macosVersionCode: appConfig.macosVersionCode || "",
      macosMinSupportedVersion: appConfig.macosMinSupportedVersion || "",
      macosForceUpdate: appConfig.macosForceUpdate ? "true" : "false",
      macosReleaseNotesUrl: appConfig.macosReleaseNotesUrl || "",
      webUrl: appConfig.webUrl || "",
      webVersionName: appConfig.webVersionName || "",
      webVersionCode: appConfig.webVersionCode || "",
      webMinSupportedVersion: appConfig.webMinSupportedVersion || "",
      webForceUpdate: appConfig.webForceUpdate ? "true" : "false",
      webReleaseNotesUrl: appConfig.webReleaseNotesUrl || "",
      webhookAllowedHosts: appConfig.webhookAllowedHosts || "",
      allowedApiPrefixes: appConfig.allowedApiPrefixes || "",
      apiCatalog: appConfig.apiCatalog || "",
    });
  };

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
            embeddedConfigId: values.embeddedConfigId || values.configId || "",
            verifyToken: values.verifyToken || "",
            webhookUrl: values.webhookUrl || "",
            systemUserAccessToken: values.systemUserAccessToken || values.accessToken || "",
          });
        } else if (tab === "app-settings") {
          const res = await getPlatformSettings("mobile-app");
          const values = res?.values || {};
          if (!active) return;
          setAppConfig((prev) => ({
            ...prev,
            appName: values.appName || "Textzy",
            baseDomain: values.baseDomain || "",
            apiBaseUrl: values.apiBaseUrl || "",
            hubPath: values.hubPath || "/hubs/inbox",
            supportUrl: values.supportUrl || "",
            termsUrl: values.termsUrl || "",
            privacyUrl: values.privacyUrl || "",
            webPushPublicKey: values.webPushPublicKey || "",
            firebaseApiKey: values.firebaseApiKey || "",
            firebaseAuthDomain: values.firebaseAuthDomain || "",
            firebaseProjectId: values.firebaseProjectId || "",
            firebaseStorageBucket: values.firebaseStorageBucket || "",
            firebaseMessagingSenderId: values.firebaseMessagingSenderId || "",
            firebaseAppId: values.firebaseAppId || "",
            firebaseMeasurementId: values.firebaseMeasurementId || "",
            enforceApiAllowList: String(values.enforceApiAllowList || "false").toLowerCase() === "true",
            maxDevicesPerUser: values.maxDevicesPerUser || "3",
            pairCodeTtlSeconds: values.pairCodeTtlSeconds || "180",
            minSupportedAppVersion: values.minSupportedAppVersion || "",
            pairSchemaVersion: values.pairSchemaVersion || "1",
            androidApkUrl: values.androidApkUrl || "",
            androidVersionName: values.androidVersionName || "",
            androidVersionCode: values.androidVersionCode || "",
            androidMinSupportedVersion: values.androidMinSupportedVersion || "",
            androidForceUpdate: String(values.androidForceUpdate || "false").toLowerCase() === "true",
            androidReleaseNotesUrl: values.androidReleaseNotesUrl || "",
            iosDownloadUrl: values.iosDownloadUrl || "",
            iosStoreUrl: values.iosStoreUrl || "",
            iosVersionName: values.iosVersionName || "",
            iosBuildNumber: values.iosBuildNumber || "",
            iosMinSupportedVersion: values.iosMinSupportedVersion || "",
            iosForceUpdate: String(values.iosForceUpdate || "false").toLowerCase() === "true",
            iosReleaseNotesUrl: values.iosReleaseNotesUrl || "",
            windowsDownloadUrl: values.windowsDownloadUrl || "",
            windowsVersionName: values.windowsVersionName || "",
            windowsVersionCode: values.windowsVersionCode || "",
            windowsMinSupportedVersion: values.windowsMinSupportedVersion || "",
            windowsForceUpdate: String(values.windowsForceUpdate || "false").toLowerCase() === "true",
            windowsReleaseNotesUrl: values.windowsReleaseNotesUrl || "",
            macosDownloadUrl: values.macosDownloadUrl || "",
            macosVersionName: values.macosVersionName || "",
            macosVersionCode: values.macosVersionCode || "",
            macosMinSupportedVersion: values.macosMinSupportedVersion || "",
            macosForceUpdate: String(values.macosForceUpdate || "false").toLowerCase() === "true",
            macosReleaseNotesUrl: values.macosReleaseNotesUrl || "",
            webUrl: values.webUrl || "",
            webVersionName: values.webVersionName || "",
            webVersionCode: values.webVersionCode || "",
            webMinSupportedVersion: values.webMinSupportedVersion || "",
            webForceUpdate: String(values.webForceUpdate || "false").toLowerCase() === "true",
            webReleaseNotesUrl: values.webReleaseNotesUrl || "",
            webhookAllowedHosts: values.webhookAllowedHosts || "",
            allowedApiPrefixes: values.allowedApiPrefixes || prev.allowedApiPrefixes,
            apiCatalog: values.apiCatalog || prev.apiCatalog,
          }));
          const telemetry = await getPlatformMobileTelemetry({ take: 200, days: Number(mobileTelemetryDays || 1) }).catch(() => []);
          if (!active) return;
          setMobileTelemetryRows(telemetry || []);
        } else if (tab === "payment-gateway") {
          const res = await getPlatformSettings("payment-gateway");
          const values = res?.values || {};
          if (!active) return;
          const p = values.provider || "razorpay";
          setGateway(p);
          setPayment({
            provider: p,
            mode: (values.mode || "test").toLowerCase() === "live" ? "live" : "test",
            merchantId: values.merchantId || "",
            keyId: values.keyId || "",
            keySecret: values.keySecret || "",
            webhookSecret: values.webhookSecret || "",
            webhookAllowedIps: values.webhookAllowedIps || "",
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
        } else if (tab === "smtp-settings") {
          const res = await getPlatformSettings("smtp");
          const values = res?.values || {};
          if (!active) return;
          setSmtp((prev) => ({
            ...prev,
            provider: (values.provider || "smtp").toLowerCase() === "resend" ? "resend" : "smtp",
            host: values.host || "smtppro.zoho.in",
            port: values.port || "587",
            timeoutMs: values.timeoutMs || "15000",
            enableSsl: String(values.enableSsl || "true").toLowerCase() === "true",
            username: values.username || "",
            password: values.password || "",
            fromEmail: values.fromEmail || "",
            fromName: values.fromName || "Textzy",
            resendApiKey: values.resendApiKey || "",
            resendWebhookSecret: values.resendWebhookSecret || "",
            resendFromEmail: values.resendFromEmail || "",
            resendFromName: values.resendFromName || "Textzy",
          }));
          const report = await getPlatformEmailReport({ days: 7, take: 60 }).catch(() => null);
          if (!active) return;
          setEmailReport(report);
        } else if (tab === "sms-gateway") {
          const res = await getPlatformSettings("sms-gateway");
          const values = res?.values || {};
          if (!active) return;
          setSmsGateway((prev) => ({
            ...prev,
            provider: (values.provider || "tata").toLowerCase(),
            tataBaseUrl: values.tataBaseUrl || prev.tataBaseUrl,
            tataUsername: values.tataUsername || "",
            tataPassword: values.tataPassword || "",
            defaultSenderAddress: values.defaultSenderAddress || "",
            defaultPeId: values.defaultPeId || "",
            defaultTemplateId: values.defaultTemplateId || "",
            timeoutMs: values.timeoutMs || "15000",
          }));
        } else {
          if (tab === "billing-plans") {
            const rows = await listPlatformBillingPlans();
            if (!active) return;
            setPlans(rows || []);
          } else if (tab === "request-logs") {
            const [customers, rows] = await Promise.all([
              getPlatformCustomers("").catch(() => []),
              getPlatformRequestLogs({
                tenantId: requestLogFilters.tenantId,
                method: requestLogFilters.method,
                statusCode: requestLogFilters.statusCode,
                pathContains: requestLogFilters.pathContains,
                limit: Number(requestLogFilters.limit || 200),
              }).catch(() => []),
            ]);
            if (!active) return;
            setTenants(customers || []);
            setRequestLogs(rows || []);
          } else if (tab === "waba-onboarding") {
            const rows = await getPlatformWabaOnboardingSummary();
            if (!active) return;
            setOnboardingSummary(rows || null);
            const firstTenantId = (rows?.projects || [])[0]?.tenantId || "";
            if (firstTenantId) setLifecycleTenantId((prev) => prev || firstTenantId);
          } else if (tab === "waba-lookup") {
            const customers = await getPlatformCustomers("").catch(() => []);
            if (!active) return;
            const list = customers || [];
            setTenants(list);
            if (list.length) setWabaLookupTenantId((prev) => prev || list[0].tenantId);
          } else if (tab === "security-ops") {
            const customers = await getPlatformCustomers("").catch(() => []);
            if (!active) return;
            const list = customers || [];
            setTenants(list);
            const selected = securityTenantId || list[0]?.tenantId || "";
            setSecurityTenantId(selected);
            const [signals, controls] = await Promise.all([
              getPlatformSecuritySignals({ status: securityStatusFilter, limit: 200 }).catch(() => []),
              selected ? getPlatformSecurityControls(selected).catch(() => null) : Promise.resolve(null)
            ]);
            if (!active) return;
            setSecuritySignals(signals || []);
            setSecurityControls({
              circuitBreakerEnabled: !!controls?.circuitBreakerEnabled,
              ratePerMinuteOverride: Number(controls?.ratePerMinuteOverride || 0),
              reason: controls?.reason || ""
            });
          } else if (tab === "waba-policies") {
            const rows = await listWabaErrorPolicies();
            if (!active) return;
            setWabaPolicies(rows || []);
          } else if (tab === "idempotency-diagnostics") {
            const customers = await getPlatformCustomers("").catch(() => []);
            if (!active) return;
            const list = customers || [];
            setTenants(list);
            const selected = idemTenantId || list[0]?.tenantId || "";
            setIdemTenantId(selected);
            if (selected) {
              const data = await getPlatformIdempotencyDiagnostics({
                tenantId: selected,
                status: idemStatus === "all" ? "" : idemStatus,
                staleMinutes: Number(idemStaleMinutes || 30),
                limit: 300
              }).catch(() => null);
              if (!active) return;
              setIdemData(data);
            } else {
              setIdemData(null);
            }
          } else {
            const [res, qh, customers, an, wh, tp] = await Promise.all([
              getPlatformWebhookLogs({ provider: logProvider, limit: 100 }),
              getPlatformQueueHealth().catch(() => null),
              getPlatformCustomers("").catch(() => []),
              getPlatformWebhookAnalytics(analyticsTenantId, Number(analyticsDays || 7)).catch(() => null),
              getWabaDebugWebhookHealth().catch(() => null),
              getWabaDebugTenantProbe().catch(() => null),
            ]);
            if (!active) return;
            setLogs(res || []);
            setQueueHealth(qh);
            setWabaWebhookHealth(wh);
            setWabaTenantProbe(tp);
            const list = customers || [];
            setTenants(list);
            if (!analyticsTenantId && list.length) setAnalyticsTenantId(list[0].tenantId);
            setAnalytics(an);
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
  }, [
    tab,
    logProvider,
    securityStatusFilter,
    securityTenantId,
    analyticsTenantId,
    analyticsDays,
    idemTenantId,
    idemStatus,
    idemStaleMinutes,
    requestLogFilters.tenantId,
    requestLogFilters.method,
    requestLogFilters.statusCode,
    requestLogFilters.pathContains,
    requestLogFilters.limit,
    mobileTelemetryDays,
  ]);

  return (
    <div className="space-y-4" data-testid="platform-settings-page">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">Platform owner level global configuration.</p>
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
              <Label htmlFor="embedded-config-id">Embedded Signup Config ID</Label>
              <Input id="embedded-config-id" placeholder="Enter config id" value={waba.embeddedConfigId} onChange={(e) => setWaba((p) => ({ ...p, embeddedConfigId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verify-token">Webhook Verify Token</Label>
              <Input id="verify-token" placeholder="Enter verify token" value={waba.verifyToken} onChange={(e) => setWaba((p) => ({ ...p, verifyToken: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook Callback URL</Label>
              <Input id="webhook-url" placeholder="https://your-api.com/api/waba/webhook" value={waba.webhookUrl} onChange={(e) => setWaba((p) => ({ ...p, webhookUrl: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="system-user-access-token">System User Access Token (Platform Global)</Label>
              <Input
                id="system-user-access-token"
                type="password"
                placeholder="Paste system user token for global WABA lookup"
                value={waba.systemUserAccessToken}
                onChange={(e) => setWaba((p) => ({ ...p, systemUserAccessToken: e.target.value }))}
              />
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
              <Button variant="outline" onClick={async () => {
                try {
                  const health = await getWabaDebugWebhookHealth();
                  setWabaWebhookHealth(health || null);
                  if (health?.configured?.verifyToken && health?.configured?.appSecret && health?.configured?.callbackUrl) {
                    toast.success("Webhook config is valid.");
                  } else {
                    toast.error("Webhook config is incomplete. Check verify token/app secret/callback URL.");
                  }
                } catch (e) {
                  toast.error(e?.message || "Failed to test webhook.");
                }
              }}>
                Test Webhook
              </Button>
              <Button variant="outline" disabled={exportingSql} onClick={async () => {
                try {
                  setExportingSql(true);
                  const blob = await exportPlatformSqlBackup();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `textzy_platform_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.sql`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                  toast.success("SQL backup exported");
                } catch (e) {
                  toast.error(e?.message || "Failed to export SQL backup");
                } finally {
                  setExportingSql(false);
                }
              }}>
                {exportingSql ? "Exporting..." : "Export SQL Backup"}
              </Button>
            </div>
            <div className="md:col-span-2 space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Daily Mobile Telemetry</p>
                  <p className="text-xs text-slate-500">Operational telemetry from mobile app users (non-invasive).</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="w-[90px]"
                    type="number"
                    min="1"
                    max="30"
                    value={mobileTelemetryDays}
                    onChange={(e) => setMobileTelemetryDays(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setMobileTelemetryRows(await getPlatformMobileTelemetry({ take: 200, days: Number(mobileTelemetryDays || 1) }).catch(() => []));
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="max-h-[320px] overflow-auto rounded border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-1 text-left">Time (UTC)</th>
                      <th className="px-2 py-1 text-left">User</th>
                      <th className="px-2 py-1 text-left">Event</th>
                      <th className="px-2 py-1 text-left">Device</th>
                      <th className="px-2 py-1 text-left">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mobileTelemetryRows || []).map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1 whitespace-nowrap">{r.eventAtUtc || "-"}</td>
                        <td className="px-2 py-1">{r.userEmail || "-"}</td>
                        <td className="px-2 py-1">{r.eventType || "-"}</td>
                        <td className="px-2 py-1">{r.deviceId || "-"}</td>
                        <td className="px-2 py-1 break-all">{r.dataJson || "{}"}</td>
                      </tr>
                    ))}
                    {(!mobileTelemetryRows || mobileTelemetryRows.length === 0) && (
                      <tr>
                        <td className="px-2 py-3 text-slate-500" colSpan={5}>No telemetry data available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
              <Label>Mode</Label>
              <Select value={(payment.mode || "test")} onValueChange={(v) => setPayment((p) => ({ ...p, mode: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test Mode</SelectItem>
                  <SelectItem value="live">Live Mode</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pg-webhook-ips">Webhook Allowed IPs / CIDR (optional)</Label>
              <Input
                id="pg-webhook-ips"
                placeholder="e.g. 52.66.25.127, 13.126.0.0/16"
                value={payment.webhookAllowedIps}
                onChange={(e) => setPayment((p) => ({ ...p, webhookAllowedIps: e.target.value }))}
              />
              <p className="text-xs text-slate-500">Leave empty to allow all source IPs. Recommended: add Razorpay webhook IP ranges.</p>
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

      {tab === "app-settings" && (
        <div className="space-y-4">
          <Card className="border-slate-200 bg-gradient-to-r from-orange-50 via-white to-slate-50">
            <CardHeader>
              <CardTitle>Mobile App Base Settings</CardTitle>
              <CardDescription>
                Central runtime configuration consumed from <code>/api/auth/app-bootstrap</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Configured Endpoints</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {[appConfig.apiBaseUrl, appConfig.hubPath, appConfig.supportUrl, appConfig.termsUrl, appConfig.privacyUrl].filter(Boolean).length}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Push Readiness</p>
                <p className={`mt-1 text-2xl font-semibold ${appConfig.firebaseApiKey && appConfig.firebaseProjectId && appConfig.firebaseMessagingSenderId && appConfig.firebaseAppId ? "text-green-600" : "text-amber-600"}`}>
                  {appConfig.firebaseApiKey && appConfig.firebaseProjectId && appConfig.firebaseMessagingSenderId && appConfig.firebaseAppId ? "Ready" : "Partial"}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Allow-list Entries</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {String(appConfig.allowedApiPrefixes || "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean).length}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Release Channels</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {[appConfig.androidApkUrl, appConfig.iosStoreUrl || appConfig.iosDownloadUrl, appConfig.windowsDownloadUrl, appConfig.macosDownloadUrl, appConfig.webUrl].filter(Boolean).length}/5
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Runtime Configuration Details</CardTitle>
              <CardDescription>
                Professional grouped layout with all existing settings preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto pr-2 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-sm font-medium text-slate-900">Core Runtime Endpoints</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Core runtime saved"); }
                  catch { toast.error("Failed to save core runtime"); }
                  finally { setLoading(false); }
                }}
              >
                Save Core
              </Button>
            </div>
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input value={appConfig.appName} onChange={(e) => setAppConfig((p) => ({ ...p, appName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Base Domain</Label>
              <Input placeholder="textzy.in" value={appConfig.baseDomain} onChange={(e) => setAppConfig((p) => ({ ...p, baseDomain: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>API Base URL</Label>
              <Input placeholder="https://textzy-backend-production.up.railway.app" value={appConfig.apiBaseUrl} onChange={(e) => setAppConfig((p) => ({ ...p, apiBaseUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>SignalR Hub Path</Label>
              <Input placeholder="/hubs/inbox" value={appConfig.hubPath} onChange={(e) => setAppConfig((p) => ({ ...p, hubPath: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Support URL</Label>
              <Input placeholder="https://textzy.in/support" value={appConfig.supportUrl} onChange={(e) => setAppConfig((p) => ({ ...p, supportUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Terms URL</Label>
              <Input placeholder="https://textzy.in/terms" value={appConfig.termsUrl} onChange={(e) => setAppConfig((p) => ({ ...p, termsUrl: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Privacy URL</Label>
              <Input placeholder="https://textzy.in/privacy" value={appConfig.privacyUrl} onChange={(e) => setAppConfig((p) => ({ ...p, privacyUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Firebase / Push Runtime Endpoint</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Push settings saved"); }
                  catch { toast.error("Failed to save push settings"); }
                  finally { setLoading(false); }
                }}
              >
                Save Push
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Web Push Public Key (VAPID)</Label>
              <Input
                placeholder="BEl..."
                value={appConfig.webPushPublicKey}
                onChange={(e) => setAppConfig((p) => ({ ...p, webPushPublicKey: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Firebase API Key</Label>
              <Input value={appConfig.firebaseApiKey} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseApiKey: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Firebase Auth Domain</Label>
              <Input placeholder="your-app.firebaseapp.com" value={appConfig.firebaseAuthDomain} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseAuthDomain: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Firebase Project ID</Label>
              <Input value={appConfig.firebaseProjectId} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseProjectId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Firebase Storage Bucket</Label>
              <Input placeholder="your-app.appspot.com" value={appConfig.firebaseStorageBucket} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseStorageBucket: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Firebase Messaging Sender ID</Label>
              <Input value={appConfig.firebaseMessagingSenderId} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseMessagingSenderId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Firebase App ID</Label>
              <Input value={appConfig.firebaseAppId} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseAppId: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Firebase Measurement ID (optional)</Label>
              <Input value={appConfig.firebaseMeasurementId} onChange={(e) => setAppConfig((p) => ({ ...p, firebaseMeasurementId: e.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Webhook Allowed Hosts (newline or comma separated)</Label>
              <textarea
                className="min-h-[90px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={appConfig.webhookAllowedHosts}
                onChange={(e) => setAppConfig((p) => ({ ...p, webhookAllowedHosts: e.target.value }))}
                placeholder="api.example.com&#10;hooks.partner.com"
              />
              <p className="text-xs text-slate-500">Used by workflow webhook/api_call nodes. Keep empty to allow any public host.</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Allowed API Prefixes (newline or comma separated)</Label>
              <textarea
                className="min-h-[110px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={appConfig.allowedApiPrefixes}
                onChange={(e) => setAppConfig((p) => ({ ...p, allowedApiPrefixes: e.target.value }))}
                placeholder="/api/auth&#10;/api/inbox&#10;/api/messages&#10;/hubs/inbox"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>App API Catalog (newline or comma separated)</Label>
              <textarea
                className="min-h-[150px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={appConfig.apiCatalog}
                onChange={(e) => setAppConfig((p) => ({ ...p, apiCatalog: e.target.value }))}
                placeholder="/api/auth/login&#10;/api/auth/me&#10;/api/inbox/conversations"
              />
            </div>
            <label className="md:col-span-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!appConfig.enforceApiAllowList}
                onChange={(e) => setAppConfig((p) => ({ ...p, enforceApiAllowList: e.target.checked }))}
              />
              Enforce API allow-list in app runtime
            </label>
            <div className="md:col-span-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Security endpoints saved"); }
                  catch { toast.error("Failed to save security settings"); }
                  finally { setLoading(false); }
                }}
              >
                Save Security
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Max Devices Per User</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={appConfig.maxDevicesPerUser}
                onChange={(e) => setAppConfig((p) => ({ ...p, maxDevicesPerUser: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Pair QR TTL (seconds)</Label>
              <Input
                type="number"
                min="60"
                max="600"
                value={appConfig.pairCodeTtlSeconds}
                onChange={(e) => setAppConfig((p) => ({ ...p, pairCodeTtlSeconds: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Min Supported App Version</Label>
              <Input
                placeholder="1.0.0"
                value={appConfig.minSupportedAppVersion}
                onChange={(e) => setAppConfig((p) => ({ ...p, minSupportedAppVersion: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Pair Schema Version</Label>
              <Input
                placeholder="1"
                value={appConfig.pairSchemaVersion}
                onChange={(e) => setAppConfig((p) => ({ ...p, pairSchemaVersion: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Pairing policy saved"); }
                  catch { toast.error("Failed to save pairing policy"); }
                  finally { setLoading(false); }
                }}
              >
                Save Pairing
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Android APK URL (public download)</Label>
              <Input
                placeholder="https://your-cdn/textzy-android-latest.apk"
                value={appConfig.androidApkUrl}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidApkUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Android Version Name</Label>
              <Input
                placeholder="1.0.0"
                value={appConfig.androidVersionName}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidVersionName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Android Version Code</Label>
              <Input
                placeholder="1"
                value={appConfig.androidVersionCode}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidVersionCode: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Android Release Notes URL</Label>
              <Input
                placeholder="https://your-site/releases/android"
                value={appConfig.androidReleaseNotesUrl}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidReleaseNotesUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Android Min Supported Version</Label>
              <Input
                placeholder="1.0.0"
                value={appConfig.androidMinSupportedVersion}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidMinSupportedVersion: e.target.value }))}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!appConfig.androidForceUpdate}
                onChange={(e) => setAppConfig((p) => ({ ...p, androidForceUpdate: e.target.checked }))}
              />
              Android force update
            </label>
            <div className="md:col-span-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Android endpoint saved"); }
                  catch { toast.error("Failed to save Android endpoint"); }
                  finally { setLoading(false); }
                }}
              >
                Save Android
              </Button>
            </div>
            <div className="md:col-span-2 border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">iOS Update Manifest Endpoint</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("iOS endpoint saved"); }
                  catch { toast.error("Failed to save iOS endpoint"); }
                  finally { setLoading(false); }
                }}
              >
                Save iOS
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>iOS Store/Download URL</Label>
              <Input
                placeholder="https://apps.apple.com/... or direct ipa link"
                value={appConfig.iosStoreUrl || appConfig.iosDownloadUrl}
                onChange={(e) => setAppConfig((p) => ({ ...p, iosStoreUrl: e.target.value, iosDownloadUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>iOS Version Name</Label>
              <Input value={appConfig.iosVersionName} onChange={(e) => setAppConfig((p) => ({ ...p, iosVersionName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>iOS Build Number</Label>
              <Input value={appConfig.iosBuildNumber} onChange={(e) => setAppConfig((p) => ({ ...p, iosBuildNumber: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>iOS Min Supported Version</Label>
              <Input value={appConfig.iosMinSupportedVersion} onChange={(e) => setAppConfig((p) => ({ ...p, iosMinSupportedVersion: e.target.value }))} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!appConfig.iosForceUpdate} onChange={(e) => setAppConfig((p) => ({ ...p, iosForceUpdate: e.target.checked }))} />
              iOS force update
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>iOS Release Notes URL</Label>
              <Input value={appConfig.iosReleaseNotesUrl} onChange={(e) => setAppConfig((p) => ({ ...p, iosReleaseNotesUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Windows Desktop Update Manifest Endpoint</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Windows endpoint saved"); }
                  catch { toast.error("Failed to save Windows endpoint"); }
                  finally { setLoading(false); }
                }}
              >
                Save Windows
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Windows Download URL</Label>
              <Input value={appConfig.windowsDownloadUrl} onChange={(e) => setAppConfig((p) => ({ ...p, windowsDownloadUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Windows Version Name</Label>
              <Input value={appConfig.windowsVersionName} onChange={(e) => setAppConfig((p) => ({ ...p, windowsVersionName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Windows Version Code</Label>
              <Input value={appConfig.windowsVersionCode} onChange={(e) => setAppConfig((p) => ({ ...p, windowsVersionCode: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Windows Min Supported Version</Label>
              <Input value={appConfig.windowsMinSupportedVersion} onChange={(e) => setAppConfig((p) => ({ ...p, windowsMinSupportedVersion: e.target.value }))} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!appConfig.windowsForceUpdate} onChange={(e) => setAppConfig((p) => ({ ...p, windowsForceUpdate: e.target.checked }))} />
              Windows force update
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>Windows Release Notes URL</Label>
              <Input value={appConfig.windowsReleaseNotesUrl} onChange={(e) => setAppConfig((p) => ({ ...p, windowsReleaseNotesUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">macOS Desktop Update Manifest Endpoint</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("macOS endpoint saved"); }
                  catch { toast.error("Failed to save macOS endpoint"); }
                  finally { setLoading(false); }
                }}
              >
                Save macOS
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>macOS Download URL</Label>
              <Input value={appConfig.macosDownloadUrl} onChange={(e) => setAppConfig((p) => ({ ...p, macosDownloadUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>macOS Version Name</Label>
              <Input value={appConfig.macosVersionName} onChange={(e) => setAppConfig((p) => ({ ...p, macosVersionName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>macOS Version Code</Label>
              <Input value={appConfig.macosVersionCode} onChange={(e) => setAppConfig((p) => ({ ...p, macosVersionCode: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>macOS Min Supported Version</Label>
              <Input value={appConfig.macosMinSupportedVersion} onChange={(e) => setAppConfig((p) => ({ ...p, macosMinSupportedVersion: e.target.value }))} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!appConfig.macosForceUpdate} onChange={(e) => setAppConfig((p) => ({ ...p, macosForceUpdate: e.target.checked }))} />
              macOS force update
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>macOS Release Notes URL</Label>
              <Input value={appConfig.macosReleaseNotesUrl} onChange={(e) => setAppConfig((p) => ({ ...p, macosReleaseNotesUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Web App Update Manifest Endpoint</p>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try { setLoading(true); await saveMobileAppSettings(); toast.success("Web endpoint saved"); }
                  catch { toast.error("Failed to save Web endpoint"); }
                  finally { setLoading(false); }
                }}
              >
                Save Web
              </Button>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Web URL</Label>
              <Input value={appConfig.webUrl} onChange={(e) => setAppConfig((p) => ({ ...p, webUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Web Version Name</Label>
              <Input value={appConfig.webVersionName} onChange={(e) => setAppConfig((p) => ({ ...p, webVersionName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Web Version Code</Label>
              <Input value={appConfig.webVersionCode} onChange={(e) => setAppConfig((p) => ({ ...p, webVersionCode: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Web Min Supported Version</Label>
              <Input value={appConfig.webMinSupportedVersion} onChange={(e) => setAppConfig((p) => ({ ...p, webMinSupportedVersion: e.target.value }))} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!appConfig.webForceUpdate} onChange={(e) => setAppConfig((p) => ({ ...p, webForceUpdate: e.target.checked }))} />
              Web force update
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>Web Release Notes URL</Label>
              <Input value={appConfig.webReleaseNotesUrl} onChange={(e) => setAppConfig((p) => ({ ...p, webReleaseNotesUrl: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button
                className="bg-orange-500 hover:bg-orange-600"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await saveMobileAppSettings();
                    toast.success("App base settings saved");
                  } catch {
                    toast.error("Failed to save app settings");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {tab === "sms-gateway" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>TATA SMS Gateway Configuration</CardTitle>
            <CardDescription>
              Maps exactly to provider variables: MobileNo, Message, Username, PassWord, senderAddress, PEID, TemplateID.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Provider</Label>
              <Select value={smsGateway.provider} onValueChange={(value) => setSmsGateway((p) => ({ ...p, provider: value }))}>
                <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tata">TATA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>TATA Base URL</Label>
              <Input
                value={smsGateway.tataBaseUrl}
                onChange={(e) => setSmsGateway((p) => ({ ...p, tataBaseUrl: e.target.value }))}
                placeholder="https://smsgw.tatatel.co.in:9095/campaignService/campaigns/qs"
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={smsGateway.tataUsername} onChange={(e) => setSmsGateway((p) => ({ ...p, tataUsername: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>PassWord</Label>
              <Input type="password" value={smsGateway.tataPassword} onChange={(e) => setSmsGateway((p) => ({ ...p, tataPassword: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>senderAddress</Label>
              <Input value={smsGateway.defaultSenderAddress} onChange={(e) => setSmsGateway((p) => ({ ...p, defaultSenderAddress: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>PEID</Label>
              <Input value={smsGateway.defaultPeId} onChange={(e) => setSmsGateway((p) => ({ ...p, defaultPeId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>TemplateID</Label>
              <Input value={smsGateway.defaultTemplateId} onChange={(e) => setSmsGateway((p) => ({ ...p, defaultTemplateId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Timeout (ms)</Label>
              <Input value={smsGateway.timeoutMs} onChange={(e) => setSmsGateway((p) => ({ ...p, timeoutMs: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button
                className="bg-orange-500 hover:bg-orange-600"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await savePlatformSettings("sms-gateway", {
                      provider: smsGateway.provider || "tata",
                      tataBaseUrl: smsGateway.tataBaseUrl || "",
                      tataUsername: smsGateway.tataUsername || "",
                      tataPassword: smsGateway.tataPassword || "",
                      defaultSenderAddress: smsGateway.defaultSenderAddress || "",
                      defaultPeId: smsGateway.defaultPeId || "",
                      defaultTemplateId: smsGateway.defaultTemplateId || "",
                      timeoutMs: smsGateway.timeoutMs || "15000",
                    });
                    toast.success("SMS gateway settings saved");
                  } catch {
                    toast.error("Failed to save SMS gateway settings");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Save SMS Gateway
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "smtp-settings" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Email Delivery Configuration</CardTitle>
            <CardDescription>
              Configure SMTP or Resend for OTP, invite, and notification emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Provider</Label>
              <Select value={smtp.provider} onValueChange={(value) => setSmtp((p) => ({ ...p, provider: value }))}>
                <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">SMTP</SelectItem>
                  <SelectItem value="resend">Resend API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {smtp.provider === "smtp" && (
              <>
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input value={smtp.host} onChange={(e) => setSmtp((p) => ({ ...p, host: e.target.value }))} placeholder="smtppro.zoho.in" />
            </div>
            <div className="space-y-2">
              <Label>SMTP Port</Label>
              <Input value={smtp.port} onChange={(e) => setSmtp((p) => ({ ...p, port: e.target.value }))} placeholder="587" />
            </div>
            <div className="space-y-2">
              <Label>Timeout (ms)</Label>
              <Input value={smtp.timeoutMs} onChange={(e) => setSmtp((p) => ({ ...p, timeoutMs: e.target.value }))} placeholder="15000" />
            </div>
            <div className="space-y-2">
              <Label>SMTP Username</Label>
              <Input value={smtp.username} onChange={(e) => setSmtp((p) => ({ ...p, username: e.target.value }))} placeholder="noreply@yourdomain.com" />
            </div>
            <div className="space-y-2">
              <Label>SMTP Password</Label>
              <Input type="password" value={smtp.password} onChange={(e) => setSmtp((p) => ({ ...p, password: e.target.value }))} placeholder="app password" />
            </div>
            <div className="space-y-2">
              <Label>From Email</Label>
              <Input value={smtp.fromEmail} onChange={(e) => setSmtp((p) => ({ ...p, fromEmail: e.target.value }))} placeholder="noreply@yourdomain.com" />
            </div>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input value={smtp.fromName} onChange={(e) => setSmtp((p) => ({ ...p, fromName: e.target.value }))} placeholder="Textzy" />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
              <input type="checkbox" checked={!!smtp.enableSsl} onChange={(e) => setSmtp((p) => ({ ...p, enableSsl: e.target.checked }))} />
              Use TLS/SSL (recommended for port 587 STARTTLS)
            </label>
              </>
            )}
            {smtp.provider === "resend" && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <Label>Resend API Key</Label>
                  <Input type="password" value={smtp.resendApiKey} onChange={(e) => setSmtp((p) => ({ ...p, resendApiKey: e.target.value }))} placeholder="re_xxxxxxxxxxxxxxxxx" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Resend Webhook Secret</Label>
                  <Input type="password" value={smtp.resendWebhookSecret} onChange={(e) => setSmtp((p) => ({ ...p, resendWebhookSecret: e.target.value }))} placeholder="whsec_xxxxxxxxxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Resend From Email</Label>
                  <Input value={smtp.resendFromEmail} onChange={(e) => setSmtp((p) => ({ ...p, resendFromEmail: e.target.value }))} placeholder="noreply@yourdomain.com" />
                </div>
                <div className="space-y-2">
                  <Label>Resend From Name</Label>
                  <Input value={smtp.resendFromName} onChange={(e) => setSmtp((p) => ({ ...p, resendFromName: e.target.value }))} placeholder="Textzy" />
                </div>
              </>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Test Recipient Email</Label>
              <Input value={smtp.testEmail} onChange={(e) => setSmtp((p) => ({ ...p, testEmail: e.target.value }))} placeholder="owner@yourdomain.com" />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button
                className="bg-orange-500 hover:bg-orange-600"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await savePlatformSettings("smtp", {
                      provider: smtp.provider || "smtp",
                      host: smtp.host || "",
                      port: smtp.port || "587",
                      timeoutMs: smtp.timeoutMs || "15000",
                      enableSsl: smtp.enableSsl ? "true" : "false",
                      username: smtp.username || "",
                      password: smtp.password || "",
                      fromEmail: smtp.fromEmail || "",
                      fromName: smtp.fromName || "Textzy",
                      resendApiKey: smtp.resendApiKey || "",
                      resendWebhookSecret: smtp.resendWebhookSecret || "",
                      resendFromEmail: smtp.resendFromEmail || "",
                      resendFromName: smtp.resendFromName || "Textzy",
                    });
                    toast.success("Email provider settings saved");
                  } catch (e) {
                    toast.error(e?.message || "Failed to save email settings");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Save
              </Button>
              <Button
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  if (!smtp.testEmail) {
                    toast.error("Enter test recipient email");
                    return;
                  }
                  try {
                    setLoading(true);
                    await testPlatformSmtp(smtp.testEmail);
                    toast.success("SMTP test email sent");
                  } catch (e) {
                    toast.error(e?.message || "SMTP test failed");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Test SMTP
              </Button>
              <Button
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await diagnosePlatformSmtp({
                      provider: smtp.provider || "smtp",
                      host: smtp.provider === "resend" ? "" : (smtp.host || ""),
                      port: smtp.provider === "resend" ? "443" : (smtp.port || ""),
                      timeoutMs: smtp.timeoutMs || "15000",
                      enableSsl: smtp.enableSsl ? "true" : "false",
                    });
                    setSmtpDiag(res?.result || res || null);
                    toast.success("SMTP diagnostics completed");
                  } catch (e) {
                    const payload = e?.response || e?.data || null;
                    if (payload?.result) setSmtpDiag(payload.result);
                    toast.error(e?.message || "SMTP diagnostics failed");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Diagnose SMTP
              </Button>
            </div>
            <div className="md:col-span-2 rounded-lg border border-slate-200 p-3 text-xs">
              <p className="font-medium text-slate-900 mb-2">Diagnostics Result</p>
              {smtpDiag ? (
                <pre className="whitespace-pre-wrap break-all text-slate-700">{JSON.stringify(smtpDiag, null, 2)}</pre>
              ) : (
                <p className="text-slate-500">Run Diagnose SMTP to see DNS/TCP/TLS stage output.</p>
              )}
            </div>
            <div className="md:col-span-2 rounded-lg border border-slate-200 p-3 text-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">Email Report (Resend Webhooks)</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const report = await getPlatformEmailReport({ days: 7, take: 60 });
                      setEmailReport(report || null);
                    } catch (e) {
                      toast.error(e?.message || "Failed to load email report");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Refresh Report
                </Button>
              </div>
              {emailReport ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Events</div><div className="font-semibold">{emailReport?.totals?.events ?? 0}</div></div>
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Delivered</div><div className="font-semibold">{emailReport?.totals?.delivered ?? 0}</div></div>
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Bounced</div><div className="font-semibold">{emailReport?.totals?.bounced ?? 0}</div></div>
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Complained</div><div className="font-semibold">{emailReport?.totals?.complained ?? 0}</div></div>
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Opened</div><div className="font-semibold">{emailReport?.totals?.opened ?? 0}</div></div>
                    <div className="rounded border border-slate-200 p-2"><div className="text-slate-500">Clicked</div><div className="font-semibold">{emailReport?.totals?.clicked ?? 0}</div></div>
                  </div>
                  <div className="max-h-64 overflow-auto border border-slate-200 rounded">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2">Time</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">To</th>
                          <th className="p-2">Subject</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(emailReport.recent || []).map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="p-2 whitespace-nowrap">{new Date(row.atUtc).toLocaleString()}</td>
                            <td className="p-2">{row.eventType || "-"}</td>
                            <td className="p-2">{row.status || "-"}</td>
                            <td className="p-2">{row.to || "-"}</td>
                            <td className="p-2">{row.subject || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-slate-500">No email report data yet. Configure Resend webhook and refresh.</p>
              )}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Webhook Queue</div>
                <div className="text-lg font-semibold">{queueHealth?.webhook?.depth ?? 0}</div>
                <div className="text-xs text-slate-500">provider: {queueHealth?.webhook?.provider || "-"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Outbound Queue</div>
                <div className="text-lg font-semibold">{queueHealth?.outbound?.depth ?? 0}</div>
                <div className="text-xs text-slate-500">provider: {queueHealth?.outbound?.provider || "-"}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Dead Letter (24h)</div>
                <div className="text-lg font-semibold">{queueHealth?.webhook?.deadLetter24h ?? 0}</div>
                <div className="text-xs text-slate-500">retrying: {queueHealth?.webhook?.retrying ?? 0}</div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">WABA Debug Health</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const [wh, tp] = await Promise.all([
                      getWabaDebugWebhookHealth().catch(() => null),
                      getWabaDebugTenantProbe().catch(() => null),
                    ]);
                    setWabaWebhookHealth(wh);
                    setWabaTenantProbe(tp);
                  }}
                >
                  Refresh Health
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Webhook</div>
                  <div className="mt-1 text-slate-900">
                    verifyToken: {wabaWebhookHealth?.configured?.verifyToken ? "yes" : "no"},
                    {" "}appSecret: {wabaWebhookHealth?.configured?.appSecret ? "yes" : "no"},
                    {" "}callbackUrl: {wabaWebhookHealth?.configured?.callbackUrl ? "yes" : "no"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 break-all">{wabaWebhookHealth?.configured?.callbackUrlValue || "-"}</div>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Tenant Probe</div>
                  <div className="mt-1 text-slate-900">
                    connected: {wabaTenantProbe?.connected ? "yes" : "no"},
                    {" "}wabaId: {wabaTenantProbe?.wabaId || "-"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 break-all">{wabaTenantProbe?.reason || "-"}</div>
                </div>
              </div>
            </div>
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
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-900">Webhook Analytics</p>
              <div className="flex flex-wrap gap-2">
                <Select value={analyticsTenantId || "all"} onValueChange={(v) => setAnalyticsTenantId(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (control only)</SelectItem>
                    {(tenants || []).map((t) => <SelectItem key={t.tenantId} value={t.tenantId}>{t.tenantName}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={analyticsDays} onValueChange={setAnalyticsDays}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="15">15 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={async () => setAnalytics(await getPlatformWebhookAnalytics(analyticsTenantId, Number(analyticsDays || 7)))}
                >
                  Refresh Analytics
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded border border-slate-100 p-2">
                  <div className="font-medium mb-1">Status Summary</div>
                  {Object.entries(analytics?.statusSummary || {}).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></div>)}
                </div>
                <div className="rounded border border-slate-100 p-2">
                  <div className="font-medium mb-1">Failure Codes</div>
                  {Object.entries(analytics?.failureCodes || {}).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></div>)}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Time</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Source</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Provider</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Action</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((x) => (
                    <tr key={x.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 text-slate-900">{x.source || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{x.provider || "-"}</td>
                      <td className="px-3 py-2 text-slate-900">{x.action || x.Action || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{x.status || "-"}</td>
                      <td className="px-3 py-2 text-slate-600">{x.details || x.Details || "-"}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No webhook logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "request-logs" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>API Request / Response Logs</CardTitle>
            <CardDescription>All API requests with request/response snapshots for platform diagnostics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-6">
              <Select
                value={requestLogFilters.tenantId || "all"}
                onValueChange={(v) => setRequestLogFilters((p) => ({ ...p, tenantId: v === "all" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {(tenants || []).map((t) => <SelectItem key={t.tenantId} value={t.tenantId}>{t.tenantName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={requestLogFilters.method || "all"}
                onValueChange={(v) => setRequestLogFilters((p) => ({ ...p, method: v === "all" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Status code"
                value={requestLogFilters.statusCode}
                onChange={(e) => setRequestLogFilters((p) => ({ ...p, statusCode: e.target.value }))}
              />
              <Input
                placeholder="Path contains..."
                value={requestLogFilters.pathContains}
                onChange={(e) => setRequestLogFilters((p) => ({ ...p, pathContains: e.target.value }))}
              />
              <Input
                placeholder="Limit"
                value={requestLogFilters.limit}
                onChange={(e) => setRequestLogFilters((p) => ({ ...p, limit: e.target.value }))}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  const rows = await getPlatformRequestLogs({
                    tenantId: requestLogFilters.tenantId,
                    method: requestLogFilters.method,
                    statusCode: requestLogFilters.statusCode,
                    pathContains: requestLogFilters.pathContains,
                    limit: Number(requestLogFilters.limit || 200),
                  });
                  setRequestLogs(rows || []);
                }}
              >
                Refresh
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Method</th>
                    <th className="text-left px-3 py-2">Path</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Duration</th>
                    <th className="text-left px-3 py-2">Tenant</th>
                    <th className="text-left px-3 py-2">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {(requestLogs || []).map((x) => (
                    <tr key={x.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 text-slate-900">{x.method}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{x.path}</div>
                        <div className="text-xs text-slate-500 break-all">{x.queryString || "-"}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-800">{x.statusCode}</td>
                      <td className="px-3 py-2 text-slate-800">{x.durationMs} ms</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{x.tenantId || "-"}</td>
                      <td className="px-3 py-2">
                        <details>
                          <summary className="cursor-pointer text-xs text-orange-600">View request/response</summary>
                          <div className="mt-2 space-y-2">
                            <div>
                              <div className="text-[11px] font-medium text-slate-500">Request</div>
                              <pre className="max-h-40 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-700 whitespace-pre-wrap">{x.requestBody || "-"}</pre>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-slate-500">Response</div>
                              <pre className="max-h-40 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-700 whitespace-pre-wrap">{x.responseBody || "-"}</pre>
                            </div>
                            {x.error ? (
                              <div>
                                <div className="text-[11px] font-medium text-red-600">Error</div>
                                <pre className="max-h-20 overflow-auto rounded border border-red-100 bg-red-50 p-2 text-[11px] text-red-700 whitespace-pre-wrap">{x.error}</pre>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                  {(requestLogs || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No request logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "waba-onboarding" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Project Onboarding States</CardTitle>
            <CardDescription>Counts and per-project WABA onboarding status for owner control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(onboardingSummary?.counts || {}).map(([state, value]) => (
                <div key={state} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{state.replaceAll("_", " ")}</div>
                  <div className="text-xl font-semibold text-slate-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">Total projects: {onboardingSummary?.totalProjects ?? 0}</p>
              <Button
                variant="outline"
                onClick={async () => setOnboardingSummary(await getPlatformWabaOnboardingSummary())}
              >
                Refresh
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={lifecycleTenantId || "none"} onValueChange={(v) => setLifecycleTenantId(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-[320px]"><SelectValue placeholder="Select project for lifecycle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select project</SelectItem>
                    {(onboardingSummary?.projects || []).map((p) => (
                      <SelectItem key={p.tenantId} value={p.tenantId}>{p.tenantName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={!lifecycleTenantId || lifecycleLoading}
                  onClick={async () => {
                    try {
                      setLifecycleLoading(true);
                      const data = await getPlatformWabaLifecycle(lifecycleTenantId);
                      setLifecycleData(data || null);
                    } catch (e) {
                      toast.error(e?.message || "Failed to load lifecycle.");
                    } finally {
                      setLifecycleLoading(false);
                    }
                  }}
                >
                  Lifecycle
                </Button>
                <Button
                  variant="outline"
                  disabled={!lifecycleTenantId || lifecycleLoading}
                  onClick={async () => {
                    try {
                      setLifecycleLoading(true);
                      await reissuePlatformWabaToken(lifecycleTenantId);
                      toast.success("System user token reissued.");
                      setLifecycleData(await getPlatformWabaLifecycle(lifecycleTenantId));
                      setOnboardingSummary(await getPlatformWabaOnboardingSummary());
                    } catch (e) {
                      toast.error(e?.message || "Failed to reissue token.");
                    } finally {
                      setLifecycleLoading(false);
                    }
                  }}
                >
                  Reissue Token
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  disabled={!lifecycleTenantId || lifecycleLoading}
                  onClick={async () => {
                    if (!window.confirm("Deactivate WABA for this project?")) return;
                    try {
                      setLifecycleLoading(true);
                      await deactivatePlatformWabaLifecycle(lifecycleTenantId);
                      toast.success("Tenant WABA deactivated.");
                      setLifecycleData(await getPlatformWabaLifecycle(lifecycleTenantId).catch(() => null));
                      setOnboardingSummary(await getPlatformWabaOnboardingSummary());
                    } catch (e) {
                      toast.error(e?.message || "Failed to deactivate.");
                    } finally {
                      setLifecycleLoading(false);
                    }
                  }}
                >
                  Deactivate
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">State</div>
                  <div className="text-slate-900">{lifecycleData?.onboardingState || "-"}</div>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">System User</div>
                  <div className="text-slate-900 break-all">{lifecycleData?.systemUserId || "-"}</div>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Token Source</div>
                  <div className="text-slate-900">{lifecycleData?.tokenSource || "-"}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Project</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Slug</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">State</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">WABA</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Phone</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Last Error</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(onboardingSummary?.projects || []).map((x) => (
                    <tr key={x.tenantId} className="border-t border-slate-100">
                      <td className="px-3 py-2">{x.tenantName || "-"}</td>
                      <td className="px-3 py-2 text-slate-600">{x.tenantSlug || "-"}</td>
                      <td className="px-3 py-2">{x.state || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{x.wabaId || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{x.displayPhoneNumber || "-"}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[320px] truncate">{x.lastError || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {!["ready", "cancelled", "not_configured", "error"].includes((x.state || "").toLowerCase()) ? (
                            <Button
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              onClick={async () => {
                                try {
                                  await cancelPlatformWabaRequest(x.tenantId);
                                  toast.success(`Cancelled onboarding for ${x.tenantName}`);
                                  setOnboardingSummary(await getPlatformWabaOnboardingSummary());
                                } catch (e) {
                                  toast.error(e?.message || "Failed to cancel onboarding request.");
                                }
                              }}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={async () => {
                              try {
                                setLifecycleTenantId(x.tenantId);
                                const data = await getPlatformWabaLifecycle(x.tenantId);
                                setLifecycleData(data || null);
                              } catch (e) {
                                toast.error(e?.message || "Failed to load lifecycle.");
                              }
                            }}
                          >
                            Lifecycle
                          </Button>
                          <Button
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={async () => {
                              try {
                                await reissuePlatformWabaToken(x.tenantId);
                                toast.success("Token reissued");
                                if (lifecycleTenantId === x.tenantId) {
                                  setLifecycleData(await getPlatformWabaLifecycle(x.tenantId));
                                }
                              } catch (e) {
                                toast.error(e?.message || "Reissue failed");
                              }
                            }}
                          >
                            Reissue
                          </Button>
                          <Button
                            variant="outline"
                            className="h-8 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={async () => {
                              if (!window.confirm(`Deactivate WABA for ${x.tenantName}?`)) return;
                              try {
                                await deactivatePlatformWabaLifecycle(x.tenantId);
                                toast.success("Tenant deactivated");
                                setOnboardingSummary(await getPlatformWabaOnboardingSummary());
                              } catch (e) {
                                toast.error(e?.message || "Deactivate failed");
                              }
                            }}
                          >
                            Deactivate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(onboardingSummary?.projects || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">No projects found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "waba-lookup" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>WABA ID / Phone ID Lookup</CardTitle>
            <CardDescription>Resolve mapping in both directions using platform global token (project selection optional).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Project (Optional)</Label>
              <Select value={wabaLookupTenantId || "none"} onValueChange={(v) => setWabaLookupTenantId(v === "none" ? "" : v)}>
                <SelectTrigger className="w-[320px]"><SelectValue placeholder="No project selected (platform-global)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project selected (platform-global)</SelectItem>
                  {(tenants || []).map((t) => (
                    <SelectItem key={t.tenantId} value={t.tenantId}>{t.tenantName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="font-medium text-slate-900">Lookup by Phone Number ID</div>
                <Input
                  placeholder="Enter phone_number_id"
                  value={lookupPhoneId}
                  onChange={(e) => setLookupPhoneId(e.target.value)}
                />
                <Button
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={lookupLoading}
                  onClick={async () => {
                    if (!lookupPhoneId.trim()) return toast.error("Enter phone number ID");
                    try {
                      setLookupLoading(true);
                      const data = await platformLookupByPhone(wabaLookupTenantId, lookupPhoneId.trim());
                      setLookupByPhoneData(data || null);
                    } catch (e) {
                      toast.error(e?.message || "Lookup failed");
                    } finally {
                      setLookupLoading(false);
                    }
                  }}
                >
                  Resolve Phone → WABA
                </Button>
                {lookupByPhoneData ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                    <div><span className="text-slate-500">Display:</span> <b>{lookupByPhoneData.displayPhoneNumber || "-"}</b></div>
                    <div><span className="text-slate-500">Verified Name:</span> <b>{lookupByPhoneData.verifiedName || "-"}</b></div>
                    <div><span className="text-slate-500">WABA ID:</span> <b>{lookupByPhoneData.wabaId || "-"}</b></div>
                    <div><span className="text-slate-500">WABA Name:</span> <b>{lookupByPhoneData.wabaName || "-"}</b></div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="font-medium text-slate-900">Lookup by WABA ID</div>
                <Input
                  placeholder="Enter waba_id"
                  value={lookupWabaId}
                  onChange={(e) => setLookupWabaId(e.target.value)}
                />
                <Button
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={lookupLoading}
                  onClick={async () => {
                    if (!lookupWabaId.trim()) return toast.error("Enter WABA ID");
                    try {
                      setLookupLoading(true);
                      const data = await platformLookupByWaba(wabaLookupTenantId, lookupWabaId.trim());
                      setLookupByWabaData(data || null);
                    } catch (e) {
                      toast.error(e?.message || "Lookup failed");
                    } finally {
                      setLookupLoading(false);
                    }
                  }}
                >
                  Resolve WABA → Phones
                </Button>
                {lookupByWabaData ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                    <div><span className="text-slate-500">WABA Name:</span> <b>{lookupByWabaData.wabaName || "-"}</b></div>
                    <div><span className="text-slate-500">Verification:</span> <b>{lookupByWabaData.businessVerificationStatus || "-"}</b></div>
                    <div><span className="text-slate-500">Phones:</span> <b>{(lookupByWabaData.phones || []).length}</b></div>
                    <div className="max-h-40 overflow-auto rounded border border-slate-200 bg-white mt-2">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left px-2 py-1">Phone ID</th>
                            <th className="text-left px-2 py-1">Display</th>
                            <th className="text-left px-2 py-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lookupByWabaData.phones || []).map((x) => (
                            <tr key={x.id} className="border-t border-slate-100">
                              <td className="px-2 py-1">{x.id || "-"}</td>
                              <td className="px-2 py-1">{x.displayPhoneNumber || "-"}</td>
                              <td className="px-2 py-1">{x.status || "-"}</td>
                            </tr>
                          ))}
                          {(lookupByWabaData.phones || []).length === 0 && (
                            <tr><td colSpan={3} className="px-2 py-3 text-center text-slate-500">No phone numbers.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "waba-policies" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>WABA Error Classification Policies</CardTitle>
            <CardDescription>Control retryable/permanent behavior by Meta error code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1"><Label>Error Code</Label><Input value={policyForm.code} onChange={(e) => setPolicyForm((p) => ({ ...p, code: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Classification</Label>
                <Select value={policyForm.classification} onValueChange={(v) => setPolicyForm((p) => ({ ...p, classification: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retryable">retryable</SelectItem>
                    <SelectItem value="permanent">permanent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2"><Label>Description</Label><Input value={policyForm.description} onChange={(e) => setPolicyForm((p) => ({ ...p, description: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={async () => {
                try {
                  await upsertWabaErrorPolicy(policyForm);
                  setPolicyForm({ code: "", classification: "permanent", description: "", isActive: true });
                  setWabaPolicies(await listWabaErrorPolicies());
                  toast.success("Policy saved");
                } catch {
                  toast.error("Failed to save policy");
                }
              }}>Save Policy</Button>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Classification</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {wabaPolicies.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{p.code}</td>
                      <td className="px-3 py-2">{p.classification}</td>
                      <td className="px-3 py-2">{p.description || "-"}</td>
                      <td className="px-3 py-2">{p.isActive ? "Active" : "Inactive"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="mr-2" onClick={() => setPolicyForm({ code: p.code, classification: p.classification, description: p.description || "", isActive: !!p.isActive })}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          try { await deactivateWabaErrorPolicy(p.code); setWabaPolicies(await listWabaErrorPolicies()); toast.success("Policy deactivated"); } catch { toast.error("Deactivate failed"); }
                        }}>Deactivate</Button>
                      </td>
                    </tr>
                  ))}
                  {wabaPolicies.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No policies found.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "idempotency-diagnostics" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Idempotency Key Diagnostics</CardTitle>
            <CardDescription>Inspect reserved/accepted/failed idempotency keys by tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select value={idemTenantId || "none"} onValueChange={(v) => setIdemTenantId(v === "none" ? "" : v)}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select tenant</SelectItem>
                  {(tenants || []).map((t) => <SelectItem key={t.tenantId} value={t.tenantId}>{t.tenantName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={idemStatus} onValueChange={setIdemStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="reserved">reserved</SelectItem>
                  <SelectItem value="accepted">accepted</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                </SelectContent>
              </Select>
              <Input className="w-[180px]" type="number" min={1} value={idemStaleMinutes} onChange={(e) => setIdemStaleMinutes(e.target.value)} />
              <Button
                variant="outline"
                onClick={async () => {
                  if (!idemTenantId) return toast.error("Select tenant first");
                  const data = await getPlatformIdempotencyDiagnostics({
                    tenantId: idemTenantId,
                    status: idemStatus === "all" ? "" : idemStatus,
                    staleMinutes: Number(idemStaleMinutes || 30),
                    limit: 300
                  });
                  setIdemData(data || null);
                }}
              >
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Reserved</div>
                <div className="text-lg font-semibold">{idemData?.summary?.reserved || 0}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Accepted</div>
                <div className="text-lg font-semibold">{idemData?.summary?.accepted || 0}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Stale Reserved (&gt; {idemData?.staleMinutes || idemStaleMinutes}m)</div>
                <div className="text-lg font-semibold">{idemData?.staleReserved || 0}</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Created</th>
                    <th className="text-left px-3 py-2">Key</th>
                    <th className="text-left px-3 py-2">MessageId</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Stale</th>
                  </tr>
                </thead>
                <tbody>
                  {(idemData?.items || []).map((x) => (
                    <tr key={x.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{x.createdAtUtc ? new Date(x.createdAtUtc).toLocaleString() : "-"}</td>
                      <td className="px-3 py-2 text-slate-900">{x.key}</td>
                      <td className="px-3 py-2 text-slate-700">{x.messageId || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{x.status}</td>
                      <td className="px-3 py-2 text-slate-700">{x.stale ? "yes" : "no"}</td>
                    </tr>
                  ))}
                  {(idemData?.items || []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "security-ops" && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Security Operations</CardTitle>
            <CardDescription>
              Manage circuit breaker, queue purge, and platform security signals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <Select value={securityStatusFilter} onValueChange={setSecurityStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={securityTenantId || "none"}
                onValueChange={async (value) => {
                  const nextTenantId = value === "none" ? "" : value;
                  setSecurityTenantId(nextTenantId);
                  if (!nextTenantId) {
                    setSecurityControls({ circuitBreakerEnabled: false, ratePerMinuteOverride: 0, reason: "" });
                    return;
                  }
                  const controls = await getPlatformSecurityControls(nextTenantId).catch(() => null);
                  setSecurityControls({
                    circuitBreakerEnabled: !!controls?.circuitBreakerEnabled,
                    ratePerMinuteOverride: Number(controls?.ratePerMinuteOverride || 0),
                    reason: controls?.reason || ""
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select tenant</SelectItem>
                  {(tenants || []).map((t) => (
                    <SelectItem key={t.tenantId} value={t.tenantId}>{t.tenantName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                placeholder="Rate/min override"
                value={securityControls.ratePerMinuteOverride || 0}
                onChange={(e) =>
                  setSecurityControls((p) => ({ ...p, ratePerMinuteOverride: Number(e.target.value || 0) }))
                }
              />
              <Input
                placeholder="Reason"
                value={securityControls.reason || ""}
                onChange={(e) => setSecurityControls((p) => ({ ...p, reason: e.target.value }))}
              />
              <Button
                className="bg-orange-500 hover:bg-orange-600"
                onClick={async () => {
                  if (!securityTenantId) return toast.error("Select tenant first");
                  try {
                    await upsertPlatformSecurityControls({
                      tenantId: securityTenantId,
                      circuitBreakerEnabled: !!securityControls.circuitBreakerEnabled,
                      ratePerMinuteOverride: Number(securityControls.ratePerMinuteOverride || 0),
                      reason: securityControls.reason || ""
                    });
                    toast.success("Security controls updated.");
                  } catch {
                    toast.error("Failed to update controls.");
                  }
                }}
              >
                Save Controls
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={securityControls.circuitBreakerEnabled ? "default" : "outline"}
                className={securityControls.circuitBreakerEnabled ? "bg-red-600 hover:bg-red-700" : ""}
                onClick={() =>
                  setSecurityControls((p) => ({ ...p, circuitBreakerEnabled: !p.circuitBreakerEnabled }))
                }
              >
                Circuit Breaker: {securityControls.circuitBreakerEnabled ? "ON" : "OFF"}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await purgePlatformQueue("outbound");
                    toast.success("Outbound queue purge requested.");
                  } catch {
                    toast.error("Failed to purge outbound queue.");
                  }
                }}
              >
                Purge Outbound Queue
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await purgePlatformQueue("webhook");
                    toast.success("Webhook queue purge requested.");
                  } catch {
                    toast.error("Failed to purge webhook queue.");
                  }
                }}
              >
                Purge Webhook Queue
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Signal</th>
                    <th className="text-left px-3 py-2">Severity</th>
                    <th className="text-left px-3 py-2">Tenant</th>
                    <th className="text-left px-3 py-2">Details</th>
                    <th className="text-right px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(securitySignals || []).map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {s.createdAtUtc ? new Date(s.createdAtUtc).toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-900">{s.signalType || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{s.severity || "-"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{s.tenantId || "-"}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-[420px] break-words">{s.details || "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {String(s.status || "").toLowerCase() !== "resolved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await resolvePlatformSecuritySignal(s.id);
                                const rows = await getPlatformSecuritySignals({ status: securityStatusFilter, limit: 200 }).catch(() => []);
                                setSecuritySignals(rows || []);
                                toast.success("Signal marked resolved.");
                              } catch {
                                toast.error("Failed to resolve signal.");
                              }
                            }}
                          >
                            Resolve
                          </Button>
                        ) : (
                          <span className="text-xs text-emerald-600">Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(securitySignals || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No security signals.</td>
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
