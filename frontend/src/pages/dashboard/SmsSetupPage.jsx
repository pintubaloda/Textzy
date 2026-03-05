import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { archiveSmsSender, createSmsSender, getSmsSenderStats, listSmsSenders, updateSmsSender } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, FileCheck2, ShieldCheck, Trash2 } from "lucide-react";

const SmsSetupPage = () => {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0, verified: 0, compliant: 0, byRoute: {} });
  const [form, setForm] = useState({
    senderId: "",
    entityId: "",
    routeType: "service_explicit",
    purpose: "",
    description: "",
    isVerified: false,
  });
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [res, s] = await Promise.all([listSmsSenders(), getSmsSenderStats().catch(() => null)]);
      setRows(res || []);
      if (s) setStats(s);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.senderId.trim() || !form.entityId.trim()) {
      toast.error("Sender ID and Entity ID are required.");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        senderId: form.senderId.trim().toUpperCase(),
        entityId: form.entityId.trim(),
        routeType: form.routeType,
        purpose: form.purpose.trim(),
        description: form.description.trim(),
        isVerified: !!form.isVerified,
      };
      if (editingId) {
        await updateSmsSender(editingId, payload);
        toast.success("SMS sender updated.");
      } else {
        await createSmsSender(payload);
        toast.success("SMS sender saved.");
      }
      setEditingId("");
      setForm({ senderId: "", entityId: "", routeType: "service_explicit", purpose: "", description: "", isVerified: false });
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to save sender.");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingId(row.id);
    setForm({
      senderId: row.senderId || "",
      entityId: row.entityId || "",
      routeType: row.routeType || "service_explicit",
      purpose: row.purpose || "",
      description: row.description || "",
      isVerified: !!row.isVerified,
    });
  };

  const onArchive = async (id) => {
    try {
      await archiveSmsSender(id);
      toast.success("Sender archived.");
      if (editingId === id) {
        setEditingId("");
        setForm({ senderId: "", entityId: "", routeType: "service_explicit", purpose: "", description: "", isVerified: false });
      }
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to archive sender.");
    }
  };

  const byRoute = stats?.byRoute || {};

  return (
    <div className="space-y-6" data-testid="sms-setup-page">
      <div>
        <h1 className="text-2xl font-heading font-bold text-slate-900">SMS Setup</h1>
        <p className="text-slate-600">India DLT-ready sender registry with compliance metadata and route controls.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-gradient-to-r from-orange-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-xs text-slate-500">Total Senders</p>
                <p className="text-2xl font-semibold text-slate-900">{stats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-xs text-slate-500">Verified</p>
                <p className="text-2xl font-semibold text-slate-900">{stats?.verified || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileCheck2 className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-slate-500">DLT Compliant</p>
                <p className="text-2xl font-semibold text-slate-900">{stats?.compliant || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <p className="text-xs text-slate-500 mb-2">Route Mix</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(byRoute).length === 0 ? <Badge variant="secondary">No data</Badge> : null}
              {Object.entries(byRoute).map(([k, v]) => (
                <Badge key={k} variant="outline">{k}: {v}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">{editingId ? "Edit DLT Sender" : "Add DLT Sender"}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Sender ID</Label>
            <Input placeholder="e.g. TXTZY" value={form.senderId} onChange={(e) => setForm((p) => ({ ...p, senderId: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-2">
            <Label>DLT Entity ID</Label>
            <Input placeholder="19-digit PE ID" value={form.entityId} onChange={(e) => setForm((p) => ({ ...p, entityId: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>DLT Route Type</Label>
            <Select value={form.routeType} onValueChange={(v) => setForm((p) => ({ ...p, routeType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="service_explicit">Service Explicit</SelectItem>
                <SelectItem value="service_implicit">Service Implicit</SelectItem>
                <SelectItem value="transactional">Transactional</SelectItem>
                <SelectItem value="promotional">Promotional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Purpose</Label>
            <Input placeholder="OTP / alerts / delivery updates" value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Verification Status</Label>
            <Select value={form.isVerified ? "yes" : "no"} onValueChange={(v) => setForm((p) => ({ ...p, isVerified: v === "yes" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Verified</SelectItem>
                <SelectItem value="no">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Description</Label>
            <Input placeholder="Optional compliance/internal note" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button className="bg-orange-500 hover:bg-orange-600 w-full" onClick={save} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Sender" : "Save Sender"}
            </Button>
          </div>
          {editingId ? (
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={() => { setEditingId(""); setForm({ senderId: "", entityId: "", routeType: "service_explicit", purpose: "", description: "", isVerified: false }); }}>
                Cancel Edit
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">Saved Sender IDs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sender ID</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-slate-500">No sender IDs configured yet.</TableCell>
                </TableRow>
              ) : null}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.senderId}</TableCell>
                  <TableCell className="font-mono">{r.entityId}</TableCell>
                  <TableCell><Badge variant="outline">{r.routeType || "service_explicit"}</Badge></TableCell>
                  <TableCell>{r.isVerified ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Verified</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                  <TableCell>{r.createdAtUtc ? new Date(r.createdAtUtc).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onArchive(r.id)}>
                        <Trash2 className="w-4 h-4 mr-1" /> Archive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SmsSetupPage;
