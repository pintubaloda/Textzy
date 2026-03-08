import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Filter, History, Laptop2, RefreshCcw, ShieldCheck, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  exportPlatformSecurityReport,
  getPlatformCustomers,
  getPlatformSecurityReport,
  getPlatformUsers,
} from "@/lib/api";

const fmt = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

function KpiCard({ title, value, hint, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{Number(value || 0).toLocaleString()}</p>
            <p className="mt-1 text-sm text-slate-500">{hint}</p>
          </div>
          <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${tones[tone] || tones.slate}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TableShell({ headers, children, empty, colSpan }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 text-left font-semibold text-slate-600">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children}
            {!children?.length ? (
              <tr>
                <td colSpan={colSpan || headers.length} className="px-4 py-10 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformSecurityReportPage() {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState({ summary: {}, loginHistory: [], sessionsByUser: [], auditEvents: [], notes: {} });
  const [filters, setFilters] = useState({
    tenantId: "",
    userId: "",
    actionContains: "",
    sessionStatus: "all",
    fromUtc: "",
    toUtc: "",
    limit: 200,
  });

  const load = async () => {
    try {
      setLoading(true);
      const [tenantRows, userRows, reportRows] = await Promise.all([
        getPlatformCustomers("").catch(() => []),
        getPlatformUsers("").catch(() => []),
        getPlatformSecurityReport(filters),
      ]);
      setTenants(Array.isArray(tenantRows) ? tenantRows : []);
      setUsers(Array.isArray(userRows) ? userRows : []);
      setReport(reportRows || { summary: {}, loginHistory: [], sessionsByUser: [], auditEvents: [], notes: {} });
    } catch (error) {
      toast.error(error?.message || "Failed to load security report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = async () => {
    try {
      setLoading(true);
      setReport(await getPlatformSecurityReport(filters));
    } catch (error) {
      toast.error(error?.message || "Failed to apply security filters");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    try {
      setExporting(true);
      const blob = await exportPlatformSecurityReport(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `platform-security-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.message || "Failed to export security report");
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary || {};
  const loginHistory = Array.isArray(report?.loginHistory) ? report.loginHistory : [];
  const sessionsByUser = Array.isArray(report?.sessionsByUser) ? report.sessionsByUser : [];
  const auditEvents = Array.isArray(report?.auditEvents) ? report.auditEvents : [];
  const note = report?.notes?.location || "IP address and device metadata are captured. Lat/long is not collected.";

  const tenantOptions = useMemo(() => (Array.isArray(tenants) ? tenants : []), [tenants]);
  const userOptions = useMemo(() => (Array.isArray(users) ? users : []), [users]);

  return (
    <div className="space-y-6" data-testid="platform-security-report-page">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/10">Platform Security Report</Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Login, session, and audit visibility for the full SaaS platform</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-200">
              Review login history, per-user session footprint, and action-level audit trails across all tenants. Export filtered evidence as CSV when needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={applyFilters} disabled={loading}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button className="bg-orange-500 text-white hover:bg-orange-600" onClick={downloadCsv} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard title="Logins" value={summary.loginCount} hint="Recent login/session records after filters" icon={History} tone="orange" />
        <KpiCard title="Active Sessions" value={summary.activeSessions} hint="Currently valid web sessions" icon={Laptop2} tone="emerald" />
        <KpiCard title="Unique Users" value={summary.uniqueUsers} hint="Distinct users represented in session history" icon={UserCircle2} tone="blue" />
        <KpiCard title="Audit Events" value={summary.auditEvents} hint="Action-level audit rows after filters" icon={ShieldCheck} tone="slate" />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-orange-500" />
            Filters
          </CardTitle>
          <CardDescription>{note}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <Label>Tenant</Label>
            <Select value={filters.tenantId || "all"} onValueChange={(value) => setFilters((prev) => ({ ...prev, tenantId: value === "all" ? "" : value }))}>
              <SelectTrigger><SelectValue placeholder="All tenants" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                {tenantOptions.map((tenant) => (
                  <SelectItem key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.tenantName || tenant.companyName || tenant.tenantSlug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>User</Label>
            <Select value={filters.userId || "all"} onValueChange={(value) => setFilters((prev) => ({ ...prev, userId: value === "all" ? "" : value }))}>
              <SelectTrigger><SelectValue placeholder="All users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {userOptions.map((user) => (
                  <SelectItem key={user.userId} value={user.userId}>
                    {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Session Status</Label>
            <Select value={filters.sessionStatus} onValueChange={(value) => setFilters((prev) => ({ ...prev, sessionStatus: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Action Filter</Label>
            <Input value={filters.actionContains} onChange={(e) => setFilters((prev) => ({ ...prev, actionContains: e.target.value }))} placeholder="team.invite, billing..." />
          </div>

          <div className="space-y-2">
            <Label>From (UTC)</Label>
            <Input type="datetime-local" value={filters.fromUtc} onChange={(e) => setFilters((prev) => ({ ...prev, fromUtc: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>To (UTC)</Label>
            <Input type="datetime-local" value={filters.toUtc} onChange={(e) => setFilters((prev) => ({ ...prev, toUtc: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Row Limit</Label>
            <Input type="number" min={20} max={1000} value={filters.limit} onChange={(e) => setFilters((prev) => ({ ...prev, limit: Number(e.target.value || 200) }))} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="logins" className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 rounded-2xl bg-slate-100">
          <TabsTrigger value="logins">Login History</TabsTrigger>
          <TabsTrigger value="sessions">Per-User Sessions</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="logins">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Login history</CardTitle>
              <CardDescription>Each row represents a created web session with IP, device, and 2FA markers.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableShell
                headers={["User", "Tenant", "Session State", "Device / IP", "Created", "Last Seen", "2FA"]}
                empty={loading ? "Loading login history..." : "No login history found for the current filters."}
              >
                {loginHistory.map((row) => {
                  const isRevoked = !!row.revokedAtUtc;
                  const isExpired = !isRevoked && row.expiresAtUtc && new Date(row.expiresAtUtc) <= new Date();
                  const stateText = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
                  const stateTone = isRevoked ? "bg-rose-100 text-rose-700" : isExpired ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                  return (
                    <tr key={row.sessionId} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.userName || "-"}</p>
                        <p className="text-xs text-slate-500">{row.userEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.tenantName}</p>
                        <p className="text-xs text-slate-500">{row.tenantSlug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={stateTone}>{stateText}</Badge>
                        <p className="mt-2 text-xs text-slate-500">{row.role || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.deviceLabel || row.userAgent || "-"}</p>
                        <p className="text-xs text-slate-500">Created: {row.ipAddress || "-"}</p>
                        <p className="text-xs text-slate-500">Last seen: {row.lastSeenIpAddress || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmt(row.createdAtUtc)}</td>
                      <td className="px-4 py-3 text-slate-700">{fmt(row.lastSeenAtUtc)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-xs">
                          <p className={row.twoFactorVerifiedAtUtc ? "text-emerald-700" : "text-slate-500"}>
                            {row.twoFactorVerifiedAtUtc ? `2FA verified ${fmt(row.twoFactorVerifiedAtUtc)}` : "2FA not verified"}
                          </p>
                          <p className={row.stepUpVerifiedAtUtc ? "text-blue-700" : "text-slate-500"}>
                            {row.stepUpVerifiedAtUtc ? `Step-up ${fmt(row.stepUpVerifiedAtUtc)}` : "No recent step-up"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TableShell>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Per-user session history</CardTitle>
              <CardDescription>Quick aggregation of session footprint per user across the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableShell
                headers={["User", "Sessions", "Active", "Last Tenant", "Last Device", "Last IP", "Last Seen"]}
                empty={loading ? "Loading session summary..." : "No session summary available for the current filters."}
              >
                {sessionsByUser.map((row) => (
                  <tr key={row.userId} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.userName || "-"}</p>
                      <p className="text-xs text-slate-500">{row.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{Number(row.sessionCount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-emerald-100 text-emerald-700">{Number(row.activeSessions || 0).toLocaleString()}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.lastTenantName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.lastDeviceLabel || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.lastIpAddress || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{fmt(row.lastSeenAtUtc)}</td>
                  </tr>
                ))}
              </TableShell>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Action audit trail</CardTitle>
              <CardDescription>Filterable action history with actor, tenant, IP address, and device metadata.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableShell
                headers={["Action", "Actor", "Tenant", "IP / Device", "Details", "When"]}
                empty={loading ? "Loading audit trail..." : "No audit events found for the current filters."}
              >
                {auditEvents.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="border-slate-300 text-slate-700">{row.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.actorName || "-"}</p>
                      <p className="text-xs text-slate-500">{row.actorEmail || "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.tenantName || "Platform"}</p>
                      <p className="text-xs text-slate-500">{row.tenantSlug || "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.ipAddress || "-"}</p>
                      <p className="text-xs text-slate-500">{row.deviceLabel || row.userAgent || "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700 break-words max-w-[360px]">{row.details || "-"}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{fmt(row.createdAtUtc)}</td>
                  </tr>
                ))}
              </TableShell>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
