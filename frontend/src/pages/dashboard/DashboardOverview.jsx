import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  Send,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  MessageCircle,
  CheckCheck,
  Clock,
  AlertCircle,
  Plus,
  Calendar,
  MoreVertical,
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
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DashboardOverview = () => {
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    Promise.all([apiGet("/api/messages"), apiGet("/api/contacts"), apiGet("/api/campaigns")])
      .then(([m, c, cp]) => {
        setMessages(m || []);
        setContacts(c || []);
        setCampaigns(cp || []);
      })
      .catch(() => {});
  }, []);

  const computedStats = useMemo(() => {
    const total = messages.length;
    const sent = messages.filter((x) => x.status === "Accepted").length;
    const wa = messages.filter((x) => x.channel === 2).length;
    const sms = messages.filter((x) => x.channel === 1).length;
    return { total, sent, wa, sms, contacts: contacts.length };
  }, [messages, contacts]);

  const stats = [
    {
      title: "Total Messages",
      value: computedStats.total.toLocaleString(),
      change: "+12.5%",
      trend: "up",
      icon: MessageSquare,
      color: "orange",
    },
    {
      title: "WhatsApp Sent",
      value: computedStats.wa.toLocaleString(),
      change: "+8.2%",
      trend: "up",
      icon: MessageCircle,
      color: "green",
    },
    {
      title: "SMS Sent",
      value: computedStats.sms.toLocaleString(),
      change: "-2.1%",
      trend: "down",
      icon: Send,
      color: "blue",
    },
    {
      title: "Active Contacts",
      value: computedStats.contacts.toLocaleString(),
      change: "+5.3%",
      trend: "up",
      icon: Users,
      color: "purple",
    },
  ];

  const messageData = [
    { name: "Mon", whatsapp: 4000, sms: 2400 },
    { name: "Tue", whatsapp: 3000, sms: 1398 },
    { name: "Wed", whatsapp: 2000, sms: 9800 },
    { name: "Thu", whatsapp: 2780, sms: 3908 },
    { name: "Fri", whatsapp: 1890, sms: 4800 },
    { name: "Sat", whatsapp: 2390, sms: 3800 },
    { name: "Sun", whatsapp: 3490, sms: 4300 },
  ];

  const deliveryData = [
    { name: "Delivered", value: 92, color: "#22C55E" },
    { name: "Read", value: 78, color: "#3B82F6" },
    { name: "Failed", value: 3, color: "#EF4444" },
    { name: "Pending", value: 5, color: "#F59E0B" },
  ];

  const recentCampaigns = (campaigns || []).slice(0, 3).map((c) => ({
    name: c.name,
    status: "active",
    sent: computedStats.sent,
    delivered: computedStats.sent,
    read: Math.max(0, Math.floor(computedStats.sent * 0.7)),
  }));

  const recentConversations = [
    {
      name: "Priya Sharma",
      phone: "+91 98765 43210",
      message: "Thanks for the quick response!",
      time: "5 min ago",
      unread: true,
    },
    {
      name: "Amit Patel",
      phone: "+91 87654 32109",
      message: "When will my order be delivered?",
      time: "15 min ago",
      unread: true,
    },
    {
      name: "Sneha Gupta",
      phone: "+91 76543 21098",
      message: "I'd like to know more about...",
      time: "1 hour ago",
      unread: false,
    },
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge>;
      case "active":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Active</Badge>;
      case "scheduled":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Scheduled</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="dashboard-overview">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600">Welcome back, Rahul! Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" data-testid="date-range-btn">
            <Calendar className="w-4 h-4" />
            Last 7 days
          </Button>
          <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="new-campaign-btn">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="border-slate-200 stats-card" data-testid={`stat-card-${index}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <div className={`flex items-center gap-1 mt-2 text-sm ${stat.trend === "up" ? "text-green-600" : "text-red-600"}`}>
                    {stat.trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {stat.change} vs last week
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

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Message Trends Chart */}
        <Card className="lg:col-span-2 border-slate-200" data-testid="message-trends-chart">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Message Trends</CardTitle>
                <CardDescription>WhatsApp and SMS messages over time</CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Export CSV</DropdownMenuItem>
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={messageData}>
                  <defs>
                    <linearGradient id="colorWhatsapp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSms" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="whatsapp"
                    stroke="#25D366"
                    fillOpacity={1}
                    fill="url(#colorWhatsapp)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="sms"
                    stroke="#F97316"
                    fillOpacity={1}
                    fill="url(#colorSms)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#25D366]"></div>
                <span className="text-sm text-slate-600">WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-sm text-slate-600">SMS</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Stats */}
        <Card className="border-slate-200" data-testid="delivery-stats">
          <CardHeader>
            <CardTitle>Delivery Stats</CardTitle>
            <CardDescription>Today's message delivery breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {deliveryData.map((item, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.name === "Delivered" && <CheckCheck className="w-4 h-4 text-green-500" />}
                    {item.name === "Read" && <CheckCheck className="w-4 h-4 text-blue-500" />}
                    {item.name === "Failed" && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {item.name === "Pending" && <Clock className="w-4 h-4 text-yellow-500" />}
                    <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{item.value}%</span>
                </div>
                <Progress value={item.value} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Campaigns */}
        <Card className="border-slate-200" data-testid="recent-campaigns">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Campaigns</CardTitle>
                <CardDescription>Your latest campaign performance</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600" data-testid="view-all-campaigns-btn">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentCampaigns.map((campaign, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  data-testid={`campaign-item-${index}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-medium text-slate-900">{campaign.name}</p>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span>Sent: {campaign.sent.toLocaleString()}</span>
                      <span>Delivered: {campaign.delivered.toLocaleString()}</span>
                      <span>Read: {campaign.read.toLocaleString()}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Conversations */}
        <Card className="border-slate-200" data-testid="recent-conversations">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Conversations</CardTitle>
                <CardDescription>Latest messages from customers</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600" data-testid="view-all-conversations-btn">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentConversations.map((conversation, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  data-testid={`conversation-item-${index}`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                    {conversation.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-slate-900">{conversation.name}</p>
                      <span className="text-xs text-slate-500">{conversation.time}</span>
                    </div>
                    <p className="text-sm text-slate-500 truncate">{conversation.message}</p>
                  </div>
                  {conversation.unread && (
                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;
