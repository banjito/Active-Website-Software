/**
 * A copy of an unsaved custom form kept in this browser.
 *
 * Written as the technician types, so a closed tab, a crash or a dropped
 * connection on site loses nothing: reopening the form offers to restore it.
 * Cleared once the form is saved. Browser storage can be unavailable (private
 * windows, blocked site data), so every access is guarded and failure just
 * means no draft.
 */

export interface LocalDraft {
  formData: Record<string, Record<string, any>>;
  status?: string;
  /** When the draft was written (ms since epoch). */
  savedAt: number;
}

const PREFIX = 'cf-draft:';

/** One key per form: job + template + saved instance (or "new"). */
export function localDraftKey(jobId?: string, templateId?: string, instanceId?: string | null): string {
  return `${PREFIX}${jobId ?? '-'}:${templateId ?? '-'}:${instanceId || 'new'}`;
}

export function saveLocalDraft(key: string, draft: LocalDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage full or unavailable */
  }
}

export function loadLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'number' || !parsed.formData) return null;
    return parsed as LocalDraft;
  } catch {
    return null;
  }
}

export function clearLocalDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* unavailable */
  }
}
