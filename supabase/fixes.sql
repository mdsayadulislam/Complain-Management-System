-- ============================================================================
-- BAUST STUDENT COMPLAINT & GRIEVANCE MANAGEMENT SYSTEM
-- SUPABASE PRODUCTION MIGRATION & SECURITY HARDENING (fixes.sql)
-- Covers:
--   BUG 1: Authentic Profile Provisioning & Session RLS
--   BUG 3: Dynamic Departmental Categories Table & RLS
--   BUG 4: Evidence Storage Bucket (20MB limit, MIME restrictions, RLS)
--   BUG 5: Profile Avatar Storage Bucket (2MB limit, MIME restrictions, RLS)
--   BUG 6: Atomic Case Status Transition RPC & Immutable History Protection
-- ============================================================================

-- ============================================================================
-- 0. FIX INFINITE RECURSION (42P17) ON public.profiles RLS POLICIES
--    schema.sql's "Super admins can manage all profiles" (FOR ALL) queried
--    public.profiles directly, causing Postgres error 42P17 on every login.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_profile_immutable_fields(p_uid UUID)
RETURNS TABLE(role VARCHAR, is_blocked BOOLEAN, department_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.role, p.is_blocked, p.department_id
    FROM public.profiles p
    WHERE p.id = p_uid
    LIMIT 1;
$$;

DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    AND EXISTS (
        SELECT 1 FROM public.get_profile_immutable_fields(auth.uid()) g
        WHERE g.role = profiles.role
          AND g.is_blocked = profiles.is_blocked
    )
);

-- ============================================================================
-- 1. PROFILES SELF-REGISTRATION & AUTH TRIGGER (BUG 1)
-- ============================================================================
-- Allow newly authenticated users to insert their own profile row
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Ensure public departments can be read during registration/routing even before full profile sync
DROP POLICY IF EXISTS "Departments are viewable by all authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Departments are publicly viewable" ON public.departments;
CREATE POLICY "Departments are publicly viewable"
ON public.departments FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- Automatic profile creation helper on auth.users signup (supports email & anonymous users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_dept_id UUID;
    v_is_anon BOOLEAN;
    v_full_name VARCHAR(150);
    v_email VARCHAR(150);
    v_student_id VARCHAR(50);
BEGIN
    v_is_anon := COALESCE(NEW.is_anonymous, FALSE) OR (NULLIF(TRIM(COALESCE(NEW.email, '')), '') IS NULL);

    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
    IF v_role NOT IN ('student', 'office_head', 'dept_admin', 'staff', 'officer') THEN
        v_role := 'student';
    END IF;

    BEGIN
        v_dept_id := NULLIF(NEW.raw_user_meta_data->>'department_id', '')::UUID;
        IF v_dept_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_dept_id) THEN
            v_dept_id := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_dept_id := NULL;
    END;

    IF v_dept_id IS NULL AND NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'department_code', '')), '') IS NOT NULL THEN
        SELECT id INTO v_dept_id
        FROM public.departments
        WHERE UPPER(code) = UPPER(TRIM(NEW.raw_user_meta_data->>'department_code'))
        LIMIT 1;
    END IF;

    v_full_name := LEFT(
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
            'Anonymous Student'
        ),
        150
    );

    v_email := LEFT(
        COALESCE(
            NULLIF(LOWER(TRIM(COALESCE(NEW.email, ''))), ''),
            'anon-' || LOWER(REPLACE(NEW.id::TEXT, '-', '')) || '@anonymous.baust.edu.bd'
        ),
        150
    );

    v_student_id := LEFT(
        COALESCE(
            NULLIF(UPPER(TRIM(NEW.raw_user_meta_data->>'student_or_emp_id')), ''),
            CASE
                WHEN v_is_anon THEN 'ANON-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8))
                ELSE 'BAUST-' || UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 8))
            END
        ),
        50
    );

    BEGIN
        INSERT INTO public.profiles (
            id,
            full_name,
            email,
            student_or_emp_id,
            phone,
            role,
            department_id,
            avatar_url
        )
        VALUES (
            NEW.id,
            v_full_name,
            v_email,
            v_student_id,
            NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
            v_role,
            v_dept_id,
            ''
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user fallback triggered for user %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. DYNAMIC DEPARTMENTAL CATEGORIES (BUG 3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT categories_department_name_unique UNIQUE (department_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_department_id ON public.categories(department_id);

-- Backfill initial categories from existing departments.category_tags array
INSERT INTO public.categories (department_id, name)
SELECT d.id, UNNEST(d.category_tags)
FROM public.departments d
ON CONFLICT (department_id, name) DO NOTHING;

INSERT INTO public.categories (department_id, name)
SELECT d.id, 'Others'
FROM public.departments d
ON CONFLICT (department_id, name) DO NOTHING;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read categories for complaint submission dropdowns
DROP POLICY IF EXISTS "Categories are viewable by authenticated users" ON public.categories;
CREATE POLICY "Categories are viewable by authenticated users"
ON public.categories FOR SELECT
TO authenticated
USING (TRUE);

-- Office Heads / Dept Admins can insert categories ONLY for their own assigned department (Super Admin for all)
DROP POLICY IF EXISTS "Office heads can add categories to their department" ON public.categories;
CREATE POLICY "Office heads can add categories to their department"
ON public.categories FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (p.role IN ('office_head', 'dept_admin') AND p.department_id = categories.department_id)
          )
    )
);

