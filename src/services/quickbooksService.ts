import { supabase } from '../lib/supabase';

interface QuickBooksIntegration {
  id: string;
  realm_id: string | null;
  company_name: string | null;
  environment: 'sandbox' | 'production';
  token_expires_at: string;
  created_at: string;
}

interface QuickBooksConnectionStatus {
  connected: boolean;
  integration?: QuickBooksIntegration;
}

/**
 * Rate limiter for QuickBooks API calls
 * QuickBooks allows ~500 requests per minute, so we'll space requests out
 */
class QuickBooksRateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minDelayMs = 300; // Minimum 300ms between requests (200 req/min) - more conservative
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 2000; // Start with 2 second delay for rate limits

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRetry(fn);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error (429)
      // Supabase FunctionsHttpError might have status in different places
      const errorMessage = error?.message || error?.toString() || '';
      const errorStatus = error?.status || error?.context?.status;
      const isRateLimit = errorStatus === 429 || 
                         errorMessage.includes('429') ||
                         errorMessage.includes('Too Many Requests') ||
                         errorMessage.includes('rate limit') ||
                         errorMessage.includes('Rate limit');

      // Don't retry on 400 (Bad Request) or other client errors - these are permanent failures
      const isClientError = errorStatus >= 400 && errorStatus < 500 && errorStatus !== 429;
      
      if (isClientError) {
        // Log but don't retry client errors
        console.log(`[QB Rate Limiter] Client error (${errorStatus}), not retrying:`, errorMessage);
        throw error;
      }

      if (isRateLimit && retryCount < this.maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = this.retryDelayMs * Math.pow(2, retryCount);
        console.log(`[QB Rate Limiter] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        await this.delay(delay);
        return this.executeWithRetry(fn, retryCount + 1);
      }

      throw error;
    }
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minDelayMs) {
        await this.delay(this.minDelayMs - timeSinceLastRequest);
      }

      const task = this.queue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const rateLimiter = new QuickBooksRateLimiter();

/**
 * Get the OAuth URL from server (keeps client ID secret)
 */
export async function getQuickBooksOAuthUrl(): Promise<string | null> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
      body: { action: 'get_oauth_url', origin: window.location.origin },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw error;
    }

    return data?.authUrl || null;
  } catch (error) {
    console.error('Error getting QuickBooks OAuth URL:', error);
    return null;
  }
}

/**
 * Get the current QuickBooks connection status for the authenticated user
 */
export async function getQuickBooksStatus(): Promise<QuickBooksConnectionStatus> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw error;
    }

    return data as QuickBooksConnectionStatus;
  } catch (error) {
    console.error('Error getting QuickBooks status:', error);
    return { connected: false };
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getQuickBooksAccessToken(): Promise<string | null> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // First, check if we have an active integration
    const status = await getQuickBooksStatus();
    if (!status.connected || !status.integration) {
      return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const expiresAt = new Date(status.integration.token_expires_at);
    const now = new Date();
    const buffer = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (expiresAt.getTime() - now.getTime() < buffer) {
      // Token is expired or about to expire, refresh it
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.access_token) {
        throw new Error('Failed to refresh token');
      }

      return data.access_token;
    }

    // Token is still valid, get it from the database
    const { data: integration, error: integrationError } = await supabase
      .schema('common')
      .from('quickbooks_integrations')
      .select('access_token')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return null;
    }

    return integration.access_token;
  } catch (error) {
    console.error('Error getting QuickBooks access token:', error);
    return null;
  }
}

/**
 * Disconnect QuickBooks integration
 */
export async function disconnectQuickBooks(): Promise<boolean> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw error;
    }

    return data?.success || false;
  } catch (error) {
    console.error('Error disconnecting QuickBooks:', error);
    return false;
  }
}

/**
 * Make a QuickBooks API call via Edge Function (to avoid CORS)
 * This function uses rate limiting to prevent 429 errors
 */
export async function quickBooksApiCall(
  endpoint: string,
  method: string = 'GET',
  data?: any
): Promise<any> {
  return rateLimiter.execute(async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    console.log(`[QB API] Calling: ${method} ${endpoint}`);
    
    const { data: response, error } = await supabase.functions.invoke('quickbooks-api', {
      body: { endpoint, method, data },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('[QB API] Error:', error);
      // Preserve error structure for rate limiter to detect 429s
      throw error;
    }

    if (response?.error) {
      console.error('[QB API] Response error:', response);
      throw new Error(`${response.error}: ${response.details || ''}`);
    }

    console.log(`[QB API] Success: ${endpoint}`, response);
    return response;
  });
}

/**
 * Get company information from QuickBooks
 */
export async function getQuickBooksCompanyInfo(): Promise<any> {
  // Get company info - the companyinfo endpoint needs realmId at the end
  const response = await quickBooksApiCall('/v3/company/{realmId}/companyinfo/{realmId}');
  return response?.CompanyInfo || response;
}

/**
 * Get customers from QuickBooks
 */
export async function getQuickBooksCustomers(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Customer MAXRESULTS 1000');
  return response?.QueryResponse?.Customer || [];
}

/**
 * Get invoices from QuickBooks
 */
export async function getQuickBooksInvoices(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Invoice MAXRESULTS 1000');
  return response?.QueryResponse?.Invoice || [];
}

/**
 * Get estimates from QuickBooks
 */
export async function getQuickBooksEstimates(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Estimate MAXRESULTS 1000');
  return response?.QueryResponse?.Estimate || [];
}

/**
 * Create an invoice in QuickBooks
 */
export async function createQuickBooksInvoice(invoiceData: any): Promise<any> {
  return quickBooksApiCall('/v3/company/{realmId}/invoice', 'POST', invoiceData);
}

/**
 * Create an estimate in QuickBooks
 */
export async function createQuickBooksEstimate(estimateData: any): Promise<any> {
  return quickBooksApiCall('/v3/company/{realmId}/estimate', 'POST', estimateData);
}

/**
 * Create a customer in QuickBooks
 */
export async function createQuickBooksCustomer(customerData: any): Promise<any> {
  return quickBooksApiCall('/v3/company/{realmId}/customer', 'POST', customerData);
}

/**
 * Get Profit and Loss Report from QuickBooks
 * @param dateMacro - QuickBooks date macro (e.g., 'Last 30 Days', 'This Month', 'This Fiscal Quarter')
 * @param startDate - Start date in YYYY-MM-DD format (used if no dateMacro)
 * @param endDate - End date in YYYY-MM-DD format (used if no dateMacro)
 */
export async function getQuickBooksProfitAndLoss(
  dateMacro?: string,
  startDate?: string, 
  endDate?: string
): Promise<any> {
  // Common params: summarize_column_by=Total gives us the totals we need
  const commonParams = '&summarize_column_by=Total&minorversion=65';
  
  // If a date macro is provided, use it (more accurate)
  // URL encode the macro since it contains spaces
  if (dateMacro) {
    const encodedMacro = encodeURIComponent(dateMacro);
    return quickBooksApiCall(`/v3/company/{realmId}/reports/ProfitAndLoss?date_macro=${encodedMacro}${commonParams}`);
  }
  
  // Otherwise use date range
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const start = startDate || startOfYear.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  return quickBooksApiCall(`/v3/company/{realmId}/reports/ProfitAndLoss?start_date=${start}&end_date=${end}${commonParams}`);
}

/**
 * Get Balance Sheet Report from QuickBooks
 */
export async function getQuickBooksBalanceSheet(asOfDate?: string): Promise<any> {
  if (asOfDate) {
    return quickBooksApiCall(`/v3/company/{realmId}/reports/BalanceSheet?as_of=${asOfDate}`);
  }
  return quickBooksApiCall(`/v3/company/{realmId}/reports/BalanceSheet?date_macro=Today`);
}

/**
 * Get all accounts (Chart of Accounts) from QuickBooks
 */
export async function getQuickBooksAccounts(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Account MAXRESULTS 1000');
  return response?.QueryResponse?.Account || [];
}

/**
 * Get purchases/expenses from QuickBooks
 */
export async function getQuickBooksPurchases(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Purchase MAXRESULTS 1000');
  return response?.QueryResponse?.Purchase || [];
}

/**
 * Get bills from QuickBooks
 */
export async function getQuickBooksBills(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Bill MAXRESULTS 1000');
  return response?.QueryResponse?.Bill || [];
}

/**
 * Get vendors from QuickBooks
 */
export async function getQuickBooksVendors(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Vendor MAXRESULTS 1000');
  return response?.QueryResponse?.Vendor || [];
}

/**
 * Get payments received from QuickBooks
 */
export async function getQuickBooksPayments(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Payment MAXRESULTS 1000');
  return response?.QueryResponse?.Payment || [];
}

/**
 * Get sales receipts from QuickBooks
 */
export async function getQuickBooksSalesReceipts(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM SalesReceipt MAXRESULTS 1000');
  return response?.QueryResponse?.SalesReceipt || [];
}

/**
 * Get deposits from QuickBooks
 */
export async function getQuickBooksDeposits(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Deposit MAXRESULTS 1000');
  return response?.QueryResponse?.Deposit || [];
}

/**
 * Get cash flow report from QuickBooks
 */
export async function getQuickBooksCashFlow(startDate?: string, endDate?: string): Promise<any> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const start = startDate || startOfYear.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  return quickBooksApiCall(`/v3/company/{realmId}/reports/CashFlow?start_date=${start}&end_date=${end}`);
}

/**
 * Get employees from QuickBooks
 */
export async function getQuickBooksEmployees(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Employee MAXRESULTS 1000');
  return response?.QueryResponse?.Employee || [];
}

/**
 * Get time activities (time tracking entries) from QuickBooks
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function getQuickBooksTimeActivities(startDate?: string, endDate?: string): Promise<any[]> {
  try {
    // QuickBooks TimeActivity query - date filtering may not work in WHERE clause
    // So we fetch all and filter client-side, or use a simpler query
    const query = 'SELECT * FROM TimeActivity MAXRESULTS 1000';
    
    // Try with date filter if provided, but catch errors if it doesn't work
    if (startDate && endDate) {
      // QuickBooks might require different date format or syntax
      // Try the query with date filter first
      try {
        const dateQuery = `SELECT * FROM TimeActivity WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' MAXRESULTS 1000`;
        const response = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(dateQuery)}`);
        return response?.QueryResponse?.TimeActivity || [];
      } catch (dateError) {
        // If date filter fails, fall back to fetching all
        console.warn('[QB API] TimeActivity date filter failed, fetching all:', dateError);
      }
    }
    
    // Fallback: fetch all time activities
    const response = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(query)}`);
    const allActivities = response?.QueryResponse?.TimeActivity || [];
    
    // Filter by date client-side if dates provided
    if (startDate && endDate && allActivities.length > 0) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      return allActivities.filter((activity: any) => {
        const txnDate = new Date(activity.TxnDate || activity.MetaData?.CreateTime);
        return txnDate >= start && txnDate <= end;
      });
    }
    
    return allActivities;
  } catch (error) {
    console.error('[QB API] Error fetching TimeActivities:', error);
    // Return empty array instead of throwing - don't break the dashboard
    return [];
  }
}

