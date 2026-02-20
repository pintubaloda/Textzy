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
  Plus,
  Calendar,
  MoreVertical,
  QrCode,
  PhoneCall,
  Bot,
  Plug,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

      {/* KPI Cards - Top */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="relative overflow-hidden border-slate-200 bg-white shadow-sm" data-testid={`stat-card-${index}`}>
            <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-slate-100/80" />
            <CardContent className="pt-4 pb-4 relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg text-slate-600 mb-1">{stat.title}</p>
                  <p className="text-5xl leading-none font-bold text-slate-900 mt-1">{stat.value}</p>
                  <div className={`flex items-center gap-1 mt-3 text-base ${stat.trend === "up" ? "text-green-600" : "text-red-500"}`}>
                    {stat.trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {stat.change} vs last week
                  </div>
                </div>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  stat.color === "orange" ? "bg-orange-100" :
                  stat.color === "green" ? "bg-green-100" :
                  stat.color === "blue" ? "bg-blue-100" : "bg-purple-100"
                }`}>
                  <stat.icon className={`w-6 h-6 ${
                    stat.color === "orange" ? "text-orange-500" :
                    stat.color === "green" ? "text-green-500" :
                    stat.color === "blue" ? "text-blue-500" : "text-purple-500"
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="rounded-[32px] p-6 md:p-8 bg-gradient-to-br from-[#30337a] via-[#3c3f90] to-[#31347a] text-white relative overflow-hidden border border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(227,66,255,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(83,136,255,0.18),transparent_35%)]" />
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="px-5 py-2 rounded-full bg-white/12 border border-white/10">WhatsApp Business API Status: <b className="text-fuchsia-200">Pending</b></div>
            <Button className="rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white">Apply Now</Button>
            <div className="px-5 py-2 rounded-full bg-white/12 border border-white/10">TRAIL(Pro + Flows)</div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-3xl border border-white/18 bg-white/6 p-6">
              <h3 className="text-4xl font-heading font-semibold leading-tight mb-4">Setup FREE WhatsApp Business Account</h3>
              <div className="rounded-xl border border-white/18 p-4 mb-5 text-lg">Apply for WhatsApp Business API</div>
              <p className="text-white/80 mb-2 text-xl leading-tight">Click on Continue With Facebook to apply for WhatsApp Business API</p>
              <p className="text-white/80 text-xl leading-tight">Requirement: Registered Business & Working Website.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20 text-base px-7">Schedule Meeting</Button>
                <Button className="bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white text-base px-7">Continue with Facebook</Button>
              </div>
            </div>
            <div className="rounded-3xl border border-white/18 bg-white/6 p-6 text-center">
              <QrCode className="w-32 h-32 mx-auto mb-4 text-white/90" />
              <p className="text-4xl font-semibold leading-tight">Project Business Name</p>
              <p className="text-white/80 mt-2 text-2xl">+91 72496 30121</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            <button className="rounded-2xl border border-white/20 bg-white/10 p-4 text-left text-lg"><PhoneCall className="w-6 h-6 mb-2" />Add WhatsApp Contacts</button>
            <button className="rounded-2xl border border-white/20 bg-white/10 p-4 text-left text-lg"><Users className="w-6 h-6 mb-2" />Add Team Members</button>
            <button className="rounded-2xl border border-white/20 bg-white/10 p-4 text-left text-lg"><Plug className="w-6 h-6 mb-2" />Explore Integrations</button>
            <button className="rounded-2xl border border-white/20 bg-white/10 p-4 text-left text-lg"><Bot className="w-6 h-6 mb-2" />Chatbot Setup</button>
          </div>
        </div>
      </section>

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
