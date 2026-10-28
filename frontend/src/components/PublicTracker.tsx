import React, { useState } from 'react';
import { Search, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import { Grievance } from '../types';
import { RiskBadge } from './RiskBadge';
import { AuditTimeline } from './AuditTimeline';

interface PublicTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  initialCaseId?: string;
}

export const PublicTracker: React.FC<PublicTrackerProps> = ({
  isOpen,
  onClose,
  initialCaseId = '',
}) => {
  const [caseIdInput, setCaseIdInput] = useState(initialCaseId || 'CF-2026-1004');
  const [searchedCase, setSearchedCase] = useState<Grievance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sampleCases = ['CF-2026-1001', 'CF-2026-1004', 'CF-2026-1007', 'CF-2026-1013'];

  const handleSearch = async (targetId?: string) => {
    const idToSearch = (targetId || caseIdInput).trim().toUpperCase();
    if (!idToSearch) return;

    try {
      setIsLoading(true);
      setError(null);
      const res = await api.trackPublicGrievance(idToSearch);
      setSearchedCase(res);
      setCaseIdInput(idToSearch);
    } catch (err: any) {
      setError(err.message || 'Case not found');
      setSearchedCase(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-dropdown w-full max-w-3xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-950 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">Public Grievance Tracker</h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">Transparent real-time case progression & audit log</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Close public tracker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Search Box */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={caseIdInput}
                onChange={e => setCaseIdInput(e.target.value)}
                placeholder="Enter Case ID (e.g. CF-2026-1004)"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 min-h-[42px]"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md transition-all shrink-0 min-h-[42px] flex items-center justify-center"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Quick sample chips */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
            <span>Try sample records:</span>
            {sampleCases.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => handleSearch(id)}
                className="font-mono px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors"
              >
                {id}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Search Result Card */}
          {searchedCase && (
            <div className="mt-4 p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-cyan-400">{searchedCase.case_id}</span>
                    <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {searchedCase.status}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-slate-100 mt-1">{searchedCase.title}</h4>
                </div>

                <RiskBadge risk={searchedCase.risk_analysis} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3.5 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-500 block">Department</span>
                  <span className="font-semibold text-slate-200">{searchedCase.department_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Locality</span>
                  <span className="font-semibold text-slate-200">{searchedCase.locality}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Assigned Officer</span>
                  <span className="font-semibold text-slate-200">{searchedCase.assigned_officer_name || 'Department Pool'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target SLA Deadline</span>
                  <span className="font-semibold text-slate-200 font-mono">{searchedCase.target_deadline}</span>
                </div>
              </div>

              {/* Verified Resolution Notes if resolved */}
              {searchedCase.resolution_note && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-slate-200">
                  <div className="font-bold text-emerald-400 mb-1">Official Resolution Record:</div>
                  <p className="italic">"{searchedCase.resolution_note}"</p>
                </div>
              )}

              {/* Public Timeline */}
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Accountability Audit Progression
                </h5>
                <AuditTimeline history={searchedCase.history || []} />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 text-center">
                🔒 Reporter personal contact information is anonymized in accordance with public municipal privacy standards.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
