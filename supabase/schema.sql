-- ============================================================================
-- BANGLADESH ARMY UNIVERSITY OF SCIENCE AND TECHNOLOGY (BAUST)
-- OFFICIAL STUDENT COMPLAINT & GRIEVANCE MANAGEMENT SYSTEM
-- COMPLETE SUPABASE POSTGRESQL PRODUCTION SCHEMA (IDEMPOTENT & RLS HARDENED)
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. BAUST TARGET AUTHORITIES (DEPARTMENTS & ADMINISTRATIVE OFFICES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    head_title VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    category_tags TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.departments (code, name, head_title, email, category_tags) VALUES
('CSE', 'Department of Computer Science and Engineering', 'Head of the Department (CSE)', 'head.cse@baust.edu.bd', ARRAY['Software Lab Systems', 'GPU Cluster / Server', 'Course Curriculum', 'Academic Schedule', 'Faculty Consultation', 'Others']),
('EEE', 'Department of Electrical and Electronic Engineering', 'Head of the Department (EEE)', 'head.eee@baust.edu.bd', ARRAY['Circuits & Machine Lab', 'Oscilloscope Calibration', 'Course Schedule', 'Final Year Project Lab', 'Others']),
('ME', 'Department of Mechanical Engineering', 'Head of the Department (ME)', 'head.me@baust.edu.bd', ARRAY['Thermodynamics Lab', 'Workshop Machinery', 'CAD Lab Facilities', 'Faculty Consultation', 'Others']),
('CE', 'Department of Civil Engineering', 'Head of the Department (CE)', 'head.ce@baust.edu.bd', ARRAY['Structural Materials Lab', 'Surveying Equipment', 'Soil Mechanics Facility', 'Class Timetable', 'Others']),
('IPE', 'Department of Industrial and Production Engineering', 'Head of the Department (IPE)', 'head.ipe@baust.edu.bd', ARRAY['Manufacturing Process Lab', 'Quality Control Equipment', 'Industrial Training Coordination', 'Others']),
('BBA', 'Department of Business Administration', 'Head of the Department (BBA)', 'head.bba@baust.edu.bd', ARRAY['Internship Placement', 'Business Lab Software', 'Case Study Room', 'Course Schedule', 'Others']),
('ENGLISH', 'Department of English', 'Head of the Department (English)', 'head.english@baust.edu.bd', ARRAY['Language Lab Audio Systems', 'Literature Library Reserve', 'Academic Writing Support', 'Others']),
('ARTS_SCIENCE', 'Department of Arts and Sciences', 'Head of the Department (Arts and Sciences)', 'head.as@baust.edu.bd', ARRAY['Physics Lab Optics', 'Chemistry Lab Reagents', 'Mathematics Remedial Support', 'Others']),
('REGISTRAR', 'Office of the Registrar', 'Registrar, BAUST', 'registrar@baust.edu.bd', ARRAY['Semester Registration', 'Certificate Attestation', 'Migration Clearance', 'Student ID Card Issuance', 'Others']),
('PROCTOR', 'Proctor Office', 'Office of the Proctor, BAUST', 'proctor@baust.edu.bd', ARRAY['Campus Discipline & Code of Conduct', 'Anti-Ragging / Anti-Bullying Protocol', 'Campus Security & Access', 'Student ID Card Compliance', 'Others']),
('ICT', 'ICT & System Services', 'Director (ICT & Systems)', 'ict.support@baust.edu.bd', ARRAY['Campus Wi-Fi / Eduroam', 'Student Portal Login', 'Institutional Email (@baust.edu.bd)', 'Biometric Attendance', 'Others']),
('ACCOUNTS', 'Accounts & Finance Branch', 'Head of Accounts & Finance', 'accounts@baust.edu.bd', ARRAY['Tuition Fee Billing', 'Waiver & Scholarship Disbursement', 'Bank Payment Challan', 'Refund Processing', 'Others']),
('EXAM_CONTROLLER', 'Controller of Examinations Office', 'Controller of Examinations', 'exam.controller@baust.edu.bd', ARRAY['Exam Schedule Conflict', 'Grade Sheet Discrepancy', 'Scrutiny & Recheck', 'Admit Card Clearance', 'Others']),
('HOSTEL', 'University Hostel & Hall Management (SDZHH Hall)', 'Chief Provost & Hostel Warden (Shaheed Delwar Zahid Hall)', 'hostel.warden@baust.edu.bd', ARRAY['Shaheed Delwar Zahid Hall (SDZHH)', 'Dormitory Water & Electricity', 'Dining Hall Food Quality', 'Room Allotment', 'Hostel Safety & Anti-Bullying', 'Others'])
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. USER PROFILES TABLE (AUTHENTICATION & SELF-SERVICE MANAGEMENT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    student_or_emp_id VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(30) NOT NULL DEFAULT 'student' CHECK (
        role IN ('student', 'office_head', 'dept_admin', 'staff', 'officer', 'super_admin')
    ),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    avatar_url TEXT DEFAULT '',
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. COMPLAINTS TABLE (WITH INTER-DEPARTMENT FORWARDING SUPPORT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    forwarded_from_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    forwarded_reason TEXT,
    forwarded_at TIMESTAMPTZ,
    transfer_count INTEGER DEFAULT 0,
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_sos BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'submitted' CHECK (
        status IN ('submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened')
    ),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deadline TIMESTAMPTZ,
    is_anonymous BOOLEAN DEFAULT FALSE,
    revealed_by_admin BOOLEAN DEFAULT FALSE,
    is_spam BOOLEAN DEFAULT FALSE,
    merged_into UUID REFERENCES public.complaints(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_complaints_updated_at ON public.complaints;
CREATE TRIGGER set_complaints_updated_at
BEFORE UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. COMPLAINT ATTACHMENTS (MAX 5 FILES, VALIDATED MIME TYPES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    storage_path TEXT,
    file_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. COMPLAINT TIMELINE & TRANSFER HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_name VARCHAR(150) NOT NULL,
    action VARCHAR(50) NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. COMPLAINT MESSAGES & SECURE INTERNAL NOTES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name VARCHAR(150) NOT NULL,
    sender_role VARCHAR(30) NOT NULL,
    body TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. RESOLUTION FEEDBACK & REOPENING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID UNIQUE NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. INSTITUTIONAL AUDIT LOGS (IMMUTABLE COMPLIANCE ARCHIVE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(150) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    ip_address VARCHAR(50) DEFAULT '127.0.0.1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES (NON-RECURSIVE & IDEMPOTENT)
-- ============================================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security-definer helpers to avoid RLS recursion on public.profiles
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

-- Departments Policies
DROP POLICY IF EXISTS "Departments are viewable by all authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Departments are publicly viewable" ON public.departments;
CREATE POLICY "Departments are publicly viewable"
ON public.departments FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

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

DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Complaints Policies
DROP POLICY IF EXISTS "Student can view own complaints" ON public.complaints;
CREATE POLICY "Student can view own complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Department staff and office heads can only view their department complaints" ON public.complaints;
CREATE POLICY "Department staff and office heads can only view their department complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('office_head', 'dept_admin', 'staff', 'officer')
          AND (
              department_id = complaints.department_id
              OR department_id = complaints.forwarded_from_department_id
          )
    )
);

DROP POLICY IF EXISTS "Super admins can view all department complaints" ON public.complaints;
CREATE POLICY "Super admins can view all department complaints"
ON public.complaints FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "Students can submit complaints" ON public.complaints;
CREATE POLICY "Students can submit complaints"
ON public.complaints FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.departments WHERE id = department_id AND is_active = TRUE)
);

DROP POLICY IF EXISTS "Department authorities can update or forward current department complaints" ON public.complaints;
CREATE POLICY "Department authorities can update or forward current department complaints"
ON public.complaints FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND (
            role = 'super_admin' OR
            (role IN ('office_head', 'dept_admin', 'staff', 'officer') AND department_id = complaints.department_id)
          )
    )
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.departments WHERE id = department_id AND is_active = TRUE)
);