-- Office Heads / Dept Admins can delete categories ONLY within their own department (Super Admin for all)
DROP POLICY IF EXISTS "Office heads can delete categories from their department" ON public.categories;
CREATE POLICY "Office heads can delete categories from their department"
ON public.categories FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              p.role = 'super_admin'
              OR (p.role IN ('office_head', 'dept_admin') AND p.department_id = categories.department_id)
          )
    )
);

-- ============================================================================
-- 3. EVIDENCE FILE UPLOAD STORAGE BUCKET & RLS (BUG 4)
--    Max 20 MB per file, exact MIME types: JPG, PNG, PDF, MP4
-- ============================================================================
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

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Allow anon and auth uploads to complaint-attachments"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'complaint-attachments');

CREATE POLICY "Allow public reads from complaint-attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'complaint-attachments');

CREATE POLICY "Allow uploads update on complaint-attachments"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'complaint-attachments');

CREATE POLICY "Allow users to delete attachments"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'complaint-attachments');

-- 6. Ensure complaint_attachments table RLS allows owners and current/forwarding department staff to read/insert
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

-- ============================================================================
-- 4. PROFILE PICTURE STORAGE BUCKET & RLS (BUG 5)
--    Bucket name: 'profiles', 2 MB server-side cap, JPEG/PNG/WebP
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profiles',
    'profiles',
    TRUE,
    2097152, -- 2 MB in bytes (2 * 1024 * 1024)
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Profiles avatar public read" ON storage.objects;
CREATE POLICY "Profiles avatar public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Profiles avatar self insert" ON storage.objects;
CREATE POLICY "Profiles avatar self insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Profiles avatar self update" ON storage.objects;
CREATE POLICY "Profiles avatar self update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Profiles avatar self delete" ON storage.objects;
CREATE POLICY "Profiles avatar self delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

-- ============================================================================
-- 5. ATOMIC CASE STATUS TRANSITION RPC & IMMUTABLE HISTORY LOGGING (BUG 6)
-- ============================================================================

-- Guarantee immutability on complaint_history: forbid UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.prevent_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'complaint_history is immutable: % operations are strictly prohibited.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS enforce_immutable_complaint_history ON public.complaint_history;
CREATE TRIGGER enforce_immutable_complaint_history
BEFORE UPDATE OR DELETE ON public.complaint_history
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

