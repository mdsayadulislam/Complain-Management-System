-- ============================================================================
-- MIGRATION: Fix complaint-attachments Supabase Storage RLS Policies
-- Target: Fix "Upload failed: new row violates row-level security policy"
-- Covers:
--   1. Ensure 'complaint-attachments' bucket exists with 20 MB size limit
--      and strict allowed MIME types: JPG, PNG, PDF, MP4.
--   2. Grant INSERT, SELECT, UPDATE, DELETE policies on storage.objects
--      supporting BOTH authenticated students and anonymous whistleblower submissions.
--   3. Ensure public.complaint_attachments table RLS allows attachment insertion
--      and stakeholder viewing.
-- Safe, idempotent, and re-runnable at any time.
-- ============================================================================

-- 1. Ensure Storage Bucket Exists & is Properly Configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'complaint-attachments',
    'complaint-attachments',
    FALSE,
    20971520, -- 20 MB in bytes (20 * 1024 * 1024)
    ARRAY['image/jpeg', 'image/png', 'application/pdf', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Storage Objects INSERT Policy (Supports Authenticated & Anonymous Submissions)
DROP POLICY IF EXISTS "Complaint attachments upload policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments upload own folder" ON storage.objects;

CREATE POLICY "Complaint attachments upload policy"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (
    bucket_id = 'complaint-attachments'
    AND (
        -- Authenticated user uploading to their own user UID folder
        (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::TEXT)
        -- Authenticated user submitting anonymously into 'anonymous' folder
        OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = 'anonymous')
        -- Anonymous whistleblower uploading into 'anonymous' folder or their session folder
        OR (auth.role() = 'anon' AND (storage.foldername(name))[1] = 'anonymous')
        OR (auth.role() = 'anon' AND (storage.foldername(name))[1] IS NOT NULL)
    )
);

-- 3. Storage Objects SELECT Policy (File Owner, Anonymous Uploader, Super Admin, Dept Staff)
DROP POLICY IF EXISTS "Complaint attachments read policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments read authorized stakeholders" ON storage.objects;

CREATE POLICY "Complaint attachments read policy"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (
    bucket_id = 'complaint-attachments'
    AND (
        -- Authenticated user reading their own uploaded files
        (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::TEXT)
        -- Anonymous files readable by uploader during session / preview
        OR (storage.foldername(name))[1] = 'anonymous'
        -- Super administrator can inspect all evidence attachments
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
        -- Authorized department staff / officers / heads of the routed or forwarded department
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
              AND EXISTS (
                  SELECT 1
                  FROM public.complaint_attachments ca
                  JOIN public.complaints c ON c.id = ca.complaint_id
                  WHERE (
                      c.department_id = p.department_id
                      OR c.forwarded_from_department_id = p.department_id
                  )
                    AND (
                        ca.storage_path = storage.objects.name
                        OR ca.file_url LIKE '%' || storage.objects.name || '%'
                    )
              )
        )
    )
);

-- 4. Storage Objects UPDATE Policy (For Overwrite / Upsert / Metadata)
DROP POLICY IF EXISTS "Complaint attachments update policy" ON storage.objects;

CREATE POLICY "Complaint attachments update policy"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (
    bucket_id = 'complaint-attachments'
    AND (
        (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::TEXT)
        OR (storage.foldername(name))[1] = 'anonymous'
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
    )
)
WITH CHECK (
    bucket_id = 'complaint-attachments'
    AND (
        (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::TEXT)
        OR (storage.foldername(name))[1] = 'anonymous'
    )
);

-- 5. Storage Objects DELETE Policy (Owner or Super Admin can Remove Uploaded Files)
DROP POLICY IF EXISTS "Complaint attachments delete policy" ON storage.objects;
DROP POLICY IF EXISTS "Complaint attachments delete own folder" ON storage.objects;

CREATE POLICY "Complaint attachments delete policy"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (
    bucket_id = 'complaint-attachments'
    AND (
        (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::TEXT)
        OR (storage.foldername(name))[1] = 'anonymous'
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'super_admin'
        )
    )
);

-- 6. Ensure complaint_attachments table has storage_path column and RLS
ALTER TABLE public.complaint_attachments
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill storage_path from existing Supabase Storage URLs if needed
UPDATE public.complaint_attachments
SET storage_path = substring(
    file_url
    FROM '/storage/v1/object/(?:sign|public|authenticated)/complaint-attachments/([^?#]+)'
)
WHERE storage_path IS NULL
  AND file_url ~ '/storage/v1/object/(?:sign|public|authenticated)/complaint-attachments/';

-- Update complaint_attachments table RLS policies
DROP POLICY IF EXISTS "Attachments readable by complaint stakeholders" ON public.complaint_attachments;
CREATE POLICY "Attachments readable by complaint stakeholders"
ON public.complaint_attachments FOR SELECT
TO authenticated, anon
USING (
    EXISTS (
        SELECT 1 FROM public.complaints c
        LEFT JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = complaint_attachments.complaint_id
          AND (
              c.user_id = auth.uid()
              OR c.is_anonymous = TRUE
              OR p.role = 'super_admin'
              OR (
                  p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
                  AND (
                      c.department_id = p.department_id
                      OR c.forwarded_from_department_id = p.department_id
                  )
              )
          )
    )
);

DROP POLICY IF EXISTS "Complaint owners can insert attachments" ON public.complaint_attachments;
CREATE POLICY "Complaint owners can insert attachments"
ON public.complaint_attachments FOR INSERT
TO authenticated, anon
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.complaints c
        WHERE c.id = complaint_attachments.complaint_id
          AND (c.user_id = auth.uid() OR auth.role() = 'anon' OR c.is_anonymous = TRUE)
    )
);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
