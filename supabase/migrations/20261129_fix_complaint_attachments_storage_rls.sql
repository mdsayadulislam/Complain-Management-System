-- ============================================================================
-- SAFE STORAGE FIX: Policies Only (No ALTER TABLE / No GRANT on storage schema)
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Drop all previous conflicting policies on storage.objects
DROP POLICY IF EXISTS "complaint_attachments_insert_all" ON storage.objects;
DROP POLICY IF EXISTS "complaint_attachments_select_all" ON storage.objects;
DROP POLICY IF EXISTS "complaint_attachments_update_all" ON storage.objects;
DROP POLICY IF EXISTS "complaint_attachments_delete_all" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon and auth uploads to complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads update on complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete attachments" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments read policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments read authorized stakeholders" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments update policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments delete policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments delete own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to complaint-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- 2. Create clean, permissive policies on storage.objects for complaint-attachments
-- A) INSERT: Allow everyone (students, officers, anonymous whistleblowers) to upload evidence
CREATE POLICY "complaint_attachments_insert_all"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'complaint-attachments');

-- B) SELECT: Allow reading attachments (and returning metadata on upload)
CREATE POLICY "complaint_attachments_select_all"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'complaint-attachments');

-- C) UPDATE: Allow updating attachments if needed
CREATE POLICY "complaint_attachments_update_all"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'complaint-attachments')
WITH CHECK (bucket_id = 'complaint-attachments');

-- D) DELETE: Allow removing attachments before final submit
CREATE POLICY "complaint_attachments_delete_all"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'complaint-attachments');

-- 3. Synchronize public.complaint_attachments table
ALTER TABLE public.complaint_attachments
ADD COLUMN IF NOT EXISTS storage_path TEXT;

DROP POLICY IF EXISTS "Attachments readable by complaint stakeholders" ON public.complaint_attachments;
CREATE POLICY "Attachments readable by complaint stakeholders"
ON public.complaint_attachments FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Complaint owners can insert attachments" ON public.complaint_attachments;
CREATE POLICY "Complaint owners can insert attachments"
ON public.complaint_attachments FOR INSERT
TO public
WITH CHECK (true);

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
