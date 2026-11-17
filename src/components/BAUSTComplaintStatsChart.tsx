import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Check,
  Copy,
  Database,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.ts';

interface DailyTrendPoint {
  date: string;
  count: number;
  cumulative_total: number;
}

interface DepartmentCountPoint {
  code: string;
  name: string;
  count: number;
}

interface PublicComplaintStats {
  total_complaints: number;
  active_complaints: number;
  resolved_complaints: number;
  daily_trend: DailyTrendPoint[];
  by_department: DepartmentCountPoint[];
}

interface BAUSTComplaintStatsChartProps {
  refreshTrigger?: number;
}

const RPC_MIGRATION_SQL = `CREATE OR REPLACE FUNCTION public.get_public_complaint_stats()
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
NOTIFY pgrst, 'reload schema';`;

const DEPT_BAR_COLORS = [
  '#059669',
  '#0d9488',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#d97706',
  '#475569',
];

const formatShortDate = (isoDate: string): string => {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

export const BAUSTComplaintStatsChart: React.FC<BAUSTComplaintStatsChartProps> = ({
  refreshTrigger = 0,
}) => {
  const [stats, setStats] = useState<PublicComplaintStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rpcMissing, setRpcMissing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'trend' | 'department'>('trend');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const loadStats = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setStats(null);
      setErrorMessage('Supabase connection environment variables are not configured.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setRpcMissing(false);

    try {
      const { data, error } = await supabase.rpc('get_public_complaint_stats');

      if (error) {
        const msg = error.message || '';
        const code = error.code || '';
        const isSchemaMissing =
          code === '42883' ||
          code === 'PGRST202' ||
          msg.toLowerCase().includes('could not find the function') ||
          msg.toLowerCase().includes('schema cache');

        if (isSchemaMissing) {
          setRpcMissing(true);
        } else {
          setErrorMessage(msg || 'Unable to load complaint overview statistics.');
        }
        setStats(null);
        return;
      }

      const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const dailyTrendRaw = Array.isArray(raw.daily_trend) ? raw.daily_trend : [];
      const byDeptRaw = Array.isArray(raw.by_department) ? raw.by_department : [];

      setStats({
        total_complaints: Number(raw.total_complaints ?? 0),
        active_complaints: Number(raw.active_complaints ?? 0),
        resolved_complaints: Number(raw.resolved_complaints ?? 0),
        daily_trend: dailyTrendRaw.map((item: any) => ({
          date: String(item?.date ?? ''),
          count: Number(item?.count ?? 0),
          cumulative_total: Number(item?.cumulative_total ?? 0),
        })),
        by_department: byDeptRaw.map((item: any) => ({
          code: String(item?.code ?? ''),
          name: String(item?.name ?? ''),
          count: Number(item?.count ?? 0),
        })),
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error loading complaint statistics.');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, [refreshTrigger]);

  const formattedTrend = useMemo(() => {
    if (!stats) return [];
    return stats.daily_trend.map((pt) => ({
      ...pt,
      label: formatShortDate(pt.date),
    }));
  }, [stats]);

  const departmentData = useMemo(() => {
    if (!stats) return [];
    const nonZero = stats.by_department.filter((d) => d.count > 0);
    return nonZero.length > 0 ? nonZero : stats.by_department;
  }, [stats]);

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(RPC_MIGRATION_SQL);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  return (
    <section
      aria-label="Total Complaints Overview"
      className="w-full bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Top Header & Counter Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Institutional Grievance Ledger</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Total Complaints Overview
          </h2>
          <p className="text-xs text-slate-500">
            Aggregate count of non-spam grievances submitted across BAUST departments to date.
          </p>
        </div>

        {/* Summary Counters + Mode Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-5 sm:gap-6">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total Complaints Filed So Far
              </span>
              {loading ? (
                <div className="mt-1 h-7 w-16 rounded bg-slate-200 animate-pulse" />
              ) : (
                <span className="block text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {stats ? stats.total_complaints : '—'}
                </span>
              )}
            </div>

            <div className="h-9 w-px bg-slate-200" aria-hidden="true" />

            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active
              </span>
              {loading ? (
                <div className="mt-1 h-6 w-10 rounded bg-slate-200 animate-pulse" />
              ) : (
                <span className="block text-lg font-bold font-mono text-amber-600 tabular-nums">
                  {stats ? stats.active_complaints : '—'}
                </span>
              )}
            </div>

            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Resolved
              </span>
              {loading ? (
                <div className="mt-1 h-6 w-10 rounded bg-slate-200 animate-pulse" />
              ) : (
                <span className="block text-lg font-bold font-mono text-emerald-700 tabular-nums">
                  {stats ? stats.resolved_complaints : '—'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setChartMode('trend')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  chartMode === 'trend'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Cumulative Trend</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('department')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                  chartMode === 'department'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>By Department</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void loadStats()}
              disabled={loading}
              aria-label="Refresh complaint statistics"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Body: Loading / RPC Notice / Empty / Chart */}
      {loading ? (
        <div className="h-60 w-full rounded-xl bg-slate-50 border border-slate-100 p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="h-3 w-36 bg-slate-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-8 gap-3 items-end h-36 pt-4">
            <div className="h-10 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-16 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-12 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-24 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-20 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-28 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-32 bg-slate-200 rounded-t animate-pulse" />
            <div className="h-36 bg-slate-200 rounded-t animate-pulse" />
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded" />
        </div>
      ) : rpcMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-900">
                Aggregate Statistics RPC Pending Setup
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Run{' '}
                <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-amber-200">
                  supabase/migrations/20261128_public_complaint_stats_rpc.sql
                </code>{' '}
                in your Supabase SQL Editor to enable live public and dashboard complaint charts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCopySql()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            {copiedSql ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>SQL Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy RPC SQL</span>
              </>
            )}
          </button>
        </div>
      ) : errorMessage ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-1">
          <p className="text-xs font-semibold text-slate-800">
            Could not load aggregate complaint overview
          </p>
          <p className="text-xs text-slate-500">{errorMessage}</p>
        </div>
      ) : !stats || stats.total_complaints === 0 ? (
        <div className="h-52 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center px-6 space-y-1.5">
          <BarChart3 className="w-6 h-6 text-slate-400" />
          <p className="text-sm font-semibold text-slate-800">
            No complaints have been recorded yet
          </p>
          <p className="text-xs text-slate-500 max-w-md">
            Once students or staff submit grievances, cumulative submission volume and departmental totals will appear here automatically.
          </p>
        </div>
      ) : chartMode === 'trend' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Cumulative Complaints Over Time (Non-Spam)</span>
            <span className="font-mono tabular-nums text-slate-600">
              {formattedTrend.length} active {formattedTrend.length === 1 ? 'day' : 'days'} recorded
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={formattedTrend}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="baustCumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    value,
                    name === 'cumulative_total' ? 'Total to Date' : 'Filed on Date',
                  ]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as { date?: string } | undefined;
                    return row?.date ? `Date: ${row.date}` : String(label);
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_total"
                  name="cumulative_total"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fill="url(#baustCumulativeGrad)"
                  dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="count"
                  stroke="#0284c7"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Complaints by BAUST Department</span>
            <span className="font-mono tabular-nums text-slate-600">
              {departmentData.length} {departmentData.length === 1 ? 'department' : 'departments'}
            </span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentData}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="code"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => [value, 'Complaints Filed']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as DepartmentCountPoint | undefined;
                    return row?.name ? `${row.code} — ${row.name}` : String(label);
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {departmentData.map((entry, idx) => (
                    <Cell
                      key={`dept-bar-${entry.code}`}
                      fill={DEPT_BAR_COLORS[idx % DEPT_BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
};
