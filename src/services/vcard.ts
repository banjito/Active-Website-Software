import type { AmpContact } from '@/services/ampContactsService';

// Organization name placed on every exported contact card.
const ORG_NAME = 'AMP';

// Escape a value for vCard text fields (commas, semicolons, backslashes, newlines).
function esc(value: string): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Split a full name into family/given for the structured N field.
function splitName(name: string): { given: string; family: string } {
  const parts = (name ?? '').trim().split(/\s+/);
  if (parts.length <= 1) return { given: parts[0] ?? '', family: '' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
}

// Build a single vCard (3.0 — the most widely supported on iOS and Android).
export function contactToVCard(c: AmpContact): string {
  const { given, family } = splitName(c.name);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(c.name)}`,
    `ORG:${esc(ORG_NAME)}`,
  ];
  if (c.role) lines.push(`TITLE:${esc(c.role)}`);
  if (c.work_phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(c.work_phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=WORK:${esc(c.email)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// Concatenate many contacts into one .vcf payload for batch import.
export function contactsToVCardFile(contacts: AmpContact[]): string {
  return contacts.map(contactToVCard).join('\r\n');
}

// Trigger a .vcf download. On iPhone and Android this opens the
// "Add Contacts" prompt so the user can import everyone at once.
export function downloadVCard(contacts: AmpContact[], filename = 'amp-contacts.vcf'): void {
  const blob = new Blob([contactsToVCardFile(contacts)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