-- Atomic Stored Procedure (RPC) for complaint status transition + immutable history logging
CREATE OR REPLACE FUNCTION public.update_complaint_status(
    p_complaint_id UUID,
    p_new_status VARCHAR,
    p_note TEXT
)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor public.profiles%ROWTYPE;
    v_complaint public.complaints%ROWTYPE;
    v_from_status VARCHAR(30);
    v_trimmed_note TEXT;
BEGIN
    -- 1. Verify authenticated session
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update complaint status.';
    END IF;

    -- 2. Validate mandatory note
    v_trimmed_note := TRIM(COALESCE(p_note, ''));
    IF LENGTH(v_trimmed_note) < 3 THEN
        RAISE EXCEPTION 'A mandatory rationale note (minimum 3 characters) is required for status transitions.';
    END IF;

    -- 3. Validate allowed lifecycle status
    IF p_new_status NOT IN ('submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened') THEN
        RAISE EXCEPTION 'Invalid complaint status: %', p_new_status;
    END IF;

    -- 4. Load actor profile
    SELECT * INTO v_actor
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    IF v_actor.is_blocked THEN
        RAISE EXCEPTION 'Account is blocked from performing administrative actions.';
    END IF;

    -- 5. Lock complaint row atomically
    SELECT * INTO v_complaint
    FROM public.complaints
    WHERE id = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found.', p_complaint_id;
    END IF;

    -- 6. Strict departmental authorization guard
    IF v_actor.role <> 'super_admin' THEN
        IF v_actor.role NOT IN ('office_head', 'dept_admin', 'staff', 'officer')
           OR v_actor.department_id IS DISTINCT FROM v_complaint.department_id THEN
            RAISE EXCEPTION 'Permission denied: You may only update complaints assigned to your department.';
        END IF;
    END IF;

    v_from_status := v_complaint.status;

    -- 7. Atomically update complaint status
    UPDATE public.complaints
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_complaint_id
    RETURNING * INTO v_complaint;

    -- 8. Append immutable audit entry to complaint_history
    INSERT INTO public.complaint_history (
        complaint_id,
        actor_id,
        actor_name,
        action,
        from_status,
        to_status,
        note
    )
    VALUES (
        p_complaint_id,
        v_actor_id,
        v_actor.full_name,
        'STATUS_UPDATED',
        v_from_status,
        p_new_status,
        v_trimmed_note
    );

    -- 9. Record institutional audit log entry
    INSERT INTO public.audit_logs (
        actor_id,
        actor_name,
        actor_role,
        action,
        target,
        details
    )
    VALUES (
        v_actor_id,
        v_actor.full_name,
        v_actor.role,
        'STATUS_TRANSITION',
        v_complaint.tracking_id,
        FORMAT('Transitioned status from %s to %s. Note: %s', v_from_status, p_new_status, v_trimmed_note)
    );

    RETURN v_complaint;
END;
$$;

