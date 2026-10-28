import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  FileText,
  Users
} from 'lucide-react';
import { Grievance, User } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../api/client';

interface CitizenDashboardProps {
  currentUser: User;
  onOpenSubmit: () => void;
  onSelectCase: (c: Grievance) => void;
  refreshKey?: number;
}

export const CitizenDashboard: React.FC<CitizenDashboardProps> = ({
  currentUser,
  onOpenSubmit,
  onSelectCase,
  refreshKey,
}) => {
  const [cases, setCases] = useState<Grievance[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
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
    if (filterStatus === 'active') {
      if (['Resolved', 'Closed'].includes(item.status)) return false;
    } else if (filterStatus === 'resolved') {
      if (!['Resolved', 'Closed'].includes(item.status)) return false;
    } else if (filterStatus === 'reopened') {
      if (item.status !== 'Reopened' && item.reopen_count === 0) return false;
    }

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

  const totalSubmitted = cases.length;
  const activeCount = cases.filter(c => !['Resolved', 'Closed'].includes(c.status)).length;
  const resolvedCount = cases.filter(c => ['Resolved', 'Closed'].includes(c.status)).length;
  const reopenedCount = cases.filter(c => c.reopen_count > 0).length;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 text-left">
      {/* Citizen Welcome Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl glass-panel border border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
              Citizen Portal
            </span>
            <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-none">Authenticated as {currentUser.email}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">Welcome, {currentUser.name}</h1>
          <p className="text-xs text-slate-400">Monitor your reported grievances, track municipal SLA deadlines, and review resolutions.</p>
        </div>

        <button
          onClick={onOpenSubmit}
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-950 flex items-center justify-center gap-2 min-h-[42px] w-full sm:w-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Submit New Grievance</span>
        </button>
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-slate-400 font-semibold block truncate">Total Registered</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-white">{totalSubmitted}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-cyan-400 font-semibold block truncate">Under Action</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-cyan-400">{activeCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-emerald-400 font-semibold block truncate">Resolved</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-emerald-400">{resolvedCount}</span>
        </div>
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-white/5">
          <span className="text-xs text-rose-400 font-semibold block truncate">Reopened</span>
          <span className="text-xl sm:text-2xl font-mono font-bold text-rose-400">{reopenedCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-slate-900/40 border border-white/5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Cases ({cases.length})
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'active'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Active In Progress ({activeCount})
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'resolved'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            onClick={() => setFilterStatus('reopened')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === 'reopened'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Reopened ({reopenedCount})
          </button>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search my cases..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 min-h-[38px]"
          />
        </div>
      </div>

      {/* Grievance Cards List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">Loading citizen grievances...</div>
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center glass-panel rounded-2xl border border-white/5 space-y-3">
            <FileText className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-300">No grievances matching your selection</h3>
            <p className="text-xs text-slate-500">You haven't reported or joined any grievances in this status category.</p>
          </div>
        ) : (
          filteredCases.map(item => (
            <div
              key={item.case_id}
              onClick={() => onSelectCase(item)}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer space-y-3 group"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cyan-400 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60">
                    {item.case_id}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.status}
                  </span>
                  {item.citizen_support_count > 1 && (
                    <span className="text-[10px] font-semibold text-violet-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      +{item.citizen_support_count - 1} Co-signers
                    </span>
                  )}
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
                <span>{item.department_name} • Locality: {item.locality}</span>
                <div className="flex items-center gap-4 font-mono text-[11px]">
                  <span>Logged: {item.submission_date}</span>
                  <span className="text-cyan-400 font-semibold group-hover:underline">
                    View Case Audit & Details →
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
