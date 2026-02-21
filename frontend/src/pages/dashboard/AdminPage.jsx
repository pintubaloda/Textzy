import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getPlatformCustomers, getPlatformCustomerDetails, getPlatformCustomerUsage, getPlatformCustomerSubscriptions, getPlatformCustomerInvoices, getPlatformCustomerMembers, getPlatformCustomerActivity } from "@/lib/api";

const AdminPage = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [details, setDetails] = useState(null);
  const [usage, setUsage] = useState(null);
  const [subs, setSubs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);

  const loadCustomers = async (query = "") => {
    try {
      setLoading(true);
      const data = await getPlatformCustomers(query);
      setRows(Array.isArray(data) ? data : []);
      if (!selectedTenantId && data?.length > 0) setSelectedTenantId(data[0].tenantId);
    } catch (e) {
      toast.error(e.message || "Failed to load platform customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers("");
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;
    (async () => {
      try {
        const [d, u, s, i, m, a] = await Promise.all([
          getPlatformCustomerDetails(selectedTenantId),
          getPlatformCustomerUsage(selectedTenantId, selectedMonth),
          getPlatformCustomerSubscriptions(selectedTenantId),
          getPlatformCustomerInvoices(selectedTenantId),
          getPlatformCustomerMembers(selectedTenantId),
          getPlatformCustomerActivity(selectedTenantId, 100),
        ]);
        setDetails(d || null);
        setUsage(u || null);
        setSubs(Array.isArray(s) ? s : []);
        setInvoices(Array.isArray(i) ? i : []);
        setMembers(Array.isArray(m) ? m : []);
        setActivity(Array.isArray(a) ? a : []);
      } catch (e) {
        toast.error(e.message || "Failed to load tenant details");
      }
    })();
  }, [selectedTenantId, selectedMonth]);

  const totals = useMemo(() => {
    const tenants = rows.length;
    const users = rows.reduce((acc, x) => acc + Number(x.users || 0), 0);
    const activeUsers = rows.reduce((acc, x) => acc + Number(x.activeUsers || 0), 0);
    const revenue = rows.reduce((acc, x) => acc + Number(x.totalRevenue || 0), 0);
    return { tenants, users, activeUsers, revenue };
  }, [rows]);

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Platform Owner Panel</h1>
          <p className="text-slate-600">Monitor platform users, usage, plans, invoices and tenant activity.</p>
        </div>
        <Button variant="outline" onClick={() => loadCustomers(q)} disabled={loading}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-slate-500">Tenants</p><p className="text-2xl font-bold">{totals.tenants}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-slate-500">Users</p><p className="text-2xl font-bold">{totals.users}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-slate-500">Active Users</p><p className="text-2xl font-bold">{totals.activeUsers}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-slate-500">Total Revenue</p><p className="text-2xl font-bold">₹{totals.revenue.toLocaleString()}</p></CardContent></Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Platform Customers</CardTitle>
          <CardDescription>Select a tenant/company to view usage, purchase history and invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label>Search tenant</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by company name or slug"
                onKeyDown={(e) => { if (e.key === "Enter") loadCustomers(q); }}
              />
            </div>
            <div>
              <Label>Select tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {rows.map((r) => (
                    <SelectItem key={r.tenantId} value={r.tenantId}>{r.tenantName} ({r.tenantSlug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {details ? (
            <div className="rounded-lg border border-slate-200 p-4 grid md:grid-cols-4 gap-4">
              <div><p className="text-xs text-slate-500">Tenant</p><p className="font-semibold">{details.tenant?.name}</p></div>
              <div><p className="text-xs text-slate-500">Slug</p><p className="font-semibold">{details.tenant?.slug}</p></div>
              <div><p className="text-xs text-slate-500">Owner</p><p className="font-semibold">{rows.find(x => x.tenantId === selectedTenantId)?.ownerName || "-"}</p></div>
              <div><p className="text-xs text-slate-500">Plan</p><p className="font-semibold">{details.subscription?.plan?.name || "No Plan"}</p></div>
            </div>
          ) : null}

          <Tabs defaultValue="usage" className="space-y-4">
            <TabsList>
              <TabsTrigger value="usage">Usage</TabsTrigger>
              <TabsTrigger value="subscriptions">Purchase History</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="members">Users</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="usage" className="space-y-3">
              <div className="w-56">
                <Label>Month</Label>
                <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                {Object.entries(usage?.values || {}).map(([k, v]) => (
                  <Card key={k}><CardContent className="pt-5"><p className="text-xs text-slate-500">{k}</p><p className="text-xl font-semibold">{Number(v || 0).toLocaleString()}</p></CardContent></Card>
                ))}
                {Object.keys(usage?.values || {}).length === 0 ? <p className="text-sm text-slate-500">No usage data for selected month.</p> : null}
              </div>
            </TabsContent>

            <TabsContent value="subscriptions">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Plan</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Cycle</th>
                      <th className="text-left px-3 py-2">Start</th>
                      <th className="text-left px-3 py-2">Renew</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{s.plan?.name || "-"}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{s.status}</Badge></td>
                        <td className="px-3 py-2">{s.billingCycle}</td>
                        <td className="px-3 py-2">{s.startedAtUtc ? new Date(s.startedAtUtc).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">{s.renewAtUtc ? new Date(s.renewAtUtc).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                    {subs.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No purchase history.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="invoices">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Invoice</th>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Total</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{inv.invoiceNo || inv.id}</td>
                        <td className="px-3 py-2">{inv.createdAtUtc ? new Date(inv.createdAtUtc).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2">₹{Number(inv.total || 0).toLocaleString()}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{inv.status}</Badge></td>
                      </tr>
                    ))}
                    {invoices.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No invoices.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="members">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Email</th>
                      <th className="text-left px-3 py-2">Role</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.userId} className="border-t border-slate-100">
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2">{m.email}</td>
                        <td className="px-3 py-2">{m.role}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{m.isActive ? "active" : "inactive"}</Badge></td>
                      </tr>
                    ))}
                    {members.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No users.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="activity">
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Time</th>
                      <th className="text-left px-3 py-2">Action</th>
                      <th className="text-left px-3 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((a) => (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{a.createdAtUtc ? new Date(a.createdAtUtc).toLocaleString() : "-"}</td>
                        <td className="px-3 py-2">{a.action}</td>
                        <td className="px-3 py-2">{a.details}</td>
                      </tr>
                    ))}
                    {activity.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No activity found.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPage;

