# QuickBooks Setup - Step-by-Step Checklist

Follow these steps in order. Check off each one as you complete it.

---

## ✅ Step 0: Install Supabase CLI

**Do this FIRST** - You need the Supabase CLI to set secrets.

### Option 1: Install via Homebrew (Mac - Recommended)

1. Open your terminal
2. Install Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   ```
3. Verify installation:
   ```bash
   supabase --version
   ```
   You should see a version number (e.g., `1.x.x`)

### Option 2: Install via npm (Any Platform)

1. Open your terminal
2. Install Supabase CLI globally:
   ```bash
   npm install -g supabase
   ```
3. Verify installation:
   ```bash
   supabase --version
   ```
   You should see a version number (e.g., `1.x.x`)

### Option 3: Download Binary (Alternative)

1. Go to https://github.com/supabase/cli/releases
2. Download the latest release for your platform (macOS, Windows, or Linux)
3. Extract and add to your PATH, or run directly

**✅ Check this off when done**

---

## ✅ Step 1: Login to Supabase

1. Open your terminal
2. Login to Supabase:
   ```bash
   supabase login
   ```
3. This will open your browser - sign in with your Supabase account
4. After signing in, return to the terminal - you should see "Successfully logged in"

**✅ Check this off when done**

---

## 🔍 Verify Your Account (Optional but Recommended)

After logging in, verify which account and project you're using:

### Check Which Account You're Logged Into

1. Check your login status:
   ```bash
   supabase projects list
   ```
   This shows all projects for the account you're logged into.

2. Or check your account info:
   ```bash
   cat ~/.supabase/access-token 2>/dev/null || echo "Token file not found"
   ```
   (This just confirms you're logged in - the token itself is encrypted)

3. **Best way**: Go to https://supabase.com/dashboard and check which account/projects you see there

### Check Which Project is Linked (After Linking)

After you link your project in Step 2, you can verify:

1. Check linked project:
   ```bash
   cd /Users/cohn/ampOS/Active-Website-Software-master
   cat .supabase/config.toml 2>/dev/null | grep project_id || echo "Not linked yet"
   ```

2. Or check project info:
   ```bash
   supabase status
   ```
   This shows your linked project details.

**✅ Check this off when done**

---

## ✅ Step 2: Link Your Project

1. Get your Supabase project reference:
   - Go to https://supabase.com/dashboard
   - Select your project
   - Look at the URL or project settings - you'll see something like `vdxprdihmbqomwqfldpo`
   - Or check your `.env` file - it's in `VITE_SUPABASE_URL=https://vdxprdihmbqomwqfldpo.supabase.co`

2. Link your project:
   ```bash
   cd /Users/cohn/ampOS/Active-Website-Software-master
   supabase link --project-ref vdxprdihmbqomwqfldpo
   ```
   (Replace `vdxprdihmbqomwqfldpo` with your actual project reference)

3. **Verify the link worked:**
   ```bash
   supabase status
   ```
   You should see your project information displayed.

**✅ Check this off when done**

---

## ✅ Step 3: Set Supabase Secrets (Server-Side)

**Now set the QuickBooks credentials** - The client secret must be stored server-side only.

1. Set the QuickBooks client secret in Supabase (REQUIRED):
   ```bash
   supabase secrets set QB_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
   ```
   (Get your client secret from the QuickBooks Developer Dashboard)

2. (Optional but recommended) Set the QuickBooks client ID in Supabase:
   ```bash
   supabase secrets set QB_CLIENT_ID=YOUR_CLIENT_ID_HERE
   ```
   (Get your client ID from the QuickBooks Developer Dashboard)

3. (Optional) Set other QuickBooks configuration:
   ```bash
   supabase secrets set QB_ENVIRONMENT=sandbox
   supabase secrets set QB_REDIRECT_URI=https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback
   ```

4. Verify secrets were set:
   ```bash
   supabase secrets list
   ```
   You should see `QB_CLIENT_SECRET` (and optionally `QB_CLIENT_ID`, `QB_ENVIRONMENT`, `QB_REDIRECT_URI`) in the list (values will be hidden/masked).

**✅ Check this off when done**

---

## ✅ Step 4: Get Your Netlify Site URL

1. Go to https://app.netlify.com
2. Find your site in the dashboard
3. Note your site URL (it will be something like `https://your-site-name.netlify.app`)
4. Write it down - you'll need it for the next steps

**Your Netlify URL:** `https://____________________.netlify.app`

**✅ Check this off when done**

---

## ✅ Step 5: Add Environment Variables to Netlify

1. In Netlify, go to your site
2. Click **Site settings** (gear icon or from the top menu)
3. Click **Environment variables** in the left sidebar
4. Click **Add a variable** button

### Add Variable 1: VITE_QB_CLIENT_ID

