-- ============================================================================
-- MIGRATION: Add storage_path to complaint_attachments & Forwarding Read RLS
-- Covers:
--   1. Persist object storage_path on public.complaint_attachments
--   2. Backfill storage_path from existing file_url values
--   3. Allow both current and forwarding/previous department staff to read
--      authorized evidence files in complaint_attachments and storage.objects
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

ALTER TABLE public.complaint_attachments
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill storage_path from existing Supabase Storage URLs
UPDATE public.complaint_attachments
SET storage_path = substring(
    file_url
    FROM '/storage/v1/object/(?:sign|public|authenticated)/complaint-attachments/([^?#]+)'
)
WHERE storage_path IS NULL
  AND file_url ~ '/storage/v1/object/(?:sign|public|authenticated)/complaint-attachments/';

-- Update complaint_attachments SELECT policy to include forwarding/previous dept staff
DROP POLICY IF EXISTS "Attachments readable by complaint stakeholders" ON public.complaint_attachments;
CREATE POLICY "Attachments readable by complaint stakeholders"
ON public.complaint_attachments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.complaints c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = complaint_attachments.complaint_id
          AND (
              c.user_id = auth.uid()
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

-- Update storage.objects SELECT policy for private complaint-attachments bucket
DROP POLICY IF EXISTS "Complaint attachments read authorized stakeholders" ON storage.objects;
CREATE POLICY "Complaint attachments read authorized stakeholders"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'complaint-attachments'
    AND (
        (storage.foldername(name))[1] = auth.uid()::TEXT
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                  p.role = 'super_admin'
                  OR (
                      p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
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
        )
    )
);

NOTIFY pgrst, 'reload schema';
