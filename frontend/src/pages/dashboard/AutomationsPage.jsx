import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  MoreVertical,
  Zap,
  Play,
  Pause,
  Clock,
  MessageSquare,
  Users,
  ArrowRight,
  GitBranch,
  Timer,
  Globe,
  Trash2,
  Edit,
  Copy,
  BarChart3,
  Bot,
  Target,
  Filter,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const AutomationsPage = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const automations = [
    {
      id: 1,
      name: "Welcome Flow",
      description: "Greet new contacts and introduce your business",
      trigger: "Contact Created",
      status: "active",
      executions: 12456,
      successRate: 98.5,
      lastRun: "5 min ago",
    },
    {
      id: 2,
      name: "Order Confirmation",
      description: "Send order details and tracking info",
      trigger: "Order Placed",
      status: "active",
      executions: 45678,
      successRate: 99.2,
      lastRun: "2 min ago",
    },
    {
      id: 3,
      name: "Abandoned Cart",
      description: "Remind customers about items left in cart",
      trigger: "Cart Abandoned",
      status: "active",
      executions: 3456,
      successRate: 67.8,
      lastRun: "1 hour ago",
    },
    {
      id: 4,
      name: "Customer Feedback",
      description: "Request feedback after order delivery",
      trigger: "Order Delivered",
      status: "paused",
      executions: 8765,
      successRate: 45.2,
      lastRun: "2 days ago",
    },
    {
      id: 5,
      name: "FAQ Chatbot",
      description: "Answer common customer questions automatically",
      trigger: "Message Received",
      status: "active",
      executions: 23456,
      successRate: 85.4,
      lastRun: "1 min ago",
    },
  ];

  const flowTemplates = [
    {
      name: "Welcome Series",
      description: "Multi-step onboarding sequence for new contacts",
      icon: Users,
      steps: 5,
    },
    {
      name: "Lead Qualification",
      description: "Qualify leads with interactive questions",
      icon: Target,
      steps: 7,
    },
    {
      name: "FAQ Bot",
      description: "Answer common questions with AI-powered responses",
      icon: Bot,
      steps: 10,
    },
    {
      name: "Appointment Booking",
      description: "Let customers book appointments via chat",
      icon: Clock,
      steps: 6,
    },
  ];

  const stats = [
    { title: "Active Automations", value: "12", icon: Zap, color: "orange" },
    { title: "Total Executions", value: "156K", icon: Play, color: "green" },
    { title: "Success Rate", value: "94.2%", icon: Target, color: "blue" },
    { title: "Messages Sent", value: "234K", icon: MessageSquare, color: "purple" },
  ];

  return (
    <div className="space-y-6" data-testid="automations-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Automations</h1>
          <p className="text-slate-600">Create automated workflows and chatbots</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="create-automation-btn">
              <Plus className="w-4 h-4" />
              Create Automation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Create New Automation</DialogTitle>
              <DialogDescription>
                Choose a template or start from scratch to build your automation
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {flowTemplates.map((template, index) => (
                  <Card
                    key={index}
                    className="border-slate-200 cursor-pointer hover:border-orange-300 transition-colors"
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                          <template.icon className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900">{template.name}</h4>
                          <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                          <p className="text-xs text-slate-400 mt-2">{template.steps} steps</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-4">
                <Button variant="outline" className="w-full gap-2">
                  <Plus className="w-4 h-4" />
                  Start from Scratch
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stat.color === "orange" ? "bg-orange-100" :
                  stat.color === "green" ? "bg-green-100" :
                  stat.color === "blue" ? "bg-blue-100" : "bg-purple-100"
                }`}>
                  <stat.icon className={`w-5 h-5 ${
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

      {/* Automations List */}
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Automations</CardTitle>
              <CardDescription>Manage your automated workflows</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search automations..." className="pl-10 w-64" data-testid="search-automations" />
              </div>
              <Button variant="outline" size="icon" data-testid="filter-automations-btn">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className="p-4 border border-slate-200 rounded-lg hover:border-orange-200 transition-colors"
                data-testid={`automation-${automation.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      automation.status === "active" ? "bg-green-100" : "bg-slate-100"
                    }`}>
                      <Zap className={`w-6 h-6 ${
                        automation.status === "active" ? "text-green-600" : "text-slate-400"
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900">{automation.name}</h4>
                        <Badge className={automation.status === "active" ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-slate-100 text-slate-700 hover:bg-slate-100"}>
                          {automation.status === "active" ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{automation.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          Trigger: {automation.trigger}
                        </span>
                        <span className="flex items-center gap-1">
                          <Play className="w-3 h-3" />
                          {automation.executions.toLocaleString()} executions
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last run: {automation.lastRun}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{automation.successRate}%</p>
                      <p className="text-xs text-slate-500">Success rate</p>
                    </div>
                    <Switch
                      checked={automation.status === "active"}
                      data-testid={`toggle-automation-${automation.id}`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`automation-menu-${automation.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Flow
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <BarChart3 className="w-4 h-4 mr-2" />
                          View Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        {automation.status === "active" ? (
                          <DropdownMenuItem>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem>
                            <Play className="w-4 h-4 mr-2" />
                            Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Flow Builder Preview */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Visual Flow Builder</CardTitle>
          <CardDescription>Build complex automation flows with our drag-and-drop editor</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 rounded-lg p-8 min-h-[400px]">
            <div className="flex items-center justify-center gap-8">
              {/* Sample Flow Nodes */}
              <div className="flow-node flow-node-trigger bg-white p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Target className="w-4 h-4 text-orange-600" />
                  </div>
                  <span className="font-medium text-slate-900">Trigger</span>
                </div>
                <p className="text-sm text-slate-500">Message Received</p>
              </div>

              <ArrowRight className="w-6 h-6 text-slate-300" />

              <div className="flow-node flow-node-condition bg-white p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <GitBranch className="w-4 h-4 text-yellow-600" />
                  </div>
                  <span className="font-medium text-slate-900">Condition</span>
                </div>
                <p className="text-sm text-slate-500">Check keyword</p>
              </div>

              <ArrowRight className="w-6 h-6 text-slate-300" />

              <div className="space-y-4">
                <div className="flow-node flow-node-action bg-white p-4 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-900">Send Message</span>
                  </div>
                  <p className="text-sm text-slate-500">Welcome template</p>
                </div>

                <div className="flow-node flow-node-action bg-white p-4 rounded-lg shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Timer className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-medium text-slate-900">Wait</span>
                  </div>
                  <p className="text-sm text-slate-500">24 hours</p>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
                <Plus className="w-4 h-4" />
                Open Flow Builder
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AutomationsPage;
