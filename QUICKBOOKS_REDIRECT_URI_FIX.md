# QuickBooks Redirect URI Fix

## The Problem

You're seeing this error:
> "The redirect_uri query parameter value is invalid. Make sure it is listed in the Redirect URIs section on your app's keys tab and matches it exactly."

## The Solution

You need to add the exact redirect URI to your QuickBooks Developer Dashboard.

### Step 1: Find Your Current Redirect URI

The redirect URI being used is:
- **Local Development**: `http://localhost:5175/auth/quickbooks/callback`
- **Production**: `https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback`

To check what's actually being sent, open your browser console and run:
```javascript
console.log('Redirect URI:', import.meta.env.VITE_QB_REDIRECT_URI || `${window.location.origin}/auth/quickbooks/callback`);
```

### Step 2: Add to QuickBooks Developer Dashboard

1. Go to https://developer.intuit.com
2. Sign in to your account
3. Click **Apps** in the top menu
4. Find your app (use your Client ID from QuickBooks Developer Dashboard)
5. Click on your app to open it
6. Go to the **Keys** tab (or **OAuth Settings**)
7. Find the **Redirect URIs** section
8. Click **Add** or **Edit**

### Step 3: Add These Exact URIs

Add these **exact** redirect URIs (one per line, no trailing slashes):

**For Local Development:**
```
http://localhost:5175/auth/quickbooks/callback
```

**For Production (when ready):**
```
https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback
```

**⚠️ IMPORTANT:**
- ✅ Must match **exactly** (case-sensitive)
- ✅ No trailing slashes
- ✅ Include the protocol (`http://` or `https://`)
- ✅ Include the port for local (`:5175`)
- ✅ Include the full path (`/auth/quickbooks/callback`)

### Step 4: Save and Test

1. Click **Save** or **Update**
2. Wait a few seconds for changes to propagate
3. Try connecting again from `/settings/integrations`

## Common Mistakes

❌ **Wrong**: `http://localhost:5175/auth/quickbooks/callback/` (trailing slash)
❌ **Wrong**: `localhost:5175/auth/quickbooks/callback` (missing protocol)
❌ **Wrong**: `http://localhost/auth/quickbooks/callback` (missing port)
✅ **Correct**: `http://localhost:5175/auth/quickbooks/callback`

## Still Not Working?

1. **Check the exact error message** - it might show what URI was sent
2. **Verify in browser console** - check what redirect URI is actually being used
3. **Clear browser cache** - sometimes old redirects are cached
4. **Wait a few minutes** - QuickBooks changes can take 1-2 minutes to propagate

## Quick Test

To see what redirect URI your app is using right now, open browser console and type:
```javascript
const redirectUri = import.meta.env.VITE_QB_REDIRECT_URI || `${window.location.origin}/auth/quickbooks/callback`;
console.log('Current redirect URI:', redirectUri);
```

Then make sure that **exact** string is in your QuickBooks Developer Dashboard.

