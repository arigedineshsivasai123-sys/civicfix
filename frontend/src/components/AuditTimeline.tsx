import React from 'react';
import {
  PlusCircle,
  UserCheck,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertOctagon,
  HelpCircle,
  FileText,
  Link,
  Shield,
  User,
  Activity
} from 'lucide-react';
import { CaseHistoryEntry } from '../types';

interface AuditTimelineProps {
  history: CaseHistoryEntry[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ history }) => {
  if (!history || history.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 italic bg-slate-900/30 rounded-xl border border-slate-800">
        No audit events recorded yet.
      </div>
    );
  }

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'CREATED':
        return {
          icon: PlusCircle,
          color: 'text-cyan-400 bg-cyan-950/70 border-cyan-800/60',
          title: 'Grievance Created',
        };
      case 'ASSIGNED':
        return {
          icon: UserCheck,
          color: 'text-blue-400 bg-blue-950/70 border-blue-800/60',
          title: 'Assigned to Officer',
        };
      case 'REASSIGNED':
        return {
          icon: RefreshCw,
          color: 'text-amber-400 bg-amber-950/70 border-amber-800/60',
          title: 'Case Reassigned',
        };
      case 'STATUS_CHANGE':
        return {
          icon: Clock,
          color: 'text-indigo-400 bg-indigo-950/70 border-indigo-800/60',
          title: 'Status Updated',
        };
      case 'RESOLVED':
        return {
          icon: CheckCircle,
          color: 'text-emerald-400 bg-emerald-950/70 border-emerald-800/60',
          title: 'Case Resolved',
        };
      case 'REOPENED':
        return {
          icon: AlertOctagon,
          color: 'text-rose-400 bg-rose-950/70 border-rose-800/60',
          title: 'Reopened by Citizen',
        };
      case 'INFO_REQUESTED':
        return {
          icon: HelpCircle,
          color: 'text-amber-400 bg-amber-950/70 border-amber-800/60',
          title: 'Information Requested',
        };
      case 'NOTE_ADDED':
        return {
          icon: FileText,
          color: 'text-slate-300 bg-slate-800 border-slate-700',
          title: 'Progress Note',
        };
      case 'LINKED_DUPLICATE':
        return {
          icon: Link,
          color: 'text-violet-400 bg-violet-950/70 border-violet-800/60',
          title: 'Citizen Co-Signed Issue',
        };
      default:
        return {
          icon: Activity,
          color: 'text-slate-400 bg-slate-800 border-slate-700',
          title: action,
        };
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-purple-900/60 text-purple-300 border-purple-700/50';
      case 'manager':
        return 'bg-blue-900/60 text-blue-300 border-blue-700/50';
      case 'officer':
        return 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50';
      case 'system':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      default:
        return 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50';
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-cyan-500/50 before:via-blue-500/30 before:to-transparent">
      {history.map((item, index) => {
        const config = getActionConfig(item.action);
        const Icon = config.icon;

        return (
          <div key={item.id || index} className="relative group">
            {/* Timeline node icon */}
            <div className={`absolute -left-6 top-0 w-6 h-6 rounded-full border flex items-center justify-center -translate-x-1/2 transition-transform group-hover:scale-110 ${config.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>

            {/* Event content card */}
            <div className="glass-panel rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200 text-sm">
                    {config.title}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getRoleBadge(item.actor_role)}`}>
                    {item.actor_role}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{item.created_at}</span>
                </div>
              </div>

              {/* Actor attribution */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                {item.actor_role === 'system' ? (
                  <Shield className="w-3 h-3 text-cyan-400" />
                ) : (
                  <User className="w-3 h-3 text-slate-400" />
                )}
                <span>Actor: <strong className="text-slate-300 font-medium">{item.actor_name}</strong></span>
              </div>

              {/* Old vs New values if present */}
              {(item.old_value || item.new_value) && (
                <div className="flex items-center gap-2 text-xs font-mono my-2 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
                  {item.old_value && (
                    <>
                      <span className="text-rose-400 line-through">{item.old_value}</span>
                      <span className="text-slate-500">→</span>
                    </>
                  )}
                  <span className="text-emerald-400 font-semibold">{item.new_value}</span>
                </div>
              )}

              {/* Note / Description */}
              {item.notes && (
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 mt-1">
                  {item.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
