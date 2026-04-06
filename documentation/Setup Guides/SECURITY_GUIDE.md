# Security Guide: Environment Variables

## 🔐 Understanding VITE_ Variables

### What Happens to VITE_ Variables?

When you use `VITE_` prefix in Vite:
1. ✅ Variable is available in client-side code via `import.meta.env.VITE_*`
2. ⚠️ Variable is **bundled into your JavaScript** and sent to the browser
3. ⚠️ Anyone can view your source code and see these values
4. ⚠️ They appear in browser DevTools, network requests, etc.

### Safe vs Unsafe

| Type | Safe in VITE_? | Example | Why? |
|------|----------------|---------|------|
| **Public API Keys** | ✅ YES | Supabase Anon Key | Designed to be public, protected by RLS |
| **Client IDs** | ✅ YES | OAuth Client IDs | Public by design, used for redirects |
| **API Secrets** | ❌ NO | Client Secrets, API Keys | Should never be exposed |
| **Database Passwords** | ❌ NO | Any password | Should never be exposed |
| **Service Account Keys** | ❌ NO | Private keys | Should never be exposed |

---

## ✅ Supabase: Safe to Expose

### Why Supabase Anon Key is Safe

```typescript
// This is SAFE - Supabase anon key is meant to be public
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

**Security Model:**
- Supabase uses **Row Level Security (RLS)** policies
- The anon key is **public by design**
- Security comes from:
  1. RLS policies on your tables
  2. User authentication (JWT tokens)
  3. Service role key (server-side only, never exposed)

**Anyone can see your anon key** - that's fine! They still can't access your data without:
- A valid user session
- RLS policies allowing access

---

## ❌ QuickBooks: Client Secret Must Be Secret

### The Problem

```typescript
// ❌ DANGEROUS - Client secret exposed in client bundle!
const clientSecret = import.meta.env.VITE_QB_CLIENT_SECRET; // BAD!
```

**Why This is Dangerous:**
1. Client secret is bundled into your JavaScript
2. Anyone can view source code and extract it
3. Attacker can use your client secret to make API calls
4. They could access/modify QuickBooks data

### The Solution: Server-Side Only

**Option 1: Supabase Edge Functions (Recommended)**

```typescript
// ✅ SAFE - Server-side only
// In Supabase Edge Function:
const clientSecret = Deno.env.get('QB_CLIENT_SECRET'); // Not exposed!
```

**Setup:**
```bash
# Set secret in Supabase (server-side only)
supabase secrets set QB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

**Option 2: Backend API Proxy**

Create a backend service that:
- Stores client secret server-side
- Handles all QuickBooks API calls
- Your frontend calls your backend, not QuickBooks directly

---

## 📋 Current Setup Status

### ✅ Safe (Can stay in VITE_)
- `VITE_SUPABASE_URL` - Public endpoint
- `VITE_SUPABASE_ANON_KEY` - Public key, protected by RLS
- `VITE_QB_CLIENT_ID` - Public OAuth client ID
- `VITE_QB_ENVIRONMENT` - Public config
- `VITE_QB_REDIRECT_URI` - Public config

### ❌ Removed from VITE_ (Must be server-side)
- `VITE_QB_CLIENT_SECRET` - **REMOVED** - Use Supabase secrets instead

---

## 🔧 How to Use Server-Side Secrets

### 1. Set Supabase Secret

```bash
cd /Users/cohn/ampOS/Active-Website-Software-master
supabase secrets set QB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

### 2. Access in Edge Function

```typescript
// supabase/functions/quickbooks-oauth/index.ts
const clientId = Deno.env.get('QB_CLIENT_ID') || '';
const clientSecret = Deno.env.get('QB_CLIENT_SECRET') || '';

// Use these for OAuth token exchange (server-side only)
```

### 3. Frontend Calls Edge Function

```typescript
// Frontend (client-side)
const response = await fetch('/functions/v1/quickbooks-oauth', {
  method: 'POST',
  body: JSON.stringify({ authCode: code })
});

// Edge function handles the secret securely
```

---

## 🚀 Production Deployment

### Netlify Environment Variables

**Client-Side (VITE_ prefix):**
- `VITE_QB_CLIENT_ID` ✅
- `VITE_QB_ENVIRONMENT` ✅
- `VITE_QB_REDIRECT_URI` ✅

**Server-Side (Supabase Secrets):**
- `QB_CLIENT_SECRET` - Set via `supabase secrets set`

**Never add `VITE_QB_CLIENT_SECRET` to Netlify!**

---

## ✅ Best Practices

1. **Default to Server-Side**: If unsure, put it server-side
2. **Check Documentation**: API docs usually say if a key is public
3. **Test Exposure**: Check your built JavaScript bundle for secrets
4. **Use Environment-Specific Secrets**: Different secrets for dev/prod
5. **Rotate Secrets**: If a secret is exposed, rotate it immediately

---

## 🔍 How to Check if Secrets are Exposed

### Check Your Build

```bash
# Build your app
npm run build

# Search for secrets in the built files (replace with your actual secret value)
grep -r "YOUR_CLIENT_SECRET_HERE" dist/
```

If you find it, it's exposed! Move it server-side.

### Check Browser DevTools

1. Open your app in browser
2. Open DevTools → Sources
3. Search for your secret
4. If found, it's exposed!

---

## 📚 Summary

| Credential | Location | Safe? |
|------------|----------|-------|
| Supabase Anon Key | `VITE_SUPABASE_ANON_KEY` | ✅ Yes (by design) |
| Supabase URL | `VITE_SUPABASE_URL` | ✅ Yes (public endpoint) |
| QuickBooks Client ID | `VITE_QB_CLIENT_ID` | ✅ Yes (public by design) |
| QuickBooks Client Secret | Supabase Secrets | ✅ Yes (server-side only) |
| QuickBooks Client Secret | `VITE_QB_CLIENT_SECRET` | ❌ **NEVER!** |

---

**Remember**: When in doubt, keep it server-side!
