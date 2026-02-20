import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Globe, Phone, Upload, Save, MessageSquare, Instagram, ChevronRight, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { wabaExchangeCode, wabaGetOnboardingStatus, wabaRecheckOnboarding, wabaStartOnboarding } from "@/lib/api";

const SettingsPage = () => {
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile");
  const [wabaView, setWabaView] = useState("whatsapp");
  const [whatsappStatus, setWhatsappStatus] = useState({ state: "requested", readyToSend: false, isConnected: false });
  const [startingWaba, setStartingWaba] = useState(false);
  const [connectingWaba, setConnectingWaba] = useState(false);
  const [checkingWaba, setCheckingWaba] = useState(false);

  const facebookAppId = process.env.REACT_APP_FACEBOOK_APP_ID || "";
  const embeddedConfigId = process.env.REACT_APP_WABA_EMBEDDED_CONFIG_ID || "";

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("Settings saved successfully!");
    }, 1000);
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) setActiveTab(tab);
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (activeTab === "whatsapp") {
      loadWabaStatus();
    }
  }, [activeTab]);

  const loadWabaStatus = async () => {
    try {
      const data = await wabaGetOnboardingStatus();
      setWhatsappStatus(data || {});
    } catch {
      setWhatsappStatus({ state: "requested", readyToSend: false, isConnected: false });
    }
  };


  const handleWabaStart = async () => {
    setStartingWaba(true);
    try {
      await wabaStartOnboarding();
      await loadWabaStatus();
      toast.success("Onboarding started");
    } catch (e) {
      toast.error(e.message || "Failed to start onboarding");
    } finally {
      setStartingWaba(false);
    }
  };

  const handleWabaRecheck = async () => {
    setCheckingWaba(true);
    try {
      const data = await wabaRecheckOnboarding();
      setWhatsappStatus(data || {});
      toast.success("Status refreshed");
    } catch (e) {
      toast.error(e.message || "Failed to refresh status");
    } finally {
      setCheckingWaba(false);
    }
  };

  const handleWabaConnect = async () => {
    if (!facebookAppId || !embeddedConfigId) {
      toast.error("Missing REACT_APP_FACEBOOK_APP_ID or REACT_APP_WABA_EMBEDDED_CONFIG_ID");
      return;
    }

    setConnectingWaba(true);
    try {
      const FB = await new Promise((resolve, reject) => {
        if (window.FB) return resolve(window.FB);
        window.fbAsyncInit = function () {
          window.FB.init({ appId: facebookAppId, cookie: true, xfbml: false, version: "v21.0" });
          resolve(window.FB);
        };
        const script = document.createElement("script");
        script.async = true;
        script.defer = true;
        script.src = "https://connect.facebook.net/en_US/sdk.js";
        script.onerror = reject;
        document.body.appendChild(script);
      });

      FB.login(async (response) => {
        if (!response || !response.authResponse) {
          setConnectingWaba(false);
          toast.error("Embedded signup cancelled");
          return;
        }
        const code = response.authResponse.code;
        if (!code) {
          setConnectingWaba(false);
          toast.error("Meta did not return authorization code");
          return;
        }
        try {
          await wabaExchangeCode(code);
          await loadWabaStatus();
          toast.success("WhatsApp connected");
        } catch (e) {
          toast.error(e.message || "Code exchange failed");
        } finally {
          setConnectingWaba(false);
        }
      }, {
        config_id: embeddedConfigId,
        response_type: "code",
        override_default_response_type: true,
        scope: "business_management,whatsapp_business_management,whatsapp_business_messaging",
      });
    } catch {
      setConnectingWaba(false);
      toast.error("Failed to load Facebook SDK");
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Settings</h1>
          <p className="text-slate-600">Manage your account and preferences</p>
        </div>
        <Button
          className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          onClick={handleSave}
          disabled={saving}
          data-testid="save-settings-btn"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          setSearchParams({ tab: value });
        }}
        className="space-y-6"
      >
        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="w-24 h-24">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-orange-100 text-orange-600 text-2xl font-medium">RK</AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" className="gap-2" data-testid="upload-avatar-btn">
                    <Upload className="w-4 h-4" />
                    Upload Photo
                  </Button>
                  <p className="text-sm text-slate-500 mt-2">JPG, PNG or GIF. Max size 2MB.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input defaultValue="Rahul" data-testid="first-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input defaultValue="Kumar" data-testid="last-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" defaultValue="rahul@techstart.com" data-testid="email-input" />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input defaultValue="+91 98765 43210" data-testid="phone-input" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input defaultValue="Admin" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select defaultValue="ist">
                    <SelectTrigger data-testid="timezone-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ist">Asia/Kolkata (IST)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                      <SelectItem value="pst">America/Los_Angeles (PST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Update your business details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input defaultValue="TechStart India Pvt. Ltd." data-testid="company-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select defaultValue="technology">
                    <SelectTrigger data-testid="industry-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="ecommerce">E-commerce</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input defaultValue="https://techstart.com" data-testid="website-input" />
                </div>
                <div className="space-y-2">
                  <Label>Company Size</Label>
                  <Select defaultValue="50-100">
                    <SelectTrigger data-testid="company-size-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="50-100">50-100 employees</SelectItem>
                      <SelectItem value="100+">100+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    defaultValue="123 Business Park, Sector 5, Mumbai, Maharashtra 400001"
                    data-testid="address-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input defaultValue="27XXXXX1234X1Z5" data-testid="gstin-input" />
                </div>
                <div className="space-y-2">
                  <Label>PAN</Label>
                  <Input defaultValue="XXXXX1234X" data-testid="pan-input" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium text-slate-900">Email Notifications</h4>
                <div className="space-y-4">
                  {[
                    { label: "Campaign completed", description: "Get notified when a campaign finishes" },
                    { label: "Low balance alerts", description: "Alert when SMS or message credits are low" },
                    { label: "New team member", description: "When someone joins your workspace" },
                    { label: "Template approved", description: "When your template is approved by WhatsApp" },
                    { label: "Weekly reports", description: "Receive weekly performance summaries" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="font-medium text-slate-900">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.description}</p>
                      </div>
                      <Switch defaultChecked={index < 3} data-testid={`notification-${index}`} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-slate-900">In-App Notifications</h4>
                <div className="space-y-4">
                  {[
                    { label: "New messages", description: "Show notification for new inbox messages" },
                    { label: "System alerts", description: "Important system notifications" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="font-medium text-slate-900">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.description}</p>
                      </div>
                      <Switch defaultChecked data-testid={`inapp-notification-${index}`} />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" data-testid="current-password-input" />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" data-testid="new-password-input" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" data-testid="confirm-password-input" />
                </div>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="update-password-btn">
                  Update Password
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>Add an extra layer of security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Enable 2FA</p>
                    <p className="text-sm text-slate-500">Use an authenticator app for additional security</p>
                  </div>
                  <Switch data-testid="enable-2fa-switch" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>Manage your active login sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Globe className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Chrome on macOS</p>
                        <p className="text-sm text-slate-500">Mumbai, India • Current session</p>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Phone className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Mobile App on iPhone</p>
                        <p className="text-sm text-slate-500">Mumbai, India • 2 hours ago</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                      Revoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp">
          <div className="space-y-4">
            <h2 className="text-3xl font-heading font-bold text-slate-900">Channel Setup</h2>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="border-slate-200 bg-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-green-700" />
                  </div>
                  <div className="flex-1 text-sm text-slate-700">
                    {whatsappStatus.isConnected ? "Your WhatsApp number is connected" : "Your WhatsApp number is not connected"}
                  </div>
                  <Button
                    onClick={handleWabaConnect}
                    disabled={connectingWaba}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {connectingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {whatsappStatus.isConnected ? "Reconnect Number" : "Connect Number"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
                    <Instagram className="w-5 h-5 text-pink-600" />
                  </div>
                  <div className="flex-1 text-sm text-slate-700">Your Business Instagram is not connected</div>
                  <Button variant="outline" disabled>
                    Connect Account
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
                  <button
                    onClick={() => setWabaView("whatsapp")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      wabaView === "whatsapp" ? "bg-white text-orange-600 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    WhatsApp
                  </button>
                  <button
                    onClick={() => setWabaView("instagram")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      wabaView === "instagram" ? "bg-white text-orange-600 shadow-sm" : "text-slate-600"
                    }`}
                  >
                    Instagram
                  </button>
                </div>
              </CardContent>
            </Card>

            {wabaView === "instagram" ? (
              <Card className="border-slate-200">
                <CardContent className="p-8 text-center">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center mb-3">
                    <Instagram className="w-6 h-6 text-pink-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900">Instagram setup is coming soon</h3>
                  <p className="text-slate-600 mt-2">Connect your Instagram business profile from this screen in the next update.</p>
                </CardContent>
              </Card>
            ) : null}

            {wabaView === "whatsapp" && !whatsappStatus.isConnected ? (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle>Setup FREE WhatsApp Business Account</CardTitle>
                  <CardDescription>Use Embedded Signup to connect your business in a guided flow</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                    <div className="text-sm font-semibold text-orange-800">Apply for WhatsApp Business API</div>
                    <p className="text-sm text-slate-600 mt-2">
                      Click on <b>Continue with Facebook</b> to start Embedded Signup. Requirement: registered business and working website.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-4 gap-3">
                    {[
                      { step: "Step 1", label: "Start onboarding", done: ["requested", "code_received", "exchanged", "assets_linked", "webhook_subscribed", "verified", "ready"].includes(whatsappStatus.state) },
                      { step: "Step 2", label: "Code exchange", done: ["exchanged", "assets_linked", "webhook_subscribed", "verified", "ready"].includes(whatsappStatus.state) },
                      { step: "Step 3", label: "Assets linked", done: ["assets_linked", "webhook_subscribed", "verified", "ready"].includes(whatsappStatus.state) },
                      { step: "Step 4", label: "Ready to send", done: !!whatsappStatus.readyToSend },
                    ].map((s) => (
                      <div key={s.step} className={`rounded-lg border p-3 ${s.done ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"}`}>
                        <div className="text-xs font-semibold text-slate-500">{s.step}</div>
                        <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
                          {s.done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-slate-400" />}
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleWabaStart} disabled={startingWaba} variant="outline">
                      {startingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Start Onboarding
                    </Button>
                    <Button onClick={handleWabaConnect} disabled={connectingWaba} className="bg-orange-500 hover:bg-orange-600 text-white">
                      {connectingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Continue with Facebook
                    </Button>
                    <Button onClick={handleWabaRecheck} disabled={checkingWaba} variant="outline">
                      {checkingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Refresh Checks
                    </Button>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    Current status: <span className="font-semibold text-slate-900">{whatsappStatus.state || "requested"}</span>
                    {whatsappStatus.lastError ? <div className="text-amber-700 mt-1">Last error: {whatsappStatus.lastError}</div> : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {wabaView === "whatsapp" && whatsappStatus.isConnected ? (
              <div className="grid xl:grid-cols-3 gap-4">
                <Card className="xl:col-span-2 border-slate-200">
                  <CardHeader>
                    <CardTitle>WhatsApp Cloud API Setup</CardTitle>
                    <CardDescription>Connected and operational details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Business Name</p>
                        <p className="font-semibold text-slate-900">{whatsappStatus.businessName || "Project Business Name"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Display Number</p>
                        <p className="font-semibold text-slate-900">{whatsappStatus.displayPhoneNumber || "Not available"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">Phone Number ID</p>
                        <p className="font-semibold text-slate-900 break-all">{whatsappStatus.phoneNumberId || "Not available"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs text-slate-500">WABA ID</p>
                        <p className="font-semibold text-slate-900 break-all">{whatsappStatus.wabaId || "Not available"}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs text-slate-500 mb-2">Connection Health</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                        </Badge>
                        <Badge className={whatsappStatus.readyToSend ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
                          {whatsappStatus.readyToSend ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                          {whatsappStatus.readyToSend ? "Ready to Send" : "Checks Pending"}
                        </Badge>
                        <Badge variant="outline" className="border-slate-300 text-slate-700">
                          State: {whatsappStatus.state || "connected"}
                        </Badge>
                      </div>
                      {whatsappStatus.lastError ? (
                        <p className="text-xs text-amber-700 mt-2">{whatsappStatus.lastError}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleWabaRecheck} disabled={checkingWaba} variant="outline">
                        {checkingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Refresh Checks
                      </Button>
                      <Button onClick={handleWabaConnect} disabled={connectingWaba} className="bg-orange-500 hover:bg-orange-600 text-white">
                        {connectingWaba ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Reconnect WhatsApp
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" className="w-full justify-between" onClick={handleWabaStart} disabled={startingWaba}>
                      Start/Re-run Onboarding
                      {startingWaba ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" className="w-full justify-between">
                      Open Meta Docs <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-between">
                      API & Webhooks <ChevronRight className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
