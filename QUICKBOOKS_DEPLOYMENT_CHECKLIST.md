# QuickBooks Integration - Deployment Checklist

This checklist covers all the steps needed to get QuickBooks integration working in sandbox mode.

## ✅ Already Completed

- [x] Supabase secrets configured (`QB_CLIENT_ID`, `QB_CLIENT_SECRET`)
- [x] Edge function code exists (`supabase/functions/quickbooks-oauth/index.ts`)
- [x] Frontend components created (`QuickBooksIntegration`, `QuickBooksCallback`)
- [x] Settings/Integrations page created (`/settings/integrations`)
- [x] Route added to App.tsx
- [x] Callback route configured (`/auth/quickbooks/callback`)
- [x] **QuickBooks job sync table migration run** (`create_quickbooks_job_sync_table.sql`)
- [x] **QuickBooks Dashboard created** in Admin Dashboard

## 🔧 Steps Remaining

### 1. Run Database Migration

**Action Required:** Execute the SQL migration to create the `quickbooks_integrations` table.

**Note:** The `quickbooks_job_sync` table migration has already been run. ✅

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project (Field Software)
3. Navigate to **SQL Editor**
4. Open the file: `Database Scripts/Setup & Configuration/create_quickbooks_integration_table.sql`
5. Copy the entire SQL script
6. Paste it into the SQL Editor
7. Click **Run** (or press Cmd/Ctrl + Enter)

**Verify it worked:**
```sql
SELECT * FROM common.quickbooks_integrations LIMIT 1;
```
(Should return empty result, not an error)

---

### 2. Deploy Edge Function

**Action Required:** Deploy the `quickbooks-oauth` Edge Function to Supabase.

**Option A: Using Supabase CLI (Recommended)**

```bash
cd /Users/cohn/ampOS/Active-Website-Software-master

# Make sure you're logged in
supabase login

# Link your project (if not already linked)
supabase link --project-ref vdxprdihmbqomwqfldpo

# Deploy the function
supabase functions deploy quickbooks-oauth
```

**Option B: Using Supabase Dashboard**

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Edge Functions**
4. Click **Create a new function**
5. Name it: `quickbooks-oauth`
6. Copy the contents of `supabase/functions/quickbooks-oauth/index.ts`
7. Paste into the editor
8. Click **Deploy**

**Verify it worked:**
- Go to Edge Functions in Supabase Dashboard
- You should see `quickbooks-oauth` listed
- Test it by clicking on it and checking the logs

---

### 3. Set Additional Supabase Secrets (Optional but Recommended)

Set the environment and redirect URI for the Edge Function:

```bash
# Set environment (sandbox or production)
supabase secrets set QB_ENVIRONMENT=sandbox

# Set redirect URI (replace with your actual Netlify URL)
supabase secrets set QB_REDIRECT_URI=https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback
```

**Note:** The redirect URI should match what you configure in QuickBooks Developer Dashboard.

---

### 4. Configure Netlify Environment Variables

**Action Required:** Add frontend environment variables to Netlify.

1. Go to https://app.netlify.com
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**

Add these variables:

| Key | Value | Scopes |
|-----|-------|--------|
| `VITE_QB_CLIENT_ID` | `YOUR_QB_CLIENT_ID_HERE` | Builds, Functions, Runtime |
| `VITE_QB_ENVIRONMENT` | `sandbox` | Builds, Functions, Runtime |
| `VITE_QB_REDIRECT_URI` | `https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback` | Builds, Functions, Runtime |
| `VITE_QB_SCOPE` | `com.intuit.quickbooks.accounting` | Builds, Functions, Runtime |

**Important:** Replace `YOUR-SITE-NAME` with your actual Netlify site name.

---

### 5. Configure QuickBooks Developer Dashboard

**Action Required:** Add redirect URIs to your QuickBooks app.

