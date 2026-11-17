# BAUST Student Complaint & Grievance Management System

Official Complaint & Grievance Management System built for **Bangladesh Army University of Science and Technology (BAUST)** with Supabase Authentication, PostgreSQL Row Level Security (RLS), Realtime Updates, and Storage.

---

## Core Features

1. **Bilingual Interface (English & Bengali)**:
   - Full UI localization (`react-i18next`) with an instant language switcher in the navigation bar.

2. **Role-Based Authentication & Institutional Validation (`Supabase Auth`)**:
   - Supports **Student**, **Office Head / Department Admin**, **Staff / Officer**, and **Super Admin** roles, plus **Anonymous Student** login (`signInAnonymously`).
   - Student registration enforces `BAUST-0802...` Student ID format validation; officials register with department-scoped `FAC-<DEPT>-<ID>` credentials.
   - Protected client-side routes (`ProtectedRoute`) for role-restricted portals, analytics, and audit trails.

3. **14 Official BAUST Academic Departments & Administrative Offices**:
   - **Academic Departments**: CSE, EEE, ME, CE, IPE, BBA, English, Arts and Sciences.
   - **Administrative Offices**: Office of the Registrar, Proctor Office, ICT & System Services, Accounts & Finance Branch, Controller of Examinations Office, University Hostel & Hall Management (Shaheed Delwar Zahid Hall - SDZHH).

4. **Dynamic Departmental Categories (+ Universal `Others` Fallback)**:
   - Department Heads and Super Admins can add or remove custom departmental categories via `CategoryManagerModal` (`public.categories`).
   - Every department's complaint submission dropdown automatically includes an `Others` category alongside its department-specific options.

5. **Department-Level Routing, Isolation & Inter-Department Forwarding**:
   - Complaints are routed directly to the selected target department with database-enforced RLS isolation.
   - Office Heads can transfer misdirected complaints to another authority using the atomic `forward_complaint` RPC with a mandatory institutional transfer note, automatically updating audit history and reassigning active triage visibility.

6. **Live Case Messaging, Status Workflow & Reopen Support**:
   - Atomic status transitions (`submitted` -> `under_review` -> `assigned` -> `in_progress` -> `resolved` -> `closed` / `reopened`) powered by `update_complaint_status` RPC.
   - Real-time message thread (`Supabase Realtime` `postgres_changes` on `complaint_messages`), internal staff-only notes, student satisfaction feedback, and double-submit protection.

7. **Evidence Uploads with On-Demand Signed URL Renewal**:
   - Multi-file evidence attachment uploads (`FileUploadZone`) stored in the `complaint-attachments` bucket with persistent `storage_path` tracking and fresh on-demand signed URL generation when inspecting cases.

8. **Public Grievance Tracker & Emergency SOS**:
   - Anyone with a tracking ID (e.g., `BAUST-2026-0001`) can look up case progress, timeline history, and non-internal messages via the `track_complaint_by_id` RPC without exposing confidential anonymous complainant identities.
   - Dedicated Emergency SOS flagging and high-priority alert banner.

9. **Analytics, Resolution SLA Metrics & Immutable Audit Logs**:
   - Department-wise complaint distribution and real average resolution time (`avg_resolution_hours`) charts via `Recharts`, scoped to the authenticated user's RLS visibility.
   - CSV export (`exportComplaintsToCSV`) and immutable `complaint_history` / `audit_logs` timeline.

10. **Self-Service Profile Management**:
    - Users can update their Full Name, Student/Employee ID (with duplicate-ID validation), phone number, and upload/remove profile avatars stored in the `profiles` bucket with cache-busting updates.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router DOM v7, Recharts, Lucide React, Motion, i18next / react-i18next
- **Server**: Node.js, Express, tsx (`server.ts`)
- **Database, Auth, Storage & Realtime**: Supabase (PostgreSQL, Auth, Row Level Security, Storage Buckets, Realtime `postgres_changes`)