/**
 * Get QuickBooks Customers (optionally only jobs). Used as projects list fallback.
 */
async function getQuickBooksCustomersAsProjects(onlyJobs: boolean): Promise<{ Id: string; Name?: string; DisplayName?: string }[]> {
  const qr = (r: any) => r?.QueryResponse?.Customer ?? r?.QueryResponse?.customer ?? [];
  try {
    let list: any[] = [];
    if (onlyJobs) {
      const query = 'SELECT Id, DisplayName, FullyQualifiedName, ParentRef, Job FROM Customer MAXRESULTS 1000';
      const response = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(query)}`);
      const all = qr(response);
      list = Array.isArray(all) ? all.filter((c: any) => c.Job === true || c.Job === 1 || c.ParentRef != null) : [];
    }
    if (list.length === 0) {
      const query = 'SELECT Id, DisplayName, FullyQualifiedName FROM Customer MAXRESULTS 1000';
      const response = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(query)}`);
      list = Array.isArray(qr(response)) ? qr(response) : [];
    }
    return list.map((c: any) => ({
      Id: String(c.Id ?? c.id),
      Name: c.FullyQualifiedName ?? c.DisplayName ?? c.displayName,
      DisplayName: c.DisplayName ?? c.displayName ?? c.FullyQualifiedName,
    }));
  } catch (error) {
    console.warn('[QB API] Customer fetch failed:', error);
    return [];
  }
}

