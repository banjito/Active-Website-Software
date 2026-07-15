import React, { useState, useEffect } from 'react';
import { Phone, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { fetchAmpContacts, upsertAmpContact, deleteAmpContact, syncAmpContactsFromSheet } from '@/services/ampContactsService';
import type { AmpContact } from '@/services/ampContactsService';
import { usePermissions } from '@/hooks/usePermissions';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { companyConfig } from "@/lib/companyConfig";

export default function AmpContactsManager() {
  const [contacts, setContacts] = useState<AmpContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AmpContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ work_phone: '', name: '', email: '', role: '' });
  const { getUserRole } = usePermissions();
  const role = getUserRole();
  const canEdit = role === 'Office Admin' || role === 'HR Rep' || role === 'Admin' || role === 'Super Admin';

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchAmpContacts();
      setContacts(list);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load AMP contacts');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setForm({ work_phone: '', name: '', email: '', role: '' });
    setCreating(true);
    setEditing(null);
  };

  const openEdit = (c: AmpContact) => {
    setForm({
      work_phone: c.work_phone,
      name: c.name,
      email: c.email,
      role: c.role,
    });
    setEditing(c);
    setCreating(false);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setForm({ work_phone: '', name: '', email: '', role: '' });
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      if (editing) {
        await upsertAmpContact({
          id: editing.id,
          work_phone: form.work_phone.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role.trim(),
          display_order: editing.display_order,
        });
        toast.success('Contact updated');
      } else {
        await upsertAmpContact({
          id: '',
          work_phone: form.work_phone.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role.trim(),
          display_order: contacts.length,
        });
        toast.success('Contact added');
      }
      closeForm();
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save contact');
    }
  };

  const syncFromSheet = async () => {
    setSyncing(true);
    try {
      const result = await syncAmpContactsFromSheet();
      toast.success(
        `Synced ${result.total} contacts (${result.inserted} added, ${result.updated} updated, ${result.deleted} removed)`
      );
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Sync from Google Sheet failed');
    } finally {
      setSyncing(false);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!window.confirm('Remove this contact from the list?')) return;
    setDeletingId(id);
    try {
      await deleteAmpContact(id);
      toast.success('Contact removed');
      void load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          AMP internal phone list
        </CardTitle>
      </CardHeader>
      <CardContent>
        {canEdit && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button onClick={openCreate} className="gap-2"
              leftIcon={<Plus className="h-4 w-4" />}>
              Add contact
            </Button>
            <Button variant="outline" onClick={syncFromSheet} disabled={syncing} className="gap-2"
              leftIcon={<RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />}
              >
              {syncing ? 'Syncing…' : 'Sync from Google Sheet'}
            </Button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>
        ) : (
          <div className="rounded-none border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Work phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {canEdit && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <a href={`tel:${c.work_phone.replace(/\D/g, '')}`} className="text-brand hover:underline">
                        {c.work_phone}
                      </a>
                    </TableCell>
                    <TableCell>
                      <a href={`mailto:${c.email}`} className="hover:underline">{c.email || '—'}</a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.role || '—'}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDelete(c.id)}
                            disabled={deletingId === c.id}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={creating || !!editing} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit contact' : 'Add contact'}</DialogTitle>
            <DialogDescription>Phone, name, email, and role will appear in the portal AMP contacts list.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="ac-name">Name</Label>
              <Input
                id="ac-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="ac-phone">Work phone</Label>
              <Input
                id="ac-phone"
                value={form.work_phone}
                onChange={(e) => setForm((f) => ({ ...f, work_phone: e.target.value }))}
                placeholder="e.g. 256-555-1234"
              />
            </div>
            <div>
              <Label htmlFor="ac-email">Email</Label>
              <Input
                id="ac-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={`e.g. jane.smith${companyConfig.allowedEmailDomains[0]}`}
              />
            </div>
            <div>
              <Label htmlFor="ac-role">Role</Label>
              <Input
                id="ac-role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="e.g. Project Manager"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
