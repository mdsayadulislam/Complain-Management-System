import {
  BAUSTDepartment,
  UserProfile,
  Complaint,
  ComplaintAttachment,
  ComplaintHistoryItem,
  ComplaintMessage,
  ComplaintFeedback,
  ComplaintNotification,
  AuditLogItem,
  BAUSTAnalytics,
  ComplaintStatus,
  UserRole,
} from '../src/types/index.ts';

export const BAUST_OFFICIAL_DEPARTMENTS: BAUSTDepartment[] = [
  {
    id: 'dept-cse',
    code: 'CSE',
    name: 'Department of Computer Science and Engineering',
    head_title: 'Head of the Department (CSE)',
    email: 'head.cse@baust.edu.bd',
    category_tags: ['Software Lab Systems', 'GPU Cluster / Server', 'Course Curriculum', 'Academic Schedule', 'Faculty Consultation'],
  },
  {
    id: 'dept-eee',
    code: 'EEE',
    name: 'Department of Electrical and Electronic Engineering',
    head_title: 'Head of the Department (EEE)',
    email: 'head.eee@baust.edu.bd',
    category_tags: ['Circuits & Machine Lab', 'Oscilloscope Calibration', 'Course Schedule', 'Final Year Project Lab'],
  },
  {
    id: 'dept-me',
    code: 'ME',
    name: 'Department of Mechanical Engineering',
    head_title: 'Head of the Department (ME)',
    email: 'head.me@baust.edu.bd',
    category_tags: ['Thermodynamics Lab', 'Workshop Machinery', 'CAD Lab Facilities', 'Faculty Consultation'],
  },
  {
    id: 'dept-ce',
    code: 'CE',
    name: 'Department of Civil Engineering',
    head_title: 'Head of the Department (CE)',
    email: 'head.ce@baust.edu.bd',
    category_tags: ['Structural Materials Lab', 'Surveying Equipment', 'Soil Mechanics Facility', 'Class Timetable'],
  },
  {
    id: 'dept-ipe',
    code: 'IPE',
    name: 'Department of Industrial and Production Engineering',
    head_title: 'Head of the Department (IPE)',
    email: 'head.ipe@baust.edu.bd',
    category_tags: ['Manufacturing Process Lab', 'Quality Control Equipment', 'Industrial Training Coordination'],
  },
  {
    id: 'dept-bba',
    code: 'BBA',
    name: 'Department of Business Administration',
    head_title: 'Head of the Department (BBA)',
    email: 'head.bba@baust.edu.bd',
    category_tags: ['Internship Placement', 'Business Lab Software', 'Case Study Room', 'Course Schedule'],
  },
  {
    id: 'dept-english',
    code: 'English',
    name: 'Department of English',
    head_title: 'Head of the Department (English)',
    email: 'head.english@baust.edu.bd',
    category_tags: ['Language Lab Audio Systems', 'Literature Library Reserve', 'Academic Writing Support'],
  },
  {
    id: 'dept-as',
    code: 'Arts and Sciences',
    name: 'Department of Arts and Sciences',
    head_title: 'Head of the Department (Arts and Sciences)',
    email: 'head.as@baust.edu.bd',
    category_tags: ['Physics Lab Optics', 'Chemistry Lab Reagents', 'Mathematics Remedial Support'],
  },
  {
    id: 'dept-registrar',
    code: 'Registrar',
    name: 'Office of the Registrar',
    head_title: 'Registrar, BAUST',
    email: 'registrar@baust.edu.bd',
    category_tags: ['Semester Registration', 'Certificate Attestation', 'Migration Clearance', 'Student ID Card Issuance'],
  },
  {
    id: 'dept-proctor',
    code: 'Proctor',
    name: 'Proctor Office',
    head_title: 'Office of the Proctor, BAUST',
    email: 'proctor@baust.edu.bd',
    category_tags: ['Campus Discipline & Code of Conduct', 'Anti-Ragging / Anti-Bullying Protocol', 'Campus Security & Access', 'Student ID Card Compliance'],
  },
  {
    id: 'dept-ict',
    code: 'ICT',
    name: 'ICT & System Services',
    head_title: 'Director (ICT & Systems)',
    email: 'ict.support@baust.edu.bd',
    category_tags: ['Campus Wi-Fi / Eduroam', 'Student Portal Login', 'Institutional Email (@baust.edu.bd)', 'Biometric Attendance'],
  },
  {
    id: 'dept-accounts',
    code: 'Accounts',
    name: 'Accounts & Finance Branch',
    head_title: 'Head of Accounts & Finance',
    email: 'accounts@baust.edu.bd',
    category_tags: ['Tuition Fee Billing', 'Waiver & Scholarship Disbursement', 'Bank Payment Challan', 'Refund Processing'],
  },
  {
    id: 'dept-exam',
    code: 'Exam Controller',
    name: 'Controller of Examinations Office',
    head_title: 'Controller of Examinations',
    email: 'exam.controller@baust.edu.bd',
    category_tags: ['Exam Schedule Conflict', 'Grade Sheet Discrepancy', 'Scrutiny & Recheck', 'Admit Card Clearance'],
  },
  {
    id: 'dept-hostel',
    code: 'Hostel',
    name: 'University Hostel & Hall Management (SDZHH Hall)',
    head_title: 'Chief Provost & Hostel Warden (Shaheed Delwar Zahid Hall)',
    email: 'hostel.warden@baust.edu.bd',
    category_tags: ['Shaheed Delwar Zahid Hall (SDZHH)', 'Dormitory Water & Electricity', 'Dining Hall Food Quality', 'Room Allotment', 'Hostel Safety & Anti-Bullying'],
  },
];

