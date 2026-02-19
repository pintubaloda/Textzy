import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Plus,
  MoreVertical,
  Users,
  UserPlus,
  Shield,
  Mail,
  Trash2,
  Edit,
  Search,
  Crown,
  UserCog,
  UserCheck,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

const TeamPage = () => {
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const teamMembers = [
    {
      id: 1,
      name: "Rahul Kumar",
      email: "rahul@techstart.com",
      role: "Owner",
      status: "active",
      lastActive: "Now",
      avatar: "RK",
    },
    {
      id: 2,
      name: "Priya Sharma",
      email: "priya@techstart.com",
      role: "Admin",
      status: "active",
      lastActive: "2 hours ago",
      avatar: "PS",
    },
    {
      id: 3,
      name: "Amit Patel",
      email: "amit@techstart.com",
      role: "Manager",
      status: "active",
      lastActive: "1 day ago",
      avatar: "AP",
    },
    {
      id: 4,
      name: "Sneha Gupta",
      email: "sneha@techstart.com",
      role: "Agent",
      status: "active",
      lastActive: "3 hours ago",
      avatar: "SG",
    },
    {
      id: 5,
      name: "Vikram Singh",
      email: "vikram@techstart.com",
      role: "Agent",
      status: "inactive",
      lastActive: "1 week ago",
      avatar: "VS",
    },
    {
      id: 6,
      name: "New User",
      email: "newuser@techstart.com",
      role: "Agent",
      status: "pending",
      lastActive: "Pending invitation",
      avatar: "NU",
    },
  ];

  const roles = [
    {
      name: "Owner",
      description: "Full access to all features and settings",
      permissions: ["All permissions"],
      count: 1,
    },
    {
      name: "Admin",
      description: "Manage team, billing, and all features",
      permissions: ["Team management", "Billing", "All messaging features"],
      count: 1,
    },
    {
      name: "Manager",
      description: "Manage campaigns, templates, and contacts",
      permissions: ["Campaigns", "Templates", "Contacts", "Analytics"],
      count: 1,
    },
    {
      name: "Agent",
      description: "Access inbox and respond to conversations",
      permissions: ["Inbox access", "View contacts"],
      count: 3,
    },
  ];

  const getRoleBadge = (role) => {
    switch (role) {
      case "Owner":
        return (
          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 gap-1">
            <Crown className="w-3 h-3" />
            {role}
          </Badge>
        );
      case "Admin":
        return (
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 gap-1">
            <Shield className="w-3 h-3" />
            {role}
          </Badge>
        );
      case "Manager":
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 gap-1">
            <UserCog className="w-3 h-3" />
            {role}
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 gap-1">
            <UserCheck className="w-3 h-3" />
            {role}
          </Badge>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>;
      case "inactive":
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Inactive</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pending</Badge>;
      default:
        return null;
    }
  };

  const handleInvite = () => {
    toast.success("Invitation sent successfully!");
    setShowInviteDialog(false);
  };

  return (
    <div className="space-y-6" data-testid="team-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Team</h1>
          <p className="text-slate-600">Manage your team members and roles</p>
        </div>
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2" data-testid="invite-member-btn">
              <UserPlus className="w-4 h-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your workspace
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input type="email" placeholder="colleague@company.com" data-testid="invite-email-input" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select defaultValue="agent">
                  <SelectTrigger data-testid="invite-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-2">Role Permissions</p>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• Access inbox and conversations</li>
                  <li>• View contact information</li>
                  <li>• Send messages (within limits)</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={handleInvite}>
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {roles.map((role, index) => (
          <Card key={index} className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{role.name}s</p>
                  <p className="text-2xl font-bold text-slate-900">{role.count}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  role.name === "Owner" ? "bg-orange-100" :
                  role.name === "Admin" ? "bg-purple-100" :
                  role.name === "Manager" ? "bg-blue-100" : "bg-slate-100"
                }`}>
                  {role.name === "Owner" && <Crown className="w-5 h-5 text-orange-600" />}
                  {role.name === "Admin" && <Shield className="w-5 h-5 text-purple-600" />}
                  {role.name === "Manager" && <UserCog className="w-5 h-5 text-blue-600" />}
                  {role.name === "Agent" && <UserCheck className="w-5 h-5 text-slate-600" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Members Table */}
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>6 members • 4 active, 1 inactive, 1 pending</CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search members..." className="pl-10 w-64" data-testid="search-members" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamMembers.map((member) => (
                <TableRow key={member.id} className="table-row-hover">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-white font-medium">
                          {member.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-slate-900">{member.name}</p>
                        <p className="text-sm text-slate-500">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(member.role)}</TableCell>
                  <TableCell>{getStatusBadge(member.status)}</TableCell>
                  <TableCell className="text-slate-500">{member.lastActive}</TableCell>
                  <TableCell>
                    {member.role !== "Owner" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`member-menu-${member.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Role
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            View Activity
                          </DropdownMenuItem>
                          {member.status === "pending" && (
                            <DropdownMenuItem>
                              <Mail className="w-4 h-4 mr-2" />
                              Resend Invitation
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Roles & Permissions */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>Overview of available roles and their permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {roles.map((role, index) => (
              <Card key={index} className="border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      role.name === "Owner" ? "bg-orange-100" :
                      role.name === "Admin" ? "bg-purple-100" :
                      role.name === "Manager" ? "bg-blue-100" : "bg-slate-100"
                    }`}>
                      {role.name === "Owner" && <Crown className="w-5 h-5 text-orange-600" />}
                      {role.name === "Admin" && <Shield className="w-5 h-5 text-purple-600" />}
                      {role.name === "Manager" && <UserCog className="w-5 h-5 text-blue-600" />}
                      {role.name === "Agent" && <UserCheck className="w-5 h-5 text-slate-600" />}
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900">{role.name}</h4>
                      <p className="text-xs text-slate-500">{role.count} member{role.count !== 1 && "s"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">{role.description}</p>
                  <div className="space-y-2">
                    {role.permissions.map((permission, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        {permission}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamPage;
