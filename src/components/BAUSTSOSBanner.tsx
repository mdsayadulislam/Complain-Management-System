import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Complaint } from '../types/index.ts';

interface BAUSTSOSBannerProps {
  sosComplaint: Complaint | null;
  onTriageClick: (complaint: Complaint) => void;
}

export const BAUSTSOSBanner: React.FC<BAUSTSOSBannerProps> = ({
  sosComplaint,
  onTriageClick,
}) => {
  if (!sosComplaint || sosComplaint.status === 'resolved' || sosComplaint.status === 'closed') {
    return null;
  }

  return (
    <div className="bg-rose-950/95 text-rose-100 border-b border-rose-800/80 px-4 py-2.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs md:text-sm">
        <div className="flex items-center gap-2.5 text-center sm:text-left">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shrink-0 font-bold text-xs animate-pulse">
            !
          </span>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="font-semibold text-white tracking-tight uppercase text-xs bg-rose-700/60 px-2 py-0.5 rounded">
              BAUST Emergency SOS Incident
            </span>
            <span className="font-mono text-rose-300 font-semibold">{sosComplaint.tracking_id}</span>
            <span className="hidden sm:inline text-rose-400">·</span>
            <span className="font-semibold text-rose-200 uppercase text-[11px] bg-rose-900/60 px-1.5 py-0.2 rounded">
              Routed to: {sosComplaint.department_code}
            </span>
            <span className="hidden sm:inline text-rose-400">·</span>
            <span className="font-medium text-rose-100 truncate max-w-md">{sosComplaint.subject}</span>
          </div>
        </div>

        <button
          onClick={() => onTriageClick(sosComplaint)}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded transition-colors shrink-0 shadow-sm"
        >
          <span>Priority Triage</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
