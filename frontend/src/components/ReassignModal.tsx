import React, { useState, useEffect } from 'react';
import { X, Share2, User, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Grievance, User as UserType } from '../types';
import { api } from '../api/client';

interface ReassignModalProps {
  caseItem: Grievance | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

export const ReassignModal: React.FC<ReassignModalProps> = ({
  caseItem,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [officers, setOfficers] = useState<UserType[]>([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | ''>('');
  const [reason, setReason] = useState('Workload capacity rebalancing');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && caseItem) {
      // Fetch officers in this department
      api.listStaff('officer', caseItem.department_id)
        .then(res => {
          setOfficers(res);
          // Pre-select first officer that isn't the currently assigned officer
          const available = res.find(o => o.id !== caseItem.assigned_officer_id);
          if (available) {
            setSelectedOfficerId(available.id);
          } else if (res.length > 0) {
            setSelectedOfficerId(res[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, caseItem]);

  if (!isOpen || !caseItem) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficerId) {
      setError('Please select a target officer');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await api.reassignGrievance(caseItem.case_id, Number(selectedOfficerId), reason);
      onSuccess(res.message);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reassign case');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-dropdown w-full max-w-lg max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-950 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">Reassign Case Officer</h3>
              <p className="text-xs text-slate-400 font-mono truncate">{caseItem.case_id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-left flex-1 overflow-y-auto min-h-0">
          <div className="p-3 rounded-xl bg-slate-900 border border-white/5 space-y-1 text-xs">
            <div className="text-slate-400">Current Assigned Officer:</div>
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>{caseItem.assigned_officer_name || 'Unassigned'}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Previous Reassignment Count: {caseItem.reassignment_count}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select New Officer *
            </label>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {officers.map(off => {
                const load = off.active_cases_count ?? 0;
                const isSelected = selectedOfficerId === off.id;
                const isCurrent = off.id === caseItem.assigned_officer_id;
                
                return (
                  <div
                    key={off.id}
                    onClick={() => setSelectedOfficerId(off.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-left flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-950/30 border-amber-500 shadow-md shadow-amber-950/50 ring-1 ring-amber-500/50'
                        : isCurrent
                        ? 'bg-slate-900/40 border-slate-800 opacity-60'
                        : 'bg-slate-900/80 border-slate-700/80 hover:border-slate-500 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-500 bg-transparent'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                          <span>{off.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{off.badge_number || 'OFF-XXX'}</span>
                          <span>•</span>
                          <span className="text-cyan-400 font-semibold">{load} Active Case{load !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      {load >= 7 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800">
                          Overburdened
                        </span>
                      ) : load >= 4 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-800">
                          Moderate
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Optimal
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reassignment Justification *
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-medium text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="Workload capacity rebalancing">Workload capacity rebalancing</option>
              <option value="SLA deadline risk intervention">SLA deadline risk intervention</option>
              <option value="Specialized technical expertise required">Specialized technical expertise required</option>
              <option value="Officer unavailable / on leave">Officer unavailable / on leave</option>
            </select>
          </div>

          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950 disabled:opacity-50"
            >
              {isSubmitting ? 'Reassigning...' : 'Confirm Reassignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
