import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Send,
  MessageSquare,
  Star,
  Lock,
  Copy,
  Loader2,
} from 'lucide-react';
import { Complaint, ComplaintMessage, ComplaintStatus, UserProfile } from '../types/index.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';

interface BAUSTPublicTrackerProps {
  currentUser?: UserProfile | null;
}

export const BAUSTPublicTracker: React.FC<BAUSTPublicTrackerProps> = ({ currentUser }) => {
  const [trackingIdInput, setTrackingIdInput] = useState('');
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [messages, setMessages] = useState<ComplaintMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Feedback, Chat & Reopen State
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [missingRpcSqlNeeded, setMissingRpcSqlNeeded] = useState(false);
  const [copiedRpcSql, setCopiedRpcSql] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live Realtime updates for public messages while tracking a complaint
  useEffect(() => {
    if (!complaint?.id || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`tracker-messages-${complaint.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'complaint_messages',
          filter: `complaint_id=eq.${complaint.id}`,
        },
        (payload) => {
          const incoming = payload.new as ComplaintMessage | undefined;
          if (!incoming || !incoming.id || incoming.is_internal) return;

          const safeMessage: ComplaintMessage =
            complaint.is_anonymous && incoming.sender_id === complaint.user_id
              ? { ...incoming, sender_name: 'Anonymous Student' }
              : incoming;

          setMessages((prev) => {
            if (prev.some((m) => m.id === safeMessage.id)) return prev;
            return [...prev, safeMessage].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [complaint?.id, complaint?.is_anonymous, complaint?.user_id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const trackRpcSql = `CREATE OR REPLACE FUNCTION public.track_complaint_by_id(p_tracking_id VARCHAR)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_complaint RECORD; v_history JSONB; v_messages JSONB; v_feedback JSONB;
BEGIN
    SELECT c.id, c.tracking_id, c.user_id, c.department_id, d.code AS department_code, d.name AS department_name,
           c.category, c.subject, c.description, c.priority, c.is_sos, c.status, c.is_anonymous, c.deadline, c.created_at, c.updated_at
    INTO v_complaint FROM public.complaints c JOIN public.departments d ON d.id = c.department_id
    WHERE UPPER(c.tracking_id) = UPPER(TRIM(p_tracking_id)) LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', h.id, 'complaint_id', h.complaint_id, 'actor_id', h.actor_id, 'actor_name', h.actor_name, 'action', h.action, 'from_status', h.from_status, 'to_status', h.to_status, 'note', h.note, 'created_at', h.created_at) ORDER BY h.created_at ASC), '[]'::jsonb) INTO v_history FROM public.complaint_history h WHERE h.complaint_id = v_complaint.id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'complaint_id', m.complaint_id, 'sender_id', m.sender_id, 'sender_name', CASE WHEN v_complaint.is_anonymous AND m.sender_id = v_complaint.user_id THEN 'Anonymous Student' ELSE m.sender_name END, 'sender_role', m.sender_role, 'body', m.body, 'is_internal', m.is_internal, 'created_at', m.created_at) ORDER BY m.created_at ASC), '[]'::jsonb) INTO v_messages FROM public.complaint_messages m WHERE m.complaint_id = v_complaint.id AND m.is_internal = FALSE;
    SELECT to_jsonb(f.*) INTO v_feedback FROM public.complaint_feedback f WHERE f.complaint_id = v_complaint.id LIMIT 1;
    RETURN jsonb_build_object('id', v_complaint.id, 'tracking_id', v_complaint.tracking_id, 'user_id', v_complaint.user_id, 'department_id', v_complaint.department_id, 'department_code', v_complaint.department_code, 'department_name', v_complaint.department_name, 'category', v_complaint.category, 'subject', v_complaint.subject, 'description', v_complaint.description, 'priority', v_complaint.priority, 'is_sos', v_complaint.is_sos, 'status', v_complaint.status, 'is_anonymous', v_complaint.is_anonymous, 'deadline', v_complaint.deadline, 'created_at', v_complaint.created_at, 'updated_at', v_complaint.updated_at, 'history', v_history, 'messages', v_messages, 'feedback', v_feedback);
END; $$;
REVOKE ALL ON FUNCTION public.track_complaint_by_id(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint_by_id(VARCHAR) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';`;

  const handleTrack = async (e?: React.FormEvent, customId?: string) => {
    if (e) e.preventDefault();
    const id = (customId || trackingIdInput).trim();
    if (!id) return;

    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setMissingRpcSqlNeeded(false);

    try {
      const { data, error } = await supabase.rpc('track_complaint_by_id', {
        p_tracking_id: id,
      });

      let tracked: Complaint | null = null;

      if (error) {
        const lowerMsg = error.message.toLowerCase();
        const isMissingRpc =
          error.code === 'PGRST202' ||
          lowerMsg.includes('schema cache') ||
          lowerMsg.includes('could not find the function');

        if (!isMissingRpc) {
          throw new Error(error.message);
        }

        if (!currentUser) {
          setMissingRpcSqlNeeded(true);
          throw new Error(
            'Public tracking RPC (track_complaint_by_id) has not been created in Supabase yet. Run the SQL snippet below in Supabase SQL Editor, or sign in to track your complaint.'
          );
        }

        const { data: row, error: rowErr } = await supabase
          .from('complaints')
          .select('*, dept:department_id (code, name)')
          .ilike('tracking_id', id)
          .maybeSingle();

        if (rowErr) {
          throw new Error(rowErr.message);
        }
        if (!row) {
          throw new Error('No BAUST grievance found with this tracking ID.');
        }

        const deptObj = Array.isArray((row as any).dept) ? (row as any).dept[0] : (row as any).dept;
        const [{ data: histRows }, { data: msgRows }, { data: fbRow }] = await Promise.all([
          supabase
            .from('complaint_history')
            .select('*')
            .eq('complaint_id', row.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('complaint_messages')
            .select('*')
            .eq('complaint_id', row.id)
            .eq('is_internal', false)
            .order('created_at', { ascending: true }),
          supabase
            .from('complaint_feedback')
            .select('*')
            .eq('complaint_id', row.id)
            .maybeSingle(),
        ]);

        tracked = {
          ...(row as any),
          department_code: deptObj?.code || '',
          department_name: deptObj?.name || '',
          history: (histRows || []) as any[],
          messages: (msgRows || []) as any[],
          feedback: (fbRow as any) || undefined,
        } as Complaint;
      } else {
        if (!data) {
          throw new Error('No BAUST grievance found with this tracking ID.');
        }
        tracked = data as Complaint;
      }

      setComplaint(tracked);
      setMessages(tracked.messages || []);
      setFeedbackSent(Boolean(tracked.feedback));
    } catch (err: any) {
      setComplaint(null);
      setMessages([]);
      setErrorMsg(err.message || 'Tracking ID not found.');
    } finally {
      setLoading(false);
    }
  };

  const canInteractAsStakeholder =
    Boolean(currentUser) &&
    Boolean(complaint) &&
    (currentUser!.id === complaint!.user_id ||
      currentUser!.role === 'super_admin' ||
      currentUser!.department_id === complaint!.department_id);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint || !currentUser || !newMessage.trim() || !isSupabaseConfigured || sendingMessage) {
      return;
    }

    setSendingMessage(true);
    setErrorMsg(null);
    try {
      const senderName =
        complaint.is_anonymous && currentUser.id === complaint.user_id
          ? 'Anonymous Student'
          : currentUser.full_name;

      const { data, error } = await supabase
        .from('complaint_messages')
        .insert({
          complaint_id: complaint.id,
          sender_id: currentUser.id,
          sender_name: senderName,
          sender_role: currentUser.role,
          body: newMessage.trim(),
          is_internal: false,
        })
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        const inserted = data as ComplaintMessage;
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        setNewMessage('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!complaint || !currentUser || !isSupabaseConfigured || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from('complaint_feedback').insert({
        complaint_id: complaint.id,
        rating,
        comment: comment.trim(),
      });
      if (error) {
        if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
          setFeedbackSent(true);
          return;
        }
        throw error;
      }
      setFeedbackSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleReopenSubmit = async () => {
    if (!complaint || !currentUser || !reopenReason.trim() || !isSupabaseConfigured || reopenSubmitting) {
      return;
    }

    setReopenSubmitting(true);
    setErrorMsg(null);
    try {
      const prevStatus = complaint.status;
      const { error } = await supabase
        .from('complaints')
        .update({ status: 'reopened' })
        .eq('id', complaint.id);

      if (error) throw error;

      await supabase.from('complaint_history').insert({
        complaint_id: complaint.id,
        actor_id: currentUser.id,
        actor_name: currentUser.full_name,
        action: 'REOPENED',
        from_status: prevStatus,
        to_status: 'reopened',
        note: `Student reopened grievance. Reason: "${reopenReason.trim()}"`,
      });

      setShowReopenBox(false);
      setReopenReason('');
      await handleTrack(undefined, complaint.tracking_id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reopen grievance.');
    } finally {
      setReopenSubmitting(false);
    }
  };

  const steps: ComplaintStatus[] = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved'];
  const currentStepIndex = complaint ? steps.indexOf(complaint.status as any) : -1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          BAUST Grievance Public Tracking Engine
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Bangladesh Army University of Science and Technology. Enter your official BAUST tracking
          ID (e.g., <span className="font-mono">CMP-BAUST-2026-XXXXXX</span>) to inspect resolution progress.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
        <form onSubmit={(e) => void handleTrack(e)} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={trackingIdInput}
              onChange={(e) => setTrackingIdInput(e.target.value)}
              placeholder="Enter Tracking ID (e.g. CMP-BAUST-2026-104821)"
              required
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !trackingIdInput.trim()}
            className="w-full sm:w-auto px-6 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors shrink-0 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Track Ticket'}
          </button>
        </form>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl space-y-2.5">
          <div className="text-center font-medium">{errorMsg}</div>
          {missingRpcSqlNeeded && (
            <div className="space-y-2 pt-1">
              <pre className="p-2.5 bg-slate-900 text-emerald-300 rounded-lg overflow-x-auto max-h-36 text-[10px] font-mono select-all whitespace-pre-wrap text-left">
                {trackRpcSql}
              </pre>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(trackRpcSql);
                    setCopiedRpcSql(true);
                    setTimeout(() => setCopiedRpcSql(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedRpcSql ? 'SQL Fix Copied!' : 'Copy SQL Fix for Supabase'}</span>
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-[11px] transition-colors"
                >
                  <span>Sign In to Track</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complaint Result */}
      {complaint && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-6">
          {/* Header Card */}
          <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm sm:text-base font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 sm:px-3 py-1 rounded border border-emerald-200">
                  {complaint.tracking_id}
                </span>

                <span className="text-xs font-bold text-slate-800 bg-slate-200/80 px-2 py-0.5 rounded uppercase">
                  Target: {complaint.department_code}
                </span>

                {complaint.is_sos && (
                  <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded border border-rose-300 uppercase flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Critical SOS
                  </span>
                )}
              </div>

              <span className="text-xs font-semibold text-slate-600">
                Routed to: {complaint.department_name}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-3">{complaint.subject}</h2>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-2">
              <span>{complaint.category}</span>
              <span aria-hidden="true">·</span>
              <span>Priority: {complaint.priority.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>Registered {new Date(complaint.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* 5-Step Progress Bar */}
          <div className="px-4 sm:px-6 py-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
              Lifecycle Progress
            </h3>

            <div className="flex items-start justify-between relative px-1 sm:px-2 gap-1">
              <div className="absolute left-5 right-5 top-3 sm:top-4 h-0.5 bg-slate-200 -z-0"></div>
              {steps.map((st, index) => {
                const isCompleted = currentStepIndex >= index;
                const isCurrent = complaint.status === st;

                return (
                  <div key={st} className="flex flex-col items-center relative z-10 flex-1 min-w-0">
                    <div
                      className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all ${
                        isCurrent
                          ? 'bg-emerald-700 text-white ring-4 ring-emerald-100'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-400 border border-slate-300'
                      }`}
                    >
                      {isCompleted && !isCurrent ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : index + 1}
                    </div>
                    <span
                      className={`text-[9px] sm:text-xs mt-1.5 capitalize text-center leading-tight ${
                        isCurrent
                          ? 'font-bold text-emerald-800'
                          : isCompleted
                          ? 'font-medium text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grievance Statement */}
          <div className="px-4 sm:px-6">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Grievance Details
            </h3>
            <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {complaint.description}
            </div>
          </div>

          {/* Action History */}
          <div className="px-4 sm:px-6">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Department Action Log
            </h3>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden bg-white">
              {complaint.history && complaint.history.length > 0 ? (
                complaint.history.map((h, i) => (
                  <div key={h.id} className="p-3 text-xs flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{h.actor_name}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(h.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{h.note}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  Complaint registered. Department initial review in progress.
                </div>
              )}
            </div>
          </div>

          {/* Feedback & Reopen (Authenticated Complainant Only) */}
          {(complaint.status === 'resolved' || complaint.status === 'closed') && (
            <div className="mx-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">Grievance Resolved</h4>
                  <p className="text-[11px] text-emerald-800">
                    Satisfaction & reopening controls for {complaint.department_code}.
                  </p>
                </div>
                {currentUser && currentUser.id === complaint.user_id && (
                  <button
                    type="button"
                    onClick={() => setShowReopenBox(!showReopenBox)}
                    className="px-3 py-1 text-xs font-semibold text-rose-700 bg-white border border-rose-300 rounded hover:bg-rose-50"
                  >
                    Reopen Issue
                  </button>
                )}
              </div>

              {feedbackSent || complaint.feedback ? (
                <div className="p-3 bg-white rounded border border-emerald-200 text-xs text-slate-800">
                  <div className="flex items-center gap-1 text-amber-500 mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${
                          s <= (complaint.feedback?.rating || rating)
                            ? 'fill-current text-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p>"{complaint.feedback?.comment || comment || 'Thank you for your rating!'}"</p>
                </div>
              ) : currentUser && currentUser.id === complaint.user_id ? (
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-emerald-200">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" onClick={() => setRating(s)}>
                        <Star
                          className={`w-4 h-4 ${
                            s <= rating ? 'fill-current text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comment on resolution..."
                    className="flex-1 px-3 py-1 text-xs bg-white border border-slate-300 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => void handleFeedbackSubmit()}
                    disabled={feedbackSubmitting}
                    className="px-4 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                  >
                    {feedbackSubmitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800 pt-1">
                  Sign in as the complainant to submit a rating or reopen this ticket.
                </p>
              )}

              {showReopenBox && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded space-y-2">
                  <input
                    type="text"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    disabled={reopenSubmitting}
                    placeholder="State reason for reopening..."
                    className="w-full p-2 text-xs bg-white border border-slate-300 rounded disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => void handleReopenSubmit()}
                    disabled={!reopenReason.trim() || reopenSubmitting}
                    className="px-4 py-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                  >
                    {reopenSubmitting ? 'Reopening...' : 'Confirm Reopen'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live Chat with Department */}
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/60 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Department Communication Log ({complaint.department_code})
              </h3>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2.5 p-3 bg-white rounded-lg border border-slate-200">
              {messages.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No chat messages exchanged yet.
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="text-xs space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-700">{m.sender_name}</span>
                      <span className="uppercase text-[9px] px-1 bg-slate-100 rounded">
                        {m.sender_role}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 text-slate-800 rounded border border-slate-200 max-w-lg leading-relaxed">
                      {m.body}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {canInteractAsStakeholder ? (
              <form onSubmit={(e) => void handleSendMessage(e)} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sendingMessage}
                  placeholder="Ask assigned department officer..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  className="px-3.5 sm:px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Sign in with your verified BAUST account to post messages on this ticket.</span>
                </div>
                {!currentUser && (
                  <Link
                    to="/login"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md shrink-0 self-start sm:self-auto"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
