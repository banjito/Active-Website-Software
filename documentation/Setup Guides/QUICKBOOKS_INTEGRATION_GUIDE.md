# QuickBooks Integration Guide

This guide explains how to use the QuickBooks integration after it has been set up.

## Overview

The QuickBooks integration allows you to:
- Connect your QuickBooks account to the application
- Sync customers from QuickBooks
- Create invoices in QuickBooks
- Access QuickBooks company information

## Setup Complete Checklist

Before using the integration, ensure you have completed:
- ✅ QuickBooks credentials configured in Supabase secrets
- ✅ Environment variables set in Netlify (for frontend)
- ✅ Database migration run (creates `quickbooks_integrations` table)
- ✅ QuickBooks Developer Dashboard configured with redirect URIs

## Database Migration

Run the database migration to create the necessary table:

```sql
-- Run this in Supabase SQL Editor
-- File: Database Scripts/Setup & Configuration/create_quickbooks_integration_table.sql
```

This creates the `common.quickbooks_integrations` table that stores OAuth tokens per user.

## Connecting QuickBooks

### For Users

1. Navigate to Settings → Integrations (or wherever you've added the `QuickBooksIntegration` component)
2. Click "Connect QuickBooks"
3. You'll be redirected to QuickBooks to authorize the connection
4. After authorization, you'll be redirected back to the app
5. The connection status will be displayed

### For Developers

Use the `QuickBooksIntegration` component in your settings page:

```tsx
import QuickBooksIntegration from '@/components/quickbooks/QuickBooksIntegration';

function SettingsPage() {
  return (
    <div>
      <h2>Integrations</h2>
      <QuickBooksIntegration 
        onConnect={() => console.log('Connected!')}
        onDisconnect={() => console.log('Disconnected!')}
      />
    </div>
  );
}
```

## Using the QuickBooks Service

The `quickbooksService.ts` provides several functions for interacting with QuickBooks:

### Check Connection Status

```typescript
import { getQuickBooksStatus } from '@/services/quickbooksService';

const status = await getQuickBooksStatus();
if (status.connected) {
  console.log('QuickBooks is connected');
  console.log('Company ID:', status.integration?.realm_id);
}
```

### Get Access Token

```typescript
import { getQuickBooksAccessToken } from '@/services/quickbooksService';

const token = await getQuickBooksAccessToken();
if (token) {
  // Use token for API calls
}
```

The service automatically refreshes expired tokens.

### Make API Calls

```typescript
import { quickBooksApiCall } from '@/services/quickbooksService';

// Example: Get customers
const customers = await quickBooksApiCall('/v3/company/{realmId}/query?query=SELECT * FROM Customer');
```

### Helper Functions

```typescript
import { 
  getQuickBooksCompanyInfo,
  getQuickBooksCustomers,
  createQuickBooksInvoice 
} from '@/services/quickbooksService';

// Get company information
const companyInfo = await getQuickBooksCompanyInfo();

// Get customers
const customers = await getQuickBooksCustomers();

// Create an invoice
const invoice = await createQuickBooksInvoice({
  Line: [/* invoice line items */],
  CustomerRef: { value: 'customer-id' },
  // ... other invoice fields
});
```

## API Endpoints

### Supabase Edge Function: `quickbooks-oauth`

**POST** - Exchange authorization code for tokens
```typescript
const response = await supabase.functions.invoke('quickbooks-oauth', {
  body: { code: 'auth-code', realmId: 'company-id' },
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

**GET** - Get connection status
```typescript
const response = await supabase.functions.invoke('quickbooks-oauth', {
  method: 'GET',
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

**PUT** - Refresh access token
```typescript
const response = await supabase.functions.invoke('quickbooks-oauth', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

**DELETE** - Disconnect QuickBooks
```typescript
const response = await supabase.functions.invoke('quickbooks-oauth', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

## Routes

The following routes are available:

- `/auth/quickbooks/callback` - OAuth callback handler (automatically handles redirect from QuickBooks)

## Environment Variables

### Frontend (VITE_ prefix)
- `VITE_QB_CLIENT_ID` - QuickBooks OAuth client ID
- `VITE_QB_ENVIRONMENT` - `sandbox` or `production`
- `VITE_QB_REDIRECT_URI` - OAuth redirect URI
- `VITE_QB_SCOPE` - OAuth scope (default: `com.intuit.quickbooks.accounting`)

### Backend (Supabase Secrets)
- `QB_CLIENT_SECRET` - QuickBooks OAuth client secret (REQUIRED)
- `QB_CLIENT_ID` - QuickBooks OAuth client ID (optional, has fallback)
- `QB_ENVIRONMENT` - Environment setting (optional, defaults to sandbox)
- `QB_REDIRECT_URI` - Redirect URI (optional)

## Security Notes

1. **Client Secret**: Never expose `QB_CLIENT_SECRET` in frontend code. It's stored in Supabase secrets and only accessible server-side.

2. **Access Tokens**: Access tokens are stored in the database and automatically refreshed when expired.

3. **RLS Policies**: The `quickbooks_integrations` table has Row Level Security enabled, so users can only access their own integrations.

## Troubleshooting

### "QuickBooks credentials not configured"
- Ensure `QB_CLIENT_SECRET` is set in Supabase secrets
- Run: `supabase secrets list` to verify

### "Redirect URI mismatch"
- Ensure the redirect URI in Netlify matches QuickBooks Developer Dashboard exactly
- Check for trailing slashes (should NOT have one)
- Verify you're using `https://` for production

### "No valid QuickBooks access token available"
- The token may have expired and refresh failed
- Try disconnecting and reconnecting QuickBooks
- Check that the refresh token is still valid in QuickBooks

### "QuickBooks not connected"
- User needs to connect their QuickBooks account first
- Check the `quickbooks_integrations` table for an active integration

## Next Steps

After connecting QuickBooks, you can:
1. Sync customers from QuickBooks to your app
2. Create invoices in QuickBooks from your jobs
3. Sync invoice status back to your app
4. Use QuickBooks data in reports and dashboards

## Example: Syncing Customers

```typescript
import { getQuickBooksCustomers } from '@/services/quickbooksService';

async function syncCustomers() {
  try {
    const qbResponse = await getQuickBooksCustomers();
    const customers = qbResponse.QueryResponse?.Customer || [];
    
    // Process and save customers to your database
    for (const customer of customers) {
      // Map QuickBooks customer to your customer format
      // Save to database
    }
  } catch (error) {
    console.error('Error syncing customers:', error);
  }
}
```

## Example: Creating an Invoice

```typescript
import { createQuickBooksInvoice } from '@/services/quickbooksService';

async function createInvoice(jobId: string, customerId: string, amount: number) {
  try {
    const invoice = await createQuickBooksInvoice({
      Line: [
        {
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Service' }
          }
        }
      ],
      CustomerRef: { value: customerId },
      TxnDate: new Date().toISOString().split('T')[0],
    });
    
    console.log('Invoice created:', invoice);
    return invoice;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}
```

---

**Last Updated**: January 2025
