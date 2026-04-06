# Manual Setup: Resumes Storage Bucket

If you're getting permission errors when running the SQL script, follow these manual steps:

## Step 1: Create the Bucket via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"** button
4. Configure the bucket:
   - **Name**: `resumes`
   - **Public**: ✅ **Yes** (check this - it's required for anonymous uploads)
   - **File size limit**: `10MB` (or `10485760` bytes)
   - **Allowed MIME types**: 
     - `application/pdf`
     - `application/msword`
     - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

5. Click **"Create bucket"**

## Step 2: Set Up Storage Policies

After creating the bucket, run the SQL script `2024_hr_resumes_bucket.sql` in the Supabase SQL Editor. 

The script will:
- Create policies that allow **anonymous users** to upload resumes
- Allow anyone to read resumes (for HR team access)
- Allow authenticated users to update/delete resumes

## Step 3: Verify Setup

After running the script, verify the setup:

1. Check that the bucket exists in Storage
2. Check that the policies are created (you can see them in the Storage → Policies section)
3. Test by trying to upload a resume from the public career page

## Important Notes

- The bucket **MUST** be public for anonymous uploads to work
- The policies allow `TO public` which means anyone (including non-logged-in users) can upload
- This is safe because:
  - Only PDF and Word documents are allowed
  - File size is limited to 10MB
  - Files are stored in organized folders by requisition ID

## Troubleshooting

If you still get permission errors:
1. Make sure you're running the SQL as a user with proper permissions
2. Try creating the bucket via Dashboard first, then run only the policy creation part
3. Check Supabase documentation for your specific permission setup
