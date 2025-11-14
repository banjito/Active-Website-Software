import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { ShortcutService, type Shortcut } from '@/services/ShortcutService';
import { Button } from '@/components/ui/Button';
import { ShortcutManagerDndKit } from '@/components/shortcuts/ShortcutManagerDndKit';
import { supabase } from '@/lib/supabase';
import { BUILTIN_PORTALS } from '@/components/shortcuts/builtins';

export const SidebarShortcuts: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [managerOpen, setManagerOpen] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`amp:user:${user?.id}:myMenuExpanded`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        setLoading(true);
        const data = await ShortcutService.getUserShortcuts(user.id);
        setShortcuts(data);
      } finally {
        setLoading(false);
      }
    };
    load();
    // Subscribe to realtime changes for this user's shortcuts
    const channel = supabase
      .channel(`user_shortcuts_${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'common',
        table: 'user_shortcuts',
        filter: `user_id=eq.${user.id}`
      }, async () => {
        try {
          const data = await ShortcutService.getUserShortcuts(user.id);
          setShortcuts(data);
        } catch (e) {
          // noop
        }
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!id) return;
    try {
      await ShortcutService.deleteShortcut(id);
      if (user) {
        const data = await ShortcutService.getUserShortcuts(user.id);
        setShortcuts(data);
      }
    } catch (err) {
      console.error('Failed to delete shortcut', err);
    }
  };

  const handleItemClick = (url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank');
      return;
    }
    navigate(url);
  };

  const isGroupShortcut = (s: Shortcut) => typeof s.url === 'string' && s.url.startsWith('portal:');
  const getGroupKey = (s: Shortcut) => s.url.replace('portal:', '');
  const toggleGroup = (key: string) => {
    const next = { ...expanded, [key]: !expanded[key] };
    setExpanded(next);
    try {
      if (user?.id) localStorage.setItem(`amp:user:${user.id}:myMenuExpanded`, JSON.stringify(next));
    } catch {}
  };

  // Build grouped structure so portal links always appear under their portal header
  const portalGroups: Record<string, { hasGroup: boolean; children: Array<{ id: string; title: string; path: string }> }> = {};
  const externalShortcuts: Shortcut[] = [];
  const unmatchedInternal: Shortcut[] = [];

  shortcuts.forEach((s) => {
    const url = s.url || '';
    if (isGroupShortcut(s)) {
      const key = getGroupKey(s);
      if (!portalGroups[key]) portalGroups[key] = { hasGroup: true, children: [] };
      else portalGroups[key].hasGroup = true;
      return;
    }
    if (url.startsWith('http')) {
      externalShortcuts.push(s);
      return;
    }
    // Try to map internal path to a portal
    const portal = BUILTIN_PORTALS.find(p => p.options.some(o => o.path === url));
    if (portal) {
      const key = portal.key as string;
      if (!portalGroups[key]) portalGroups[key] = { hasGroup: false, children: [] };
      portalGroups[key].children.push({ id: s.id!, title: s.title, path: url });
      return;
    }
    // Otherwise keep as unmatched internal
    unmatchedInternal.push(s);
  });

  const isActive = useMemo(() => {
    return (url: string) => {
      if (url.startsWith('http')) return false;
      try {
        // Match by pathname start to highlight group pages
        return location.pathname === url || location.pathname.startsWith(url + '/');
      } catch {
        return false;
      }
    };
  }, [location.pathname]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 mb-1">
        <h2 className="text-xs font-semibold text-muted-foreground dark:text-dark-500">MY MENU</h2>
        <button
          onClick={() => setManagerOpen(true)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-100"
          title="Add or manage shortcuts"
        >
          <Plus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {loading ? (
        <div className="px-2 py-1 text-xs text-gray-500 dark:text-dark-400">Loading…</div>
      ) : shortcuts.length === 0 ? (
        <button
          onClick={() => setManagerOpen(true)}
          className="text-left w-full px-3 py-2 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-100"
        >
          Add your first shortcut
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          {/* Render portals that have either a group or mapped children */}
          {BUILTIN_PORTALS.map((portal) => {
            const key = portal.key as string;
            const groupData = portalGroups[key];
            if (!groupData) return null;
            const open = expanded[key] ?? groupData.hasGroup; // open by default if explicitly grouped
            return (
              <div key={key} className="group relative">
                <button
                  onClick={() => toggleGroup(key)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-between ${
                    open ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <span>{portal.label}</span>
                  <span className="text-xs text-gray-500">{open ? '–' : '+'}</span>
                </button>
                {open && (
                  <div className="mt-1 ml-2 pl-2 border-l border-gray-200 dark:border-dark-200 flex flex-col gap-1">
                    {/* If user created a group, show full portal options */}
                    {groupData.hasGroup
                      ? portal.options.map(opt => (
                          <Link key={opt.path} to={opt.path} onClick={(e) => e.currentTarget.blur()}>
                            <div className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                              isActive(opt.path) ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
                            }`}>{opt.label}</div>
                          </Link>
                        ))
                      : null}
                    {/* Also show any individually saved children mapped into this portal */}
                    {groupData.children.map(child => (
                      <Link key={child.id} to={child.path} onClick={(e) => e.currentTarget.blur()}>
                        <div className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                          isActive(child.path) ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
                        }`}>{child.title}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Render unmatched internal and external shortcuts at bottom */}
          {unmatchedInternal.map((s) => (
            <div key={s.id} className="group relative">
              <Link to={s.url} onClick={(e) => e.currentTarget.blur()}>
                <div className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(s.url) ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
                }`}>{s.title}</div>
              </Link>
              <button
                onClick={() => handleDelete(s.id!)}
                className="absolute right-1 top-1 hidden group-hover:flex items-center justify-center h-5 w-5 rounded hover:bg-gray-200 dark:hover:bg-dark-200"
                title="Remove shortcut"
              >
                <X className="h-3 w-3 text-gray-500 dark:text-gray-300" />
              </button>
            </div>
          ))}
          {externalShortcuts.map((s) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => handleItemClick(s.url)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(s.url) ? 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-300 hover:bg-gray-50 dark:hover:bg-dark-100 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {s.title}
              </button>
              <button
                onClick={() => handleDelete(s.id!)}
                className="absolute right-1 top-1 hidden group-hover:flex items-center justify-center h-5 w-5 rounded hover:bg-gray-200 dark:hover:bg-dark-200"
                title="Remove shortcut"
              >
                <X className="h-3 w-3 text-gray-500 dark:text-gray-300" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ShortcutManagerDndKit isOpen={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
};

export default SidebarShortcuts;