1. **Key:** `VITE_QB_CLIENT_ID`
2. **Value:** `YOUR_CLIENT_ID_HERE` (get from QuickBooks Developer Dashboard)
3. ✅ Check the box: **"Contains secret values"** (good practice)
4. **Scopes:** Select **"Specific scopes"** and check:
   - ✅ Builds
   - ✅ Functions
   - ✅ Runtime
5. **Values:** Select **"Same value for all deploy contexts"**
6. Click **Save**

### Add Variable 2: VITE_QB_ENVIRONMENT

1. Click **Add a variable** again
2. **Key:** `VITE_QB_ENVIRONMENT`
3. **Value:** `sandbox`
4. **Scopes:** Select **"Specific scopes"** and check:
   - ✅ Builds
   - ✅ Functions
   - ✅ Runtime
5. **Values:** Select **"Same value for all deploy contexts"**
6. Click **Save**

### Add Variable 3: VITE_QB_REDIRECT_URI

1. Click **Add a variable** again
2. **Key:** `VITE_QB_REDIRECT_URI`
3. **Value:** `https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback`
   - Replace `YOUR-SITE-NAME` with your actual Netlify site name
   - Example: `https://my-amp-os.netlify.app/auth/quickbooks/callback`
4. **Scopes:** Select **"Specific scopes"** and check:
   - ✅ Builds
   - ✅ Functions
   - ✅ Runtime
5. **Values:** Select **"Same value for all deploy contexts"**
6. Click **Save**

### Add Variable 4: VITE_QB_SCOPE

1. Click **Add a variable** again
2. **Key:** `VITE_QB_SCOPE`
3. **Value:** `com.intuit.quickbooks.accounting`
4. **Scopes:** Select **"Specific scopes"** and check:
   - ✅ Builds
   - ✅ Functions
   - ✅ Runtime
5. **Values:** Select **"Same value for all deploy contexts"**
6. Click **Save**

**⚠️ IMPORTANT:** Do NOT add `VITE_QB_CLIENT_SECRET` - it's already in Supabase secrets!

**✅ Check this off when done**

---

## ✅ Step 6: Update QuickBooks Developer Dashboard

1. Go to https://developer.intuit.com
2. Sign in to your account
3. Click on **Apps** in the top menu
4. Find your app (use the Client ID from your QuickBooks Developer Dashboard)
5. Click on your app to open it
6. Look for **Redirect URIs** or **OAuth Settings**
7. Add your redirect URI:
   - `https://YOUR-SITE-NAME.netlify.app/auth/quickbooks/callback`
   - (Use the same URL you used in Step 3, Variable 3)
8. Also add your local development URL:
   - `http://localhost:5175/auth/quickbooks/callback`
9. Click **Save** or **Update**

**✅ Check this off when done**

---

## ✅ Step 7: Redeploy Your Site

1. In Netlify, go to your site dashboard
2. Click on the **Deploys** tab
3. Click **Trigger deploy** button (usually in the top right)
4. Select **Deploy site**
5. Wait for the deploy to complete (usually 1-3 minutes)

**✅ Check this off when done**

---

## ✅ Step 8: Verify Everything Works

### Test Local Development

1. Make sure your `.env` file has the QuickBooks variables (it should already)
2. Start your dev server:
   ```bash
   npm run dev
   ```
3. In your browser console, check if variables are available:
   ```javascript
   console.log('QB Client ID:', import.meta.env.VITE_QB_CLIENT_ID);
   console.log('QB Environment:', import.meta.env.VITE_QB_ENVIRONMENT);
   ```
   You should see your values printed.

### Test Production

1. Go to your Netlify site URL
2. Open browser DevTools (F12)
3. Go to Console tab
4. Type:
   ```javascript
   console.log('QB Client ID:', import.meta.env.VITE_QB_CLIENT_ID);
   ```
   You should see your Client ID (the value, not undefined)

**✅ Check this off when done**

---

## 🎯 What's Next?

After completing all steps above:

1. ✅ Credentials are configured (local + production)
2. ⏳ Implement OAuth flow in your code
3. ⏳ Create QuickBooks API service wrapper
4. ⏳ Test with sandbox QuickBooks company
5. ⏳ Switch to production when ready

---

## 🆘 Troubleshooting

### "Variable not found" in production
- ✅ Make sure you redeployed after adding variables
- ✅ Check that variable names match exactly (case-sensitive)
- ✅ Verify variables are in the correct scopes (Builds, Functions, Runtime)

### "Redirect URI mismatch" error
- ✅ Make sure the redirect URI in Netlify matches QuickBooks Developer Dashboard exactly
- ✅ Check for trailing slashes (should NOT have one)
- ✅ Verify you're using `https://` for production, `http://` for local

### "Client secret not found" in Edge Functions
- ✅ Run `supabase secrets list` to verify it's set
- ✅ Make sure you're accessing it as `Deno.env.get('QB_CLIENT_SECRET')` (not `VITE_QB_CLIENT_SECRET`)

---

**Last Updated**: January 2025