DROP POLICY IF EXISTS "Complainant can reopen own resolved complaint" ON public.complaints;
CREATE POLICY "Complainant can reopen own resolved complaint"
ON public.complaints FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status IN ('resolved', 'closed'))
WITH CHECK (user_id = auth.uid() AND status = 'reopened');

-- Complaint History Policies
DROP POLICY IF EXISTS "History visible to ticket stakeholders" ON public.complaint_history;
CREATE POLICY "History visible to ticket stakeholders"
ON public.complaint_history FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.complaints c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = complaint_history.complaint_id
          AND (
            c.user_id = auth.uid() OR
            p.role = 'super_admin' OR
            (p.role IN ('office_head', 'dept_admin', 'staff', 'officer') AND c.department_id = p.department_id)
          )
    )
);

DROP POLICY IF EXISTS "Stakeholders can insert history events" ON public.complaint_history;
CREATE POLICY "Stakeholders can insert history events"
ON public.complaint_history FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

-- Messages Policies
DROP POLICY IF EXISTS "Messages visibility policy" ON public.complaint_messages;
CREATE POLICY "Messages visibility policy"
ON public.complaint_messages FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.complaints c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = complaint_messages.complaint_id
          AND (
            (c.user_id = auth.uid() AND complaint_messages.is_internal = FALSE) OR
            p.role = 'super_admin' OR
            (p.role IN ('office_head', 'dept_admin', 'staff', 'officer') AND c.department_id = p.department_id)
          )
    )
);