/**
 * Get QuickBooks Projects and Customer Jobs/Customers for linking to jobs.
 */
export async function getQuickBooksProjects(): Promise<{ Id: string; Name?: string; DisplayName?: string }[]> {
  const results: { Id: string; Name?: string; DisplayName?: string }[] = [];
  const seenIds = new Set<string>();
  const add = (item: { Id: string; Name?: string; DisplayName?: string }) => {
    if (seenIds.has(item.Id)) return;
    seenIds.add(item.Id);
    results.push(item);
  };
  try {
    const projectQuery = 'SELECT * FROM Project MAXRESULTS 1000';
    const response = await quickBooksApiCall(`/v3/company/{realmId}/query?query=${encodeURIComponent(projectQuery)}`);
    const projectList = response?.QueryResponse?.Project ?? response?.QueryResponse?.project ?? [];
    if (Array.isArray(projectList)) {
      for (const p of projectList) {
        add({ Id: String(p.Id ?? p.id), Name: p.Name ?? p.DisplayName ?? p.displayName, DisplayName: p.DisplayName ?? p.displayName ?? p.Name ?? p.name });
      }
    }
  } catch (error) {
    console.warn('[QB API] Projects not available:', error);
  }
  const customerJobs = await getQuickBooksCustomersAsProjects(true);
  for (const j of customerJobs) add(j);
  if (results.length === 0) {
    const allCustomers = await getQuickBooksCustomersAsProjects(false);
    for (const c of allCustomers) add(c);
  }
  return results;
}

