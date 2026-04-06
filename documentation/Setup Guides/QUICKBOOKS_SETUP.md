# QuickBooks Integration Setup Guide

## ✅ Credentials Configured

Your QuickBooks API credentials have been added to your local `.env` file:
- **Client ID**: `YOUR_CLIENT_ID_HERE` (get from QuickBooks Developer Dashboard)
- **Client Secret**: `YOUR_CLIENT_SECRET_HERE` (get from QuickBooks Developer Dashboard)
- **Environment**: Sandbox (for testing)

## 🔒 Security - GitHub Protection

✅ **Your credentials are SAFE** - The `.env` file is already in `.gitignore`, so these secrets will **never** be committed to GitHub.

## 🚀 Production Deployment (Netlify)

When you deploy to Netlify, you need to add these as **Environment Variables** in the Netlify dashboard. Here's how:

### Step 1: Access Netlify Environment Variables

1. Go to your Netlify dashboard: https://app.netlify.com
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**

### Step 2: Add Each Variable

**⚠️ IMPORTANT**: Only add variables that are safe to expose in client-side code!

Add these variables one by one (these are safe to expose):

| Variable Name | Value | Secret Checkbox? |
|--------------|-------|------------------|
| `VITE_QB_CLIENT_ID` | `YOUR_CLIENT_ID_HERE` (from QuickBooks Developer Dashboard) | ✅ Check it (good practice, but it's public anyway) |
| `VITE_QB_ENVIRONMENT` | `sandbox` (or `production` when ready) | Optional |
| `VITE_QB_REDIRECT_URI` | `https://your-domain.netlify.app/auth/quickbooks/callback` | Optional |
| `VITE_QB_SCOPE` | `com.intuit.quickbooks.accounting` | Optional |

**❌ DO NOT ADD `VITE_QB_CLIENT_SECRET` to Netlify!**

The client secret must be set in Supabase Edge Functions secrets (see below).

### Step 3: Update Redirect URI

**Important**: You need to update the Redirect URI in two places:

1. **In Netlify Environment Variables**: Use your production URL
   ```
   VITE_QB_REDIRECT_URI=https://your-actual-domain.netlify.app/auth/quickbooks/callback
   ```

2. **In QuickBooks Developer Dashboard**: 
   - Go to https://developer.intuit.com
   - Open your app settings
   - Add your production redirect URI to the allowed redirect URIs list
   - Example: `https://your-domain.netlify.app/auth/quickbooks/callback`

### Step 4: Set QuickBooks Client Secret (Server-Side Only)

**The client secret MUST NOT be in Netlify environment variables!**

Instead, set it as a Supabase secret:

```bash
cd /Users/cohn/ampOS/Active-Website-Software-master
supabase secrets set QB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

This keeps the secret server-side only and prevents it from being bundled into your client-side JavaScript.

### Step 5: Redeploy

After adding the environment variables:
1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Deploy site**
3. The new environment variables will be available in your production build

## 📝 Using Credentials in Code

### Client-Side (React Components)

Since these use the `VITE_` prefix, they're available in your React components:

```typescript
const clientId = import.meta.env.VITE_QB_CLIENT_ID;
const clientSecret = import.meta.env.VITE_QB_CLIENT_SECRET;
const environment = import.meta.env.VITE_QB_ENVIRONMENT; // 'sandbox' or 'production'
const redirectUri = import.meta.env.VITE_QB_REDIRECT_URI;
const scope = import.meta.env.VITE_QB_SCOPE;
```

### Server-Side (Supabase Edge Functions)

For Supabase Edge Functions, you can either:
1. Use the same `VITE_` variables (they'll be available at build time)
2. Or set them as Supabase secrets (more secure for server-side):

```bash
supabase secrets set QB_CLIENT_ID=YOUR_CLIENT_ID_HERE
supabase secrets set QB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

Then access them in Edge Functions:
```typescript
const clientId = Deno.env.get('QB_CLIENT_ID');
const clientSecret = Deno.env.get('QB_CLIENT_SECRET');
```

## 🔄 OAuth Flow Setup

After getting the initial credentials, you'll need to:

1. **Initiate OAuth Flow**: Redirect user to QuickBooks authorization
2. **Handle Callback**: Receive authorization code
3. **Exchange for Tokens**: Get access token and refresh token
4. **Store Tokens Securely**: Save in database (not in .env - these are user-specific)

The access token and refresh token are **per-user** and should be stored in your database, not in environment variables.

## 🧪 Testing with Sandbox

- **Sandbox Base URL**: `https://sandbox-quickbooks.api.intuit.com`
- **Production Base URL**: `https://quickbooks.api.intuit.com`

Use the sandbox environment for all testing before switching to production.

## ⚠️ Security: Supabase vs QuickBooks

### ✅ Supabase Anon Key (SAFE to expose)
The `VITE_SUPABASE_ANON_KEY` is **designed to be public**. Supabase uses **Row Level Security (RLS)** policies to protect your data, not by hiding the key. Anyone can see your anon key - that's fine! Your RLS policies ensure only authorized users can access data.

### ❌ QuickBooks Client Secret (NOT safe to expose)
The QuickBooks `CLIENT_SECRET` should **NEVER** be in a `VITE_` variable because:
- `VITE_` variables are bundled into your client-side JavaScript
- Anyone can view your client bundle and extract the secret
- This would allow unauthorized access to QuickBooks API

### 🔒 Secure Setup for QuickBooks

**Client-Side (Safe to expose):**
- ✅ `VITE_QB_CLIENT_ID` - Public, used for OAuth redirect
- ✅ `VITE_QB_ENVIRONMENT` - Public config
- ✅ `VITE_QB_REDIRECT_URI` - Public config

**Server-Side Only (Must be secret):**
- ❌ `QB_CLIENT_SECRET` - Must be in Supabase Edge Functions secrets, NOT in VITE_

2. **Redirect URI Matching**: The redirect URI must match EXACTLY between:
   - Your `.env` file
   - Netlify environment variables
   - QuickBooks Developer Dashboard settings

3. **Environment Switching**: When ready for production:
   - Change `VITE_QB_ENVIRONMENT` to `production`
   - Update redirect URI to production URL
   - Update QuickBooks app settings to production environment

## 📚 Next Steps

1. ✅ Credentials added to `.env` (local development)
2. ⏳ Add credentials to Netlify (production)
3. ⏳ Update QuickBooks Developer Dashboard with redirect URIs
4. ⏳ Implement OAuth flow
5. ⏳ Create QuickBooks API service wrapper

---

**Last Updated**: January 2025
