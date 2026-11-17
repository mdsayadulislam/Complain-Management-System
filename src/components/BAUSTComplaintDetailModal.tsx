import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  AlertTriangle,
  User,
  Paperclip,
  CheckCircle,
  MessageSquare,
  Lock,
  Send,
  Star,
  Eye,
  ArrowRightLeft,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  Complaint,
  ComplaintAttachment,
  ComplaintMessage,
  ComplaintStatus,
  UserProfile,
  BAUSTDepartment,
} from '../types/index.ts';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { BAUSTForwardModal } from './BAUSTForwardModal.tsx';

function extractComplaintStoragePath(att: ComplaintAttachment): string | null {
  if (att.storage_path && att.storage_path.trim()) {
    return att.storage_path.trim();
  }
  if (att.file_url) {
    const match = att.file_url.match(
      /\/storage\/v1\/object\/(?:sign|public|authenticated)\/complaint-attachments\/([^?#]+)/i
    );
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

interface BAUSTComplaintDetailModalProps {
  complaintId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  departments?: BAUSTDepartment[];
  onRefresh: () => void;
}

export const BAUSTComplaintDetailModal: React.FC<BAUSTComplaintDetailModalProps> = ({
  complaintId,
  isOpen,
  onClose,
  currentUser,
  departments = [],
  onRefresh,
}) => {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [messages, setMessages] = useState<ComplaintMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
  const [chatChannel, setChatChannel] = useState<'public' | 'internal'>('public');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<ComplaintStatus>('in_progress');
  const [statusNote, setStatusNote] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealJustification, setRevealJustification] = useState('');
  const [revealSubmitting, setRevealSubmitting] = useState(false);

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  const [sendingMessage, setSendingMessage] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [freshAttachmentUrls, setFreshAttachmentUrls] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canManage =
    currentUser.role === 'super_admin' ||
    ((currentUser.role === 'office_head' ||
      currentUser.role === 'dept_admin' ||
      currentUser.role === 'staff' ||
      currentUser.role === 'officer') &&
      currentUser.department_id === complaint?.department_id);

  useEffect(() => {
    if (isOpen && complaintId) {
      setFreshAttachmentUrls({});
      void loadComplaintData(complaintId);
    } else {
      setComplaint(null);
      setMessages([]);
      setFreshAttachmentUrls({});
      setActionError(null);
    }
  }, [isOpen, complaintId]);

  // Live Realtime subscription for complaint_messages while the detail modal is open
  useEffect(() => {
    if (!isOpen || !complaintId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`complaint-messages-${complaintId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'complaint_messages',
          filter: `complaint_id=eq.${complaintId}`,
        },
        (payload) => {
          const incoming = payload.new as ComplaintMessage | undefined;
          if (!incoming || !incoming.id) return;
          if (incoming.is_internal && currentUser.role === 'student') return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOpen, complaintId, currentUser.role]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTab, chatChannel]);

  const loadComplaintData = async (id: string) => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setActionError(null);

    try {
      const { data: cData, error: cError } = await supabase
        .from('complaints')
        .select(
          `
          *,
          dept:department_id (code, name),
          from_dept:forwarded_from_department_id (code, name),
          owner:user_id (full_name, student_or_emp_id, email),
          complaint_attachments (*),
          complaint_history (*),
          complaint_messages (*),
          complaint_feedback (*)
        `
        )
        .eq('id', id)
        .single();

      if (cError || !cData) {
        throw new Error(cError?.message || 'Unable to load complaint record.');
      }

      const deptObj = Array.isArray((cData as any).dept)
        ? (cData as any).dept[0]
        : (cData as any).dept;
      const fromDeptObj = Array.isArray((cData as any).from_dept)
        ? (cData as any).from_dept[0]
        : (cData as any).from_dept;
      const ownerObj = Array.isArray((cData as any).owner)
        ? (cData as any).owner[0]
        : (cData as any).owner;

      const isMasked =
        Boolean(cData.is_anonymous) &&
        !cData.revealed_by_admin &&
        currentUser.role !== 'super_admin' &&
        cData.user_id !== currentUser.id;

      const historyList = Array.isArray((cData as any).complaint_history)
        ? [...(cData as any).complaint_history].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        : [];

      const feedbackList = Array.isArray((cData as any).complaint_feedback)
        ? (cData as any).complaint_feedback
        : (cData as any).complaint_feedback
        ? [(cData as any).complaint_feedback]
        : [];

      const msgList: ComplaintMessage[] = Array.isArray((cData as any).complaint_messages)
        ? [...(cData as any).complaint_messages].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        : [];

      const hydrated: Complaint = {
        ...cData,
        student_name: isMasked ? 'Anonymous Student' : ownerObj?.full_name || 'Student',
        student_id: isMasked ? 'BAUST-CONFIDENTIAL' : ownerObj?.student_or_emp_id || '',
        student_email: isMasked ? 'confidential@baust.edu.bd' : ownerObj?.email || '',
        department_code: deptObj?.code,
        department_name: deptObj?.name,
        forwarded_from_department_code: fromDeptObj?.code,
        forwarded_from_department_name: fromDeptObj?.name,
        attachments: (cData as any).complaint_attachments || [],
        history: historyList,
        feedback: feedbackList[0] || null,
      };

      setComplaint(hydrated);
      setMessages(msgList);
      setFeedbackDone(Boolean(feedbackList[0]));
    } catch (err: any) {
      setActionError(err.message || 'Failed to load grievance details.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAttachment = async (att: ComplaintAttachment) => {
    setActionError(null);
    const storagePath = extractComplaintStoragePath(att);
    let targetUrl = freshAttachmentUrls[att.id] || att.file_url;

    if (storagePath && isSupabaseConfigured) {
      setOpeningAttachmentId(att.id);
      try {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('complaint-attachments')
          .createSignedUrl(storagePath, 3600);

        if (signedError) {
          throw new Error(signedError.message);
        }

        if (signedData?.signedUrl) {
          targetUrl = signedData.signedUrl;
          setFreshAttachmentUrls((prev) => ({
            ...prev,
            [att.id]: signedData.signedUrl,
          }));
        }
      } catch (err: any) {
        if (!targetUrl) {
          setActionError(`Unable to generate secure file link: ${err.message || 'Access denied'}`);
          setOpeningAttachmentId(null);
          return;
        }
      } finally {
        setOpeningAttachmentId(null);
      }
    }

    if (targetUrl) {
      const link = document.createElement('a');
      link.href = targetUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint || !newMessage.trim() || !isSupabaseConfigured || sendingMessage) return;

    const isInternal = chatChannel === 'internal' && currentUser.role !== 'student';
    const senderName =
      complaint.is_anonymous &&
      currentUser.id === complaint.user_id &&
      !complaint.revealed_by_admin
        ? 'Anonymous Student'
        : currentUser.full_name;

    setSendingMessage(true);
    setActionError(null);
    try {
      const { data, error } = await supabase
        .from('complaint_messages')
        .insert({
          complaint_id: complaint.id,
          sender_id: currentUser.id,
          sender_name: senderName,
          sender_role: currentUser.role,
          body: newMessage.trim(),
          is_internal: isInternal,
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        const inserted = data as ComplaintMessage;
        setMessages((prev) =>
          prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
        );
        setNewMessage('');
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  // BUG 6: Atomic status transition via PostgreSQL RPC update_complaint_status (with RLS-safe fallback if RPC not yet deployed)
  const handleStatusSubmit = async () => {
    if (!complaint || !statusNote.trim() || !isSupabaseConfigured) return;

    const trimmedNote = statusNote.trim();
    if (trimmedNote.length < 3) {
      setActionError('A mandatory rationale note (minimum 3 characters) is required.');
      return;
    }

    setStatusSubmitting(true);
    setActionError(null);

    try {
      const { error } = await supabase.rpc('update_complaint_status', {
        p_complaint_id: complaint.id,
        p_new_status: targetStatus,
        p_note: trimmedNote,
      });

      if (error) {
        const lowerMsg = error.message.toLowerCase();
        const isMissingRpc =
          error.code === 'PGRST202' ||
          lowerMsg.includes('schema cache') ||
          lowerMsg.includes('could not find the function');

        if (!isMissingRpc) {
          throw new Error(error.message);
        }

        // Fallback when supabase/fixes.sql RPC hasn't been executed yet:
        // RLS policy on public.complaints still strictly enforces department/admin isolation.
        const prevStatus = complaint.status;
        const { error: updateErr } = await supabase
          .from('complaints')
          .update({ status: targetStatus, updated_at: new Date().toISOString() })
          .eq('id', complaint.id);

        if (updateErr) {
          throw new Error(updateErr.message);
        }

        const { error: histErr } = await supabase.from('complaint_history').insert({
          complaint_id: complaint.id,
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          action: 'STATUS_UPDATED',
          from_status: prevStatus,
          to_status: targetStatus,
          note: trimmedNote,
        });

        if (histErr) {
          throw new Error(`Status updated, but history log failed: ${histErr.message}`);
        }

        await supabase.from('audit_logs').insert({
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'STATUS_TRANSITION',
          target: complaint.tracking_id,
          details: `Transitioned status from ${prevStatus} to ${targetStatus}. Note: ${trimmedNote}`,
        });
      }

      setStatusModalOpen(false);
      setStatusNote('');
      await loadComplaintData(complaint.id);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Status transition failed.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleRevealSubmit = async () => {
    if (
      !complaint ||
      revealJustification.trim().length < 10 ||
      !isSupabaseConfigured ||
      revealSubmitting
    ) {
      return;
    }

    setRevealSubmitting(true);
    setActionError(null);
    try {
      const { error } = await supabase
        .from('complaints')
        .update({ revealed_by_admin: true })
        .eq('id', complaint.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        actor_id: currentUser.id,
        actor_name: currentUser.full_name,
        actor_role: currentUser.role,
        action: 'REVEAL_ANONYMOUS_IDENTITY',
        target: complaint.tracking_id,
        details: `Whistleblower unmasked by Super Admin. Justification: "${revealJustification.trim()}"`,
      });

      await supabase.from('complaint_history').insert({
        complaint_id: complaint.id,
        actor_id: currentUser.id,
        actor_name: currentUser.full_name,
        action: 'IDENTITY_REVEALED',
        from_status: complaint.status,
        to_status: complaint.status,
        note: `Whistleblower identity unmasked under disciplinary inquiry.`,
      });

      setRevealModalOpen(false);
      setRevealJustification('');
      await loadComplaintData(complaint.id);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to unmask identity.');
    } finally {
      setRevealSubmitting(false);
    }
  };

  const handleReopenSubmit = async () => {
    if (!complaint || !reopenReason.trim() || !isSupabaseConfigured || reopenSubmitting) return;

    setReopenSubmitting(true);
    setActionError(null);
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

      setReopenModalOpen(false);
      setReopenReason('');
      await loadComplaintData(complaint.id);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reopen grievance.');
    } finally {
      setReopenSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!complaint || !isSupabaseConfigured || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    setActionError(null);
    try {
      const { error } = await supabase.from('complaint_feedback').insert({
        complaint_id: complaint.id,
        rating: feedbackRating,
        comment: feedbackComment.trim(),
      });
      if (error) {
        if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
          setFeedbackDone(true);
          await loadComplaintData(complaint.id);
          return;
        }
        throw error;
      }
      setFeedbackDone(true);
      await loadComplaintData(complaint.id);
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (loading && !complaint) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
        <div className="bg-white rounded-xl p-8 text-xs font-mono text-slate-600 shadow-2xl">
          Loading BAUST grievance details...
        </div>
      </div>
    );
  }

  if (!complaint) return null;

  const steps: ComplaintStatus[] = ['submitted', 'under_review', 'assigned', 'in_progress', 'resolved'];
  const currentStepIndex = steps.indexOf(complaint.status as any);
  const filteredMessages = messages.filter((m) => (chatChannel === 'internal' ? m.is_internal : !m.is_internal));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-4 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-mono font-bold text-emerald-800 bg-emerald-50 px-2 sm:px-2.5 py-1 rounded border border-emerald-200">
              {complaint.tracking_id}
            </span>
            {complaint.is_sos && (
              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300 uppercase">
                <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-600" />
                Critical SOS
              </span>
            )}
            <span className="text-[11px] sm:text-xs font-bold text-slate-800 uppercase bg-slate-200/80 px-2 py-0.5 rounded">
              Target: {complaint.department_code}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <div className="flex items-center p-1 bg-slate-200 rounded-lg text-[11px] sm:text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'details' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === 'chat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat ({messages.length})</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              aria-label="Close detail modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-3 sm:px-6 py-3 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between relative px-1 sm:px-2 gap-1">
            <div className="absolute left-5 right-5 top-3 sm:top-3.5 h-0.5 bg-slate-200 -z-0"></div>
            {steps.map((st, index) => {
              const isCompleted = currentStepIndex >= index;
              const isCurrent = complaint.status === st;

              return (
                <div key={st} className="flex flex-col items-center relative z-10 flex-1 min-w-0">
                  <div
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-emerald-700 text-white ring-4 ring-emerald-100'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-400 border border-slate-300'
                    }`}
                  >
                    {isCompleted && !isCurrent ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : index + 1}
                  </div>
                  <span
                    className={`text-[9px] sm:text-[10px] mt-1 capitalize text-center leading-tight ${
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

        {actionError && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
            {actionError}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'details' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
                  {complaint.subject}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-2">
                  <span className="font-bold text-emerald-800">{complaint.department_name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{complaint.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">Priority: {complaint.priority}</span>
                  <span aria-hidden="true">·</span>
                  <span>Registered {new Date(complaint.created_at).toLocaleString()}</span>
                </div>

                {complaint.forwarded_from_department_name && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-xs text-amber-950 shadow-xs">
                    <ArrowRightLeft className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="font-bold text-amber-900">
                          Transferred from {complaint.forwarded_from_department_name}
                        </strong>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded font-bold">
                          {complaint.forwarded_from_department_code || 'PREV'} → {complaint.department_code}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Transfer Rationale: "{complaint.forwarded_reason}"
                      </p>
                      {complaint.forwarded_at && (
                        <span className="text-[10px] text-amber-700/80 font-mono block">
                          Forwarded at: {new Date(complaint.forwarded_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Complainant
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    {complaint.is_anonymous ? (
                      <div className="flex items-center gap-1 text-slate-800">
                        <Shield className="w-4 h-4 text-emerald-700" />
                        <span className="font-semibold">
                          {complaint.revealed_by_admin
                            ? `${complaint.student_name} (${complaint.student_id})`
                            : 'Anonymous Student'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-slate-800">
                        <User className="w-4 h-4 text-slate-500" />
                        <span className="font-semibold">{complaint.student_name}</span>
                      </div>
                    )}
                  </div>
                  {complaint.is_anonymous && !complaint.revealed_by_admin && currentUser.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setRevealModalOpen(true)}
                      className="mt-1 text-[11px] text-rose-700 underline font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Legal Identity Reveal (Super Admin)</span>
                    </button>
                  )}
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Target BAUST Wing
                  </span>
                  <div className="mt-1 font-semibold text-slate-900">
                    {complaint.department_name}
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Isolated to {complaint.department_code} Admin
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    SLA Deadline
                  </span>
                  <div className="mt-1 font-mono text-slate-800 font-medium">
                    {complaint.deadline ? new Date(complaint.deadline).toLocaleString() : 'Standard 48h'}
                  </div>
                </div>
              </div>

              {/* Statement */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Statement of Grievance
                </h3>
                <div className="p-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {complaint.description}
                </div>
              </div>

              {/* Attachments */}
              {complaint.attachments && complaint.attachments.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Evidence Attachments ({complaint.attachments.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {complaint.attachments.map((att) => {
                      const isOpening = openingAttachmentId === att.id;
                      const freshUrl = freshAttachmentUrls[att.id];
                      return (
                        <div
                          key={att.id}
                          className="p-3 border border-slate-200 rounded-lg flex items-center justify-between gap-2 bg-slate-50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span className="text-xs font-semibold text-slate-800 truncate">
                              {att.file_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {freshUrl ? (
                              <a
                                href={freshUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-emerald-700 underline font-semibold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Open File</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleOpenAttachment(att)}
                                disabled={isOpening}
                                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 underline font-semibold disabled:opacity-50 cursor-pointer"
                              >
                                {isOpening ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Signing...</span>
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Open File</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Feedback and Reopen */}
              {(complaint.status === 'resolved' || complaint.status === 'closed') && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950">
                        Issue Resolved by {complaint.department_code}
                      </h4>
                      <p className="text-[11px] text-emerald-800">
                        Rate the resolution efficiency or reopen if unsatisfied.
                      </p>
                    </div>

                    {complaint.user_id === currentUser.id && (
                      <button
                        type="button"
                        onClick={() => setReopenModalOpen(true)}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-300 rounded hover:bg-rose-50"
                      >
                        Reopen Grievance
                      </button>
                    )}
                  </div>

                  {complaint.feedback || feedbackDone ? (
                    <div className="p-3 bg-white rounded border border-emerald-200 text-xs text-slate-800">
                      <div className="flex items-center gap-1 text-amber-500 mb-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= (complaint.feedback?.rating || feedbackRating)
                                ? 'fill-current text-amber-400'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p>"{complaint.feedback?.comment || feedbackComment || 'Resolution acknowledged.'}"</p>
                    </div>
                  ) : (
                    complaint.user_id === currentUser.id && (
                      <div className="pt-2 border-t border-emerald-200/60 flex flex-col sm:flex-row gap-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button key={s} type="button" onClick={() => setFeedbackRating(s)}>
                              <Star
                                className={`w-4 h-4 ${
                                  s <= feedbackRating ? 'fill-current text-amber-400' : 'text-slate-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          placeholder="Add comments on departmental action..."
                          className="flex-1 px-3 py-1 text-xs bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => void handleFeedbackSubmit()}
                          disabled={feedbackSubmitting}
                          className="px-4 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                        >
                          {feedbackSubmitting ? 'Submitting...' : 'Submit Rating'}
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Immutable History Timeline */}
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Official Immutable Timeline & Rationale History
                </h3>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {complaint.history && complaint.history.length > 0 ? (
                    complaint.history.map((h, i) => (
                      <div key={h.id} className="p-3 text-xs flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800">{h.actor_name}</span>
                              {h.from_status && h.to_status && h.from_status !== h.to_status && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                  {h.from_status} → {h.to_status}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(h.created_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1 bg-slate-50 p-2 rounded border border-slate-100">
                            {h.note}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Grievance registered. Awaiting initial department triage.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Live Chat Panel */
            <div className="flex flex-col h-full min-h-[420px]">
              {canManage && (
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg text-xs font-medium mb-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setChatChannel('public')}
                    className={`flex-1 py-1.5 rounded-md transition-colors ${
                      chatChannel === 'public'
                        ? 'bg-white text-slate-900 font-semibold shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Student Complainant Channel
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatChannel('internal')}
                    className={`flex-1 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                      chatChannel === 'internal'
                        ? 'bg-amber-100 text-amber-950 font-semibold shadow-xs border border-amber-300'
                        : 'text-slate-600'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Confidential Staff Notes</span>
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50/70 rounded-lg border border-slate-200">
                {filteredMessages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No messages recorded in this channel yet.
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isMe = msg.sender_id === currentUser.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5">
                          <span className="font-semibold text-slate-700">{msg.sender_name}</span>
                          <span className="uppercase text-[9px] px-1 bg-slate-200 rounded">
                            {msg.sender_role}
                          </span>
                        </div>
                        <div
                          className={`max-w-md p-3 rounded-lg text-xs leading-relaxed ${
                            isMe
                              ? 'bg-emerald-700 text-white rounded-br-xs'
                              : msg.is_internal
                              ? 'bg-amber-50 text-amber-950 border border-amber-200 rounded-bl-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-2 shrink-0">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sendingMessage}
                  placeholder={
                    chatChannel === 'internal'
                      ? 'Type internal staff note (confidential)...'
                      : 'Type response to student complainant...'
                  }
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
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
            </div>
          )}
        </div>

        {/* Operational Admin Footer */}
        {canManage && (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
            <span className="text-xs font-bold text-slate-700">
              Department Authority Action ({complaint.department_code}):
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setForwardModalOpen(true)}
                className="flex-1 sm:flex-none justify-center px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
                <span>Forward Dept</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusModalOpen(true)}
                className="flex-1 sm:flex-none justify-center px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Update Lifecycle Status
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Atomic Status Update Modal (calls update_complaint_status RPC) */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Update Case Status: {complaint.tracking_id}
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Target Status
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as ComplaintStatus)}
                className="w-full p-2 border border-slate-300 rounded text-xs bg-white text-slate-900"
              >
                <option value="under_review">Under Review</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Mandatory Departmental Rationale Note *
              </label>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={3}
                placeholder="State the technical or administrative actions taken..."
                required
                className="w-full p-2 border border-slate-300 rounded text-xs text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleStatusSubmit()}
                disabled={!statusNote.trim() || statusSubmitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded"
              >
                {statusSubmitting ? 'Saving...' : 'Save Status Transition'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Reveal Modal */}
      {revealModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>Super Admin Whistleblower Identity Reveal</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              This action unmasks the student's name and ID. An entry will be permanently logged in the
              BAUST <strong>audit_logs</strong> table.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Inquiry & Disciplinary Authorization Justification * (min 10 chars)
              </label>
              <textarea
                value={revealJustification}
                onChange={(e) => setRevealJustification(e.target.value)}
                rows={3}
                placeholder="State the official inquiry reference or vice chancellor directive..."
                className="w-full p-2 border border-slate-300 rounded text-xs text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRevealModalOpen(false)}
                disabled={revealSubmitting}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRevealSubmit()}
                disabled={revealJustification.trim().length < 10 || revealSubmitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded"
              >
                {revealSubmitting ? 'Revealing...' : 'Confirm Reveal & Write Audit Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Reopen Grievance</h3>
            <textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={3}
              disabled={reopenSubmitting}
              placeholder="Explain why the resolution was incomplete or if the problem reoccurred..."
              className="w-full p-2 border border-slate-300 rounded text-xs text-slate-900 disabled:bg-slate-100"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReopenModalOpen(false)}
                disabled={reopenSubmitting}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReopenSubmit()}
                disabled={!reopenReason.trim() || reopenSubmitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded"
              >
                {reopenSubmitting ? 'Reopening...' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inter-Department Forward Modal */}
      <BAUSTForwardModal
        complaint={complaint}
        departments={departments}
        currentUser={currentUser}
        isOpen={forwardModalOpen}
        onClose={() => setForwardModalOpen(false)}
        onSuccess={(updated) => {
          setComplaint(updated);
          onRefresh();
          onClose();
        }}
      />
    </div>
  );
};