/**
 * Search QuickBooks projects/customers by name (client-side filter).
 */
export async function searchQuickBooksProjects(query: string): Promise<{ Id: string; Name?: string; DisplayName?: string }[]> {
  const all = await getQuickBooksProjects();
  if (!query?.trim()) return all;
  const q = query.trim().toLowerCase();
  return all.filter((p) => (p.Name && p.Name.toLowerCase().includes(q)) || (p.DisplayName && p.DisplayName.toLowerCase().includes(q)));
}

/**
 * Get total hours worked for a QuickBooks project/customer from TimeActivity.
 */
export async function getQuickBooksHoursByProject(projectId: string): Promise<number> {
  try {
    const activities = await getQuickBooksTimeActivities();
    let totalMinutes = 0;
    for (const a of activities) {
      const refId = a.ProjectRef?.value || a.ProjectRef?.name;
      const customerRefId = a.CustomerRef?.value;
      if (refId !== projectId && customerRefId !== projectId) continue;
      if (a.Hours != null) totalMinutes += Number(a.Hours) * 60;
      if (a.Minutes != null) totalMinutes += Number(a.Minutes);
      if (a.Duration != null && a.Hours == null && a.Minutes == null) totalMinutes += Number(a.Duration) / 60;
    }
    return Math.round((totalMinutes / 60) * 100) / 100;
  } catch (error) {
    console.warn('[QB API] Error fetching hours for project:', projectId, error);
    return 0;
  }
}

/**
 * Get a single employee by ID
 */
export async function getQuickBooksEmployee(employeeId: string): Promise<any> {
  const response = await quickBooksApiCall(`/v3/company/{realmId}/employee/${employeeId}`);
  return response?.Employee || response;
}

/**
 * Get Employee Payroll Info (detailed compensation data)
 * This includes hourly rates, salary, pay schedule, etc.
 */