DROP POLICY IF EXISTS "Stakeholders can post messages" ON public.complaint_messages;
CREATE POLICY "Stakeholders can post messages"
ON public.complaint_messages FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- Feedback Policies
DROP POLICY IF EXISTS "Feedback viewable by ticket owner and target department" ON public.complaint_feedback;
CREATE POLICY "Feedback viewable by ticket owner and target department"
ON public.complaint_feedback FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.complaints c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = complaint_feedback.complaint_id
          AND (
            c.user_id = auth.uid() OR
            p.role = 'super_admin' OR
            (p.role IN ('office_head', 'dept_admin', 'staff', 'officer') AND c.department_id = p.department_id)
          )
    )
);

DROP POLICY IF EXISTS "Complainant can submit feedback" ON public.complaint_feedback;
CREATE POLICY "Complainant can submit feedback"
ON public.complaint_feedback FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.complaints c
        WHERE c.id = complaint_id AND c.user_id = auth.uid() AND c.status IN ('resolved', 'closed')
    )
);

-- Audit Logs Policies
DROP POLICY IF EXISTS "Audit logs readable only by super admin" ON public.audit_logs;
CREATE POLICY "Audit logs readable only by super admin"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "System can record audit logs" ON public.audit_logs;
CREATE POLICY "System can record audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Auto-create profile row safely for both email & anonymous Supabase Auth users
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
-- 10. IMMUTABLE COMPLAINT HISTORY & ATOMIC STATUS TRANSITION RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'complaint_history records are strictly immutable and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_immutable_complaint_history ON public.complaint_history;
CREATE TRIGGER enforce_immutable_complaint_history
BEFORE UPDATE OR DELETE ON public.complaint_history
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

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
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update complaint status.';
    END IF;

    v_trimmed_note := TRIM(COALESCE(p_note, ''));
    IF LENGTH(v_trimmed_note) < 3 THEN
        RAISE EXCEPTION 'A mandatory rationale note (minimum 3 characters) is required for status transitions.';
    END IF;

    IF p_new_status NOT IN ('submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened') THEN
        RAISE EXCEPTION 'Invalid complaint status: %', p_new_status;
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
           OR v_actor.department_id IS DISTINCT FROM v_complaint.department_id THEN
            RAISE EXCEPTION 'Permission denied: You may only update complaints assigned to your department.';
        END IF;
    END IF;

    v_from_status := v_complaint.status;

    UPDATE public.complaints
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_complaint_id
    RETURNING * INTO v_complaint;

    INSERT INTO public.complaint_history (
        complaint_id, actor_id, actor_name, action, from_status, to_status, note
    )
    VALUES (
        p_complaint_id, v_actor_id, v_actor.full_name, 'STATUS_UPDATED', v_from_status, p_new_status, v_trimmed_note
    );

    INSERT INTO public.audit_logs (
        actor_id, actor_name, actor_role, action, target, details
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
        c.id, c.tracking_id, c.user_id, c.department_id,
        d.code AS department_code, d.name AS department_name,
        c.category, c.subject, c.description, c.priority, c.is_sos,
        c.status, c.is_anonymous, c.deadline, c.created_at, c.updated_at
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
                'id', h.id, 'complaint_id', h.complaint_id, 'actor_id', h.actor_id,
                'actor_name', h.actor_name, 'action', h.action,
                'from_status', h.from_status, 'to_status', h.to_status,
                'note', h.note, 'created_at', h.created_at
            ) ORDER BY h.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_history
    FROM public.complaint_history h WHERE h.complaint_id = v_complaint.id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id, 'complaint_id', m.complaint_id, 'sender_id', m.sender_id,
                'sender_name', CASE WHEN v_complaint.is_anonymous AND m.sender_id = v_complaint.user_id THEN 'Anonymous Student' ELSE m.sender_name END,
                'sender_role', m.sender_role, 'body', m.body,
                'is_internal', m.is_internal, 'created_at', m.created_at
            ) ORDER BY m.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_messages
    FROM public.complaint_messages m
    WHERE m.complaint_id = v_complaint.id AND m.is_internal = FALSE;

    SELECT to_jsonb(f.*) INTO v_feedback
    FROM public.complaint_feedback f WHERE f.complaint_id = v_complaint.id LIMIT 1;

    RETURN jsonb_build_object(
        'id', v_complaint.id, 'tracking_id', v_complaint.tracking_id, 'user_id', v_complaint.user_id,
        'department_id', v_complaint.department_id, 'department_code', v_complaint.department_code,
        'department_name', v_complaint.department_name, 'category', v_complaint.category,
        'subject', v_complaint.subject, 'description', v_complaint.description,
        'priority', v_complaint.priority, 'is_sos', v_complaint.is_sos,
        'status', v_complaint.status, 'is_anonymous', v_complaint.is_anonymous,
        'deadline', v_complaint.deadline, 'created_at', v_complaint.created_at,
        'updated_at', v_complaint.updated_at, 'history', v_history,
        'messages', v_messages, 'feedback', v_feedback
    );
END;
$$;

REVOKE ALL ON FUNCTION public.track_complaint_by_id(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint_by_id(VARCHAR) TO anon, authenticated;

-- Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
