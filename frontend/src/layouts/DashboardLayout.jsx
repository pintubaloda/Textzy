import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  LayoutDashboard,
  Inbox,
  Users,
  Megaphone,
  FileText,
  Zap,
  BarChart3,
  Plug,
  CreditCard,
  Settings,
  Shield,
  ChevronDown,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  User,
  HelpCircle,
  Moon,
  Sun,
  UsersRound,
  Check,
  Send,
  GitBranch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { authProjects, clearSession, getSession, initializeMe, switchProject } from "@/lib/api";

const DashboardLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [projects, setProjects] = useState([]);
  const [switchingProject, setSwitchingProject] = useState("");
  const session = getSession();
  const role = (session.role || "").toLowerCase();
  const canAccessPlatformSettings = role === "super_admin" || role === "owner";
  const isSettingsPage = location.pathname.startsWith("/dashboard/settings");
  const isTemplatesPage = location.pathname.startsWith("/dashboard/templates");
  const isSmsSetupPage = location.pathname.startsWith("/dashboard/sms-setup");
  const isAutomationsPage = location.pathname.startsWith("/dashboard/automations");
  const currentTemplatesTab = new URLSearchParams(location.search).get("tab") || "whatsapp";
  const currentSettingsTab = new URLSearchParams(location.search).get("tab") || "profile";
  const settingsMenus = [
    { key: "profile", label: "Profile" },
    { key: "company", label: "Company" },
    { key: "notifications", label: "Notification" },
    { key: "security", label: "Security" },
    { key: "whatsapp", label: "Waba" },
  ];

  useEffect(() => {
    initializeMe();
    authProjects().then((res) => setProjects(Array.isArray(res) ? res : [])).catch(() => setProjects([]));
  }, []);

  const handleProjectSwitch = async (slug) => {
    if (!slug || slug === session.tenantSlug) return;
    try {
      setSwitchingProject(slug);
      await switchProject(slug);
      window.location.assign("/dashboard");
    } finally {
      setSwitchingProject("");
    }
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Inbox", href: "/dashboard/inbox", icon: Inbox, badge: "12" },
    { name: "Contacts", href: "/dashboard/contacts", icon: Users },
    { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
    { name: "Automations", href: "/dashboard/automations", icon: Zap },
    { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
    { name: "Integrations", href: "/dashboard/integrations", icon: Plug },
    { name: "Team", href: "/dashboard/team", icon: UsersRound },
    { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
    { name: "Admin", href: "/dashboard/admin", icon: Shield },
  ];

  const isActive = (href) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(href);
  };

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className={`min-h-screen bg-slate-50 ${darkMode ? "dark" : ""}`} data-testid="dashboard-layout">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-slate-200 flex items-center px-4">
        <div className="flex items-center gap-4 flex-1">
          {/* Mobile Menu Toggle */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-sidebar-toggle"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="dashboard-logo">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-slate-900 hidden sm:block">Textzy</span>
          </Link>

          {/* Sidebar Toggle */}
          <button
            className="hidden lg:flex p-2 rounded-lg hover:bg-slate-100"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="sidebar-toggle"
          >
            <Menu className="w-5 h-5 text-slate-500" />
          </button>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search contacts, campaigns..."
                className="pl-10 bg-slate-50 border-slate-200 h-9"
                data-testid="global-search-input"
              />
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden md:flex border-orange-200 bg-orange-50 text-orange-700" data-testid="project-switch-btn">
                Project: {session.projectName || session.tenantSlug || "Select"}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Switch Project / Company</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((p) => (
                <DropdownMenuItem key={p.slug} onClick={() => handleProjectSwitch(p.slug)} disabled={switchingProject === p.slug}>
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.slug}</p>
                    </div>
                    {p.slug === session.tenantSlug ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                        <Check className="w-3 h-3" /> Current
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{p.role}</span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/projects")}>Manage Projects</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark Mode Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode(!darkMode)}
            className="text-slate-500"
            data-testid="dark-mode-toggle"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          {/* Help */}
          <Button variant="ghost" size="icon" className="text-slate-500" data-testid="help-btn">
            <HelpCircle className="w-5 h-5" />
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-slate-500" data-testid="notifications-btn">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="py-2 px-4 text-sm text-slate-500">
                <p className="font-medium text-slate-900 mb-1">Campaign "Summer Sale" delivered</p>
                <p className="text-xs">5 minutes ago</p>
              </div>
              <DropdownMenuSeparator />
              <div className="py-2 px-4 text-sm text-slate-500">
                <p className="font-medium text-slate-900 mb-1">New message from +91 98765 43210</p>
                <p className="text-xs">15 minutes ago</p>
              </div>
              <DropdownMenuSeparator />
              <div className="py-2 px-4 text-sm text-slate-500">
                <p className="font-medium text-slate-900 mb-1">Template "Order Update" approved</p>
                <p className="text-xs">1 hour ago</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="user-menu-btn">
                <Avatar className="w-8 h-8">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-orange-100 text-orange-600 text-sm font-medium">
                    {(session.email || "RK").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-slate-900">{session.email || "User"}</p>
                  <p className="text-xs text-slate-500">{session.role || "agent"}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="profile-menu-item">
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="settings-menu-item">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="billing-menu-item">
                <CreditCard className="w-4 h-4 mr-2" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="logout-menu-item">
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 bg-white border-r border-slate-200 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        } ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        data-testid="sidebar"
      >
        <ScrollArea className="h-full py-4">
          <nav className="px-3 space-y-1">
            {navigation.map((item) => (
              <div key={item.name}>
                <Link
                  to={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive(item.href)
                      ? "bg-orange-50 text-orange-600 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive(item.href) ? "text-orange-500" : ""}`} />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1">{item.name}</span>
                      {item.badge && (
                        <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
                {sidebarOpen && item.name === "Campaigns" && (
                  <div className="pt-2 pb-1">
                    <p className="px-3 pb-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Templates</p>
                    <Link
                      to="/dashboard/templates?tab=whatsapp"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isTemplatesPage && currentTemplatesTab !== "sms"
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm">WhatsApp</span>
                    </Link>
                    <Link
                      to="/dashboard/templates?tab=sms"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isTemplatesPage && currentTemplatesTab === "sms"
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Send className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm">SMS</span>
                    </Link>
                    <Link
                      to="/dashboard/sms-setup"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isSmsSetupPage
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Settings className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm">SMS Setup</span>
                    </Link>
                  </div>
                )}
                {sidebarOpen && item.name === "Automations" && (
                  <div className="pt-2 pb-1">
                    <Link
                      to="/dashboard/automations/workflow"
                      className={`ml-4 flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isAutomationsPage && location.pathname.includes("/workflow")
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <GitBranch className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm">Work Flow</span>
                    </Link>
                    <Link
                      to="/dashboard/automations/qa"
                      className={`ml-4 flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isAutomationsPage && location.pathname.includes("/qa")
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <HelpCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1 text-sm">Q&A</span>
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {canAccessPlatformSettings && sidebarOpen && (
              <div className="pt-3 mt-3 border-t border-slate-200">
                <p className="px-3 pb-2 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                  Platform Setting
                </p>
                <Link
                  to="/dashboard/platform-settings?tab=waba-master"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    location.pathname.startsWith("/dashboard/platform-settings") && new URLSearchParams(location.search).get("tab") !== "payment-gateway"
                      ? "bg-orange-50 text-orange-600 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-sm">Waba Master Config</span>
                </Link>
                <Link
                  to="/dashboard/platform-settings?tab=payment-gateway"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    location.pathname.startsWith("/dashboard/platform-settings") && new URLSearchParams(location.search).get("tab") === "payment-gateway"
                      ? "bg-orange-50 text-orange-600 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <CreditCard className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-sm">Payment Gateway Setup</span>
                </Link>
                <Link
                  to="/dashboard/platform-settings?tab=webhook-logs"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    location.pathname.startsWith("/dashboard/platform-settings") && new URLSearchParams(location.search).get("tab") === "webhook-logs"
                      ? "bg-orange-50 text-orange-600 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Plug className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-sm">Webhook Logs</span>
                </Link>
              </div>
            )}
          </nav>

          {/* Usage Stats */}
          {sidebarOpen && (
            <div className="mx-3 mt-8 p-4 bg-slate-50 rounded-xl">
              <p className="text-sm font-medium text-slate-900 mb-3">Monthly Usage</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">WhatsApp Messages</span>
                    <span className="text-slate-900 font-medium">7,234 / 10,000</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: "72%" }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">SMS Credits</span>
                    <span className="text-slate-900 font-medium">32,100 / 50,000</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: "64%" }}></div>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4" data-testid="upgrade-plan-btn">
                Upgrade Plan
              </Button>
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <main
        className={`pt-16 transition-all duration-300 ${
          sidebarOpen ? "lg:pl-64" : "lg:pl-20"
        }`}
      >
        <div className="p-6">
          {isSettingsPage && (
            <div className="mb-4 h-12 bg-white border border-slate-200 rounded-xl flex items-center px-4 lg:px-6">
              <div className="flex items-center gap-2 overflow-x-auto">
                {settingsMenus.map((item) => (
                  <Link
                    key={item.key}
                    to={`/dashboard/settings?tab=${item.key}`}
                    className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${
                      currentSettingsTab === item.key
                        ? "bg-orange-100 text-orange-700 font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
