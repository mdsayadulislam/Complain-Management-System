import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  Cell,
} from 'recharts';
import { Clock, ShieldCheck } from 'lucide-react';
import { BAUSTAnalytics, BAUSTDepartment, Complaint, UserProfile } from '../types/index.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

const DEPT_COLORS = [
  '#059669', '#0284c7', '#d97706', '#dc2626', '#7c3aed',
  '#2563eb', '#0d9488', '#e11d48', '#475569', '#16a34a',
  '#ca8a04', '#9333ea', '#64748b', '#0f766e',
];

interface BAUSTAnalyticsViewProps {
  departments?: BAUSTDepartment[];
  currentUser?: UserProfile | null;
}

export const BAUSTAnalyticsView: React.FC<BAUSTAnalyticsViewProps> = ({
  departments = [],
  currentUser = null,
}) => {
  const [analytics, setAnalytics] = useState<BAUSTAnalytics | null>(null);
  const [rawComplaints, setRawComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchAnalytics();
  }, [departments.length, currentUser?.id, currentUser?.role, currentUser?.department_id]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      let deptList = departments;
      let complaintRows: Complaint[] = [];

      if (isSupabaseConfigured) {
        if (deptList.length === 0) {
          const { data: deptData } = await supabase
            .from('departments')
            .select('id, code, name, head_title, email, category_tags')
            .eq('is_active', true);
          deptList = (deptData as BAUSTDepartment[]) || [];
        }

        const { data: cmpData } = await supabase
          .from('complaints')
          .select(
            'id, tracking_id, user_id, department_id, category, subject, description, priority, is_sos, status, deadline, is_anonymous, created_at, updated_at'
          );

        const deptMap = new Map(deptList.map((d) => [d.id, d]));
        complaintRows = ((cmpData as any[]) || []).map((c) => {
          const d = deptMap.get(c.department_id);
          return {
            ...c,
            student_name: '',
            student_id: '',
            student_email: '',
            is_spam: false,
            merged_into: null,
            assigned_to: null,
            department_code: d?.code || '',
            department_name: d?.name || '',
          } as Complaint;
        });
      }

      setRawComplaints(complaintRows);

      const now = Date.now();
      const statusCounts = {
        submitted: 0,
        under_review: 0,
        assigned: 0,
        in_progress: 0,
        resolved: 0,
        reopened: 0,
      };

      let criticalSos = 0;
      let overdue = 0;

      for (const c of complaintRows) {
        if (c.status in statusCounts) {
          statusCounts[c.status as keyof typeof statusCounts] += 1;
        }
        if (c.status === 'closed') {
          statusCounts.resolved += 1;
        }
        if (c.is_sos && c.status !== 'resolved' && c.status !== 'closed') {
          criticalSos += 1;
        }
        if (c.deadline && new Date(c.deadline).getTime() < now && c.status !== 'resolved' && c.status !== 'closed') {
          overdue += 1;
        }
      }

      const byDepartment = deptList.map((d) => {
        const deptComplaints = complaintRows.filter((c) => c.department_id === d.id);
        return {
          code: d.code,
          name: d.name,
          count: deptComplaints.length,
          resolved: deptComplaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length,
        };
      });

      const avgResolutionHours = deptList
        .map((d) => {
          const resolvedWithTimes = complaintRows.filter((c) => {
            if (c.department_id !== d.id) return false;
            if (c.status !== 'resolved' && c.status !== 'closed') return false;
            const createdMs = new Date(c.created_at).getTime();
            const updatedMs = new Date(c.updated_at).getTime();
            return Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs >= createdMs;
          });
          if (resolvedWithTimes.length === 0) return null;
          const totalHours = resolvedWithTimes.reduce((sum, c) => {
            const diffHours =
              (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60);
            return sum + Math.max(0, diffHours);
          }, 0);
          return {
            dept: d.code,
            hours: Number((totalHours / resolvedWithTimes.length).toFixed(1)),
          };
        })
        .filter((item): item is { dept: string; hours: number } => item !== null);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyTrends: { month: string; count: number; resolved: number }[] = [];
      const currentDate = new Date();
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const inMonth = complaintRows.filter((c) => {
          const cd = new Date(c.created_at);
          return cd.getFullYear() === y && cd.getMonth() === m;
        });
        monthlyTrends.push({
          month: `${monthNames[m]} ${String(y).slice(-2)}`,
          count: inMonth.length,
          resolved: inMonth.filter((c) => c.status === 'resolved' || c.status === 'closed').length,
        });
      }

      setAnalytics({
        total: complaintRows.length,
        ...statusCounts,
        critical_sos: criticalSos,
        overdue,
        by_department: byDepartment,
        monthly_trends: monthlyTrends,
        avg_resolution_hours: avgResolutionHours,
      });
    } catch (e) {
      console.error('Failed to compute BAUST analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-xs text-slate-400">
        Loading BAUST institutional grievance metrics...
      </div>
    );
  }

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isStudent = currentUser?.role === 'student';

  const scopeBadge = isSuperAdmin
    ? 'University-Wide Scope · All 14 Wings'
    : isStudent
    ? 'Personal Scope · Your Grievances'
    : `Departmental Scope · ${currentUser?.department_code || 'Assigned Wing'}`;

  const scopeSubtitle = isSuperAdmin
    ? `Central institutional grievance volumes & SLA metrics across ${analytics.by_department.length} BAUST departments and administrative offices.`
    : isStudent
    ? 'RLS-scoped grievance progress and resolution timings for your personal submissions.'
    : `RLS-scoped metrics strictly reflecting grievances routed to or forwarded from ${currentUser?.department_name || 'your assigned BAUST wing'}.`;

  const visibleDepartments = isSuperAdmin
    ? analytics.by_department
    : analytics.by_department.filter(
        (d) =>
          d.count > 0 ||
          (currentUser?.department_code &&
            d.code.toUpperCase() === currentUser.department_code.toUpperCase())
      );

  const avgHoursMap = new Map(
    analytics.avg_resolution_hours.map((item) => [item.dept, item.hours])
  );

  const overallAvgResolutionHours = (() => {
    const resolvedRows = rawComplaints.filter(
      (c) => c.status === 'resolved' || c.status === 'closed'
    );
    if (resolvedRows.length === 0) return null;
    const valid = resolvedRows.filter((c) => {
      const createdMs = new Date(c.created_at).getTime();
      const updatedMs = new Date(c.updated_at).getTime();
      return Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs >= createdMs;
    });
    if (valid.length === 0) return null;
    const total = valid.reduce(
      (acc, c) =>
        acc + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60),
      0
    );
    return Number((total / valid.length).toFixed(1));
  })();

  const statusData = [
    { name: 'Submitted', count: analytics.submitted, color: '#0284c7' },
    { name: 'Under Review', count: analytics.under_review, color: '#2563eb' },
    { name: 'Assigned', count: analytics.assigned, color: '#4f46e5' },
    { name: 'In Progress', count: analytics.in_progress, color: '#d97706' },
    { name: 'Resolved', count: analytics.resolved, color: '#059669' },
    { name: 'Reopened', count: analytics.reopened, color: '#7c3aed' },
  ];

  const resolutionRate =
    analytics.total > 0 ? ((analytics.resolved / analytics.total) * 100).toFixed(1) : '0';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {isSuperAdmin
                ? 'BAUST Institutional Analytics & SLA Compliance'
                : isStudent
                ? 'Personal Grievance Analytics'
                : 'Departmental Analytics & SLA Compliance'}
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>{scopeBadge}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">{scopeSubtitle}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Grievances
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {analytics.total}
            </span>
            <span className="text-xs text-slate-400">Visible Scope</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Resolution Rate
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
              {resolutionRate}%
            </span>
            <span className="text-xs text-emerald-600 font-medium">SLA Target &gt; 85%</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Avg Resolution Time
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {overallAvgResolutionHours !== null ? `${overallAvgResolutionHours}h` : '—'}
            </span>
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Mean SLA</span>
            </span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Active SOS Emergencies
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
              {analytics.critical_sos}
            </span>
            <span className="text-xs text-rose-600 font-medium">Critical Triage</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Overdue Cases
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-600 tabular-nums">
              {analytics.overdue}
            </span>
            <span className="text-xs text-amber-600 font-medium">Exceeded SLA</span>
          </div>
        </div>
      </div>

      {/* Row 1: Status Distribution & Monthly Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Grievances by Lifecycle Status</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900">6-Month Intake vs Resolution Trend</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.monthly_trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="count" name="Reported" stroke="#059669" fill="url(#colorCount)" />
                <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#2563eb" fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Average Resolution Hours Chart */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            Average Resolution Time (Hours) by Department
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Computed from created_at → updated_at for resolved &amp; closed grievances
          </span>
        </div>
        {analytics.avg_resolution_hours.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-100">
            No resolved or closed grievances in the current visibility scope yet.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.avg_resolution_hours}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dept" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="h" />
                <Tooltip
                  formatter={(value: any) => [`${value} hrs`, 'Avg Resolution Time']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="hours" name="Avg Hours" radius={[4, 4, 0, 0]}>
                  {analytics.avg_resolution_hours.map((entry, index) => (
                    <Cell key={`res-cell-${entry.dept}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Row 3: Department Volumes Breakdown */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            {isSuperAdmin
              ? 'Volume Across All Official BAUST Departments & Offices'
              : 'Visible Department & Office Volume Breakdown'}
          </h3>
          {!isSuperAdmin && (
            <span className="text-[11px] text-slate-500">
              Other departments are isolated under Supabase RLS
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {visibleDepartments.map((dept, idx) => {
            const deptAvg = avgHoursMap.get(dept.code);
            return (
              <div key={dept.code} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{dept.code}</span>
                  <span className="font-mono text-slate-600 font-semibold">{dept.count} cases</span>
                </div>
                <span className="text-[11px] text-slate-500 block truncate">{dept.name}</span>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>{dept.resolved} resolved</span>
                  <span>{deptAvg !== undefined ? `Avg: ${deptAvg}h` : 'Avg: —'}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (dept.count / Math.max(1, analytics.total)) * 100)}%`,
                      backgroundColor: DEPT_COLORS[idx % DEPT_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
