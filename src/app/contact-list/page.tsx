import React, { useEffect, useMemo, useState } from 'react';
import { Phone, Mail, Search, UserPlus, CheckSquare, Square, Download } from 'lucide-react';
import { fetchAmpContacts } from '@/services/ampContactsService';
import type { AmpContact } from '@/services/ampContactsService';
import { downloadVCard } from '@/services/vcard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';

export default function ContactListPage() {
  const [contacts, setContacts] = useState<AmpContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        setContacts(await fetchAmpContacts());
      } catch (e) {
        console.error(e);
        toast.error('Failed to load contacts');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.work_phone.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const importAll = () => {
    if (contacts.length === 0) return;
    downloadVCard(contacts, 'amp-contacts.vcf');
  };

  const importSelected = () => {
    const picked = contacts.filter((c) => selected.has(c.id));
    if (picked.length === 0) {
      toast('Select at least one contact');
      return;
    }
    downloadVCard(picked, 'amp-contacts.vcf');
    exitSelect();
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">AMP Contacts</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Tap a name to call or email. Or add everyone to your phone at once.
          </p>
        </header>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, role, email…"
            className="w-full rounded-none border border-neutral-300 bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">No contacts found.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-none border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {selectMode && (
                  <button onClick={() => toggle(c.id)} className="shrink-0 text-brand" aria-label="Select">
                    {selected.has(c.id) ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6 text-neutral-400" />}
                  </button>
                )}
                <div className="min-w-0 flex-1" onClick={() => selectMode && toggle(c.id)}>
                  <p className="truncate font-semibold text-neutral-900 dark:text-neutral-50">{c.name}</p>
                  {c.role && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{c.role}</p>}
                </div>
                {!selectMode && (
                  <div className="flex shrink-0 gap-2">
                    {c.work_phone && (
                      <a
                        href={`tel:${c.work_phone}`}
                        className="flex h-10 w-10 items-center justify-center rounded-none bg-brand/10 text-brand"
                        aria-label={`Call ${c.name}`}
                      >
                        <Phone className="h-5 w-5" />
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex h-10 w-10 items-center justify-center rounded-none bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        aria-label={`Email ${c.name}`}
                      >
                        <Mail className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="mx-auto flex max-w-2xl gap-2">
          {selectMode ? (
            <>
              <button
                onClick={exitSelect}
                className="flex-1 rounded-none border border-neutral-300 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={importSelected}
                className="flex flex-[2] items-center justify-center gap-2 rounded-none bg-brand py-3 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Add {selected.size > 0 ? selected.size : ''} to contacts
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectMode(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-none border border-neutral-300 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
              >
                <CheckSquare className="h-4 w-4" />
                Pick some
              </button>
              <button
                onClick={importAll}
                className="flex flex-[2] items-center justify-center gap-2 rounded-none bg-brand py-3 text-sm font-semibold text-white"
              >
                <UserPlus className="h-4 w-4" />
                Add all to contacts
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
