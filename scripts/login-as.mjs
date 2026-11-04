#!/usr/bin/env node
/**
 * Log in as another person on localhost, to see ampOS exactly as they do.
 *
 *   node scripts/login-as.mjs caleb.hipp@ampqes.com
 *   node scripts/login-as.mjs caleb.hipp@ampqes.com --path /pm-dashboard --port 5175
 *
 * Prints a localhost link. Open it in a PRIVATE window: the app signs in as that person
 * and shows a "Viewing as" bar at the bottom. Close the window when done.
 *
 * What it does: makes a real sign-in for that person on the live database, using the
 * service role key in .env. It does not email them or change their password.
 * Anything you save, approve or submit is recorded as them. Look, don't save.
 *
 * Only localhost can use the link: the code that reads it (src/lib/devLoginAs.ts) is
 * left out of production builds.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const optionValues = new Set(['--port', '--path'].map((flag) => option(flag.slice(2), null)).filter(Boolean));
const email = args.find((a) => !a.startsWith('--') && !optionValues.has(a))?.trim().toLowerCase();
const port = option('port', '5175');
const path = (() => {
  const p = option('path', '/portal');
  return p.startsWith('/') ? p : `/${p}`;
})();

if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/login-as.mjs person@company.com [--path /portal] [--port 5175]');
  process.exit(1);
}

const URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key in .env');
  process.exit(1);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE_KEY, noSession);

// Look the person up first. Making a sign-in link for an unknown email could create an account.
const pattern = email.replace(/[\\%_]/g, '\\$&');
const { data: people, error: lookupError } = await admin
  .schema('common')
  .from('profiles')
  .select('id, full_name, email')
  .ilike('email', pattern)
  .limit(2);
if (lookupError) {
  console.error(`Couldn't look up ${email}: ${lookupError.message}`);
  process.exit(1);
}
if (!people?.length) {
  console.error(`No one in ampOS has the email ${email}.`);
  process.exit(1);
}
if (people.length > 1) {
  console.error(`More than one profile matches ${email}. Use the exact email.`);
  process.exit(1);
}

const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const tokenHash = link?.properties?.hashed_token;
if (linkError || !tokenHash) {
  console.error(`Couldn't make a sign-in for ${email}: ${linkError?.message ?? 'no token returned'}`);
  process.exit(1);
}

// Trade the one-time token for a session here, so the browser only has to store it.
const anon = createClient(URL, ANON_KEY, noSession);
const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
const session = verified?.session;
if (verifyError || !session) {
  console.error(`Couldn't sign in as ${email}: ${verifyError?.message ?? 'no session returned'}`);
  process.exit(1);
}

const payload = Buffer.from(
  JSON.stringify({ a: session.access_token, r: session.refresh_token, e: email }),
).toString('base64url');
const role = session.user?.user_metadata?.role || 'no role';
const name = people[0].full_name || email;

console.log(`\nReady to view as ${name} (${email}), role: ${role}.`);
console.log('\nOpen this in a PRIVATE window. Use it once; run the script again for a fresh link.\n');
console.log(`http://localhost:${port}${path}#devLoginAs=${payload}\n`);
console.log('You are really them on the live database. Look, don\'t save.');
console.log('When done, close the private window.\n');
