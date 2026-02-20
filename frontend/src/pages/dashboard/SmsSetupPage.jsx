import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSmsSender, listSmsSenders } from "@/lib/api";
import { toast } from "sonner";

const SmsSetupPage = () => {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ senderId: "", entityId: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await listSmsSenders();
      setRows(res || []);
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
      await createSmsSender({
        senderId: form.senderId.trim().toUpperCase(),
        entityId: form.entityId.trim(),
      });
      toast.success("SMS sender saved.");
      setForm({ senderId: "", entityId: "" });
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to save sender.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="sms-setup-page">
      <div>
        <h1 className="text-2xl font-heading font-bold text-slate-900">SMS Setup</h1>
        <p className="text-slate-600">Add DLT Entity and Sender IDs outside template creation flow.</p>
      </div>

      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-base">Add Entity + Sender ID</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Sender ID</Label>
            <Input placeholder="e.g. TXTZY" value={form.senderId} onChange={(e) => setForm((p) => ({ ...p, senderId: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-2">
            <Label>DLT Entity ID</Label>
            <Input placeholder="e.g. 1101234567890" value={form.entityId} onChange={(e) => setForm((p) => ({ ...p, entityId: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button className="bg-orange-500 hover:bg-orange-600 w-full" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Sender"}
            </Button>
          </div>
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
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.senderId}</TableCell>
                  <TableCell className="font-mono">{r.entityId}</TableCell>
                  <TableCell>{r.createdAtUtc ? new Date(r.createdAtUtc).toLocaleString() : "-"}</TableCell>
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
