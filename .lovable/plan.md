

# Fix: Storage RLS Policies for Product Image Upload

## Root Cause
The `ugc-assets` storage bucket is private and has **no RLS policies** for `storage.objects`. Edge functions bypass this with the service role key, but the Studio page uploads product images using the client-side Supabase SDK (authenticated user token), which is blocked by RLS.

## Solution
Add storage RLS policies that allow authenticated users to:
1. **INSERT** (upload) files into their own user folder (`user_id/...`)
2. **SELECT** (read/download) their own files
3. **UPDATE** (upsert) their own files

## Technical Details

### Database Migration
Create RLS policies on `storage.objects` for the `ugc-assets` bucket:

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update (upsert) their own files
CREATE POLICY "Users can update own assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ugc-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### No Code Changes Needed
The Studio upload code is already correct -- it uploads to `${user.id}/${assetId}/product.${ext}`, which matches the RLS folder pattern. Once the policies are in place, the upload will work.

