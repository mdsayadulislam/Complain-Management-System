import { BAUSTDepartment, Complaint } from '../types/index.ts';

/**
 * Official BAUST Academic Departments & Administrative Offices catalog.
 * Used as fallback display metadata if Supabase departments query is unavailable before env setup.
 */
export const BAUST_OFFICIAL_DEPARTMENTS: BAUSTDepartment[] = [
  {
    id: 'dept-cse',
    code: 'CSE',
    name: 'Department of Computer Science and Engineering',
    head_title: 'Head of the Department (CSE)',
    email: 'head.cse@baust.edu.bd',
    category_tags: ['Software Lab Systems', 'GPU Cluster / Server', 'Course Curriculum', 'Academic Schedule', 'Faculty Consultation', 'Others'],
  },
  {
    id: 'dept-eee',
    code: 'EEE',
    name: 'Department of Electrical and Electronic Engineering',
    head_title: 'Head of the Department (EEE)',
    email: 'head.eee@baust.edu.bd',
    category_tags: ['Circuits & Machine Lab', 'Oscilloscope Calibration', 'Course Schedule', 'Final Year Project Lab', 'Others'],
  },
  {
    id: 'dept-me',
    code: 'ME',
    name: 'Department of Mechanical Engineering',
    head_title: 'Head of the Department (ME)',
    email: 'head.me@baust.edu.bd',
    category_tags: ['Thermodynamics Lab', 'Workshop Machinery', 'CAD Lab Facilities', 'Faculty Consultation', 'Others'],
  },
  {
    id: 'dept-ce',
    code: 'CE',
    name: 'Department of Civil Engineering',
    head_title: 'Head of the Department (CE)',
    email: 'head.ce@baust.edu.bd',
    category_tags: ['Structural Materials Lab', 'Surveying Equipment', 'Soil Mechanics Facility', 'Class Timetable', 'Others'],
  },
  {
    id: 'dept-ipe',
    code: 'IPE',
    name: 'Department of Industrial and Production Engineering',
    head_title: 'Head of the Department (IPE)',
    email: 'head.ipe@baust.edu.bd',
    category_tags: ['Manufacturing Process Lab', 'Quality Control Equipment', 'Industrial Training Coordination', 'Others'],
  },
  {
    id: 'dept-bba',
    code: 'BBA',
    name: 'Department of Business Administration',
    head_title: 'Head of the Department (BBA)',
    email: 'head.bba@baust.edu.bd',
    category_tags: ['Internship Placement', 'Business Lab Software', 'Case Study Room', 'Course Schedule', 'Others'],
  },
  {
    id: 'dept-english',
    code: 'ENGLISH',
    name: 'Department of English',
    head_title: 'Head of the Department (English)',
    email: 'head.english@baust.edu.bd',
    category_tags: ['Language Lab Audio Systems', 'Literature Library Reserve', 'Academic Writing Support', 'Others'],
  },
  {
    id: 'dept-as',
    code: 'ARTS_SCIENCE',
    name: 'Department of Arts and Sciences',
    head_title: 'Head of the Department (Arts and Sciences)',
    email: 'head.as@baust.edu.bd',
    category_tags: ['Physics Lab Optics', 'Chemistry Lab Reagents', 'Mathematics Remedial Support', 'Others'],
  },
  {
    id: 'dept-registrar',
    code: 'REGISTRAR',
    name: 'Office of the Registrar',
    head_title: 'Registrar, BAUST',
    email: 'registrar@baust.edu.bd',
    category_tags: ['Semester Registration', 'Certificate Attestation', 'Migration Clearance', 'Student ID Card Issuance', 'Others'],
  },
  {
    id: 'dept-proctor',
    code: 'PROCTOR',
    name: 'Proctor Office',
    head_title: 'Office of the Proctor, BAUST',
    email: 'proctor@baust.edu.bd',
    category_tags: ['Campus Discipline & Code of Conduct', 'Anti-Ragging / Anti-Bullying Protocol', 'Campus Security & Access', 'Student ID Card Compliance', 'Others'],
  },
  {
    id: 'dept-ict',
    code: 'ICT',
    name: 'ICT & System Services',
    head_title: 'Director (ICT & Systems)',
    email: 'ict.support@baust.edu.bd',
    category_tags: ['Campus Wi-Fi / Eduroam', 'Student Portal Login', 'Institutional Email (@baust.edu.bd)', 'Biometric Attendance', 'Others'],
  },
  {
    id: 'dept-accounts',
    code: 'ACCOUNTS',
    name: 'Accounts & Finance Branch',
    head_title: 'Head of Accounts & Finance',
    email: 'accounts@baust.edu.bd',
    category_tags: ['Tuition Fee Billing', 'Waiver & Scholarship Disbursement', 'Bank Payment Challan', 'Refund Processing', 'Others'],
  },
  {
    id: 'dept-exam',
    code: 'EXAM_CONTROLLER',
    name: 'Controller of Examinations Office',
    head_title: 'Controller of Examinations',
    email: 'exam.controller@baust.edu.bd',
    category_tags: ['Exam Schedule Conflict', 'Grade Sheet Discrepancy', 'Scrutiny & Recheck', 'Admit Card Clearance', 'Others'],
  },
  {
    id: 'dept-hostel',
    code: 'HOSTEL',
    name: 'University Hostel & Hall Management (SDZHH Hall)',
    head_title: 'Chief Provost & Hostel Warden (Shaheed Delwar Zahid Hall)',
    email: 'hostel.warden@baust.edu.bd',
    category_tags: ['Shaheed Delwar Zahid Hall (SDZHH)', 'Dormitory Water & Electricity', 'Dining Hall Food Quality', 'Room Allotment', 'Hostel Safety & Anti-Bullying', 'Others'],
  },
];

export function exportComplaintsToCSV(complaints: Complaint[], filename = 'baust_complaints_export.csv'): void {
  const headers = [
    'Tracking ID',
    'Subject',
    'Category',
    'Department Code',
    'Department Name',
    'Priority',
    'Status',
    'Is SOS',
    'Is Anonymous',
    'Created At',
  ];

  const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = complaints.map((c) =>
    [
      escapeCsv(c.tracking_id),
      escapeCsv(c.subject),
      escapeCsv(c.category),
      escapeCsv(c.department_code),
      escapeCsv(c.department_name),
      escapeCsv(c.priority),
      escapeCsv(c.status),
      c.is_sos ? 'YES' : 'NO',
      c.is_anonymous ? 'YES' : 'NO',
      escapeCsv(c.created_at),
    ].join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