export async function getQuickBooksEmployeeCompensation(): Promise<any[]> {
  // Get employees with all available fields for compensation
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Employee WHERE Active = true MAXRESULTS 1000');
  const employees = response?.QueryResponse?.Employee || [];
  
  // Enhanced employee data with compensation details
  return employees.map((emp: any) => ({
    id: emp.Id,
    displayName: emp.DisplayName,
    givenName: emp.GivenName,
    familyName: emp.FamilyName,
    active: emp.Active !== false,
    email: emp.PrimaryEmailAddr?.Address,
    phone: emp.PrimaryPhone?.FreeFormNumber || emp.Mobile?.FreeFormNumber,
    hiredDate: emp.HiredDate,
    releasedDate: emp.ReleasedDate,
    // Compensation fields
    billRate: emp.BillRate || 0,
    costRate: emp.CostRate || 0,
    hourlyRate: emp.HourlyRate || emp.BillRate || emp.CostRate || 0,
    // Employee type and status
    employeeType: emp.EmployeeType,
    employeeNumber: emp.EmployeeNumber,
    // Address
    address: emp.PrimaryAddr ? {
      line1: emp.PrimaryAddr.Line1,
      city: emp.PrimaryAddr.City,
      state: emp.PrimaryAddr.CountrySubDivisionCode,
      zip: emp.PrimaryAddr.PostalCode
    } : null,
    // SSN (masked)
    ssn: emp.SSN ? `***-**-${emp.SSN.slice(-4)}` : null,
    // Gender and birth date
    gender: emp.Gender,
    birthDate: emp.BirthDate,
  }));
}

/**
 * Get Payroll Summary Report (actual pay data)
 * Note: Requires QuickBooks Payroll subscription
 */
export async function getQuickBooksPayrollSummary(startDate?: string, endDate?: string): Promise<any> {
  try {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    
    const start = startDate || startOfYear.toISOString().split('T')[0];
    const end = endDate || today.toISOString().split('T')[0];
    
    // PayrollSummary report shows wages, taxes, deductions by employee
    return await quickBooksApiCall(`/v3/company/{realmId}/reports/PayrollSummary?start_date=${start}&end_date=${end}`);
  } catch (error) {
    console.log('[QB] Payroll Summary report not available - requires QuickBooks Payroll subscription');
    return null;
  }
}

/**
 * Get Payroll Details Report (detailed pay breakdown)
 * Note: Requires QuickBooks Payroll subscription
 */
export async function getQuickBooksPayrollDetails(startDate?: string, endDate?: string): Promise<any> {
  try {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    
    const start = startDate || startOfYear.toISOString().split('T')[0];
    const end = endDate || today.toISOString().split('T')[0];
    
    return await quickBooksApiCall(`/v3/company/{realmId}/reports/PayrollDetailsByEmployee?start_date=${start}&end_date=${end}`);
  } catch (error) {
    console.log('[QB] Payroll Details report not available - requires QuickBooks Payroll subscription');
    return null;
  }
}

/**
 * Get Time Off Balances/Accruals for employees
 * Note: Requires QuickBooks Payroll subscription
 */
export async function getQuickBooksTimeOffBalances(): Promise<any> {
  try {
    // Time off accruals requires Payroll subscription
    return await quickBooksApiCall('/v3/company/{realmId}/reports/TimeOffBalance');
  } catch (error) {
    console.log('[QB] Time off balance report not available - requires QuickBooks Payroll subscription');
    return null;
  }
}

/**
 * Get Employee Details by Time Period Report
 */
export async function getQuickBooksEmployeeDetails(startDate?: string, endDate?: string): Promise<any> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const start = startDate || startOfYear.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  return quickBooksApiCall(`/v3/company/{realmId}/reports/EmployeeDetails?start_date=${start}&end_date=${end}`);
}

// ============================================
// ADDITIONAL QUICKBOOKS DATA ENTITIES
// ============================================

/**
 * Get items (products and services) from QuickBooks
 */
export async function getQuickBooksItems(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Item MAXRESULTS 1000');
  return response?.QueryResponse?.Item || [];
}

/**
 * Get credit memos from QuickBooks
 */
