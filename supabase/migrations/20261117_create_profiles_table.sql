-- ============================================================================
-- MIGRATION: Ensure public.profiles table, columns, RLS policies & cache reload
-- Resolves: "Could not find the table 'public.profiles' in the schema cache"
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure prerequisite public.departments table exists for department_id FK
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
('CSE', 'Department of Computer Science and Engineering', 'Head of the Department (CSE)', 'head.cse@baust.edu.bd', ARRAY['Software Lab Systems', 'GPU Cluster / Server', 'Course Curriculum', 'Academic Schedule', 'Faculty Consultation']),
('EEE', 'Department of Electrical and Electronic Engineering', 'Head of the Department (EEE)', 'head.eee@baust.edu.bd', ARRAY['Circuits & Machine Lab', 'Oscilloscope Calibration', 'Course Schedule', 'Final Year Project Lab']),
('ME', 'Department of Mechanical Engineering', 'Head of the Department (ME)', 'head.me@baust.edu.bd', ARRAY['Thermodynamics Lab', 'Workshop Machinery', 'CAD Lab Facilities', 'Faculty Consultation']),
('CE', 'Department of Civil Engineering', 'Head of the Department (CE)', 'head.ce@baust.edu.bd', ARRAY['Structural Materials Lab', 'Surveying Equipment', 'Soil Mechanics Facility', 'Class Timetable']),
('IPE', 'Department of Industrial and Production Engineering', 'Head of the Department (IPE)', 'head.ipe@baust.edu.bd', ARRAY['Manufacturing Process Lab', 'Quality Control Equipment', 'Industrial Training Coordination']),
('BBA', 'Department of Business Administration', 'Head of the Department (BBA)', 'head.bba@baust.edu.bd', ARRAY['Internship Placement', 'Business Lab Software', 'Case Study Room', 'Course Schedule']),
('ENGLISH', 'Department of English', 'Head of the Department (English)', 'head.english@baust.edu.bd', ARRAY['Language Lab Audio Systems', 'Literature Library Reserve', 'Academic Writing Support']),
('ARTS_SCIENCE', 'Department of Arts and Sciences', 'Head of the Department (Arts and Sciences)', 'head.as@baust.edu.bd', ARRAY['Physics Lab Optics', 'Chemistry Lab Reagents', 'Mathematics Remedial Support']),
('REGISTRAR', 'Office of the Registrar', 'Registrar, BAUST', 'registrar@baust.edu.bd', ARRAY['Semester Registration', 'Certificate Attestation', 'Migration Clearance', 'Student ID Card Issuance']),
('PROCTOR', 'Proctor Office', 'Office of the Proctor, BAUST', 'proctor@baust.edu.bd', ARRAY['Campus Discipline & Code of Conduct', 'Anti-Ragging / Anti-Bullying Protocol', 'Campus Security & Access', 'Student ID Compliance']),
('ICT', 'ICT & System Services', 'Director (ICT & Systems)', 'ict.support@baust.edu.bd', ARRAY['Campus Wi-Fi / Eduroam', 'Student Portal Login', 'Institutional Email (@baust.edu.bd)', 'Biometric Attendance']),
('ACCOUNTS', 'Accounts & Finance Branch', 'Head of Accounts & Finance', 'accounts@baust.edu.bd', ARRAY['Tuition Fee Billing', 'Waiver & Scholarship Disbursement', 'Bank Payment Challan', 'Refund Processing']),
('EXAM_CONTROLLER', 'Controller of Examinations Office', 'Controller of Examinations', 'exam.controller@baust.edu.bd', ARRAY['Exam Schedule Conflict', 'Grade Sheet Discrepancy', 'Scrutiny & Recheck', 'Admit Card Clearance']),
('HOSTEL', 'University Hostel & Hall Management (SDZHH Hall)', 'Chief Provost & Hostel Warden (Shaheed Delwar Zahid Hall)', 'hostel.warden@baust.edu.bd', ARRAY['Shaheed Delwar Zahid Hall (SDZHH)', 'Dormitory Water & Electricity', 'Dining Hall Food Quality', 'Room Allotment', 'Hostel Safety & Anti-Bullying'])
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Departments are viewable by all authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Departments are publicly viewable" ON public.departments;
CREATE POLICY "Departments are publicly viewable"
ON public.departments FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);
GRANT SELECT ON public.departments TO anon, authenticated;

-- 2. Create public.profiles table if missing
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL DEFAULT '',
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

-- Ensure required columns exist even if an older partial profiles table existed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_or_emp_id VARCHAR(50);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'student';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable Row Level Security & non-recursive helper functions
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

-- 5. Profiles RLS Policies
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (TRUE);

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
          AND g.department_id IS NOT DISTINCT FROM profiles.department_id
    )
);

DROP POLICY IF EXISTS "Super admins can manage all profiles" ON public.profiles;
CREATE POLICY "Super admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- 6. Auto-create profile row whenever a new auth user signs up (supports anonymous users)
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

-- 7. Backfill profiles for any existing auth.users created before this migration
INSERT INTO public.profiles (
    id,
    full_name,
    email,
    student_or_emp_id,
    role,
    department_id,
    avatar_url
)
SELECT
    u.id,
    COALESCE(
        NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
        NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
        'Anonymous Student'
    ),
    COALESCE(
        NULLIF(LOWER(TRIM(u.email)), ''),
        'anon-' || LOWER(SUBSTRING(u.id::TEXT, 1, 12)) || '@anonymous.baust.edu.bd'
    ),
    COALESCE(
        NULLIF(UPPER(TRIM(u.raw_user_meta_data->>'student_or_emp_id')), ''),
        CASE
            WHEN NULLIF(TRIM(u.email), '') IS NULL THEN 'ANON-' || UPPER(SUBSTRING(u.id::TEXT, 1, 8))
            ELSE 'BAUST-' || UPPER(SUBSTRING(u.id::TEXT, 1, 8))
        END
    ),
    CASE
        WHEN COALESCE(u.raw_user_meta_data->>'role', 'student') IN ('student', 'office_head', 'dept_admin', 'staff', 'officer', 'super_admin')
            THEN COALESCE(u.raw_user_meta_data->>'role', 'student')
        ELSE 'student'
    END,
    CASE
        WHEN (u.raw_user_meta_data->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             AND EXISTS (SELECT 1 FROM public.departments d WHERE d.id = (u.raw_user_meta_data->>'department_id')::UUID)
            THEN (u.raw_user_meta_data->>'department_id')::UUID
        ELSE NULL
    END,
    ''
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 8. Grant API roles access to public.profiles and reload PostgREST schema cache
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
NOTIFY pgrst, 'reload schema';
