import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Phone, Plus, Pencil, Trash2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
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
import {
  fetchAmpContacts,
  upsertAmpContact,
  deleteAmpContact,
  syncAmpContactsFromSheet,
  pushAmpContactsToSheet,
} from '@/services/ampContactsService';
import type { AmpContact } from '@/services/ampContactsService';
import { usePermissions } from '@/hooks/usePermissions';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';
import { companyConfig } from "@/lib/companyConfig";

type SortField = 'name' | 'work_phone' | 'email' | 'role';
type SortDirection = 'asc' | 'desc';

// Auto-pull on mount, throttled per browser so navigating back and forth does not
// hammer the Drive API (and re-download the whole workbook) on every visit.
const AUTO_PULL_KEY = 'ampContacts:lastAutoPull';
const AUTO_PULL_INTERVAL_MS = 5 * 60 * 1000;

function autoPullDue(): boolean {
  try {
    return Date.now() - Number(window.localStorage.getItem(AUTO_PULL_KEY) ?? 0) > AUTO_PULL_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markAutoPulled() {
  try {
    window.localStorage.setItem(AUTO_PULL_KEY, String(Date.now()));
  } catch {
    // private mode / storage disabled — pulling every mount is an acceptable fallback
  }
}

export default function AmpContactsManager() {
  const [contacts, setContacts] = useState<AmpContact[]>([]);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AmpContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  // Edits live in ampOS until someone pushes them; a later pull would overwrite them.
  const [unpushedEdits, setUnpushedEdits] = useState(false);
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

  // Pull the sheet in the background once the role is known. The list renders from
  // the DB immediately; if the pull changes anything it reloads underneath.
  const autoPulled = useRef(false);
  useEffect(() => {
    if (!canEdit || autoPulled.current || !autoPullDue()) return;
    autoPulled.current = true;
    void (async () => {
      setSyncing(true);
      try {
        const result = await syncAmpContactsFromSheet();
        markAutoPulled();
        if (result.inserted || result.updated || result.deleted) {
          toast.success(
            `Updated from Google Sheet (${result.inserted} added, ${result.updated} updated, ${result.deleted} removed)`
          );
          await load();
        }
      } catch (e) {
        // Non-blocking: the list still works off the DB, and the manual button reports properly.
        console.error('Auto-pull from Google Sheet failed:', e);
      } finally {
        setSyncing(false);
      }
    })();
  }, [canEdit]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Third click clears the sort and restores the saved display order
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="inline-block ml-1 h-3 w-3 opacity-40" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="inline-block ml-1 h-3 w-3 text-brand" />
    ) : (
      <ArrowDown className="inline-block ml-1 h-3 w-3 text-brand" />
    );
  };

  const sortedContacts = useMemo(() => {
    if (!sortField) return contacts;
    const sortValue = (c: AmpContact) =>
      sortField === 'work_phone' ? c.work_phone.replace(/\D/g, '') : (c[sortField] || '');
    return [...contacts].sort((a, b) => {
      const aValue = sortValue(a);
      const bValue = sortValue(b);
      // Blanks always sort to the bottom regardless of direction
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      const comparison = aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [contacts, sortField, sortDirection]);

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
      void autoPush();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save contact');
    }
  };

  // Every DB edit goes straight back to the sheet, so the two never drift.
  // Only a failed push leaves ampOS ahead — that is what unpushedEdits tracks.
  const autoPush = async () => {
    setPushing(true);
    try {
      const result = await pushAmpContactsToSheet();
      setUnpushedEdits(false);
      if (!result.formattingPreserved) {
        toast(
          'The phone list is an .xlsx file, so its cell formatting was flattened on save. Converting it to a Google Sheet keeps formatting intact.',
          { id: 'amp-contacts-xlsx-formatting', duration: 8000 }
        );
      }
    } catch (e: any) {
      console.error('Auto-push to Google Sheet failed:', e);
      setUnpushedEdits(true);
      toast.error(
        `Saved in ampOS, but the Google Sheet was not updated: ${e?.message || 'push failed'}`
      );
    } finally {
      setPushing(false);
    }
  };

  const syncFromSheet = async () => {
    setSyncing(true);
    try {
      const result = await syncAmpContactsFromSheet();
      toast.success(
        `Synced ${result.total} contacts (${result.inserted} added, ${result.updated} updated, ${result.deleted} removed)`
      );
      setUnpushedEdits(false);
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Sync from Google Sheet failed');
    } finally {
      setSyncing(false);
    }
  };

  const pushToSheet = async (force = false) => {
    setPushing(true);
    let retryForced = false;
    try {
      const result = await pushAmpContactsToSheet(force);
      toast.success(
        `Pushed ${result.total} contacts (${result.inserted} added, ${result.updated} updated, ${result.removed} removed)`
      );
      if (!result.formattingPreserved) {
        toast(
          'The phone list is an .xlsx file, so its cell formatting was flattened on save. Converting it to a Google Sheet keeps formatting intact.',
          { duration: 8000 }
        );
      }
      setUnpushedEdits(false);
    } catch (e: any) {
      console.error(e);
      const message = e?.message || 'Push to Google Sheet failed';
      // The function refuses a push that would delete most of the sheet.
      if (message.includes('force') && window.confirm(`${message}\n\nPush anyway?`)) {
        retryForced = true;
      } else {
        toast.error(message);
      }
    } finally {
      setPushing(false);
    }
    if (retryForced) await pushToSheet(true);
  };

  // The one manual control: send up anything a failed auto-push left behind,
  // then pull, so the sheet and ampOS agree without losing local edits.
  const refreshNow = async () => {
    if (unpushedEdits) await pushToSheet();
    await syncFromSheet();
  };

  const confirmDelete = async (id: string) => {
    if (!window.confirm('Remove this contact from the list?')) return;
    setDeletingId(id);
    try {
      await deleteAmpContact(id);
      toast.success('Contact removed');
      void load();
      void autoPush();
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
          AMP Internal Phone List
        </CardTitle>
      </CardHeader>
      <CardContent>
        {canEdit && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button onClick={openCreate} className="gap-2"
              leftIcon={<Plus className="h-4 w-4" />}>
              Add contact
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refreshNow()}
              disabled={syncing || pushing}
              title="Sync with Google Sheet now"
              aria-label="Sync with Google Sheet now"
            >
              <RefreshCw className={`h-4 w-4 ${syncing || pushing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
        {canEdit && unpushedEdits && (
          <p className="mb-4 border border-brand/40 bg-brand/5 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200">
            The last push to Google Sheets failed, so these edits only exist in ampOS. Use the
            refresh button to retry — otherwise the next pull will overwrite them.
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>
        ) : (
          <div className="rounded-none border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {([
                    ['name', 'Name'],
                    ['work_phone', 'Work phone'],
                    ['email', 'Email'],
                    ['role', 'Role'],
                  ] as [SortField, string][]).map(([field, label]) => (
                    <TableHead
                      key={field}
                      onClick={() => handleSort(field)}
                      aria-sort={
                        sortField === field
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      className="cursor-pointer select-none transition-colors hover:text-dark-primary dark:hover:text-dark-secondary"
                    >
                      {label}
                      {renderSortIcon(field)}
                    </TableHead>
                  ))}
                  {canEdit && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContacts.map((c) => (
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
