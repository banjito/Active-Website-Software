import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  deleteSite,
  fetchSites,
  upsertSite,
  type SiteWithCounts,
} from "@/services/sitesService";

const emptyForm = { name: "", address: "", city: "", state: "", notes: "" };

/**
 * Facilities we work at.
 *
 * Sites are standalone — they have no customer. We have worked for several customers at
 * the same jobsite on the same equipment, so tying a facility (and therefore its assets)
 * to one customer would fork the record. Customer stays on the job.
 */
export default function SitesListPage() {
  const [sites, setSites] = useState<SiteWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SiteWithCounts | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { division } = useParams<{ division?: string }>();
  const basePath = division ? `/${division}` : "";

  const { getUserRole, isAdmin } = usePermissions();
  const role = getUserRole();
  const canEdit =
    isAdmin ||
    ["Admin", "Super Admin", "Office Admin", "Manager", "NETA Technician"].includes(
      role as string,
    );

  const load = async () => {
    setLoading(true);
    try {
      setSites(await fetchSites());
    } catch (e) {
      console.error(e);
      toast.error("Failed to load sites");
      setSites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setCreating(true);
    setEditing(null);
  };

  const openEdit = (site: SiteWithCounts) => {
    setForm({
      name: site.name,
      address: site.address ?? "",
      city: site.city ?? "",
      state: site.state ?? "",
      notes: site.notes ?? "",
    });
    setEditing(site);
    setCreating(false);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Site name is required");
      return;
    }
    setSaving(true);
    try {
      await upsertSite({
        id: editing?.id,
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        notes: form.notes,
        status: editing?.status ?? "active",
      });
      toast.success(editing ? "Site updated" : "Site added");
      closeForm();
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save site");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (site: SiteWithCounts) => {
    if (!window.confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
    try {
      await deleteSite(site.id);
      toast.success("Site deleted");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete site");
    }
  };

  const term = search.trim().toLowerCase();
  const visible = term
    ? sites.filter((s) =>
        [s.name, s.city, s.state, s.address]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : sites;

  return (
    <div className="p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Sites &amp; Facilities
          </CardTitle>
          <CardDescription>
            Every facility we work at. Assets are registered against a site, so the same
            equipment list serves every project there — whoever the customer is on a given
            job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sites…"
              className="w-full sm:w-64"
            />
            {canEdit && (
              <Button
                className="ml-auto"
                onClick={openCreate}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add site
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <div className="rounded-none border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>City / State</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Assets</TableHead>
                    {canEdit && <TableHead className="w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={canEdit ? 5 : 4}
                        className="py-8 text-center text-neutral-500 dark:text-neutral-400"
                      >
                        {sites.length === 0
                          ? "No sites yet. Add one to start building its asset list."
                          : "No sites match that search."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((site) => (
                      <TableRow key={site.id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`${basePath}/sites/${site.id}`}
                            className="text-brand hover:underline"
                          >
                            {site.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {[site.city, site.state].filter(Boolean).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-neutral-500 dark:text-neutral-400">
                          {site.address || "—"}
                        </TableCell>
                        <TableCell>{site.asset_count}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEdit(site)}
                                aria-label={`Edit ${site.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => confirmDelete(site)}
                                disabled={site.asset_count > 0}
                                aria-label={`Delete ${site.name}`}
                                title={
                                  site.asset_count > 0
                                    ? "Has registered assets — cannot be deleted"
                                    : "Delete site"
                                }
                              >
                                <Trash2
                                  className={`h-4 w-4 ${site.asset_count > 0 ? "opacity-30" : "text-destructive"}`}
                                />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit site" : "Add site"}</DialogTitle>
            <DialogDescription>
              Name the facility, not the customer — e.g. "QTS ATL2".
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="site-name">Site name</Label>
              <Input
                id="site-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. QTS ATL2"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="site-city">City</Label>
                <Input
                  id="site-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="e.g. Atlanta"
                />
              </div>
              <div>
                <Label htmlFor="site-state">State</Label>
                <Input
                  id="site-state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="e.g. GA"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="site-address">Address</Label>
              <Input
                id="site-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="site-notes">Notes</Label>
              <Textarea
                id="site-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