---

## Getting Started Locally

### Prerequisites
- Node.js (v18 or higher)
- npm (or bun)
- A Supabase project

### 1. Database & Storage Setup (Supabase)
Run the consolidated idempotent setup script in your Supabase **SQL Editor**:
- [`supabase/setup.sql`](supabase/setup.sql) — creates all tables (`departments`, `profiles`, `categories`, `complaints`, `complaint_attachments`, `complaint_history`, `complaint_messages`, `complaint_feedback`, `audit_logs`), seeds the 14 BAUST departments and categories (including `Others`), configures RLS policies, creates storage buckets (`complaint-attachments`, `profiles`), registers triggers, creates RPCs (`update_complaint_status`, `forward_complaint`, `track_complaint_by_id`), and reloads the PostgREST schema cache.

Incremental migrations are also maintained in [`supabase/migrations/`](supabase/migrations/).

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your Supabase credentials:
```env
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### 3. Install & Run
```bash
# Install dependencies
npm install

# Start the development server (runs on http://localhost:3000)
npm run dev
```

### 4. Type Check & Production Build
```bash
# TypeScript validation
npm run lint

# Build production bundle
npm run build
```

---

## Project Structure

```
├── server.ts                          # Express server & Vite dev/static entrypoint
├── src/
│   ├── components/
│   │   ├── BAUSTAuthModal.tsx         # Login, registration (BAUST-0802 validation) & anonymous auth
│   │   ├── BAUSTComplaintDetailModal.tsx # Case details, realtime chat, status & feedback
│   │   ├── BAUSTForwardModal.tsx      # Inter-department transfer modal
│   │   ├── BAUSTNavbar.tsx            # Top navigation, language toggle & profile trigger
│   │   ├── BAUSTProfileModal.tsx      # Self-service profile & avatar management
│   │   ├── BAUSTSOSBanner.tsx         # Emergency SOS broadcast banner
│   │   ├── BAUSTSubmitModal.tsx       # Complaint submission with dynamic categories & 'Others'
│   │   ├── CategoryManagerModal.tsx   # Departmental category management for office heads
│   │   ├── FileUploadZone.tsx         # Evidence attachment uploader
│   │   └── ProtectedRoute.tsx         # Role-based route guard
│   ├── lib/
│   │   ├── departments.ts             # 14 official BAUST departments catalog & CSV export
│   │   └── supabase.ts                # Supabase client, profile bootstrap & helpers
│   ├── locales/
│   │   ├── en.json                    # English translations
│   │   └── bn.json                    # Bengali translations
│   ├── pages/
│   │   └── LoginPage.tsx              # Standalone /login & /register view
│   ├── types/
│   │   └── index.ts                   # Shared TypeScript interfaces
│   ├── views/
│   │   ├── BAUSTAnalytics.tsx         # Department charts & average resolution hours
│   │   ├── BAUSTArchitectureViewer.tsx # RLS & routing architecture overview
│   │   ├── BAUSTAuditLogs.tsx         # Immutable audit trail viewer
│   │   ├── BAUSTDepartmentTriage.tsx  # Department-isolated triage console
│   │   ├── BAUSTPublicTracker.tsx     # Public tracking lookup by Tracking ID
│   │   └── BAUSTStudentPortal.tsx     # Student grievance portal
│   ├── App.tsx                        # Main router & application shell
│   └── i18n.ts                        # i18next configuration
├── supabase/
│   ├── setup.sql                      # Consolidated idempotent production setup script
│   ├── schema.sql                     # Core schema definition
│   ├── fixes.sql                      # Patch script for triggers, RLS & RPCs
│   └── migrations/                    # Timestamped SQL migrations
├── vercel.json                        # SPA rewrite configuration for Vercel
├── .env.example                       # Environment variable template
└── package.json
```

---

## License
Bangladesh Army University of Science and Technology (BAUST). All rights reserved.
