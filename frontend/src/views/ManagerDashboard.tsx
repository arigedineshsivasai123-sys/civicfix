import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Share2,
  Users,
  RotateCcw,
  Search,
  Filter,
  BarChart3,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Bell
} from 'lucide-react';
import { Grievance, User, Department } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../api/client';

interface ManagerDashboardProps {
  currentUser: User;
  onSelectCase: (c: Grievance) => void;
  onOpenReassign: (c: Grievance) => void;
  refreshKey?: number;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  currentUser,
  onSelectCase,
  onOpenReassign,
  refreshKey,
}) => {
  const [cases, setCases] = useState<Grievance[]>([]);
  const [riskQueue, setRiskQueue] = useState<Grievance[]>([]);
  const [officers, setOfficers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'intervention' | 'reopened' | 'all_cases' | 'staff'>('intervention');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [newCasesCount, setNewCasesCount] = useState(0);
  const lastLoadedAtRef = useRef<string>(new Date().toISOString().replace('T', ' ').slice(0, 19));

  const fetchManagerData = async () => {
    try {
      setIsLoading(true);
      setNewCasesCount(0);
      const [allCases, riskRes, staffRes] = await Promise.all([
        api.listGrievances(),
        api.getRiskQueue(currentUser.department_id),
        api.listStaff('officer', currentUser.department_id),
      ]);
      setCases(allCases);
      setRiskQueue(riskRes.queue || []);
      setOfficers(staffRes);
      // Update the last-loaded timestamp so polling knows what's fresh
      lastLoadedAtRef.current = new Date().toISOString().replace('T', ' ').slice(0, 19);
    } catch {
      // error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchManagerData();
  }, [currentUser, refreshKey]);

  // --- Silent background poll every 30 seconds for new grievances ---
  useEffect(() => {
    const interval = setInterval(async () => {
      // Only poll if not currently doing a full load
      if (isLoading) return;
      try {
        const res = await api.listGrievancesSince(lastLoadedAtRef.current);
        if (res.count > 0) {
          // There are updates — tell user via banner, let them decide to refresh
          setNewCasesCount(prev => Math.max(prev, res.count));
        }
      } catch {
        // silent — polling failures are non-critical
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const reopenedCases = cases.filter(c => c.status === 'Reopened' || c.reopen_count > 0);
  const overdueCount = cases.filter(c => c.risk_analysis?.risk_level === 'OVERDUE').length;
  const atRiskCount = cases.filter(c => c.risk_analysis?.risk_level === 'AT_RISK').length;
  const resolvedCount = cases.filter(c => ['Resolved', 'Closed'].includes(c.status)).length;

  const filteredAllCases = cases.filter(item => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.case_id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.locality.toLowerCase().includes(q) ||
        (item.assigned_officer_name && item.assigned_officer_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 text-left">
      {/* Manager Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl glass-panel border border-white/5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-violet-950 text-violet-400 border border-violet-800/50">
              Department Operations Console
            </span>
            <span className="text-xs text-slate-400 truncate">• {currentUser.department_name || 'Roads & Infrastructure'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">Manager SLA Command: {currentUser.name}</h1>
          <p className="text-xs text-slate-400">Continuous SLA monitoring, officer capacity balancing, and rapid bottleneck intervention.</p>
        </div>

      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <button
            onClick={fetchManagerData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-2 min-h-[38px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[11px] sm:text-xs text-slate-400">At-Risk Queue</div>
              <div className="text-lg sm:text-xl font-bold font-mono text-rose-400">{riskQueue.length} Flagged</div>
            </div>
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 text-rose-400 animate-pulse shrink-0" />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-slate-400 font-semibold block truncate">Total Grievances</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-white">{cases.length}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-rose-900/40 bg-rose-950/20">
          <span className="text-xs text-rose-400 font-semibold block truncate">SLA Overdue</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-rose-400">{overdueCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-amber-900/40 bg-amber-950/20">
          <span className="text-xs text-amber-400 font-semibold block truncate">Approaching SLA</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-amber-400">{atRiskCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-violet-900/40 bg-violet-950/20">
          <span className="text-xs text-violet-400 font-semibold block truncate">Citizen Reopened</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-violet-400">{reopenedCases.length}</span>
        </div>
      </div>

      {/* New Cases Available Banner (auto-polling) */}
      {newCasesCount > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-cyan-950/60 border border-cyan-600/50 text-sm animate-pulse-once">
          <div className="flex items-center gap-2.5 text-cyan-300">
            <Bell className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-semibold">
              {newCasesCount} new or updated case{newCasesCount > 1 ? 's' : ''} detected in your department.
            </span>
          </div>
          <button
            onClick={fetchManagerData}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Load Now
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs font-semibold overflow-x-auto scrollbar-none shrink-0">
        <button
          onClick={() => setActiveTab('intervention')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'intervention'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>Intervention Queue ({riskQueue.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reopened')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'reopened'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-violet-400" />
          <span>Reopened Appeals ({reopenedCases.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'staff'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          <span>Officer Workloads ({officers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('all_cases')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'all_cases'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
          <span>All Cases Docket ({cases.length})</span>
        </button>
      </div>

      {/* Tab 1: Intervention Queue */}
      {activeTab === 'intervention' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                These cases have breached or are near breaching SLA targets. You can reassign bottlenecked cases to officers with lower workloads.
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {riskQueue.length === 0 ? (
              <div className="p-12 text-center glass-panel rounded-2xl border border-white/5 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-200">No At-Risk Cases</h3>
                <p className="text-xs text-slate-500">All department cases are on track within their SLA windows.</p>
              </div>
            ) : (
              riskQueue.map(item => (
                <div
                  key={item.case_id}
                  className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-rose-500/40 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
                        {item.case_id}
                      </span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {item.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        Officer: <strong className="text-slate-200">{item.assigned_officer_name || 'Unassigned'}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <RiskBadge risk={item.risk_analysis} />
                      <button
                        onClick={() => onOpenReassign(item)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-sm flex items-center gap-1.5"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Reassign
                      </button>
                    </div>
                  </div>

                  <div onClick={() => onSelectCase(item)} className="cursor-pointer">
                    <h3 className="text-base font-bold text-white hover:text-cyan-300 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                      {item.description}
                    </p>
                  </div>

                  {/* Early Warning Explanations */}
                  {item.risk_analysis && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-xs text-slate-300 space-y-1 font-mono">
                      <div className="font-bold text-amber-400 text-[11px] uppercase">Early-Warning Diagnosis:</div>
                      <div>{item.risk_analysis.explanation}</div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-400 font-mono">
                    <span>Target SLA Deadline: {item.target_deadline}</span>
                    <button
                      onClick={() => onSelectCase(item)}
                      className="text-cyan-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      Audit Trail & Actions →
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Reopened Cases Queue */}
      {activeTab === 'reopened' && (
        <div className="space-y-3">
          {reopenedCases.length === 0 ? (
            <div className="p-12 text-center glass-panel rounded-2xl border border-white/5 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200">No Reopened Cases</h3>
              <p className="text-xs text-slate-500">No citizens have contested recent resolution outcomes.</p>
            </div>
          ) : (
            reopenedCases.map(item => (
              <div
                key={item.case_id}
                onClick={() => onSelectCase(item)}
                className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-violet-500/40 transition-all cursor-pointer space-y-3 group"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-violet-400 px-2.5 py-0.5 rounded bg-violet-950/80 border border-violet-800/60">
                      {item.case_id}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      Reopened {item.reopen_count}x
                    </span>
                  </div>
                  <RiskBadge risk={item.risk_analysis} />
                </div>

                <div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {item.title}
                  </h3>
                  {item.reopen_reason && (
                    <div className="mt-2 p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-xs text-rose-200 italic">
                      Citizen Contest: "{item.reopen_reason}"
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
                  <span>Assigned Officer: {item.assigned_officer_name || 'Unassigned'}</span>
                  <span className="text-violet-400 font-semibold group-hover:underline">Review & Resolve →</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Staff Capacity & Workload Table */}
      {activeTab === 'staff' && (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-white">Department Officer Workload Distribution</h3>
            <p className="text-xs text-slate-400">Monitor active caseloads to avoid assigning cases to overburdened staff</p>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-xs text-left min-w-[550px]">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="px-6 py-3">Officer Name</th>
                  <th className="px-6 py-3">Badge ID</th>
                  <th className="px-6 py-3">Active Caseload</th>
                  <th className="px-6 py-3">Workload Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {officers.map(off => {
                  const load = off.active_cases_count ?? 0;
                  return (
                    <tr key={off.id} className="hover:bg-slate-800/40">
                      <td className="px-6 py-4 font-semibold text-slate-200">
                        {off.name}
                        <span className="block text-[11px] text-slate-500 font-normal">{off.email}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-cyan-400">{off.badge_number || 'OFF-XXX'}</td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-100">{load} Active Cases</td>
                      <td className="px-6 py-4">
                        {load >= 7 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold border border-rose-800">
                            Overburdened (High Risk)
                          </span>
                        ) : load >= 4 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-semibold border border-amber-800">
                            Moderate Capacity
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800">
                            Optimal Available
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: All Department Cases */}
      {activeTab === 'all_cases' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search department records..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-3">
            {filteredAllCases.map(item => (
              <div
                key={item.case_id}
                onClick={() => onSelectCase(item)}
                className="glass-panel p-4 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-400">{item.case_id}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {item.status}
                    </span>
                    <span className="text-xs text-slate-400">• Officer: {item.assigned_officer_name || 'Unassigned'}</span>
                  </div>
                  <RiskBadge risk={item.risk_analysis} />
                </div>
                <h4 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  {item.title}
                </h4>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Locality: {item.locality}</span>
                  <span className="font-mono">Deadline: {item.target_deadline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