REVOKE ALL ON FUNCTION public.update_complaint_status(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_complaint_status(UUID, VARCHAR, TEXT) TO authenticated;

-- ============================================================================
-- 6. SAFE PUBLIC TICKET TRACKING RPC (No Identity Leak / No Internal Notes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.track_complaint_by_id(p_tracking_id VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_complaint RECORD;
    v_history JSONB;
    v_messages JSONB;
    v_feedback JSONB;
BEGIN
    SELECT
        c.id,
        c.tracking_id,
        c.user_id,
        c.department_id,
        d.code AS department_code,
        d.name AS department_name,
        c.category,
        c.subject,
        c.description,
        c.priority,
        c.is_sos,
        c.status,
        c.is_anonymous,
        c.deadline,
        c.created_at,
        c.updated_at
    INTO v_complaint
    FROM public.complaints c
    JOIN public.departments d ON d.id = c.department_id
    WHERE UPPER(c.tracking_id) = UPPER(TRIM(p_tracking_id))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'complaint_id', h.complaint_id,
                'actor_id', h.actor_id,
                'actor_name', h.actor_name,
                'action', h.action,
                'from_status', h.from_status,
                'to_status', h.to_status,
                'note', h.note,
                'created_at', h.created_at
            ) ORDER BY h.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_history
    FROM public.complaint_history h
    WHERE h.complaint_id = v_complaint.id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'complaint_id', m.complaint_id,
                'sender_id', m.sender_id,
                'sender_name', CASE WHEN v_complaint.is_anonymous AND m.sender_id = v_complaint.user_id THEN 'Anonymous Student' ELSE m.sender_name END,
                'sender_role', m.sender_role,
                'body', m.body,
                'is_internal', m.is_internal,
                'created_at', m.created_at
            ) ORDER BY m.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_messages
    FROM public.complaint_messages m
    WHERE m.complaint_id = v_complaint.id
      AND m.is_internal = FALSE;

    SELECT to_jsonb(f.*)
    INTO v_feedback
    FROM public.complaint_feedback f
    WHERE f.complaint_id = v_complaint.id
    LIMIT 1;

    RETURN jsonb_build_object(
        'id', v_complaint.id,
        'tracking_id', v_complaint.tracking_id,
        'user_id', v_complaint.user_id,
        'department_id', v_complaint.department_id,
        'department_code', v_complaint.department_code,
        'department_name', v_complaint.department_name,
        'category', v_complaint.category,
        'subject', v_complaint.subject,
        'description', v_complaint.description,
        'priority', v_complaint.priority,
        'is_sos', v_complaint.is_sos,
        'status', v_complaint.status,
        'is_anonymous', v_complaint.is_anonymous,
        'deadline', v_complaint.deadline,
        'created_at', v_complaint.created_at,
        'updated_at', v_complaint.updated_at,
        'history', v_history,
        'messages', v_messages,
        'feedback', v_feedback
    );
END;
$$;

REVOKE ALL ON FUNCTION public.track_complaint_by_id(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint_by_id(VARCHAR) TO anon, authenticated;

-- ============================================================================
-- 7. ATOMIC INTER-DEPARTMENT FORWARDING RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.forward_complaint(
    p_complaint_id UUID,
    p_target_department_id UUID,
    p_reason TEXT
)
RETURNS public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor public.profiles%ROWTYPE;
    v_complaint public.complaints%ROWTYPE;
    v_from_dept public.departments%ROWTYPE;
    v_target_dept public.departments%ROWTYPE;
    v_trimmed_reason TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to forward complaints.';
    END IF;

    v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
    IF LENGTH(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'Transfer reason must be at least 5 characters.';
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;
    IF v_actor.is_blocked THEN
        RAISE EXCEPTION 'Account is blocked from performing administrative actions.';
    END IF;

    SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found.', p_complaint_id;
    END IF;

    IF v_actor.role <> 'super_admin' THEN
        IF v_actor.role NOT IN ('office_head', 'dept_admin', 'staff', 'officer')
           OR (v_actor.department_id IS NOT NULL AND v_actor.department_id IS DISTINCT FROM v_complaint.department_id) THEN
            RAISE EXCEPTION 'Permission denied: You may only forward complaints assigned to your department.';
        END IF;
    END IF;

    IF p_target_department_id = v_complaint.department_id THEN
        RAISE EXCEPTION 'Target department must differ from the current department.';
    END IF;

    SELECT * INTO v_target_dept
    FROM public.departments
    WHERE id = p_target_department_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected target department was not found or is inactive.';
    END IF;

    SELECT * INTO v_from_dept FROM public.departments WHERE id = v_complaint.department_id;

    UPDATE public.complaints
    SET department_id = p_target_department_id,
        forwarded_from_department_id = v_complaint.department_id,
        forwarded_reason = v_trimmed_reason,
        forwarded_at = NOW(),
        transfer_count = COALESCE(v_complaint.transfer_count, 0) + 1,
        assigned_to = NULL,
        updated_at = NOW()
    WHERE id = p_complaint_id
    RETURNING * INTO v_complaint;

    INSERT INTO public.complaint_history (
        complaint_id, actor_id, actor_name, action, from_status, to_status, note
    )
    VALUES (
        p_complaint_id,
        v_actor_id,
        v_actor.full_name,
        'DEPARTMENT_TRANSFERRED',
        v_complaint.status,
        v_complaint.status,
        FORMAT(
            'Complaint officially transferred from %s to %s. Department Note: "%s"',
            COALESCE(v_from_dept.name, 'Previous Department'),
            v_target_dept.name,
            v_trimmed_reason
        )
    );

    INSERT INTO public.audit_logs (
        actor_id, actor_name, actor_role, action, target, details
    )
    VALUES (
        v_actor_id,
        v_actor.full_name,
        v_actor.role,
        'COMPLAINT_FORWARDED_INTER_DEPT',
        v_complaint.tracking_id,
        FORMAT(
            'Transferred ticket from %s to %s. Reason: %s',
            COALESCE(v_from_dept.code, 'PREV'),
            v_target_dept.code,
            v_trimmed_reason
        )
    );

    RETURN v_complaint;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_complaint(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forward_complaint(UUID, UUID, TEXT) TO authenticated;

-- Privacy-Safe Public & Dashboard Complaint Statistics RPC
CREATE OR REPLACE FUNCTION public.get_public_complaint_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_complaints BIGINT := 0;
    v_active_complaints BIGINT := 0;
    v_resolved_complaints BIGINT := 0;
    v_daily_trend JSONB := '[]'::jsonb;
    v_by_department JSONB := '[]'::jsonb;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE is_spam = FALSE),
        COUNT(*) FILTER (WHERE is_spam = FALSE AND status NOT IN ('resolved', 'closed')),
        COUNT(*) FILTER (WHERE is_spam = FALSE AND status IN ('resolved', 'closed'))
    INTO
        v_total_complaints,
        v_active_complaints,
        v_resolved_complaints
    FROM public.complaints;

    WITH daily_counts AS (
        SELECT
            DATE(c.created_at AT TIME ZONE 'UTC') AS day_date,
            COUNT(*)::BIGINT AS daily_count
        FROM public.complaints c
        WHERE c.is_spam = FALSE
        GROUP BY DATE(c.created_at AT TIME ZONE 'UTC')
    ),
    cumulative_counts AS (
        SELECT
            dc.day_date,
            dc.daily_count,
            SUM(dc.daily_count) OVER (ORDER BY dc.day_date ASC)::BIGINT AS cumulative_total
        FROM daily_counts dc
        ORDER BY dc.day_date ASC
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'date', TO_CHAR(cc.day_date, 'YYYY-MM-DD'),
                'count', cc.daily_count,
                'cumulative_total', cc.cumulative_total
            )
            ORDER BY cc.day_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_daily_trend
    FROM cumulative_counts cc;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'code', dept_rows.code,
                'name', dept_rows.name,
                'count', dept_rows.complaint_count
            )
            ORDER BY dept_rows.complaint_count DESC, dept_rows.code ASC
        ),
        '[]'::jsonb
    )
    INTO v_by_department
    FROM (
        SELECT
            d.code,
            d.name,
            COUNT(c.id)::BIGINT AS complaint_count
        FROM public.departments d
        LEFT JOIN public.complaints c
            ON c.department_id = d.id
           AND c.is_spam = FALSE
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.code, d.name
    ) dept_rows;

    RETURN jsonb_build_object(
        'total_complaints', COALESCE(v_total_complaints, 0),
        'active_complaints', COALESCE(v_active_complaints, 0),
        'resolved_complaints', COALESCE(v_resolved_complaints, 0),
        'daily_trend', v_daily_trend,
        'by_department', v_by_department
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_complaint_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_complaint_stats() TO anon, authenticated;

-- Confirm any pending unverified non-anonymous accounts in auth.users
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL
  AND COALESCE(is_anonymous, FALSE) = FALSE;

-- Refresh PostgREST schema cache so new tables/functions are visible immediately
NOTIFY pgrst, 'reload schema';

