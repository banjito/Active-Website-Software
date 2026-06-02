#!/usr/bin/env node
/**
 * One-time seed: opt existing digest recipients into common.user_preferences.
 *
 * Usage:
 *   REVIEW_NOTIFICATION_EMAIL=a@ampqes.com \
 *   WEEKLY_REPORT_EMAIL=b@ampqes.com \
 *   ACCOUNTING_NOTIFICATION_EMAIL=accounting@ampqes.com \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-digest-email-preferences.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const restHeaders = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Accept-Profile': 'common',
  'Content-Profile': 'common',
};

const DEFAULT_AUTOMATED = {
  dailyReview: true,
  dailyReadyToBill: true,
  weeklyReports: true,
};

function digestFlagsForEmail(email, reviewEmail, weeklyEmail, accountingEmail) {
  const e = email.toLowerCase();
  return {
    dailyReview: !!reviewEmail && e === reviewEmail,
    dailyReadyToBill: !!accountingEmail && e === accountingEmail,
    weeklyReports: !!weeklyEmail && e === weeklyEmail,
  };
}

async function findProfileByEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email`,
    { headers: restHeaders }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`profiles lookup failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function getExistingPreferences(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${userId}&select=notification_preferences`,
    { headers: restHeaders }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].notification_preferences : null;
}

async function upsertPreferences(userId, notificationPreferences) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_preferences?on_conflict=user_id`,
    {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      notification_preferences: notificationPreferences,
      updated_at: new Date().toISOString(),
    }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upsert failed: ${res.status} ${text}`);
  }
}

async function main() {
  const reviewEmail = process.env.REVIEW_NOTIFICATION_EMAIL?.trim().toLowerCase();
  const weeklyEmail = (
    process.env.WEEKLY_REPORT_EMAIL?.trim() ||
    process.env.REVIEW_NOTIFICATION_EMAIL?.trim() ||
    ''
  ).toLowerCase();
  const accountingEmail = (
    process.env.ACCOUNTING_NOTIFICATION_EMAIL?.trim() || 'accounting@ampqes.com'
  ).toLowerCase();

  const emails = new Set(
    [reviewEmail, weeklyEmail, accountingEmail].filter(Boolean)
  );

  if (emails.size === 0) {
    console.error('Set at least REVIEW_NOTIFICATION_EMAIL or ACCOUNTING_NOTIFICATION_EMAIL');
    process.exit(1);
  }

  console.log('Seeding digest preferences for:', [...emails].join(', '));

  for (const email of emails) {
    const profile = await findProfileByEmail(email);
    if (!profile?.id) {
      console.warn(`  skip ${email}: no common.profiles row`);
      continue;
    }

    const existing = (await getExistingPreferences(profile.id)) || {};
    const flags = digestFlagsForEmail(email, reviewEmail, weeklyEmail, accountingEmail);
    const prev = existing.automatedEmails || {};
    const automatedEmails = {
      ...DEFAULT_AUTOMATED,
      dailyReview: prev.dailyReview === true || flags.dailyReview,
      dailyReadyToBill: prev.dailyReadyToBill === true || flags.dailyReadyToBill,
      weeklyReports: prev.weeklyReports === true || flags.weeklyReports,
    };

    await upsertPreferences(profile.id, {
      ...existing,
      automatedEmails,
    });

    console.log(`  ok ${email} -> user ${profile.id}`, automatedEmails);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
