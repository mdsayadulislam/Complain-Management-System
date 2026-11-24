-- ============================================================================
-- MIGRATION: Fix complaint-attachments Supabase Storage Bucket & Public RLS
-- Target: Fix "Upload failed: new row violates row-level security policy"
-- ============================================================================

-- 1. Ensure the storage bucket exists with 20MB limit and allowed MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-attachments',
  'complaint-attachments',
  TRUE,
  20971520, -- 20MB in bytes (20 * 1024 * 1024)
  ARRAY['image/jpeg', 'image/png', 'application/pdf', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'];

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing conflicting policies if any
DROP POLICY IF EXISTS "Allow authenticated uploads to complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon and auth uploads to complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments read policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments read authorized stakeholders" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments update policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments delete policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments delete own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads update on complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete attachments" ON storage.objects;

-- 3. Policy: Allow authenticated AND anonymous users to upload evidence files
CREATE POLICY "Allow anon and auth uploads to complaint-attachments"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'complaint-attachments');

-- 4. Policy: Allow public read access to view attachments
CREATE POLICY "Allow public reads from complaint-attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'complaint-attachments');

-- 5. Policy: Allow updates/overwrites if needed
CREATE POLICY "Allow uploads update on complaint-attachments"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'complaint-attachments');

-- 6. Policy: Allow users to delete attachments (for removing files before submission)
CREATE POLICY "Allow users to delete attachments"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'complaint-attachments');

-- 7. Ensure complaint_attachments table has storage_path column and RLS
ALTER TABLE public.complaint_attachments
ADD COLUMN IF NOT EXISTS storage_path TEXT;

DROP POLICY IF EXISTS "Attachments readable by complaint stakeholders" ON public.complaint_attachments;
CREATE POLICY "Attachments readable by complaint stakeholders"
ON public.complaint_attachments FOR SELECT
TO public
USING (TRUE);

DROP POLICY IF EXISTS "Complaint owners can insert attachments" ON public.complaint_attachments;
CREATE POLICY "Complaint owners can insert attachments"
ON public.complaint_attachments FOR INSERT
TO public
WITH CHECK (TRUE);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
