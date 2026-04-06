# Understanding Netlify's "Secret" Checkbox

## 🤔 What You're Seeing

When you add environment variables in Netlify, you see:
- ✅ **"Contains secret values"** checkbox
- 📝 Note: "Secret values are only readable by code running on Netlify's systems"
- ⚠️ Note: "Local development (Netlify CLI) - This value is available to the CLI, and is not considered secret"

## ⚠️ Critical Understanding

### What the "Secret" Checkbox Does

The "Contains secret values" checkbox in Netlify:
- ✅ **Hides the value** in Netlify's UI/API/CLI (you can't see it after saving)
- ✅ **Prevents accidental exposure** in logs or error messages
- ❌ **Does NOT prevent** `VITE_` variables from being bundled into client-side JavaScript

### The Problem with VITE_ Variables

**Even if you check "Contains secret values":**

```typescript
// This STILL gets bundled into your JavaScript:
const secret = import.meta.env.VITE_QB_CLIENT_SECRET;
```

**What happens:**
1. Netlify hides it in the UI ✅
2. Netlify hides it in logs ✅
3. **BUT** Vite bundles it into `dist/assets/*.js` ❌
4. **Anyone can view** your JavaScript bundle and see the value ❌

## 🔒 The Real Solution

### For Client-Side Variables (Safe to Expose)
- ✅ `VITE_QB_CLIENT_ID` - Can check "secret" checkbox (good practice)
- ✅ `VITE_SUPABASE_ANON_KEY` - Can check "secret" checkbox (good practice)
- These are **meant to be public** anyway, so the checkbox is just for UI cleanliness

### For Server-Side Secrets (Must Stay Secret)
- ❌ `VITE_QB_CLIENT_SECRET` - **NEVER add this to Netlify!**
- ✅ Use Supabase Edge Functions secrets instead:
  ```bash
  supabase secrets set QB_CLIENT_SECRET=your-secret-here
  ```

## 📋 Netlify Configuration Guide

### Safe to Add to Netlify (with "secret" checked):

| Variable | Value | Why Safe? |
|----------|-------|-----------|
| `VITE_QB_CLIENT_ID` | Your client ID | Public by design (OAuth) |
| `VITE_QB_ENVIRONMENT` | `sandbox` | Public config |
| `VITE_QB_REDIRECT_URI` | Your callback URL | Public config |
| `VITE_SUPABASE_URL` | Your Supabase URL | Public endpoint |
| `VITE_SUPABASE_ANON_KEY` | Your anon key | Protected by RLS |

### ❌ NEVER Add to Netlify:

| Variable | Why Not? |
|----------|----------|
| `VITE_QB_CLIENT_SECRET` | Gets bundled into client-side JS |
| Any `VITE_*` variable with a real secret | Gets bundled into client-side JS |

## 🎯 Best Practice

1. **For VITE_ variables**: Check "secret" checkbox for cleanliness, but remember they're still in the bundle
2. **For real secrets**: Use Supabase Edge Functions secrets (server-side only)
3. **For production**: Set different values per environment (Production, Deploy Previews, etc.)

## 🔍 How to Verify

After deploying, check if your secret is exposed:

```bash
# Build your app
npm run build

# Search for the secret in built files (replace with your actual secret value)
grep -r "YOUR_CLIENT_SECRET_HERE" dist/
```

If found, it's exposed! Move it to Supabase secrets.

---

**TL;DR**: Netlify's "secret" checkbox hides values in the UI, but `VITE_` variables still get bundled into your JavaScript. Real secrets must be server-side only (Supabase Edge Functions).
