import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  GraduationCap,
  BookOpen,
  Building2,
  ArrowRight,
  Loader2,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import {
  DemoAccount,
  DemoCategory,
  DEMO_ACCOUNT_CATEGORIES,
  DEMO_COMMON_PASSWORD,
} from '../config/demoAccounts.ts';

interface DemoLoginPanelProps {
  onSelectAccount: (account: DemoAccount) => void;
  loading?: boolean;
  selectedAccountEmail?: string | null;
  defaultOpen?: boolean;
}

export const DemoLoginPanel: React.FC<DemoLoginPanelProps> = ({
  onSelectAccount,
  loading = false,
  selectedAccountEmail = null,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeCategoryId, setActiveCategoryId] = useState<DemoCategory['id']>('students');
  const [submittingEmail, setSubmittingEmail] = useState<string | null>(null);

  const activeCategory =
    DEMO_ACCOUNT_CATEGORIES.find((c) => c.id === activeCategoryId) || DEMO_ACCOUNT_CATEGORIES[0];

  const handleAccountClick = (account: DemoAccount) => {
    if (loading) return;
    setSubmittingEmail(account.email);
    onSelectAccount(account);
  };

  const getCategoryIcon = (id: DemoCategory['id']) => {
    switch (id) {
      case 'students':
        return <GraduationCap className="w-3.5 h-3.5 shrink-0" />;
      case 'academic':
        return <BookOpen className="w-3.5 h-3.5 shrink-0" />;
      case 'administration':
        return <Building2 className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  return (
    <div className="w-full mt-4 pt-3.5 border-t border-slate-200">
      {/* Sleek Accordion Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group ${
          isOpen
            ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
            : 'bg-slate-50/90 hover:bg-emerald-50/40 border-slate-200 hover:border-emerald-300'
        }`}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
              isOpen
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-950">
                Demo Accounts & Quick Login
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                12 Roles
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              One-click instant login for evaluators & testers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pl-2 text-slate-400 group-hover:text-emerald-700 shrink-0">
          <span className="text-[11px] font-semibold hidden sm:inline">
            {isOpen ? 'Hide Panel' : 'Quick Fill'}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-700' : ''}`}
          />
        </div>
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="mt-3 p-3 sm:p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3 transition-all animate-in fade-in-50 duration-200">
          {/* Header Info */}
          <div className="flex items-center justify-between text-[11px] text-slate-600 px-0.5">
            <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Select any demo account below to auto-fill & login instantly.</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
              <KeyRound className="w-3 h-3 text-slate-400" />
              <span>Password: {DEMO_COMMON_PASSWORD}</span>
            </div>
          </div>

          {/* 3 Categories / Tabs */}
          <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
            {DEMO_ACCOUNT_CATEGORIES.map((category) => {
              const isActive = activeCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategoryId(category.id)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 text-center ${
                    isActive
                      ? 'bg-white text-emerald-950 font-bold shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  {getCategoryIcon(category.id)}
                  <span className="truncate hidden sm:inline">{category.title}</span>
                  <span className="truncate sm:hidden">{category.shortTitle}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-300/80 text-slate-700'
                    }`}
                  >
                    {category.accounts.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Category description */}
          <p className="text-[11px] text-slate-500 px-1 italic">
            {activeCategory.description}
          </p>

          {/* Accounts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeCategory.accounts.map((account) => {
              const isCurrentSubmitting =
                loading && (submittingEmail === account.email || selectedAccountEmail === account.email);

              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => handleAccountClick(account)}
                  disabled={loading}
                  className={`group relative text-left p-2.5 sm:p-3 rounded-xl border bg-white transition-all shadow-2xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    isCurrentSubmitting
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/30'
                      : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {/* Top: Name & Role Badge */}
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 line-clamp-1">
                      {account.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${account.badgeStyle.bg} ${account.badgeStyle.text} ${account.badgeStyle.border}`}
                    >
                      {account.roleBadge}
                    </span>
                  </div>

                  {/* Middle: Designation */}
                  <p className="text-[11px] text-slate-600 line-clamp-1 mb-1.5">
                    {account.designation}
                  </p>

                  {/* Bottom: Email & Action */}
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100 font-mono text-slate-500">
                    <span className="truncate pr-1 text-[10px] text-slate-500 group-hover:text-slate-700">
                      {account.email}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold text-emerald-700 shrink-0 group-hover:translate-x-0.5 transition-transform">
                      {isCurrentSubmitting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <span>Login</span>
                          <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sm:hidden text-center text-[10px] text-slate-500 font-mono pt-1">
            Common Password: <span className="font-bold text-slate-700">{DEMO_COMMON_PASSWORD}</span>
          </div>
        </div>
      )}
    </div>
  );
};
