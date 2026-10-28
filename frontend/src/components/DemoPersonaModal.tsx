import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Shield,
  UserCheck,
  Building,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  LogOut
} from 'lucide-react';
import { User } from '../types';
import { api } from '../api/client';

interface DemoPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onPersonaAuthenticated: (user: User, roleTab: string) => void;
  onExitDemoMode?: () => void;
}

export const DemoPersonaModal: React.FC<DemoPersonaModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onPersonaAuthenticated,
  onExitDemoMode,
}) => {
  const [authenticatingEmail, setAuthenticatingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const demoAccounts = [
    {
      role: 'citizen',
      name: 'Elena Rostova',
      email: 'citizen@civicfix.gov',
      title: 'Citizen Community Reporter',
      dept: 'Public Registry',
      badge: 'CIT-104',
      tab: 'citizen',
      accent: 'border-emerald-500/40 hover:border-emerald-400 bg-emerald-950/20 text-emerald-300',
      pill: 'bg-emerald-950 text-emerald-400 border-emerald-800',
      description: 'Submit grievances, preview local duplicate warnings, co-sign issues, and file "Issue Not Fixed" reopening appeals.'
    },
    {
      role: 'officer',
      name: 'Inspector Sarah Vance',
      email: 'officer.roads@civicfix.gov',
      title: 'Field Case Worker / Inspector',
      dept: 'Roads & Public Infrastructure',
      badge: 'OFF-201',
      tab: 'officer',
      accent: 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/20 text-cyan-300',
      pill: 'bg-cyan-950 text-cyan-400 border-cyan-800',
      description: 'Manage assigned caseload, advance permitted status steps, add progress notes, and submit mandatory resolution proof.'
    },
    {
      role: 'manager',
      name: 'Arthur Pendelton',
      email: 'manager.roads@civicfix.gov',
      title: 'Department Operations Manager',
      dept: 'Roads & Works Command',
      badge: 'MGR-101',
      tab: 'manager',
      accent: 'border-violet-500/40 hover:border-violet-400 bg-violet-950/20 text-violet-300',
      pill: 'bg-violet-950 text-violet-400 border-violet-800',
      description: 'Department-wide SLA monitor, manage At-Risk & Overdue intervention queues, and reassign bottlenecked cases.'
    },
    {
      role: 'admin',
      name: 'Chief Admin Vance',
      email: 'admin@civicfix.gov',
      title: 'Municipal System Administrator',
      dept: 'Civic Governance',
      badge: 'ADM-001',
      tab: 'admin',
      accent: 'border-purple-500/40 hover:border-purple-400 bg-purple-950/20 text-purple-300',
      pill: 'bg-purple-950 text-purple-400 border-purple-800',
      description: 'Full platform governance, Recharts intake telemetry, configure category SLA windows, and inspect certified audit logs.'
    }
  ];

  const handleSelectPersona = async (account: typeof demoAccounts[0]) => {
    try {
      setAuthenticatingEmail(account.email);
      setError(null);

      // 1. Invalidate previous server session
      await api.logout();

      // 2. Authenticate the selected seeded account through the real backend
      const res = await api.login(account.email, 'CivicFix2026!');

      // 3. Notify parent to update user state and route to appropriate view
      onPersonaAuthenticated(res.user, account.tab);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setAuthenticatingEmail(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-dropdown w-full max-w-3xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">Local Demo Mode</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 shrink-0">
                  Synthetic Environment
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">Server-enforced authentication with isolated user accounts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Close persona modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Explanation Box */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-300 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
              Real Backend Authentication Lifecycle:
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Selecting a persona below <strong>invalidates the previous session</strong> on the server and issues a new authenticated token for the corresponding seeded account. Role permissions are enforced exclusively by the server user record, never by client-side dropdown state.
            </p>
          </div>

          {/* Persona Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            {demoAccounts.map(account => {
              const isActive = currentUser?.email === account.email;
              const isAuthenticating = authenticatingEmail === account.email;

              return (
                <div
                  key={account.email}
                  onClick={() => !isAuthenticating && handleSelectPersona(account)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                    isActive
                      ? 'border-cyan-400/80 bg-cyan-950/30 ring-1 ring-cyan-500/50 shadow-lg shadow-cyan-950/50'
                      : account.accent
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${account.pill}`}>
                        {account.role}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{account.badge}</span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                      {account.name}
                    </h4>
                    <div className="text-[11px] font-mono text-slate-400 mb-1">{account.email}</div>
                    <div className="text-[11px] text-slate-400 font-medium mb-2">{account.dept}</div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {account.description}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-xs">
                    {isActive ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Currently Active Session
                      </span>
                    ) : isAuthenticating ? (
                      <span className="text-cyan-400 font-semibold animate-pulse text-[11px]">
                        Authenticating with backend...
                      </span>
                    ) : (
                      <span className="text-slate-300 group-hover:text-cyan-400 font-semibold flex items-center gap-1 text-[11px]">
                        Authenticate Persona <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer with Exit Demo Mode */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
            {onExitDemoMode && (
              <button
                type="button"
                onClick={onExitDemoMode}
                className="text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit Demo Mode (Sign Out)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white ml-auto"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
