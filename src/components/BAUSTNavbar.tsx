import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Plus,
  Code2,
  ChevronDown,
  LogIn,
  LogOut,
  UserPlus,
  User,
  Globe,
  MoreVertical,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserProfile, ComplaintNotification } from '../types/index.ts';

interface BAUSTNavbarProps {
  currentUser: UserProfile | null;
  onLogout: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onOpenSubmitModal: () => void;
  onOpenProfileModal: () => void;
  notifications: ComplaintNotification[];
  onMarkNotificationRead: (id: string) => void;
  onSelectComplaintFromNotif: (complaintId: string) => void;
}

export const BAUSTNavbar: React.FC<BAUSTNavbarProps> = ({
  currentUser,
  onLogout,
  onOpenAuthModal,
  onOpenSubmitModal,
  onOpenProfileModal,
  notifications,
  onMarkNotificationRead,
  onSelectComplaintFromNotif,
}) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentLanguage = i18n.language || 'en';
  const isLoginPage = location.pathname === '/' || location.pathname === '/login';

  const toggleLanguage = () => {
    const nextLang = currentLanguage === 'en' ? 'bn' : 'en';
    void i18n.changeLanguage(nextLang);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const isStaffOrAdmin =
    currentUser?.role === 'office_head' ||
    currentUser?.role === 'dept_admin' ||
    currentUser?.role === 'staff' ||
    currentUser?.role === 'officer' ||
    currentUser?.role === 'super_admin';

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header
      className={`${
        isLoginPage ? 'hidden md:block ' : ''
      }sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Brand Logo: Hidden on mobile ONLY in login form; always visible on dashboard */}
          <div
            className={`items-center gap-2.5 min-w-0 ${
              isLoginPage ? 'hidden md:flex' : 'flex'
            }`}
          >
            <Link
              to={currentUser ? '/' : '/login'}
              className="text-left flex items-center gap-2 sm:gap-2.5 focus:outline-none group min-w-0"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-emerald-700 flex items-center justify-center font-bold text-white tracking-wider text-[10px] sm:text-xs shadow-sm border border-emerald-500 group-hover:bg-emerald-600 transition-colors shrink-0">
                BAUST
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-base font-bold tracking-tight text-white block leading-tight truncate">
                  <span className="sm:hidden">BAUST Grievance Portal</span>
                  <span className="hidden sm:inline">{t('nav.brand_title')}</span>
                </span>
                <span className="hidden sm:block text-[10px] text-emerald-400 font-medium tracking-wide uppercase truncate">
                  {t('nav.brand_subtitle')}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold uppercase tracking-wider text-slate-300">
            {currentUser && (
              <Link
                to="/student"
                className={`py-1.5 border-b-2 transition-colors ${
                  isActive('/student') || (location.pathname === '/' && !isStaffOrAdmin)
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('nav.student_portal')}
              </Link>
            )}

            {isStaffOrAdmin && (
              <Link
                to="/triage"
                className={`py-1.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                  isActive('/triage') || (location.pathname === '/' && isStaffOrAdmin)
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t('nav.dept_triage')}</span>
                {currentUser?.department_code && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-emerald-900/80 text-emerald-300 border border-emerald-600 rounded">
                    {currentUser.department_code}
                  </span>
                )}
              </Link>
            )}

            <Link
              to="/track"
              className={`py-1.5 border-b-2 transition-colors ${
                isActive('/track')
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('nav.public_tracker')}
            </Link>

            {isStaffOrAdmin && (
              <Link
                to="/analytics"
                className={`py-1.5 border-b-2 transition-colors ${
                  isActive('/analytics')
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('nav.analytics')}
              </Link>
            )}

            {currentUser?.role === 'super_admin' && (
              <Link
                to="/audit"
                className={`py-1.5 border-b-2 transition-colors ${
                  isActive('/audit')
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('nav.audit_logs')}
              </Link>
            )}

            {currentUser && (
              <Link
                to="/architecture"
                className={`py-1.5 border-b-2 transition-colors flex items-center gap-1 ${
                  isActive('/architecture')
                    ? 'border-emerald-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{t('nav.rls_policies')}</span>
              </Link>
            )}
          </nav>

          {/* Right Side Actions + Mobile Three-Dot Menu */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Desktop Language Toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors shadow-xs"
              title="Toggle language"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[11px] font-bold">
                {currentLanguage === 'en' ? 'বাংলা' : 'English'}
              </span>
            </button>

            {/* Desktop Submit CTA */}
            {currentUser && (
              <button
                type="button"
                onClick={onOpenSubmitModal}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('nav.submit_grievance')}</span>
              </button>
            )}

            {/* Notifications Bell */}
            {currentUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    setShowUserDropdown(false);
                    setMobileMenuOpen(false);
                  }}
                  className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors focus:outline-none"
                  aria-label="View notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-slate-200">
                    <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">
                        {t('nav.realtime_alerts')}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{unreadCount}</span>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-slate-500">
                          {t('nav.no_notifications')}
                        </div>
                      ) : (
                        notifications.slice(0, 8).map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => {
                              onMarkNotificationRead(notif.id);
                              if (notif.complaint_id) {
                                onSelectComplaintFromNotif(notif.complaint_id);
                                setShowNotifDropdown(false);
                              }
                            }}
                            className={`p-3 text-xs hover:bg-slate-800 cursor-pointer transition-colors ${
                              !notif.is_read ? 'bg-slate-800/50' : ''
                            }`}
                          >
                            <p className="text-slate-200 font-medium leading-snug">{notif.text}</p>
                            <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                              {new Date(notif.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Desktop User Profile / Auth Buttons */}
            {currentUser ? (
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserDropdown(!showUserDropdown);
                    setShowNotifDropdown(false);
                  }}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-slate-200"
                >
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.full_name}
                      className="w-5 h-5 rounded-full object-cover border border-emerald-500"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-emerald-800 text-emerald-300 flex items-center justify-center font-bold text-[10px]">
                      {currentUser.full_name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                  )}
                  <div className="text-left leading-tight max-w-[120px] truncate">
                    <span className="font-semibold block truncate">
                      {currentUser.full_name.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {currentUser.role === 'super_admin'
                        ? 'Super Admin'
                        : isStaffOrAdmin
                        ? currentUser.department_code
                          ? `Teacher · ${currentUser.department_code}`
                          : 'Teacher / Admin'
                        : currentUser.department_code
                        ? `Student · ${currentUser.department_code}`
                        : 'Student'}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-slate-200">
                    <div className="p-3">
                      <div className="flex items-center gap-2.5">
                        {currentUser.avatar_url ? (
                          <img
                            src={currentUser.avatar_url}
                            alt={currentUser.full_name}
                            className="w-10 h-10 rounded-full bg-slate-800 border-2 border-emerald-500 object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-950 border-2 border-emerald-600 flex items-center justify-center font-mono font-bold text-xs text-emerald-400 shrink-0">
                            {currentUser.full_name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="truncate">
                          <strong className="text-xs font-bold text-white block truncate">
                            {currentUser.full_name}
                          </strong>
                          <span className="text-[10px] text-emerald-400 block font-mono truncate">
                            {currentUser.student_or_emp_id}
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {currentUser.role === 'super_admin'
                              ? 'BAUST Super Admin'
                              : isStaffOrAdmin
                              ? currentUser.department_code
                                ? `${currentUser.department_code} Teacher · ${currentUser.department_name || ''}`
                                : currentUser.department_name || 'Teacher / Department Admin'
                              : currentUser.department_code
                              ? `${currentUser.department_code} Student · ${currentUser.department_name || ''}`
                              : currentUser.department_name || 'Student'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowUserDropdown(false);
                            onOpenProfileModal();
                          }}
                          className="flex-1 py-1.5 px-2 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t('nav.my_profile')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowUserDropdown(false);
                            onLogout();
                          }}
                          className="py-1.5 px-2.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-400" />
                          <span>{t('nav.logout')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden lg:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isLoginPage) {
                      navigate('/login?mode=login');
                    } else {
                      onOpenAuthModal('login');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('nav.sign_in')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isLoginPage) {
                      navigate('/login?mode=register');
                    } else {
                      onOpenAuthModal('register');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t('nav.register')}</span>
                </button>
              </div>
            )}

            {/* Mobile Three-Dot Menu Button (Dashboard / non-login routes only, < lg) */}
            {!isLoginPage && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(!mobileMenuOpen);
                  setShowNotifDropdown(false);
                  setShowUserDropdown(false);
                }}
                aria-label="Toggle mobile menu"
                aria-expanded={mobileMenuOpen}
                className="lg:hidden p-2 text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors focus:outline-none"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <MoreVertical className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Three-Dot Menu Bar Drawer (Dashboard / non-login routes only) */}
      {!isLoginPage && mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-xs px-4 py-4 space-y-4 shadow-2xl">
          {/* Authenticated User Card */}
          {currentUser && (
            <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.full_name}
                    className="w-9 h-9 rounded-full object-cover border border-emerald-500 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-800 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser.full_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block truncate">
                    {currentUser.full_name}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 block truncate">
                    {currentUser.student_or_emp_id}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {currentUser.role === 'super_admin'
                      ? 'Super Admin'
                      : isStaffOrAdmin
                      ? currentUser.department_code
                        ? `Teacher · ${currentUser.department_code}`
                        : 'Teacher / Admin'
                      : currentUser.department_code
                      ? `Student · ${currentUser.department_code}`
                      : 'Student'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  onOpenProfileModal();
                }}
                className="px-2.5 py-1.5 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0"
              >
                <User className="w-3.5 h-3.5" />
                <span>{t('nav.my_profile')}</span>
              </button>
            </div>
          )}

          {/* Mobile Navigation Links */}
          <nav className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider">
            {currentUser && (
              <Link
                to="/student"
                onClick={closeMobileMenu}
                className={`px-3 py-2.5 rounded-lg transition-colors ${
                  isActive('/student') || (location.pathname === '/' && !isStaffOrAdmin)
                    ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t('nav.student_portal')}
              </Link>
            )}

            {isStaffOrAdmin && (
              <Link
                to="/triage"
                onClick={closeMobileMenu}
                className={`px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  isActive('/triage') || (location.pathname === '/' && isStaffOrAdmin)
                    ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{t('nav.dept_triage')}</span>
                {currentUser?.department_code && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-900 text-emerald-300 rounded">
                    {currentUser.department_code}
                  </span>
                )}
              </Link>
            )}

            <Link
              to="/track"
              onClick={closeMobileMenu}
              className={`px-3 py-2.5 rounded-lg transition-colors ${
                isActive('/track')
                  ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {t('nav.public_tracker')}
            </Link>

            {isStaffOrAdmin && (
              <Link
                to="/analytics"
                onClick={closeMobileMenu}
                className={`px-3 py-2.5 rounded-lg transition-colors ${
                  isActive('/analytics')
                    ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t('nav.analytics')}
              </Link>
            )}

            {currentUser?.role === 'super_admin' && (
              <Link
                to="/audit"
                onClick={closeMobileMenu}
                className={`px-3 py-2.5 rounded-lg transition-colors ${
                  isActive('/audit')
                    ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t('nav.audit_logs')}
              </Link>
            )}

            {currentUser && (
              <Link
                to="/architecture"
                onClick={closeMobileMenu}
                className={`px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2 ${
                  isActive('/architecture')
                    ? 'bg-emerald-800/60 text-white border border-emerald-600/50'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{t('nav.rls_policies')}</span>
              </Link>
            )}
          </nav>

          {/* Mobile Actions */}
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            {currentUser && (
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu();
                  onOpenSubmitModal();
                }}
                className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{t('nav.submit_grievance')}</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  toggleLanguage();
                  closeMobileMenu();
                }}
                className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>{currentLanguage === 'en' ? 'বাংলা' : 'English'}</span>
              </button>

              {currentUser ? (
                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    onLogout();
                  }}
                  className="flex-1 py-2 px-3 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>{t('nav.logout')}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      if (isLoginPage) {
                        navigate('/login?mode=login');
                      } else {
                        onOpenAuthModal('login');
                      }
                    }}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('nav.sign_in')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      if (isLoginPage) {
                        navigate('/login?mode=register');
                      } else {
                        onOpenAuthModal('register');
                      }
                    }}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{t('nav.register')}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
