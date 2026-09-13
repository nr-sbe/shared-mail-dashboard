import { convert } from 'html-to-text';

export const RETENTION_MS = 72 * 60 * 60 * 1000;

export interface Source {
  id: string;
  label: string;
  address: string;
  active: boolean;
  activeSince: string | null;
}

export function parseSources(raw: string | undefined): Source[] {
  if (!raw) return [];
  const sources: unknown = JSON.parse(raw);
  if (!Array.isArray(sources)) throw new Error('Invalid sources configuration');
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const s of sources) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.id)
      || typeof s.label !== 'string' || !s.label.trim() || s.label.length > 80
      || typeof s.address !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(s.address)
      || typeof s.active !== 'boolean'
      || (s.active && (typeof s.activeSince !== 'string' || !Number.isFinite(Date.parse(s.activeSince))))
      || ids.has(s.id) || addresses.has(s.address.toLowerCase())) {
      throw new Error('Invalid sources configuration');
    }
    ids.add(s.id);
    addresses.add(s.address.toLowerCase());
  }
  return sources as Source[];
}

export function isSetupMessage(sender: string, subject: string): boolean {
  return /forwarding-noreply@google\.com/i.test(sender)
    || /gmail\s+forwarding\s+confirmation/i.test(subject)
    || /confirm.*forwarding|forwarding.*verification/i.test(subject);
}

export function readableBody(text: string | null | undefined, html: string | null | undefined): string {
  const body = text?.trim() ? text : convert(html || '', {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'form', format: 'skip' },
      { selector: 'iframe', format: 'skip' },
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
    ],
    limits: { maxInputLength: 1_000_000 },
  });
  return body.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}
