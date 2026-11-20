export interface DemoAccount {
  id: string;
  name: string;
  designation: string;
  email: string;
  password: string;
  roleBadge: string;
  departmentCode?: string;
  category: 'students' | 'academic' | 'administration';
  badgeStyle: {
    bg: string;
    text: string;
    border: string;
  };
}

export interface DemoCategory {
  id: 'students' | 'academic' | 'administration';
  title: string;
  shortTitle: string;
  description: string;
  accounts: DemoAccount[];
}

export const DEMO_COMMON_PASSWORD = '123456';

export const DEMO_ACCOUNT_CATEGORIES: DemoCategory[] = [
  {
    id: 'students',
    title: 'Students',
    shortTitle: 'Students',
    description: 'Submit, track and escalate undergraduate student grievances',
    accounts: [
      {
        id: 'student-1',
        name: 'RIMU',
        designation: 'Undergraduate Student',
        email: 'rimu98abc@gmail.com',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'Student',
        category: 'students',
        badgeStyle: {
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
        },
      },
      {
        id: 'student-2',
        name: 'Md. Sayadul Islam',
        designation: 'Undergraduate Student',
        email: 'mdsayadulislamsayad2626@gmail.com',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'Student',
        category: 'students',
        badgeStyle: {
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
        },
      },
    ],
  },
  {
    id: 'academic',
    title: 'Academic Departments',
    shortTitle: 'Academic Depts',
    description: 'Triage, forward & resolve departmental academic complaints',
    accounts: [
      {
        id: 'dept-cse',
        name: 'Dr. Md Nakib Hayat Chowdhury',
        designation: 'Head of Department (CSE)',
        email: 'nakib@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'CSE Head',
        departmentCode: 'CSE',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
        },
      },
      {
        id: 'dept-ipe',
        name: 'Prof. Dr. A.K.M. Nurul Amin',
        designation: 'Head of Department (IPE)',
        email: 'headipe@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'IPE Head',
        departmentCode: 'IPE',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-cyan-50',
          text: 'text-cyan-700',
          border: 'border-cyan-200',
        },
      },
      {
        id: 'dept-english',
        name: 'Md. Ashikullah',
        designation: 'Head of Department (English)',
        email: 'hdenglish@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'English Head',
        departmentCode: 'ENGLISH',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-indigo-50',
          text: 'text-indigo-700',
          border: 'border-indigo-200',
        },
      },
      {
        id: 'dept-ce',
        name: 'Md. Elias',
        designation: 'Head of Department (CE)',
        email: 'mdelias@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'CE Head',
        departmentCode: 'CE',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-amber-50',
          text: 'text-amber-700',
          border: 'border-amber-200',
        },
      },
      {
        id: 'dept-me',
        name: 'Md. Mahmudul Adil',
        designation: 'Head of Department (ME)',
        email: 'headme@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'ME Head',
        departmentCode: 'ME',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-orange-50',
          text: 'text-orange-700',
          border: 'border-orange-200',
        },
      },
      {
        id: 'dept-ais',
        name: 'Rakibul Islam',
        designation: 'Head of Department (AIS)',
        email: 'headais@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'AIS Head',
        departmentCode: 'ARTS_SCIENCE',
        category: 'academic',
        badgeStyle: {
          bg: 'bg-teal-50',
          text: 'text-teal-700',
          border: 'border-teal-200',
        },
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration & Hall',
    shortTitle: 'Admin & Hall',
    description: 'Discipline, systems, exam controller & residential hall governance',
    accounts: [
      {
        id: 'admin-proctor',
        name: 'Md. Zaber Hossain',
        designation: 'Office of the Proctor',
        email: 'proctor@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'Proctor',
        departmentCode: 'PROCTOR',
        category: 'administration',
        badgeStyle: {
          bg: 'bg-rose-50',
          text: 'text-rose-700',
          border: 'border-rose-200',
        },
      },
      {
        id: 'admin-ict',
        name: 'Engr. Md. Mamun Hossain',
        designation: 'ICT & System Services',
        email: 'headict@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'ICT Head',
        departmentCode: 'ICT',
        category: 'administration',
        badgeStyle: {
          bg: 'bg-purple-50',
          text: 'text-purple-700',
          border: 'border-purple-200',
        },
      },
      {
        id: 'admin-controller',
        name: 'Controller of Examinations',
        designation: 'Examination Controller Office',
        email: 'controller@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'Controller',
        departmentCode: 'EXAM_CONTROLLER',
        category: 'administration',
        badgeStyle: {
          bg: 'bg-violet-50',
          text: 'text-violet-700',
          border: 'border-violet-200',
        },
      },
      {
        id: 'admin-hostel',
        name: 'Shaheed Dr. Zikrul Haque Hall',
        designation: 'SDZHH Hall Management & Warden',
        email: 'sdzhh@baust.edu.bd',
        password: DEMO_COMMON_PASSWORD,
        roleBadge: 'Hall Warden',
        departmentCode: 'HOSTEL',
        category: 'administration',
        badgeStyle: {
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
        },
      },
    ],
  },
];
