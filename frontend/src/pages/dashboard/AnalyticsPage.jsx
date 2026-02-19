import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Send,
  Users,
  CheckCheck,
  Eye,
  MousePointer,
  Clock,
  Calendar,
  Download,
  Filter,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

const AnalyticsPage = () => {
  const overviewStats = [
    {
      title: "Total Messages",
      value: "156,234",
      change: "+12.5%",
      trend: "up",
      icon: MessageSquare,
      color: "orange",
    },
    {
      title: "Delivery Rate",
      value: "98.5%",
      change: "+0.3%",
      trend: "up",
      icon: CheckCheck,
      color: "green",
    },
    {
      title: "Read Rate",
      value: "72.3%",
      change: "+5.2%",
      trend: "up",
      icon: Eye,
      color: "blue",
    },
    {
      title: "Click Rate",
      value: "24.8%",
      change: "-2.1%",
      trend: "down",
      icon: MousePointer,
      color: "purple",
    },
  ];

  const messageVolumeData = [
    { date: "Jan 1", whatsapp: 4000, sms: 2400 },
    { date: "Jan 5", whatsapp: 3000, sms: 1398 },
    { date: "Jan 10", whatsapp: 5000, sms: 3800 },
    { date: "Jan 15", whatsapp: 4780, sms: 3908 },
    { date: "Jan 20", whatsapp: 5890, sms: 4800 },
    { date: "Jan 25", whatsapp: 6390, sms: 3800 },
    { date: "Jan 30", whatsapp: 7490, sms: 4300 },
  ];

  const deliveryData = [
    { name: "Delivered", value: 92, color: "#22C55E" },
    { name: "Read", value: 78, color: "#3B82F6" },
    { name: "Failed", value: 3, color: "#EF4444" },
    { name: "Pending", value: 5, color: "#F59E0B" },
  ];

  const channelDistribution = [
    { name: "WhatsApp", value: 65, color: "#25D366" },
    { name: "SMS", value: 35, color: "#F97316" },
  ];

  const campaignPerformance = [
    { name: "Summer Sale", sent: 12500, delivered: 12234, read: 8456, clicked: 3245 },
    { name: "New Product", sent: 8900, delivered: 8756, read: 5678, clicked: 2134 },
    { name: "Flash Sale", sent: 15000, delivered: 14890, read: 10234, clicked: 4567 },
    { name: "Newsletter", sent: 25000, delivered: 24500, read: 15678, clicked: 5890 },
  ];

  const hourlyData = [
    { hour: "00:00", messages: 120 },
    { hour: "04:00", messages: 80 },
    { hour: "08:00", messages: 450 },
    { hour: "12:00", messages: 890 },
    { hour: "16:00", messages: 1200 },
    { hour: "20:00", messages: 980 },
    { hour: "24:00", messages: 340 },
  ];

  return (
    <div className="space-y-6" data-testid="analytics-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-600">Track your messaging performance and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Select defaultValue="30days">
            <SelectTrigger className="w-40" data-testid="date-range-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" data-testid="export-report-btn">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {overviewStats.map((stat, index) => (
          <Card key={index} className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <div className={`flex items-center gap-1 mt-2 text-sm ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`}>
                    {stat.trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {stat.change} vs last period
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  stat.color === "orange" ? "bg-orange-100" :
                  stat.color === "green" ? "bg-green-100" :
                  stat.color === "blue" ? "bg-blue-100" : "bg-purple-100"
                }`}>
                  <stat.icon className={`w-6 h-6 ${
                    stat.color === "orange" ? "text-orange-600" :
                    stat.color === "green" ? "text-green-600" :
                    stat.color === "blue" ? "text-blue-600" : "text-purple-600"
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Message Volume Chart */}
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <CardTitle>Message Volume</CardTitle>
            <CardDescription>WhatsApp and SMS messages over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={messageVolumeData}>
                  <defs>
                    <linearGradient id="colorWA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSMS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                    }}
                  />
                  <Area type="monotone" dataKey="whatsapp" stroke="#25D366" fillOpacity={1} fill="url(#colorWA)" strokeWidth={2} />
                  <Area type="monotone" dataKey="sms" stroke="#F97316" fillOpacity={1} fill="url(#colorSMS)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Channel Distribution</CardTitle>
            <CardDescription>Messages by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {channelDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Delivery Funnel */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Delivery Funnel</CardTitle>
            <CardDescription>Message delivery breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deliveryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" stroke="#64748B" fontSize={12} domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={12} width={80} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {deliveryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Peak Hours */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Peak Hours</CardTitle>
            <CardDescription>Message volume by time of day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="hour" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="messages" stroke="#F97316" strokeWidth={2} dot={{ fill: "#F97316" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
          <CardDescription>Metrics for your recent campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="sent" name="Sent" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="delivered" name="Delivered" fill="#22C55E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="read" name="Read" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicked" name="Clicked" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-500">2.3s</p>
              <p className="text-sm text-slate-600 mt-1">Avg. Response Time</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">₹0.28</p>
              <p className="text-sm text-slate-600 mt-1">Cost per Message</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-500">4.2x</p>
              <p className="text-sm text-slate-600 mt-1">ROI</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-500">15,832</p>
              <p className="text-sm text-slate-600 mt-1">Active Contacts</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsPage;
