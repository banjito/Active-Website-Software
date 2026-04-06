# ⚠️ URGENT: Create Resumes Bucket Now

## The Error
"Bucket not found" means the `resumes` bucket doesn't exist yet. You **MUST** create it via Supabase Dashboard before the public career page will work.

## Step-by-Step: Create the Bucket

### 1. Go to Supabase Dashboard
- Open your Supabase project dashboard
- Navigate to **Storage** in the left sidebar

### 2. Create New Bucket
- Click the **"New bucket"** button (usually top right)
- Or click **"Create a new bucket"** if you see that option

### 3. Configure the Bucket

Fill in these **exact** settings:

**Basic Settings:**
- **Name**: `resumes` (must be exactly this, lowercase)
- **Public bucket**: ✅ **CHECK THIS BOX** (This is CRITICAL - allows anonymous uploads)

**File Size Limit:**
- Set to: `10` MB (or `10485760` bytes)

**Allowed MIME types:**
Add these three types (one per line or comma-separated):
```
application/pdf
application/msword
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

### 4. Create the Bucket
- Click **"Create bucket"** or **"Save"**

### 5. Set Up Policies (After Bucket is Created)

Once the bucket exists, you need to add policies. You can do this via:

**Option A: SQL Editor (Recommended)**
1. Go to SQL Editor in Supabase Dashboard
2. Run the file: `2024_hr_resumes_bucket_policies_only.sql`
3. This will create the 4 required policies

**Option B: Dashboard UI**
1. Go to Storage → `resumes` bucket
2. Click on "Policies" tab
3. Create these 4 policies:

#### Policy 1: Anonymous Upload (MOST IMPORTANT)
- **Policy name**: `resumes_insert`
- **Allowed operation**: `INSERT`
- **Target roles**: Select `public` (this allows non-logged-in users)
- **Policy definition**: 
  ```sql
  bucket_id = 'resumes'
  ```

#### Policy 2: Public Read
- **Policy name**: `resumes_select`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
- **Policy definition**: 
  ```sql
  bucket_id = 'resumes'
  ```

#### Policy 3: Authenticated Update
- **Policy name**: `resumes_update`
- **Allowed operation**: `UPDATE`
- **Target roles**: `authenticated`
- **Policy definition**: 
  ```sql
  bucket_id = 'resumes'
  ```

#### Policy 4: Authenticated Delete
- **Policy name**: `resumes_delete`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**: 
  ```sql
  bucket_id = 'resumes'
  ```

## Verify It Works

After creating the bucket and policies:

1. Go to your public career page: `/careers`
2. Click "Apply Now" on any job
3. Fill out the form and upload a resume
4. It should upload successfully without requiring login

## Troubleshooting

**Still getting "Bucket not found"?**
- Double-check the bucket name is exactly `resumes` (lowercase, no spaces)
- Refresh the page and try again
- Check Storage → Buckets to confirm it exists

**Getting permission errors?**
- Make sure the bucket is set to **Public**
- Verify the `resumes_insert` policy exists and allows `public` role
- Check that the policy definition is `bucket_id = 'resumes'`

**Upload fails after bucket is created?**
- Check the browser console for specific error messages
- Verify file size is under 10MB
- Verify file type is PDF or Word document
