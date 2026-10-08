import { supabase } from '@/lib/supabase';

/**
 * QuickBooks Time (formerly TSheets) is the time-clock side of QuickBooks.
 * Payroll reads hours from it. Time written through the QuickBooks Online API
 * (TimeActivity) saves but never reaches a pay run, so payroll time goes here.
 */

/**
 * Make a QuickBooks Time API call via Edge Function (keeps the access token off the browser)
 */
export async function quickBooksTimeApiCall(
  endpoint: string,
  method: string = 'GET',
  data?: any
): Promise<any> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  const { data: response, error } = await supabase.functions.invoke('quickbooks-time-api', {
    body: { endpoint, method, data },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[QB Time API] Error:', error);
    throw error;
  }

  if (response?.error) {
    console.error('[QB Time API] Response error:', response);
    throw new Error(`${response.error}: ${response.details || ''}`);
  }

  return response;
}

/**
 * Copy the QuickBooks Time job list into common.time_jobs and match QuickBooks Time
 * users to ampOS logins by email (common.time_people). Runs on the server.
 * Returns counts plus the people who still need matching by hand.
 */
export async function syncQuickBooksTime(): Promise<any> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error('Not authenticated');
  }

  const { data: response, error } = await supabase.functions.invoke('quickbooks-time-api', {
    body: { action: 'sync' },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[QB Time API] Sync error:', error);
    throw error;
  }

  if (response?.error) {
    throw new Error(`${response.error}: ${response.details || ''}`);
  }

  return response;
}

/**
 * Save hand-confirmed matches between ampOS logins and QuickBooks Time users
 */
export async function saveQuickBooksTimeUserMatches(
  matches: { profile_id: string; qb_time_user_id: number; clocks_in: boolean }[]
): Promise<void> {
  const { error } = await supabase
    .schema('common')
    .from('time_people')
    .upsert(matches, { onConflict: 'profile_id' });

  if (error) throw error;
}

// QuickBooks Time answers each written row with its own status, even when the call itself succeeds
function unwrapWriteResult(response: any): any {
  const row: any = Object.values(response?.results?.timesheets ?? {})[0];
  if (!row) throw new Error('QuickBooks Time did not return a result');
  if (row._status_code !== 200) {
    throw new Error(`${row._status_message || 'Rejected'}: ${row._status_extra || ''}`);
  }
  return row;
}

/**
 * Get active QuickBooks Time users (team members)
 */
export async function getQuickBooksTimeUsers(): Promise<any[]> {
  const users: any[] = [];
  // Results come back a page at a time; `more` says whether another page exists
  for (let page = 1; page <= 20; page++) {
    const response = await quickBooksTimeApiCall(`/users?active=yes&page=${page}`);
    users.push(...Object.values(response?.results?.users ?? {}));
    if (!response?.more) break;
  }
  return users;
}

/**
 * Get one user's time entries for a date range (YYYY-MM-DD), with the jobs they point to
 */
export async function getQuickBooksTimeTimesheets(
  userId: number | string,
  startDate: string,
  endDate: string
): Promise<{ timesheets: any[]; jobcodes: Record<string, any> }> {
  const response = await quickBooksTimeApiCall(
    `/timesheets?user_ids=${userId}&start_date=${startDate}&end_date=${endDate}`
  );
  return {
    timesheets: Object.values(response?.results?.timesheets ?? {}),
    jobcodes: response?.supplemental_data?.jobcodes ?? {},
  };
}

/**
 * Create a manual time entry (hours for a day, no clock in/out times) in QuickBooks Time
 */
export async function createQuickBooksTimeManualTimesheet(timesheetData: any): Promise<any> {
  const response = await quickBooksTimeApiCall('/timesheets', 'POST', {
    data: [{ ...timesheetData, type: 'manual' }],
  });
  return unwrapWriteResult(response);
}

/**
 * Delete a time entry from QuickBooks Time
 */
export async function deleteQuickBooksTimeTimesheet(timesheetId: number | string): Promise<any> {
  const response = await quickBooksTimeApiCall(`/timesheets?ids=${timesheetId}`, 'DELETE');
  return unwrapWriteResult(response);
}