export async function getQuickBooksCreditMemos(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM CreditMemo MAXRESULTS 1000');
  return response?.QueryResponse?.CreditMemo || [];
}

/**
 * Get refund receipts from QuickBooks
 */
export async function getQuickBooksRefundReceipts(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM RefundReceipt MAXRESULTS 1000');
  return response?.QueryResponse?.RefundReceipt || [];
}

/**
 * Get journal entries from QuickBooks
 */
export async function getQuickBooksJournalEntries(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM JournalEntry MAXRESULTS 1000');
  return response?.QueryResponse?.JournalEntry || [];
}

/**
 * Get payment terms from QuickBooks
 */
export async function getQuickBooksTerms(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Term MAXRESULTS 1000');
  return response?.QueryResponse?.Term || [];
}

/**
 * Get tax codes from QuickBooks
 */
export async function getQuickBooksTaxCodes(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM TaxCode MAXRESULTS 1000');
  return response?.QueryResponse?.TaxCode || [];
}

/**
 * Get tax rates from QuickBooks
 */
export async function getQuickBooksTaxRates(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM TaxRate MAXRESULTS 1000');
  return response?.QueryResponse?.TaxRate || [];
}

/**
 * Get classes from QuickBooks (for categorization)
 */
export async function getQuickBooksClasses(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Class MAXRESULTS 1000');
  return response?.QueryResponse?.Class || [];
}

/**
 * Get departments from QuickBooks
 */
export async function getQuickBooksDepartments(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Department MAXRESULTS 1000');
  return response?.QueryResponse?.Department || [];
}

/**
 * Get bill payments from QuickBooks
 */
export async function getQuickBooksBillPayments(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM BillPayment MAXRESULTS 1000');
  return response?.QueryResponse?.BillPayment || [];
}

/**
 * Get vendor credits from QuickBooks
 */
export async function getQuickBooksVendorCredits(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM VendorCredit MAXRESULTS 1000');
  return response?.QueryResponse?.VendorCredit || [];
}

/**
 * Get transfers between accounts from QuickBooks
 */
export async function getQuickBooksTransfers(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Transfer MAXRESULTS 1000');
  return response?.QueryResponse?.Transfer || [];
}

/**
 * Get payment methods from QuickBooks
 */
export async function getQuickBooksPaymentMethods(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM PaymentMethod MAXRESULTS 1000');
  return response?.QueryResponse?.PaymentMethod || [];
}

/**
 * Get preferences/settings from QuickBooks
 */
export async function getQuickBooksPreferences(): Promise<any> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/preferences');
  return response?.Preferences || response;
}

/**
 * Get A/R Aging Summary report from QuickBooks
 */
export async function getQuickBooksARAgingSummary(): Promise<any> {
  return quickBooksApiCall('/v3/company/{realmId}/reports/AgedReceivables?report_date=Today');
}

/**
 * Get A/P Aging Summary report from QuickBooks
 */
export async function getQuickBooksAPAgingSummary(): Promise<any> {
  return quickBooksApiCall('/v3/company/{realmId}/reports/AgedPayables?report_date=Today');
}

/**
 * Get Trial Balance report from QuickBooks
 */
export async function getQuickBooksTrialBalance(startDate?: string, endDate?: string): Promise<any> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const start = startDate || startOfYear.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  return quickBooksApiCall(`/v3/company/{realmId}/reports/TrialBalance?start_date=${start}&end_date=${end}`);
}

/**
 * Get General Ledger report from QuickBooks
 */
export async function getQuickBooksGeneralLedger(startDate?: string, endDate?: string): Promise<any> {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const start = startDate || startOfMonth.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  return quickBooksApiCall(`/v3/company/{realmId}/reports/GeneralLedger?start_date=${start}&end_date=${end}`);
}

/**
 * Get Purchase Orders from QuickBooks
 */
export async function getQuickBooksPurchaseOrders(): Promise<any[]> {
  const response = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM PurchaseOrder MAXRESULTS 1000');
  return response?.QueryResponse?.PurchaseOrder || [];
}
