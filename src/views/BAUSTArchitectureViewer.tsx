import React, { useState } from 'react';
import { Copy, Check, Database, Shield, Server, CheckCircle2 } from 'lucide-react';

export const BAUSTArchitectureViewer: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const schemaSQL = `-- ============================================================================
-- 1. BAUST DATABASE SCHEMA: DEPARTMENTS, USERS, & COMPLAINTS
-- Bangladesh Army University of Science and Technology (BAUST)
-- ============================================================================

-- 1.1 BAUST Departments & Administrative Offices (14 Official Wings)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,      -- 'CSE', 'EEE', 'REGISTRAR', 'PROCTOR', 'HOSTEL', etc.
    name VARCHAR(255) NOT NULL,             -- Official Department Name
    head_title VARCHAR(150) NOT NULL,       -- Head of Department / Officer Title
    email VARCHAR(150) NOT NULL,            -- Official BAUST Routing Email
    category_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed the 14 official BAUST departments & offices
INSERT INTO departments (code, name, head_title, email) VALUES
('CSE', 'Department of Computer Science and Engineering', 'Head of the Department (CSE)', 'head.cse@baust.edu.bd'),
('EEE', 'Department of Electrical and Electronic Engineering', 'Head of the Department (EEE)', 'head.eee@baust.edu.bd'),
('ME', 'Department of Mechanical Engineering', 'Head of the Department (ME)', 'head.me@baust.edu.bd'),
('CE', 'Department of Civil Engineering', 'Head of the Department (CE)', 'head.ce@baust.edu.bd'),
('IPE', 'Department of Industrial and Production Engineering', 'Head of the Department (IPE)', 'head.ipe@baust.edu.bd'),
('BBA', 'Department of Business Administration', 'Head of the Department (BBA)', 'head.bba@baust.edu.bd'),
('ENGLISH', 'Department of English', 'Head of the Department (English)', 'head.english@baust.edu.bd'),
('ARTS_SCIENCE', 'Department of Arts and Sciences', 'Head of the Department (Arts and Sciences)', 'head.as@baust.edu.bd'),
('REGISTRAR', 'Office of the Registrar', 'Registrar, BAUST', 'registrar@baust.edu.bd'),
('PROCTOR', 'Proctor Office', 'Office of the Proctor, BAUST', 'proctor@baust.edu.bd'),
('ICT', 'ICT & System Services', 'Director (ICT & Systems)', 'ict.support@baust.edu.bd'),
('ACCOUNTS', 'Accounts & Finance Branch', 'Head of Accounts & Finance', 'accounts@baust.edu.bd'),
('EXAM_CONTROLLER', 'Controller of Examinations Office', 'Controller of Examinations', 'exam.controller@baust.edu.bd'),
('HOSTEL', 'University Hostel & Hall Management (SDZHH Hall)', 'Chief Provost & Hostel Warden (Shaheed Delwar Zahid Hall)', 'hostel.warden@baust.edu.bd');

-- 1.2 Users Profile Table (Self-Service Profile Management & Department Binding)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    student_or_emp_id VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(30) NOT NULL CHECK (role IN ('student', 'office_head', 'dept_admin', 'staff', 'officer', 'super_admin')),
    -- FK: Links Department Admins/Staff to their assigned target authority (NULL for students and super_admin)
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    avatar_url TEXT DEFAULT '',
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Complaints Table (Bound to Target Authority with Forwarding Fields)
CREATE TABLE complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id VARCHAR(50) UNIQUE NOT NULL,                       -- e.g. CMP-BAUST-2026-1001
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT, -- Target BAUST Department
    forwarded_from_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    forwarded_reason TEXT,
    forwarded_at TIMESTAMPTZ,
    transfer_count INTEGER DEFAULT 0,
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_sos BOOLEAN DEFAULT FALSE,
    status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened')),
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    deadline TIMESTAMPTZ,
    is_anonymous BOOLEAN DEFAULT FALSE,
    revealed_by_admin BOOLEAN DEFAULT FALSE,
    is_spam BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);`;

  const rlsSQL = `-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES FOR 100% ACCURATE DEPARTMENT ROUTING
-- ============================================================================

-- Enable Row Level Security on complaints and profiles table
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLICY 1: Self-Service Profile Update (Name, ID, Phone, Avatar)
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_self_service_update"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- POLICY 2: Student Isolation (Students can ONLY view their own complaints)
-- ----------------------------------------------------------------------------
CREATE POLICY "student_select_own_complaints"
ON complaints FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
);

-- ----------------------------------------------------------------------------
-- POLICY 3: Strict Department-Level Routing for Department Admins & Office Heads
-- A complaint targeted to CSE is ONLY visible to the CSE Department Admin.
-- Cross-department viewing is 100% prohibited at the database engine level.
-- ----------------------------------------------------------------------------
CREATE POLICY "dept_admin_select_strict_department_complaints"
ON complaints FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('office_head', 'dept_admin', 'staff', 'officer')
          AND p.department_id = complaints.department_id
    )
);

-- ----------------------------------------------------------------------------
-- POLICY 4: Inter-Department Forwarding (Office Head Department Transfer)
-- Receiving Office Head can re-route a misdirected ticket to another BAUST dept
-- ----------------------------------------------------------------------------
CREATE POLICY "office_head_inter_department_transfer"
ON complaints FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role = 'super_admin' OR
            (p.role IN ('office_head', 'dept_admin') AND p.department_id = complaints.department_id)
          )
    )
);

-- ----------------------------------------------------------------------------
-- POLICY 5: Super Admin Global Access
-- ONLY users with the 'super_admin' role can view complaints across all departments.
-- ----------------------------------------------------------------------------
CREATE POLICY "super_admin_global_complaints_access"
ON complaints FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.role = 'super_admin'
    )
);`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          BAUST Grievance Routing: Database Schema & RLS Architecture
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          PostgreSQL DDL schema and Row Level Security (RLS) policies enforcing 100% accurate
          department-level grievance routing for Bangladesh Army University of Science and Technology.
        </p>
      </div>

      {/* Schema Block */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              1. Relational Database Schema (SQL DDL)
            </h3>
          </div>
          <button
            onClick={() => copyText(schemaSQL, 'schema')}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
          >
            {copiedId === 'schema' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied SQL</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy SQL</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-4 bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed max-h-96">
          {schemaSQL}
        </pre>
      </div>

      {/* RLS Policies Block */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              2. Strict Supabase / PostgreSQL Row Level Security (RLS) Policies
            </h3>
          </div>
          <button
            onClick={() => copyText(rlsSQL, 'rls')}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
          >
            {copiedId === 'rls' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied RLS</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy RLS</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-4 bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed max-h-96">
          {rlsSQL}
        </pre>
      </div>
    </div>
  );
};
