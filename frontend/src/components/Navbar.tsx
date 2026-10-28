import React, { useState } from 'react';
import {
  LogOut,
  User as UserIcon,
  Sparkles,
  Search,
  PlusCircle,
  BarChart3,
  Shield,
  Menu,
  X as CloseIcon,
  Home,
  CheckSquare,
  Building2,
  ChevronRight,
  Layers
} from 'lucide-react';
import { CivicLogo } from './CivicLogo';
import { NotificationsPopover } from './NotificationsPopover';
import { User } from '../types';
import { api } from '../api/client';

interface NavbarProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDemoMode: boolean;
  setIsDemoMode: (val: boolean) => void;
  onOpenSubmitModal: () => void;
  onOpenTrackModal: () => void;
  onOpenDemoModal: () => void;
  onSelectGrievance: (caseId: string) => void;
  onAuthChange: (user: User | null) => void;
  onNotificationMessage?: (title: string, message: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  isDemoMode,
  setIsDemoMode,
  onOpenSubmitModal,
  onOpenTrackModal,
  onOpenDemoModal,
  onSelectGrievance,
  onAuthChange,
  onNotificationMessage,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      onAuthChange(null);
      setActiveTab('portal');
      setIsMobileMenuOpen(false);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/80';
      case 'manager':
        return 'bg-violet-950/80 text-violet-300 border-violet-800/80';
      case 'officer':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80';
      default:
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
    }
  };

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
      {/* Top Banner: Visible Demo Environment Indicator */}
      {isDemoMode && (
        <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-cyan-950/70 border-b border-amber-500/20 px-3 sm:px-4 py-1 text-[11px] text-slate-300">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] sm:text-[11px] truncate">
                Demo Mode — Synthetic Data
              </span>
              <span className="hidden sm:inline text-slate-400">• HACK-P423</span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={onOpenDemoModal}
                className="font-bold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 text-[11px]"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Switch Persona</span>
              </button>
              <button
                onClick={() => setIsDemoMode(false)}
                className="text-slate-400 hover:text-white hidden sm:inline text-[11px]"
                title="Disable demo persona switcher"
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo */}
        <div onClick={() => handleTabClick('portal')} className="shrink-0">
          <CivicLogo size="md" />
        </div>

        {/* Center Nav tabs (Desktop / Tablet Large) */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-xl border border-white/5">
          <button
            onClick={() => handleTabClick('portal')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'portal'
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Public Portal
          </button>

          {currentUser?.role === 'citizen' && (
            <button
              onClick={() => handleTabClick('citizen')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'citizen'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Citizen Desk
            </button>
          )}

          {currentUser?.role === 'officer' && (
            <button
              onClick={() => handleTabClick('officer')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'officer'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Officer Queue
            </button>
          )}

          {currentUser?.role === 'manager' && (
            <button
              onClick={() => handleTabClick('manager')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'manager'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Manager SLA Console
            </button>
          )}

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => handleTabClick('admin')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              Admin Governance
            </button>
          )}

          <button
            onClick={() => handleTabClick('analytics')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'analytics'
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Live Metrics
          </button>
        </nav>

        {/* Right action area */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Track button (Tablet/Desktop) */}
          <button
            onClick={onOpenTrackModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-700/80 hover:border-slate-500 hover:text-white transition-all shadow-sm"
          >
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Track Case</span>
            <span className="lg:hidden">Track</span>
          </button>

          {/* Report Grievance CTA (Hidden on tiny mobile to save space, accessible via hamburger) */}
          <button
            onClick={onOpenSubmitModal}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all shadow-md shadow-cyan-950/30 shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Report Grievance</span>
          </button>

          {/* Demo Persona Selection Trigger */}
          {isDemoMode ? (
            <button
              onClick={onOpenDemoModal}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-950/60 to-blue-950/60 border border-violet-500/40 text-violet-300 hover:border-violet-300 transition-all shadow-sm shrink-0"
              title="Open Local Demo Persona Switcher"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-slate-400 font-normal">Persona:</span>
              <span className="font-bold text-white capitalize">{currentUser ? currentUser.role : 'Guest'}</span>
            </button>
          ) : (
            <button
              onClick={() => setIsDemoMode(true)}
              className="text-[11px] font-semibold text-slate-400 hover:text-cyan-400 px-2 py-1 rounded bg-slate-900 border border-slate-800 transition-colors hidden xl:flex items-center gap-1"
              title="Activate Demo Mode"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Demo Mode</span>
            </button>
          )}

          {/* In-App Notifications Popover */}
          {currentUser && (
            <NotificationsPopover
              onSelectGrievance={onSelectGrievance}
              onNotificationMessage={onNotificationMessage}
            />
          )}

          {/* User profile / Logout (Desktop / Tablet) */}
          {currentUser ? (
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex flex-col text-right leading-none">
                <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]">{currentUser.name}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5 self-end ${getRoleBadgeStyle(currentUser.role)}`}>
                  {currentUser.role}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-800 hover:border-rose-900/50 transition-colors"
                title="Sign out of current account"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenDemoModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}

          {/* Mobile Menu Hamburger Toggle (Visible on < md) */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
            className="md:hidden p-2 rounded-xl text-slate-300 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 hover:text-white transition-all min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            {isMobileMenuOpen ? (
              <CloseIcon className="w-5 h-5 text-cyan-400" />
            ) : (
              <Menu className="w-5 h-5 text-slate-300" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-slate-950/98 backdrop-blur-2xl px-4 py-4 space-y-4 animate-in slide-in-from-top-2 duration-200 max-h-[82dvh] overflow-y-auto">
          {/* User Profile Card */}
          {currentUser ? (
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{currentUser.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{currentUser.email}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getRoleBadgeStyle(currentUser.role)}`}>
                    {currentUser.role}
                  </span>
                  {currentUser.department_name && (
                    <span className="text-[10px] text-slate-400 truncate">
                      • {currentUser.department_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenDemoModal();
                  }}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 border border-violet-500/30"
                  title="Switch Persona"
                >
                  <Sparkles className="w-4 h-4 text-violet-400" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-800"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenDemoModal();
              }}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-cyan-950"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In / Choose Persona</span>
            </button>
          )}

          {/* Quick Action Buttons for Mobile */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenSubmitModal();
              }}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-950"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Report Issue</span>
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenTrackModal();
              }}
              className="py-2.5 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5"
            >
              <Search className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Track Case</span>
            </button>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1 pt-2 border-t border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-2 py-1">
              Platform Views
            </div>

            <button
              onClick={() => handleTabClick('portal')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'portal'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Home className="w-4 h-4 text-cyan-400" />
                <span>Public Portal</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {currentUser?.role === 'citizen' && (
              <button
                onClick={() => handleTabClick('citizen')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'citizen'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                  <span>Citizen Desk</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}

            {currentUser?.role === 'officer' && (
              <button
                onClick={() => handleTabClick('officer')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'officer'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                  <span>Officer Queue</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}

            {currentUser?.role === 'manager' && (
              <button
                onClick={() => handleTabClick('manager')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'manager'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-violet-400" />
                  <span>Manager SLA Console</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}

            {currentUser?.role === 'admin' && (
              <button
                onClick={() => handleTabClick('admin')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span>Admin Governance</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}

            <button
              onClick={() => handleTabClick('analytics')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>Live Metrics</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