1. Go to https://developer.intuit.com
2. Sign in to your account
3. Click **Apps** in the top menu
4. Find your app (use your Client ID from QuickBooks Developer Dashboard)
5. Click on your app to open it
6. Look for **Redirect URIs** or **OAuth Settings**
7. Add these redirect URIs:
   - Production: `https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback`
   - Development: `http://localhost:5175/auth/quickbooks/callback` (or your local dev port)
8. Click **Save** or **Update**

**Note:** Make sure you're in **Sandbox** mode for testing.

---

### 6. Redeploy Netlify Site

**Action Required:** Redeploy to pick up new environment variables.

1. In Netlify, go to your site dashboard
2. Click **Deploys** tab
3. Click **Trigger deploy** → **Deploy site**
4. Wait for deployment to complete (1-3 minutes)

---

### 7. Test the Integration

**Action Required:** Test the complete OAuth flow.

1. **Local Testing:**
   ```bash
   # Make sure your .env file has:
   VITE_QB_CLIENT_ID=YOUR_QB_CLIENT_ID_HERE
   VITE_QB_ENVIRONMENT=sandbox
   VITE_QB_REDIRECT_URI=http://localhost:5175/auth/quickbooks/callback
   VITE_QB_SCOPE=com.intuit.quickbooks.accounting
   
   # Start dev server
   npm run dev
   ```

2. **Navigate to Settings:**
   - Go to `http://localhost:5175/settings/integrations`
   - You should see the QuickBooks Integration component

3. **Test Connection:**
   - Click **Connect QuickBooks**
   - You should be redirected to QuickBooks authorization page
   - Sign in with a QuickBooks Sandbox account
   - Authorize the app
   - You should be redirected back to `/auth/quickbooks/callback`
   - Then redirected to `/settings/integrations`
   - You should see "Connected" status

4. **Test Production:**
   - Go to `https://YOUR-SITE-NAME.netlify.app/settings/integrations`
   - Repeat the connection test

---

## 🐛 Troubleshooting

### "QuickBooks Client ID not configured"
- ✅ Check Netlify environment variables are set
- ✅ Redeploy Netlify site
- ✅ Check browser console for `import.meta.env.VITE_QB_CLIENT_ID`

### "Redirect URI mismatch"
- ✅ Verify redirect URI in QuickBooks Developer Dashboard matches exactly
- ✅ Check for trailing slashes (should NOT have one)
- ✅ Verify `https://` for production, `http://` for local

### "Edge Function not found" or "Function error"
- ✅ Verify Edge Function is deployed: `supabase functions list`
- ✅ Check Edge Function logs in Supabase Dashboard
- ✅ Verify secrets are set: `supabase secrets list`

### "Database error" or "Table not found"
- ✅ Run the database migration (Step 1)
- ✅ Verify table exists: `SELECT * FROM common.quickbooks_integrations LIMIT 1;`

### "Token exchange failed"
- ✅ Check Edge Function logs in Supabase Dashboard
- ✅ Verify `QB_CLIENT_SECRET` is set correctly
- ✅ Verify `QB_CLIENT_ID` matches QuickBooks Developer Dashboard
- ✅ Check that redirect URI matches exactly

---

## 📋 Quick Reference

**Supabase Secrets:**
```bash
supabase secrets list
```

**Deploy Edge Function:**
```bash
supabase functions deploy quickbooks-oauth
```

**Check Edge Function Logs:**
- Supabase Dashboard → Edge Functions → quickbooks-oauth → Logs

**Test Edge Function:**
```bash
supabase functions invoke quickbooks-oauth --method GET
```

---

## 🎯 Next Steps After Setup

Once everything is working:

1. ✅ Test creating a customer sync
2. ✅ Test creating an invoice
3. ✅ Test token refresh (automatic)
4. ✅ Test disconnecting and reconnecting
5. ✅ Switch to production when ready (change `QB_ENVIRONMENT` to `production`)

---

**Last Updated:** December 2024

