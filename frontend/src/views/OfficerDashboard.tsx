import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Search,
  CheckSquare,
  FileCheck,
  ChevronRight,
  TrendingDown
} from 'lucide-react';
import { Grievance, User } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../api/client';

interface OfficerDashboardProps {
  currentUser: User;
  onSelectCase: (c: Grievance) => void;
  refreshKey?: number;
}

export const OfficerDashboard: React.FC<OfficerDashboardProps> = ({
  currentUser,
  onSelectCase,
  refreshKey,
}) => {
  const [cases, setCases] = useState<Grievance[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchCases = async () => {
    try {
      setIsLoading(true);
      const res = await api.listGrievances();
      setCases(res);
    } catch {
      // error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [currentUser, refreshKey]);

  const filteredCases = cases.filter(item => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (priorityFilter && item.priority !== priorityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.case_id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.locality.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeWorkload = cases.filter(c => !['Resolved', 'Closed'].includes(c.status)).length;
  const overdueCount = cases.filter(c => c.risk_analysis?.risk_level === 'OVERDUE').length;
  const atRiskCount = cases.filter(c => c.risk_analysis?.risk_level === 'AT_RISK').length;
  const resolvedCount = cases.filter(c => ['Resolved', 'Closed'].includes(c.status)).length;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 text-left">
      {/* Officer Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl glass-panel border border-white/5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/50">
              Officer Field Station
            </span>
            <span className="text-xs text-slate-400">Badge: {currentUser.badge_number || 'OFF-201'}</span>
            <span className="text-xs text-slate-400 truncate">• {currentUser.department_name || 'Public Works'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">Field Queue: {currentUser.name}</h1>
          <p className="text-xs text-slate-400">Manage field assignments, verify remediation, and log mandatory resolution evidence.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Active Workload</div>
            <div className="text-lg sm:text-xl font-bold font-mono text-cyan-400">{activeWorkload} Cases</div>
          </div>
          <div className={`w-3.5 h-3.5 rounded-full ${activeWorkload >= 6 ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
        </div>
      </div>

      {/* KPI Workload Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-slate-400 font-semibold block truncate">Assigned Active</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-white">{activeWorkload}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-rose-400 font-semibold block truncate">Overdue Breaches</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-rose-400">{overdueCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-amber-400 font-semibold block truncate">At-Risk Deadlines</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-amber-400">{atRiskCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-emerald-400 font-semibold block truncate">Resolved Cases</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-emerald-400">{resolvedCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-900/40 border border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-[38px]"
          >
            <option value="">All Statuses</option>
            <option value="Submitted">Submitted (Unacknowledged)</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="In Progress">In Progress</option>
            <option value="Awaiting Information">Awaiting Information</option>
            <option value="Resolved">Resolved</option>
            <option value="Reopened">Reopened</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 min-h-[38px]"
          >
            <option value="">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {(statusFilter || priorityFilter) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setPriorityFilter('');
              }}
              className="text-xs text-slate-400 hover:text-white underline ml-1 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search assigned cases..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 min-h-[38px]"
          />
        </div>
      </div>

      {/* Case Queue Table / Card List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">Loading assigned cases...</div>
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center glass-panel rounded-2xl border border-white/5 space-y-2">
            <CheckSquare className="w-8 h-8 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-200">No pending cases in this queue</h3>
            <p className="text-xs text-slate-500">All current assignments have been handled or moved forward.</p>
          </div>
        ) : (
          filteredCases.map(item => (
            <div
              key={item.case_id}
              onClick={() => onSelectCase(item)}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-cyan-500/40 transition-all cursor-pointer space-y-3 group"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
                    {item.case_id}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.status}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    item.priority === 'Urgent'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : item.priority === 'High'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {item.priority} Priority
                  </span>
                </div>

                <RiskBadge risk={item.risk_analysis} />
              </div>

              <div>
                <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                  {item.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs text-slate-400">
                <span>Locality: {item.locality} • Citizen: {item.citizen_name || 'Reporter'}</span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>Target SLA: {item.target_deadline}</span>
                  <span className="text-cyan-400 font-semibold group-hover:underline flex items-center gap-1">
                    Manage Case <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
