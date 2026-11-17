-- ============================================================================
-- MIGRATION: Seed Official BAUST Departments, Public SELECT Policy, and
--            Auto-Link Pending User Profile Department UUIDs
-- Resolves: "Selected BAUST department was not found in your Supabase 'departments' table"
-- Safe to run standalone or multiple times (100% idempotent)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure public.departments table exists
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

-- 2. Seed all 14 Official BAUST Academic Departments & Administrative Offices
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

-- 3. Allow both anon (pre-login dropdowns/tracker) and authenticated users to read active departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Departments are viewable by all authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Departments are publicly viewable" ON public.departments;
CREATE POLICY "Departments are publicly viewable"
ON public.departments FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

GRANT SELECT ON public.departments TO anon, authenticated;

-- 4. Backfill any existing profiles whose department_id is NULL using user metadata or FAC-<CODE>-... ID
UPDATE public.profiles p
SET department_id = d.id
FROM auth.users u
JOIN public.departments d
  ON UPPER(d.code) = UPPER(
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'department_code'), ''),
      NULLIF(split_part(COALESCE(p.student_or_emp_id, ''), '-', 2), '')
    )
  )
WHERE p.id = u.id
  AND p.department_id IS NULL;

-- 5. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