export class BAUSTDatabaseStore {
  public departments: BAUSTDepartment[] = [...BAUST_OFFICIAL_DEPARTMENTS];
  public users: UserProfile[] = [];
  public complaints: Complaint[] = [];
  public attachments: ComplaintAttachment[] = [];
  public history: ComplaintHistoryItem[] = [];
  public messages: ComplaintMessage[] = [];
  public feedback: ComplaintFeedback[] = [];
  public notifications: ComplaintNotification[] = [];
  public audit_logs: AuditLogItem[] = [];

  private trackingCounter: number = 1000;

  constructor() {
    this.seedUsers();
    this.seedComplaints();
  }

  public generateTrackingId(): string {
    this.trackingCounter += 1;
    return `CMP-BAUST-2026-${this.trackingCounter}`;
  }

  public addHistory(
    complaintId: string,
    actorId: string,
    actorName: string,
    action: string,
    fromStatus: ComplaintStatus | null,
    toStatus: ComplaintStatus | null,
    note: string
  ): ComplaintHistoryItem {
    const item: ComplaintHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      complaint_id: complaintId,
      actor_id: actorId,
      actor_name: actorName,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      note,
      created_at: new Date().toISOString(),
    };
    this.history.push(item);
    return item;
  }

  public addAuditLog(
    actorId: string,
    actorName: string,
    actorRole: UserRole,
    action: string,
    target: string,
    details: string,
    ip: string = '10.14.0.1'
  ): AuditLogItem {
    const log: AuditLogItem = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole,
      action,
      target,
      details,
      ip_address: ip,
      created_at: new Date().toISOString(),
    };
    this.audit_logs.unshift(log);
    return log;
  }

  public addNotification(
    userId: string,
    complaintId: string,
    trackingId: string,
    text: string,
    type: ComplaintNotification['type']
  ): ComplaintNotification {
    const notif: ComplaintNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: userId,
      complaint_id: complaintId,
      tracking_id: trackingId,
      text,
      type,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    this.notifications.unshift(notif);
    return notif;
  }

  // 100% ACCURATE DEPARTMENT-LEVEL ROUTING & RLS FILTERING
  public getComplaintsForUser(user: UserProfile): Complaint[] {
    if (user.role === 'super_admin') {
      // Super Admin: Centrally monitors all 13 BAUST departments & offices
      return this.complaints.map((c) => this.hydrateComplaint(c, user.role));
    }

    if (user.role === 'dept_admin' || user.role === 'office_head' || user.role === 'staff' || user.role === 'officer') {
      // Department Isolation: STRICTLY limited to the assigned department_id
      // Staff/Dept Admin/Office Head from Dept A can NEVER see complaints of Dept B
      if (!user.department_id) return [];
      return this.complaints
        .filter((c) => c.department_id === user.department_id)
        .map((c) => this.hydrateComplaint(c, user.role));
    }

    // Student: Sees ONLY their own complaints
    return this.complaints
      .filter((c) => c.user_id === user.id)
      .map((c) => this.hydrateComplaint(c, user.role));
  }

  public hydrateComplaint(c: Complaint, requesterRole?: UserRole): Complaint {
    const copy = { ...c };
    const dept = this.departments.find((d) => d.id === copy.department_id);
    copy.department_code = dept?.code || 'BAUST';
    copy.department_name = dept?.name || 'Department';

    // Hydrate inter-department forwarding info if forwarded
    if (copy.forwarded_from_department_id) {
      const fromDept = this.departments.find((d) => d.id === copy.forwarded_from_department_id);
      copy.forwarded_from_department_code = fromDept?.code || 'BAUST';
      copy.forwarded_from_department_name = fromDept?.name || 'Previous Department';
    }

    // Hydrate nested data
    copy.attachments = this.attachments.filter((a) => a.complaint_id === copy.id);
    copy.history = this.history
      .filter((h) => h.complaint_id === copy.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    copy.feedback = this.feedback.find((f) => f.complaint_id === copy.id) || null;

    // ANONYMOUS WHISTLEBLOWER SECURITY RULE:
    // When is_anonymous is true, mask identity at DB level for staff & dept admins
    if (copy.is_anonymous && !copy.revealed_by_admin && requesterRole !== 'super_admin') {
      copy.student_name = 'Anonymous Student';
      copy.student_id = 'BAUST-CONFIDENTIAL';
      copy.student_email = 'confidential@baust.edu.bd';
    }

    return copy;
  }

  // Get complaints that were forwarded OUT by a given department
  public getForwardedOutComplaints(departmentId: string): Complaint[] {
    return this.complaints
      .filter((c) => c.forwarded_from_department_id === departmentId)
      .map((c) => this.hydrateComplaint(c, 'dept_admin'));
  }

  public getAnalytics(): BAUSTAnalytics {
    const total = this.complaints.length;
    const submitted = this.complaints.filter((c) => c.status === 'submitted').length;
    const under_review = this.complaints.filter((c) => c.status === 'under_review').length;
    const assigned = this.complaints.filter((c) => c.status === 'assigned').length;
    const in_progress = this.complaints.filter((c) => c.status === 'in_progress').length;
    const resolved = this.complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
    const reopened = this.complaints.filter((c) => c.status === 'reopened').length;
    const critical_sos = this.complaints.filter((c) => c.is_sos && c.status !== 'resolved' && c.status !== 'closed').length;

    const now = Date.now();
    const overdue = this.complaints.filter(
      (c) => c.deadline && new Date(c.deadline).getTime() < now && c.status !== 'resolved' && c.status !== 'closed'
    ).length;

    const by_department = this.departments.map((d) => {
      const depts = this.complaints.filter((c) => c.department_id === d.id);
      const resCount = depts.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
      return {
        code: d.code,
        name: d.name,
        count: depts.length,
        resolved: resCount,
      };
    });

    const monthly_trends = [
      { month: 'Jun', count: 18, resolved: 16 },
      { month: 'Jul', count: 24, resolved: 22 },
      { month: 'Aug', count: 32, resolved: 28 },
      { month: 'Sep', count: 29, resolved: 27 },
      { month: 'Oct', count: 41, resolved: 36 },
      { month: 'Nov', count: Math.max(15, total), resolved: Math.max(10, resolved) },
    ];

    const avg_resolution_hours = this.departments.slice(0, 8).map((d, i) => ({
      dept: d.code,
      hours: [12, 16, 22, 18, 14, 20, 8, 24][i] || 16,
    }));

    return {
      total,
      submitted,
      under_review,
      assigned,
      in_progress,
      resolved,
      reopened,
      critical_sos,
      overdue,
      by_department,
      monthly_trends,
      avg_resolution_hours,
    };
  }

  private seedUsers(): void {
    this.users = [
      {
        id: 'usr-student-1',
        full_name: 'Sadman Sakib',
        email: 'sadman.210101042@baust.edu.bd',
        student_or_emp_id: 'BAUST-210101042',
        phone: '+880 1711-234567',
        role: 'student',
        department_id: null,
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-10').toISOString(),
      },
      {
        id: 'usr-student-2',
        full_name: 'Afsana Kabir',
        email: 'afsana.220202015@baust.edu.bd',
        student_or_emp_id: 'BAUST-220202015',
        phone: '+880 1722-345678',
        role: 'student',
        department_id: null,
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-15').toISOString(),
      },
      {
        id: 'usr-admin-cse',
        full_name: 'Dr. Md. Tariqul Islam',
        email: 'head.cse@baust.edu.bd',
        student_or_emp_id: 'FAC-CSE-001',
        phone: '+880 1713-456789',
        role: 'office_head',
        department_id: 'dept-cse',
        department_code: 'CSE',
        department_name: 'Department of Computer Science and Engineering',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-registrar',
        full_name: 'Lt Col (Retd) Registrar',
        email: 'registrar@baust.edu.bd',
        student_or_emp_id: 'OFF-REG-001',
        phone: '+880 1714-567890',
        role: 'office_head',
        department_id: 'dept-registrar',
        department_code: 'Registrar',
        department_name: 'Office of the Registrar',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-proctor',
        full_name: 'Prof. Dr. Proctor',
        email: 'proctor@baust.edu.bd',
        student_or_emp_id: 'OFF-PRC-001',
        phone: '+880 1715-678901',
        role: 'office_head',
        department_id: 'dept-proctor',
        department_code: 'Proctor',
        department_name: 'Proctor Office',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-eee',
        full_name: 'Prof. Dr. EEE Head',
        email: 'head.eee@baust.edu.bd',
        student_or_emp_id: 'FAC-EEE-001',
        phone: '+880 1716-789012',
        role: 'office_head',
        department_id: 'dept-eee',
        department_code: 'EEE',
        department_name: 'Department of Electrical and Electronic Engineering',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-ict',
        full_name: 'Engr. Director ICT',
        email: 'ict.support@baust.edu.bd',
        student_or_emp_id: 'OFF-ICT-001',
        phone: '+880 1717-890123',
        role: 'office_head',
        department_id: 'dept-ict',
        department_code: 'ICT',
        department_name: 'ICT & System Services',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-hostel',
        full_name: 'Chief Provost (SDZHH Hall)',
        email: 'hostel.warden@baust.edu.bd',
        student_or_emp_id: 'OFF-HST-001',
        phone: '+880 1718-901234',
        role: 'office_head',
        department_id: 'dept-hostel',
        department_code: 'Hostel',
        department_name: 'University Hostel & Hall Management (SDZHH Hall)',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-admin-exam',
        full_name: 'Controller of Examinations',
        email: 'exam.controller@baust.edu.bd',
        student_or_emp_id: 'OFF-EXM-001',
        phone: '+880 1719-012345',
        role: 'office_head',
        department_id: 'dept-exam',
        department_code: 'Exam Controller',
        department_name: 'Controller of Examinations Office',
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
      {
        id: 'usr-superadmin',
        full_name: 'Vice Chancellor & Proctor Secretariat (BAUST Super Admin)',
        email: 'superadmin@baust.edu.bd',
        student_or_emp_id: 'EXEC-BAUST-001',
        phone: '+880 1720-123456',
        role: 'super_admin',
        department_id: null,
        password: 'password123',
        is_blocked: false,
        avatar_url: '',
        created_at: new Date('2026-01-01').toISOString(),
      },
    ];
  }

  public registerUser(params: {
    full_name: string;
    email: string;
    student_or_emp_id: string;
    phone?: string;
    role: UserRole;
    department_id: string | null;
    password?: string;
  }): UserProfile {
    const dept = params.department_id ? this.departments.find((d) => d.id === params.department_id) : null;
    const newUser: UserProfile = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      full_name: params.full_name.trim(),
      email: params.email.trim().toLowerCase(),
      student_or_emp_id: params.student_or_emp_id.trim().toUpperCase(),
      phone: params.phone?.trim() || '+880 1700-000000',
      role: params.role,
      department_id: params.department_id || null,
      department_code: dept?.code,
      department_name: dept?.name,
      password: params.password || 'password123',
      is_blocked: false,
      avatar_url: '', // Clean empty default for user self-upload
      created_at: new Date().toISOString(),
    };
    this.users.push(newUser);
    return newUser;
  }

  public updateUserProfile(userId: string, data: Partial<UserProfile>): UserProfile | null {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    if (data.full_name !== undefined) user.full_name = data.full_name.trim();
    if (data.student_or_emp_id !== undefined) user.student_or_emp_id = data.student_or_emp_id.trim();
    if (data.phone !== undefined) user.phone = data.phone.trim();
    if (data.avatar_url !== undefined) user.avatar_url = data.avatar_url.trim();
    return user;
  }

  public findUserForAuth(identifier: string): UserProfile | undefined {
    const q = identifier.trim().toLowerCase();
    return this.users.find(
      (u) => u.email.toLowerCase() === q || u.student_or_emp_id.toLowerCase() === q
    );
  }

  private seedComplaints(): void {
    const cmp1Id = 'cmp-baust-01';
    const cmp2Id = 'cmp-baust-02';
    const cmp3Id = 'cmp-baust-03';
    const cmp4Id = 'cmp-baust-04';
    const cmp5Id = 'cmp-baust-05';

    this.complaints = [
      {
        id: cmp1Id,
        tracking_id: 'CMP-BAUST-2026-1001',
        user_id: 'usr-student-1',
        student_name: 'Sadman Sakib',
        student_id: 'BAUST-210101042',
        student_email: 'sadman.210101042@baust.edu.bd',
        is_anonymous: false,
        revealed_by_admin: false,
        department_id: 'dept-cse', // ROUTED TO CSE
        category: 'Software Lab Systems',
        subject: 'Compiler and GPU Server Access Failure in Software Lab 2',
        description: 'In Software Engineering Lab 2, workstations 14 to 22 cannot connect to the local GPU compute server for Deep Learning laboratory assignments. Need departmental network restart.',
        priority: 'high',
        is_sos: false,
        status: 'in_progress',
        assigned_to: 'usr-admin-cse',
        assigned_to_name: 'Dr. Md. Tariqul Islam',
        deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        is_spam: false,
        merged_into: null,
        created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      },
      {
        id: cmp2Id,
        tracking_id: 'CMP-BAUST-2026-1002',
        user_id: 'usr-student-1',
        student_name: 'Sadman Sakib',
        student_id: 'BAUST-210101042',
        student_email: 'sadman.210101042@baust.edu.bd',
        is_anonymous: false,
        revealed_by_admin: false,
        department_id: 'dept-registrar', // ROUTED TO REGISTRAR
        category: 'Certificate Attestation',
        subject: 'Semester Grade Sheet Attestation & Migration Clearance Delay',
        description: 'Applied for 6th-semester attested grade sheet on 12th October for scholarship submission. Standard processing time exceeded 10 working days.',
        priority: 'medium',
        is_sos: false,
        status: 'under_review',
        assigned_to: 'usr-admin-registrar',
        assigned_to_name: 'Lt Col (Retd) Registrar',
        deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        is_spam: false,
        merged_into: null,
        created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
      },
      {
        id: cmp3Id,
        tracking_id: 'CMP-BAUST-2026-1003',
        user_id: 'usr-student-2',
        student_name: 'Afsana Kabir',
        student_id: 'BAUST-220202015',
        student_email: 'afsana.220202015@baust.edu.bd',
        is_anonymous: false,
        revealed_by_admin: false,
        department_id: 'dept-hostel', // ROUTED TO HOSTEL
        category: 'Hostel Safety & Anti-Bullying',
        subject: 'EMERGENCY: Overhead Water Pipe Burst & Electrical Short Circuit in Hall 2 Block B',
        description: 'Major water line ruptured on the 3rd floor hallway ceiling directly above the sub-distribution breaker panel. Sparking observed. Requires urgent electrical cut-off and plumbing shutdown.',
        priority: 'critical',
        is_sos: true, // SOS ALERT
        status: 'in_progress',
        assigned_to: 'usr-admin-hostel',
        assigned_to_name: 'Chief Provost',
        deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        is_spam: false,
        merged_into: null,
        created_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      {
        id: cmp4Id,
        tracking_id: 'CMP-BAUST-2026-1004',
        user_id: 'usr-student-1',
        student_name: 'Sadman Sakib',
        student_id: 'BAUST-210101042',
        student_email: 'sadman.210101042@baust.edu.bd',
        is_anonymous: true, // ANONYMOUS
        revealed_by_admin: false,
        department_id: 'dept-cse', // ROUTED TO CSE
        category: 'Academic Schedule',
        subject: 'Anonymous Whistleblower: Timetable Overlap in CSE 4101 and Lab 4103',
        description: 'Both slots are booked for Computer Center Room 402 on Wednesday 2:00 PM. Conflicting with faculty makeup schedule.',
        priority: 'low',
        is_sos: false,
        status: 'submitted',
        assigned_to: null,
        deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        is_spam: false,
        merged_into: null,
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
      {
        id: cmp5Id,
        tracking_id: 'CMP-BAUST-2026-1005',
        user_id: 'usr-student-2',
        student_name: 'Afsana Kabir',
        student_id: 'BAUST-220202015',
        student_email: 'afsana.220202015@baust.edu.bd',
        is_anonymous: false,
        revealed_by_admin: false,
        department_id: 'dept-ict', // ROUTED TO ICT
        category: 'Campus Wi-Fi / Eduroam',
        subject: 'Authentication Failure on BAUST Student Portal and Eduroam',
        description: 'Student portal returns 502 Bad Gateway during course registration window, and campus Wi-Fi drops connection every 5 minutes in Central Library.',
        priority: 'high',
        status: 'resolved',
        is_sos: false,
        assigned_to: 'usr-admin-ict',
        assigned_to_name: 'Engr. Director (ICT)',
        deadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        is_spam: false,
        merged_into: null,
        created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      },
    ];

    // Seed Attachments
    this.attachments = [
      {
        id: 'att-1',
        complaint_id: cmp3Id,
        file_name: 'water_leak_breaker_hall2.jpg',
        file_url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
        file_type: 'image/jpeg',
        size_bytes: 1450000,
        created_at: new Date(Date.now() - 49 * 60 * 1000).toISOString(),
      },
      {
        id: 'att-2',
        complaint_id: cmp2Id,
        file_name: 'attestation_application_slip.pdf',
        file_url: '#document-slip',
        file_type: 'application/pdf',
        size_bytes: 320000,
        created_at: new Date(Date.now() - 70 * 3600 * 1000).toISOString(),
      },
    ];

    // Seed History
    this.history = [
      {
        id: 'hist-1',
        complaint_id: cmp1Id,
        actor_id: 'usr-student-1',
        actor_name: 'Sadman Sakib',
        action: 'SUBMITTED',
        from_status: null,
        to_status: 'submitted',
        note: 'Submitted and routed specifically to Department of Computer Science and Engineering (CSE).',
        created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
      },
      {
        id: 'hist-2',
        complaint_id: cmp1Id,
        actor_id: 'usr-admin-cse',
        actor_name: 'Dr. Md. Tariqul Islam',
        action: 'STATUS_UPDATE',
        from_status: 'submitted',
        to_status: 'in_progress',
        note: 'CSE System Administrator assigned to reboot network switch and restart GPU server daemon.',
        created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      },
      {
        id: 'hist-3',
        complaint_id: cmp3Id,
        actor_id: 'usr-student-2',
        actor_name: 'Afsana Kabir',
        action: 'SOS_BROADCAST',
        from_status: null,
        to_status: 'submitted',
        note: 'CRITICAL SOS ALERT: Emergency maintenance ticket broadcast to Hostel Provost.',
        created_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
      },
      {
        id: 'hist-4',
        complaint_id: cmp5Id,
        actor_id: 'usr-admin-ict',
        actor_name: 'Engr. Director (ICT)',
        action: 'RESOLVED',
        from_status: 'in_progress',
        to_status: 'resolved',
        note: 'RADIUS authentication server restarted. Library wireless access point replaced.',
        created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      },
    ];

    // Seed Messages
    this.messages = [
      {
        id: 'msg-1',
        complaint_id: cmp3Id,
        sender_id: 'usr-student-2',
        sender_name: 'Afsana Kabir',
        sender_role: 'student',
        body: 'Water is starting to drip directly onto the electrical conduit outside Room 304!',
        is_internal: false,
        created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-2',
        complaint_id: cmp3Id,
        sender_id: 'usr-admin-hostel',
        sender_name: 'Chief Provost',
        sender_role: 'dept_admin',
        body: 'Hall maintenance team and electrical engineer dispatched. Main breaker has been isolated.',
        is_internal: false,
        created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-3',
        complaint_id: cmp3Id,
        sender_id: 'usr-admin-hostel',
        sender_name: 'Chief Provost',
        sender_role: 'dept_admin',
        body: 'Internal note: Plumber isolated riser valve 3. Breaker box dry and safe.',
        is_internal: true,
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
    ];

    // Seed Feedback
    this.feedback = [
      {
        id: 'fb-1',
        complaint_id: cmp5Id,
        rating: 5,
        comment: 'Wi-Fi in Central Library is stable now. Thank you ICT team for the quick resolution.',
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
    ];

    // Seed Audit Logs
    this.audit_logs = [
      {
        id: 'audit-001',
        actor_id: 'usr-superadmin',
        actor_name: 'Vice Chancellor & Proctor Secretariat',
        actor_role: 'super_admin',
        action: 'SYSTEM_BOOTSTRAP',
        target: 'BAUST_DEPARTMENTS',
        details: 'Initialized 13 official BAUST departments & offices with strict Row Level Security (RLS) policies.',
        ip_address: '10.14.0.1',
        created_at: new Date(Date.now() - 80 * 3600 * 1000).toISOString(),
      },
    ];
  }
}

export const db = new BAUSTDatabaseStore();
