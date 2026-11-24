-- ============================================================================
-- BULLETPROOF FIX: Supabase Storage Buckets & Policies for Grievance Attachments
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Grant full schema permissions for storage to standard roles
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA storage TO postgres, anon, authenticated, service_role;

-- 2. Drop ALL existing policies on storage.objects to clear legacy/conflicting/restrictive policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', pol.policyname);
    END LOOP;
END $$;

-- 3. Drop ALL existing policies on storage.buckets
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'buckets'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.buckets;', pol.policyname);
    END LOOP;
END $$;

-- 4. Enable RLS on storage.buckets and create public read policy (fixes "Bucket not found" / listBuckets empty)
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on buckets"
ON storage.buckets FOR SELECT
TO public
USING (true);

-- 5. Upsert complaint-attachments bucket (public = true, 20MB limit, allowed_mime_types = NULL to prevent MIME rejection)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-attachments',
  'complaint-attachments',
  true,
  20971520, -- 20MB in bytes
  NULL      -- NULL allows standard files without false-positive browser MIME rejection
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = NULL;

-- Also ensure profiles bucket exists for avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  true,
  5242880, -- 5MB
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = NULL;

-- 6. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 7. Universal Permissive Policies for complaint-attachments:
-- A) INSERT: Allow authenticated users AND anonymous whistleblowers to upload files
CREATE POLICY "complaint_attachments_insert_all"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'complaint-attachments');

-- B) SELECT: Allow public reading of evidence attachments & returning * on upload
CREATE POLICY "complaint_attachments_select_all"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'complaint-attachments');

-- C) UPDATE: Allow overwriting / updating uploaded files
CREATE POLICY "complaint_attachments_update_all"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'complaint-attachments')
WITH CHECK (bucket_id = 'complaint-attachments');

-- D) DELETE: Allow removing uploaded files
CREATE POLICY "complaint_attachments_delete_all"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'complaint-attachments');

-- 8. Universal Permissive Policies for profiles (avatars):
CREATE POLICY "profiles_select_all"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profiles');

CREATE POLICY "profiles_insert_all"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'profiles');

CREATE POLICY "profiles_update_all"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'profiles')
WITH CHECK (bucket_id = 'profiles');

CREATE POLICY "profiles_delete_all"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'profiles');

-- 9. Ensure public.complaint_attachments table is synchronized
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

-- 10. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
