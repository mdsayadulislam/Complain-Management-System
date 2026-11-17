import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw, Search } from 'lucide-react';
import { AuditLogItem } from '../types/index.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

export const BAUSTAuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    if (!isSupabaseConfigured) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        setLogs(data as AuditLogItem[]);
      } else {
        setLogs([]);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor_name.toLowerCase().includes(q) ||
      log.target.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              BAUST Security & Institutional Compliance Audit Log
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
              RESTRICTED (SUPER ADMIN)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable legal ledger recording identity unmaskings, status transitions, and sensitive administrative actions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAuditLogs()}
          className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 text-xs flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-white block">
            Cryptographic Integrity & Whistleblower Protection Protocol
          </span>
          <p className="text-slate-400 mt-0.5 leading-relaxed">
            Every unmasking of an anonymous grievance, status update, or inter-department transfer is
            permanently recorded with the administrator&apos;s account identifier and precise timestamp.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 border border-slate-200 rounded-xl">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, administrator, or target ID..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        <span className="text-slate-500 text-xs font-mono">{filtered.length} verified record(s)</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Security Action</th>
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">Audit Details & Justification</th>
                <th className="px-4 py-3">Client IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans text-xs">
                    Loading security audit logs...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans text-xs">
                    No audit records found matching the query.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const isReveal = log.action === 'REVEAL_ANONYMOUS_IDENTITY';
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isReveal ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {new Date(log.created_at).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-sans font-semibold">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] ${
                            isReveal
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-sans font-medium text-slate-800">
                        {log.actor_name}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap uppercase text-[10px] text-slate-500 font-sans font-semibold">
                        {log.actor_role}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-emerald-800 font-bold">
                        {log.target}
                      </td>

                      <td className="px-4 py-3 font-sans text-slate-700 max-w-md leading-relaxed">
                        {log.details}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">{log.ip_address}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
