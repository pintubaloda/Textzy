import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Users,
  Building,
  Settings,
  BarChart3,
  AlertTriangle,
  Search,
  Plus,
  MoreVertical,
  Eye,
  Ban,
  Trash2,
  Edit,
  RefreshCw,
  Server,
  Database,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Globe,
  CreditCard,
} from "lucide-react";

const AdminPage = () => {
  const [showCreateTenantDialog, setShowCreateTenantDialog] = useState(false);

  const tenants = [
    {
      id: 1,
      name: "TechStart India",
      domain: "techstart.textzy.in",
      plan: "Growth",
      status: "active",
      users: 6,
      messages: 89234,
      revenue: "₹59,994",
      createdAt: "Jan 15, 2024",
    },
    {
      id: 2,
      name: "ShopEasy Commerce",
      domain: "shopeasy.textzy.in",
      plan: "Enterprise",
      status: "active",
      users: 25,
      messages: 456789,
      revenue: "₹2,99,994",
      createdAt: "Dec 01, 2023",
    },
    {
      id: 3,
      name: "HealthFirst Clinic",
      domain: "healthfirst.textzy.in",
      plan: "Starter",
      status: "active",
      users: 2,
      messages: 12345,
      revenue: "₹17,994",
      createdAt: "Feb 01, 2024",
    },
    {
      id: 4,
      name: "QuickBite Foods",
      domain: "quickbite.textzy.in",
      plan: "Growth",
      status: "suspended",
      users: 8,
      messages: 34567,
      revenue: "₹29,997",
      createdAt: "Nov 15, 2023",
    },
  ];

  const systemStats = [
    { title: "Total Tenants", value: "156", change: "+12", icon: Building, color: "orange" },
    { title: "Active Users", value: "2,345", change: "+234", icon: Users, color: "blue" },
    { title: "Messages Today", value: "1.2M", change: "+15%", icon: Activity, color: "green" },
    { title: "Monthly Revenue", value: "₹45.6L", change: "+8%", icon: CreditCard, color: "purple" },
  ];

  const systemHealth = [
    { name: "API Gateway", status: "healthy", latency: "23ms", uptime: "99.99%" },
    { name: "Message Queue", status: "healthy", latency: "12ms", uptime: "99.98%" },
    { name: "Database Primary", status: "healthy", latency: "5ms", uptime: "99.99%" },
    { name: "WhatsApp BSP", status: "healthy", latency: "145ms", uptime: "99.95%" },
    { name: "SMS Gateway", status: "degraded", latency: "890ms", uptime: "99.12%" },
  ];

  const recentActivity = [
    { type: "tenant_created", message: "New tenant 'QuickMart' registered", time: "5 min ago" },
    { type: "plan_upgraded", message: "TechStart upgraded to Growth plan", time: "1 hour ago" },
    { type: "alert", message: "High message volume detected on ShopEasy", time: "2 hours ago" },
    { type: "tenant_suspended", message: "QuickBite Foods suspended for payment", time: "1 day ago" },
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>;
      case "suspended":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Suspended</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pending</Badge>;
      default:
        return null;
    }
  };

  const getHealthBadge = (status) => {
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 gap-1">
            <CheckCircle className="w-3 h-3" />
            Healthy
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 gap-1">
            <AlertTriangle className="w-3 h-3" />
            Degraded
          </Badge>
        );
      case "down":
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1">
            <XCircle className="w-3 h-3" />
            Down
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-600">Platform administration and monitoring</p>
        </div>
        <Dialog open={showCreateTenantDialog} onOpenChange={setShowCreateTenantDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="create-tenant-btn">
              <Plus className="w-4 h-4" />
              Create Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
              <DialogDescription>
                Set up a new tenant workspace
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input placeholder="Company name" />
              </div>
              <div className="space-y-2">
                <Label>Subdomain</Label>
                <div className="flex items-center gap-2">
                  <Input placeholder="company" />
                  <span className="text-slate-500">.textzy.in</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Admin Email</Label>
                <Input type="email" placeholder="admin@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select defaultValue="starter">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter - ₹2,999/mo</SelectItem>
                    <SelectItem value="growth">Growth - ₹9,999/mo</SelectItem>
                    <SelectItem value="enterprise">Enterprise - Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateTenantDialog(false)}>Cancel</Button>
              <Button className="bg-orange-500 hover:bg-orange-600">Create Tenant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {systemStats.map((stat, index) => (
          <Card key={index} className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-green-600 mt-1">{stat.change}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stat.color === "orange" ? "bg-orange-100" :
                  stat.color === "blue" ? "bg-blue-100" :
                  stat.color === "green" ? "bg-green-100" : "bg-purple-100"
                }`}>
                  <stat.icon className={`w-5 h-5 ${
                    stat.color === "orange" ? "text-orange-600" :
                    stat.color === "blue" ? "text-blue-600" :
                    stat.color === "green" ? "text-green-600" : "text-purple-600"
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="tenants" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tenants" className="gap-2">
            <Building className="w-4 h-4" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Server className="w-4 h-4" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="w-4 h-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="w-4 h-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* Tenants Tab */}
        <TabsContent value="tenants">
          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Tenants</CardTitle>
                  <CardDescription>Manage all registered tenants</CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search tenants..." className="pl-10 w-64" data-testid="search-tenants" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id} className="table-row-hover">
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{tenant.name}</p>
                          <p className="text-sm text-slate-500">{tenant.domain}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tenant.plan}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                      <TableCell className="text-slate-600">{tenant.users}</TableCell>
                      <TableCell className="text-slate-600">{tenant.messages.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-900 font-medium">{tenant.revenue}</TableCell>
                      <TableCell className="text-slate-500">{tenant.createdAt}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`tenant-menu-${tenant.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Globe className="w-4 h-4 mr-2" />
                              Login as Admin
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {tenant.status === "active" ? (
                              <DropdownMenuItem className="text-yellow-600">
                                <Ban className="w-4 h-4 mr-2" />
                                Suspend
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem className="text-green-600">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="system">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-slate-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Service Status</CardTitle>
                  <Button variant="outline" size="sm" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {systemHealth.map((service, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          service.status === "healthy" ? "bg-green-100" :
                          service.status === "degraded" ? "bg-yellow-100" : "bg-red-100"
                        }`}>
                          <Server className={`w-5 h-5 ${
                            service.status === "healthy" ? "text-green-600" :
                            service.status === "degraded" ? "text-yellow-600" : "text-red-600"
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{service.name}</p>
                          <p className="text-sm text-slate-500">Latency: {service.latency}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getHealthBadge(service.status)}
                        <p className="text-sm text-slate-500 mt-1">Uptime: {service.uptime}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border-b border-slate-100 last:border-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        activity.type === "tenant_created" ? "bg-green-100" :
                        activity.type === "plan_upgraded" ? "bg-blue-100" :
                        activity.type === "alert" ? "bg-yellow-100" : "bg-red-100"
                      }`}>
                        {activity.type === "tenant_created" && <Building className="w-4 h-4 text-green-600" />}
                        {activity.type === "plan_upgraded" && <TrendingUp className="w-4 h-4 text-blue-600" />}
                        {activity.type === "alert" && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                        {activity.type === "tenant_suspended" && <Ban className="w-4 h-4 text-red-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-slate-900">{activity.message}</p>
                        <p className="text-xs text-slate-500">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>System Activity Log</CardTitle>
              <CardDescription>All platform events and activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-slate-500">
                <Activity className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>Activity log will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="config">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
                <CardDescription>Global configuration options</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">New Registrations</p>
                    <p className="text-sm text-slate-500">Allow new tenant signups</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Email Verification</p>
                    <p className="text-sm text-slate-500">Require email verification</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">Maintenance Mode</p>
                    <p className="text-sm text-slate-500">Enable platform maintenance</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Rate Limits</CardTitle>
                <CardDescription>API and messaging limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Rate Limit (requests/min)</Label>
                  <Input defaultValue="1000" type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Max Messages per Tenant (daily)</Label>
                  <Input defaultValue="100000" type="number" />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Timeout (seconds)</Label>
                  <Input defaultValue="30" type="number" />
                </div>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
