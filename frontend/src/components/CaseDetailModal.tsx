import React, { useState } from 'react';
import {
  X,
  Clock,
  User,
  Building2,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Upload,
  Send,
  HelpCircle,
  FileText,
  Paperclip,
  Share2,
  Navigation,
  ExternalLink,
  Crosshair
} from 'lucide-react';
import { Grievance, User as UserType, GrievanceStatus } from '../types';
import { RiskBadge } from './RiskBadge';
import { AuditTimeline } from './AuditTimeline';
import { api } from '../api/client';

interface CaseDetailModalProps {
  caseItem: Grievance;
  currentUser: UserType | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenReassign?: (caseItem: Grievance) => void;
}

export const CaseDetailModal: React.FC<CaseDetailModalProps> = ({
  caseItem,
  currentUser,
  isOpen,
  onClose,
  onRefresh,
  onOpenReassign,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');

  // Action states
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionProof, setResolutionProof] = useState<File | null>(null);

  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [progressNote, setProgressNote] = useState('');
  const [isInfoRequest, setIsInfoRequest] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const role = currentUser?.role || 'citizen';

  // Handle Officer advancing basic status (e.g. In Progress, Awaiting Info)
  const handleStatusTransition = async (newStatus: GrievanceStatus) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await api.updateStatus(caseItem.case_id, newStatus, `Status transitioned to ${newStatus}`);
      setSuccessMsg(`Status updated to ${newStatus}`);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Status transition failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Proof-of-Resolution submission
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNote.trim() || resolutionNote.length < 10) {
      setError('A comprehensive resolution note (at least 10 characters) is required to resolve this case.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const formData = new FormData();
      formData.append('resolution_note', resolutionNote);
      if (resolutionProof) {
        formData.append('evidence', resolutionProof);
      }
      await api.resolveGrievance(caseItem.case_id, formData);
      setSuccessMsg('Grievance marked as Resolved with verified resolution note.');
      setShowResolveForm(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve grievance');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Citizen Reopening ("Issue Not Fixed")
  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim() || reopenReason.length < 10) {
      setError('A detailed reason is required to request reopening.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await api.reopenGrievance(caseItem.case_id, reopenReason);
      setSuccessMsg('Complaint flagged as Not Fixed. Reopened and routed to Manager review.');
      setShowReopenForm(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen grievance');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Note / Info Request
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressNote.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await api.addCaseNote(caseItem.case_id, progressNote, isInfoRequest);
      setSuccessMsg(isInfoRequest ? 'Information request dispatched to citizen.' : 'Progress note recorded in audit log.');
      setProgressNote('');
      setShowNoteForm(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to add note');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isResolvedOrClosed = ['Resolved', 'Closed'].includes(caseItem.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-dropdown w-full max-w-4xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs sm:text-sm font-bold px-2 sm:px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-300">
              {caseItem.case_id}
            </span>
            <RiskBadge risk={caseItem.risk_analysis} />
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {caseItem.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Reassign button for Manager / Admin */}
            {(role === 'manager' || role === 'admin') && onOpenReassign && !isResolvedOrClosed && (
              <button
                onClick={() => onOpenReassign(caseItem)}
                className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 transition-colors flex items-center gap-1.5 min-h-[36px]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Reassign Officer</span>
                <span className="xs:hidden">Reassign</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Close case detail modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-4 sm:px-6 py-2 border-b border-white/5 bg-slate-900/40 flex items-center gap-2 text-xs font-semibold shrink-0 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
              activeTab === 'details'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Case Overview & Proof
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'timeline'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Accountability Chain ({caseItem.history?.length || 0})</span>
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-left min-h-0">
          {activeTab === 'timeline' ? (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-200">Official Case Audit Trail</h3>
                <p className="text-xs text-slate-400">Chronological history with certified actor identity stamps</p>
              </div>
              <AuditTimeline history={caseItem.history || []} />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Title & Description */}
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white mb-2 break-words">{caseItem.title}</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-900/60 p-3.5 sm:p-4 rounded-xl border border-white/5">
                  {caseItem.description}
                </p>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 p-4 rounded-xl bg-slate-900/40 border border-white/5 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">Department</span>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{caseItem.department_name}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-1">Reported Area</span>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{caseItem.locality}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-1">Assigned Officer</span>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{caseItem.assigned_officer_name || 'Unassigned'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block mb-1">SLA Target Deadline</span>
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{caseItem.target_deadline}</span>
                  </div>
                </div>
              </div>

              {/* Exact Location Card — shown when GPS or map-pin coordinates exist */}
              {caseItem.latitude && caseItem.longitude ? (
                <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-700/40 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      {caseItem.location_source === 'gps' ? (
                        <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <Crosshair className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      {caseItem.location_source === 'gps'
                        ? 'GPS-Verified Exact Location'
                        : caseItem.location_source === 'map_pin'
                        ? 'Map-Pinned Exact Location'
                        : 'Manually Entered Location'}
                    </span>
                    {caseItem.location_confirmed === 1 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-400 border border-emerald-700/50 font-semibold">
                        ✓ Confirmed
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {caseItem.street_or_landmark && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 block mb-0.5">Street / Landmark</span>
                        <span className="font-semibold text-slate-100">{caseItem.street_or_landmark}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500 block mb-0.5">Coordinates</span>
                      <span className="font-mono text-slate-200">
                        {caseItem.latitude.toFixed(6)}, {caseItem.longitude.toFixed(6)}
                      </span>
                    </div>
                    {caseItem.location_accuracy_m && (
                      <div>
                        <span className="text-slate-500 block mb-0.5">Accuracy</span>
                        <span className="font-mono text-slate-200">
                          ±{Math.round(caseItem.location_accuracy_m)} m
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <a
                      href={`https://www.google.com/maps?q=${caseItem.latitude},${caseItem.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open in Google Maps
                    </a>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${caseItem.latitude}&mlon=${caseItem.longitude}&zoom=17`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors"
                    >
                      <MapPin className="w-3 h-3" />
                      OpenStreetMap
                    </a>
                    <span className="text-[11px] text-slate-500 font-mono ml-1 hidden sm:inline">
                      {caseItem.latitude.toFixed(5)}, {caseItem.longitude.toFixed(5)}
                    </span>
                  </div>
                </div>
              ) : (
                // No precise coordinates — show the locality-only notice
                caseItem.locality && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 text-xs text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Broad area reported: <strong className="text-slate-300">{caseItem.locality}</strong>.
                      No GPS or map-pin coordinates were captured for this grievance.
                    </span>
                  </div>
                )
              )}

              {/* Early-Warning SLA Engine Rationale Card */}
              {caseItem.risk_analysis && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Early-Warning Engine SLA Diagnostic
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Risk Index: {caseItem.risk_analysis.risk_score}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {caseItem.risk_analysis.explanation}
                  </p>

                  <div className="flex flex-wrap gap-3 pt-2 text-[11px] text-slate-400 border-t border-white/5">
                    <span>Reassignments: <strong className="text-slate-200">{caseItem.reassignment_count}</strong></span>
                    <span>Reopens: <strong className="text-slate-200">{caseItem.reopen_count}</strong></span>
                    <span>Citizen Co-Signers: <strong className="text-cyan-400">{caseItem.citizen_support_count}</strong></span>
                  </div>
                </div>
              )}

              {/* Verified Resolution Notes & Evidence */}
              {caseItem.resolution_note && (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-700/50 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Verified Proof-of-Resolution Record
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed italic bg-emerald-950/40 p-3 rounded-lg border border-emerald-900/40">
                    "{caseItem.resolution_note}"
                  </p>
                  {caseItem.resolved_at && (
                    <div className="text-[11px] text-emerald-400 font-mono">
                      Resolved Timestamp: {caseItem.resolved_at}
                    </div>
                  )}

                  {/* Resolution Proof File Link */}
                  {caseItem.resolution_evidence_url && (
                    <div className="pt-2">
                      <a
                        href={caseItem.resolution_evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800/50 border border-emerald-700/50"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        View Resolution Proof Attachment
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Reopen Warning / Notification if reopened */}
              {caseItem.reopen_reason && (
                <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-700/50 space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 text-xs font-bold uppercase tracking-wider">
                    <RotateCcw className="w-4 h-4 text-rose-400" />
                    Citizen Reopening Contest (Incident #{caseItem.reopen_count})
                  </div>
                  <p className="text-xs text-rose-200 leading-relaxed bg-rose-950/40 p-3 rounded-lg border border-rose-900/40">
                    "{caseItem.reopen_reason}"
                  </p>
                </div>
              )}

              {/* Attachments Section */}
              {caseItem.attachments && caseItem.attachments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                    Case Evidence Files ({caseItem.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {caseItem.attachments.map(att => (
                      <a
                        key={att.id}
                        href={att.file_path}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-slate-900 border border-white/5 hover:border-cyan-500/40 flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-200 truncate">{att.file_name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-800 shrink-0">
                          {att.file_purpose === 'resolution_proof' ? 'Proof' : 'Citizen'}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Panels */}

              {/* 1. Citizen "Issue Not Fixed" Action (When case is resolved) */}
              {isResolvedOrClosed && !showReopenForm && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-200">Grievance Marked Resolved</span>
                    <p className="text-[11px] text-slate-400">If the municipal repair was inadequate or failed, you can request an escalation reopening.</p>
                  </div>
                  <button
                    onClick={() => setShowReopenForm(true)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700/60 transition-colors flex items-center justify-center gap-1.5 shrink-0 min-h-[44px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Report Issue Not Fixed</span>
                  </button>
                </div>
              )}

              {/* Reopen Reason Form */}
              {showReopenForm && (
                <form onSubmit={handleReopenSubmit} className="p-4 rounded-xl bg-rose-950/40 border border-rose-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" />
                      Justify Reopening Request
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowReopenForm(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    placeholder="Describe why the issue remains unresolved or failed again..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-rose-800/80 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 min-h-[42px]"
                    >
                      {isSubmitting ? 'Submitting Reopen...' : 'Submit Reopening Request'}
                    </button>
                  </div>
                </form>
              )}

              {/* 2. Officer Workflow Transition Controls */}
              {role === 'officer' && !isResolvedOrClosed && (
                <div className="p-4 rounded-xl bg-slate-900 border border-white/10 space-y-4">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                    Officer Case Actions
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {caseItem.status === 'Submitted' && (
                      <button
                        onClick={() => handleStatusTransition('Acknowledged')}
                        disabled={isSubmitting}
                        className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-cyan-900/60 text-cyan-300 border border-cyan-700/50 hover:bg-cyan-800/60 min-h-[42px]"
                      >
                        Acknowledge Case
                      </button>
                    )}

                    {(caseItem.status === 'Acknowledged' || caseItem.status === 'Reopened' || caseItem.status === 'Awaiting Information') && (
                      <button
                        onClick={() => handleStatusTransition('In Progress')}
                        disabled={isSubmitting}
                        className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-blue-900/60 text-blue-300 border border-blue-700/50 hover:bg-blue-800/60 min-h-[42px]"
                      >
                        Begin Field Work (In Progress)
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setShowNoteForm(true);
                        setIsInfoRequest(true);
                      }}
                      className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 min-h-[42px]"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                      Request Information
                    </button>

                    <button
                      onClick={() => {
                        setShowNoteForm(true);
                        setIsInfoRequest(false);
                      }}
                      className="px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 min-h-[42px]"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Add Progress Note
                    </button>

                    <button
                      onClick={() => setShowResolveForm(true)}
                      className="px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 flex items-center justify-center gap-1.5 sm:ml-auto w-full sm:w-auto min-h-[42px]"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Resolve Grievance</span>
                    </button>
                  </div>

                  {/* Resolve Form with Proof Upload */}
                  {showResolveForm && (
                    <form onSubmit={handleResolveSubmit} className="pt-4 border-t border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Submit Proof of Resolution (Mandatory)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowResolveForm(false)}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Resolution Note * (Action Taken, Work Order Details)
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={resolutionNote}
                          onChange={e => setResolutionNote(e.target.value)}
                          placeholder="e.g. Cleared storm drain obstruction, replaced acoustic sensor, verified with 3 test cycles..."
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Proof of Work Attachment (Photo or Work Order PDF)
                        </label>
                        <label className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 hover:border-slate-500 text-xs text-slate-300">
                          <Upload className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{resolutionProof ? resolutionProof.name : 'Choose File'}</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={e => setResolutionProof(e.target.files?.[0] || null)}
                            accept="image/*,application/pdf"
                          />
                        </label>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                        >
                          {isSubmitting ? 'Recording Resolution...' : 'Confirm & Resolve Case'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Add Note / Request Info Form */}
                  {showNoteForm && (
                    <form onSubmit={handleAddNote} className="pt-4 border-t border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">
                          {isInfoRequest ? 'Request Clarification from Citizen' : 'Record Internal Progress Note'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowNoteForm(false)}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>

                      <textarea
                        required
                        rows={2}
                        value={progressNote}
                        onChange={e => setProgressNote(e.target.value)}
                        placeholder={isInfoRequest ? 'Specify the exact photo or address clarification needed...' : 'Record field inspection findings...'}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isSubmitting ? 'Saving...' : 'Post Entry'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
