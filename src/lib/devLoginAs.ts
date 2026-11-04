import { supabase } from '@/lib/supabase';

/**
 * Localhost only: finish a "log in as" from scripts/login-as.mjs, and show a
 * "Viewing as" bar while signed in as someone else.
 *
 * main.tsx loads this behind import.meta.env.DEV, so none of it ships to ampos.io.
 * The flag also tells AuthContext to sign out this window only, never the real
 * person's own devices.
 */
export const DEV_LOGIN_AS_FLAG = 'devLoginAs';

export async function initDevLoginAs(payload: string | null): Promise<void> {
  if (payload) {
    try {
      // base64url from the script; atob accepts it once the two URL-safe characters are swapped
      const { a, r, e } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const { error } = await supabase.auth.setSession({ access_token: a, refresh_token: r });
      if (error) throw error;
      localStorage.setItem(DEV_LOGIN_AS_FLAG, String(e).toLowerCase());
      // Start clean so every part of the app picks up the new person
      window.location.reload();
      return;
    } catch (err) {
      console.error('[Log in as] That link did not work:', err);
      window.alert("That 'log in as' link didn't work. Run scripts/login-as.mjs again for a fresh one.");
    }
  }
  await showViewingAsBar();
}

async function showViewingAsBar(): Promise<void> {
  const viewingAs = localStorage.getItem(DEV_LOGIN_AS_FLAG);
  if (!viewingAs) return;

  // Signed in as someone else since (or signed out): the flag is stale
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.email?.toLowerCase() !== viewingAs) {
    localStorage.removeItem(DEV_LOGIN_AS_FLAG);
    return;
  }

  const bar = document.createElement('div');
  bar.textContent = `Viewing as ${viewingAs} · localhost only · saves count as them · close this window when done`;
  Object.assign(bar.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '2147483647',
    padding: '6px 12px',
    background: '#171717',
    color: '#ffffff',
    font: '12px/1.4 system-ui, sans-serif',
    textAlign: 'center',
    borderRadius: '0',
    // Clicks go through to the page underneath
    pointerEvents: 'none',
  });
  document.body.appendChild(bar);
}
