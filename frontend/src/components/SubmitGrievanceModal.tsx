import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Upload,
  CheckCircle2,
  GitCommit,
  Users,
  Clock,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  PlusCircle
} from 'lucide-react';
import { api } from '../api/client';
import { Category, DuplicateMatch } from '../types';
import { LocationPicker, LocationData } from './LocationPicker';

interface SubmitGrievanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (caseId: string) => void;
}

const EMPTY_LOCATION: LocationData = {
  locality: '',
  street_or_landmark: '',
  latitude: null,
  longitude: null,
  location_accuracy_m: null,
  location_source: 'manual',
  location_confirmed: false,
};

export const SubmitGrievanceModal: React.FC<SubmitGrievanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState<LocationData>(EMPTY_LOCATION);
  const [priority, setPriority] = useState('Medium');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [demoShortDeadline, setDemoShortDeadline] = useState(false);

  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Successful submission state (Phase 2 confirmation)
  const [submittedCaseId, setSubmittedCaseId] = useState<string | null>(null);
  const [submittedLocation, setSubmittedLocation] = useState<LocationData | null>(null);
  const [copiedTrackingId, setCopiedTrackingId] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation(EMPTY_LOCATION);
    setPriority('Medium');
    setFile(null);
    setDemoShortDeadline(false);
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setError(null);
    setSubmittedLocation(null);
  };

  useEffect(() => {
    if (isOpen) {
      api.getCategories().then(cats => {
        setCategories(cats);
        if (cats.length > 0 && !category) {
          setCategory(cats[0].name);
        }
      }).catch(() => {});
    } else {
      setSubmittedCaseId(null);
      setCopiedTrackingId(false);
    }
  }, [isOpen]);

  // Debounced duplicate detection preview
  useEffect(() => {
    if (!category || !description || description.trim().length < 15) {
      setDuplicates([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCheckingDuplicates(true);
        const res = await api.checkDuplicates({
          category,
          locality: location.locality,
          title,
          description,
          latitude: location.latitude,
          longitude: location.longitude,
        });
        setDuplicates(res.duplicates || []);
      } catch {
        // ignore
      } finally {
        setCheckingDuplicates(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [category, location.locality, location.latitude, location.longitude, title, description]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent, forceBypassDuplicates: boolean = false) => {
    e.preventDefault();
    setError(null);

    // Validate locality is set
    if (!location.locality || location.locality.trim().length < 2) {
      setError('Please provide a valid locality or area for the issue.');
      return;
    }

    // If duplicates found and user hasn't explicitly chosen to bypass, show warning dialog first
    if (duplicates.length > 0 && !forceBypassDuplicates && !showDuplicateWarning) {
      setShowDuplicateWarning(true);
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('title', title);
      formData.append('category', category);
      formData.append('locality', location.locality);
      formData.append('street_or_landmark', location.street_or_landmark);
      formData.append('location_source', location.location_source);
      formData.append('location_confirmed', location.location_confirmed ? 'true' : 'false');
      formData.append('priority', priority);
      formData.append('description', description);

      if (location.latitude !== null && location.longitude !== null) {
        formData.append('latitude', String(location.latitude));
        formData.append('longitude', String(location.longitude));
      }
      if (location.location_accuracy_m !== null) {
        formData.append('location_accuracy_m', String(location.location_accuracy_m));
      }

      if (demoShortDeadline) {
        formData.append('demo_short_deadline', 'true');
      }
      if (file) {
        formData.append('attachment', file);
      }

      const res = await api.createGrievance(formData);
      // Retain tracking ID and location for confirmation dialog (Phase 2)
      setSubmittedCaseId(res.case_id);
      setSubmittedLocation({ ...location });
    } catch (err: any) {
      setError(err.message || 'Failed to submit grievance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSupportExisting = async (existingCaseId: string) => {
    try {
      setIsSubmitting(true);
      await api.supportGrievance(existingCaseId);
      alert(`Successfully added your verification support to existing case ${existingCaseId}! Citizen support count has increased.`);
      onSuccess(existingCaseId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to support existing case');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="glass-dropdown w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-950 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {submittedCaseId ? 'Grievance Tracking Confirmation' : 'Report Public Grievance'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">Directly registered to municipal SLA tracking registry</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (submittedCaseId) {
                onSuccess(submittedCaseId);
                resetForm();
                setSubmittedCaseId(null);
              }
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            aria-label="Close dialog"
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

        {/* Phase 2: Polished Confirmation Screen */}
        {submittedCaseId ? (
          <div className="p-5 sm:p-8 text-center space-y-5 flex-1 overflow-y-auto min-h-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-bold text-white">Grievance Submitted Successfully</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Your complaint has been formally registered in the municipal database and assigned an authoritative tracking ID.
              </p>
            </div>

            {/* Exact Tracking ID Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 max-w-md mx-auto space-y-3">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
                Official Tracking ID
              </span>
              <div className="font-mono text-xl sm:text-2xl font-bold text-cyan-400 tracking-wider break-all">
                {submittedCaseId}
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(submittedCaseId);
                  setCopiedTrackingId(true);
                  setTimeout(() => setCopiedTrackingId(false), 3000);
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 flex items-center justify-center gap-2 mx-auto transition-colors min-h-[42px]"
              >
                {copiedTrackingId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Tracking ID Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Tracking ID</span>
                  </>
                )}
              </button>
            </div>

            {/* Location confirmation mini-card */}
            {submittedLocation && submittedLocation.latitude && submittedLocation.longitude ? (
              <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-700/40 max-w-md mx-auto text-left space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-400 text-[11px] font-bold uppercase tracking-wider">
                  {submittedLocation.location_source === 'gps'
                    ? '📍 GPS Location Captured'
                    : submittedLocation.location_source === 'map_pin'
                    ? '📌 Map-Pinned Location'
                    : '📍 Location Recorded'}
                </div>
                {submittedLocation.street_or_landmark && (
                  <p className="text-xs text-slate-200 font-semibold">{submittedLocation.street_or_landmark}</p>
                )}
                <p className="text-[11px] font-mono text-slate-400">
                  {submittedLocation.latitude.toFixed(6)}, {submittedLocation.longitude.toFixed(6)}
                  {submittedLocation.location_accuracy_m !== null
                    ? ` ±${Math.round(submittedLocation.location_accuracy_m)}m`
                    : ''}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${submittedLocation.latitude},${submittedLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  View on Google Maps ↗
                </a>
              </div>
            ) : submittedLocation?.locality ? (
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 max-w-md mx-auto text-left">
                <p className="text-xs text-slate-400">
                  Area: <strong className="text-slate-200">{submittedLocation.locality}</strong>
                </p>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const cid = submittedCaseId;
                  setSubmittedCaseId(null);
                  resetForm();
                  onSuccess(cid);
                  onClose();
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950 flex items-center justify-center gap-2 transition-all min-h-[42px]"
              >
                <span>View Grievance Details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onSuccess(submittedCaseId);
                  setSubmittedCaseId(null);
                  resetForm();
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center gap-2 transition-colors min-h-[42px]"
              >
                <PlusCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>Track Another Grievance</span>
              </button>
            </div>
          </div>
        ) : showDuplicateWarning && duplicates.length > 0 ? (
          <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 text-left">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-1">
                <GitCommit className="w-4 h-4 shrink-0" />
                Duplicate Complaint Intelligence Alert
              </div>
              <p className="text-xs text-slate-300">
                CivicFix's local engine detected <strong className="text-amber-300">{duplicates.length} active issue(s)</strong> matching your category and locality. Joining an existing issue strengthens its priority and aggregates community voices.
              </p>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {duplicates.map(dup => (
                <div key={dup.case_id} className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400">{dup.case_id}</span>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {dup.status}
                      </span>
                      <span className="text-xs font-semibold text-violet-400">
                        {Math.round(dup.similarity_score * 100)}% Match
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 text-sm mt-1">{dup.title}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-1 font-mono">
                      <span>Locality: {dup.locality}</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Users className="w-3 h-3" />
                        {dup.citizen_support_count} Citizens Affected
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSupportExisting(dup.case_id)}
                    className="w-full sm:w-auto shrink-0 px-3.5 py-2.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-md flex items-center justify-center gap-1.5 min-h-[40px]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Support Issue (+1)</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setShowDuplicateWarning(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white min-h-[40px] text-center"
              >
                Back to Edit
              </button>

              <button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 min-h-[40px]"
              >
                <span>Submit as Distinct Issue Anyway</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Grievance Form */
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-left flex-1 overflow-y-auto min-h-0">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Issue Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Hazardous 2-foot pothole on Oak Street"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({c.sla_hours}h SLA)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Priority Urgency
                </label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="Low">Low (Standard Non-Hazardous)</option>
                  <option value="Medium">Medium (Routine Municipal Work)</option>
                  <option value="High">High (Impacting Commuters / Property)</option>
                  <option value="Urgent">Urgent (Immediate Safety Hazard)</option>
                </select>
              </div>
            </div>

            {/* Location Picker — replaces old plain locality input */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <LocationPicker value={location} onChange={setLocation} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Detailed Grievance Description *
                </label>
                {checkingDuplicates && (
                  <span className="text-[11px] text-cyan-400 flex items-center gap-1 animate-pulse">
                    <GitCommit className="w-3 h-3" />
                    Checking for duplicate cases...
                  </span>
                )}
              </div>
              <textarea
                required
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Provide specific details, measurements, or hazards..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Live inline duplicate detection alert badge if matches exist */}
            {duplicates.length > 0 && (
              <div className="p-3 rounded-xl bg-violet-950/40 border border-violet-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-violet-300">
                  <GitCommit className="w-4 h-4 text-violet-400" />
                  <span>
                    <strong>{duplicates.length} similar active case(s)</strong> detected nearby.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDuplicateWarning(true)}
                  className="text-xs font-bold text-violet-300 underline hover:text-white"
                >
                  Review Matches
                </button>
              </div>
            )}

            {/* File upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Supporting Photo / Evidence (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-300 w-full transition-colors truncate">
                  <Upload className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">{file ? file.name : 'Choose File'}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    accept="image/*,application/pdf"
                  />
                </label>
              </div>
            </div>

            {/* Hackathon Demo Fast Escalation Toggle */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-semibold text-slate-200">Demonstration SLA Accelerator</span>
                  <p className="text-[11px] text-slate-400">Set 15-minute target deadline to preview real-time SLA risk escalation</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={demoShortDeadline}
                onChange={e => setDemoShortDeadline(e.target.checked)}
                className="w-4 h-4 text-cyan-500 rounded bg-slate-800 border-slate-700 focus:ring-cyan-500"
              />
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-white/10 flex flex-col xs:flex-row items-stretch xs:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white min-h-[42px] text-center"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-900/40 disabled:opacity-50 min-h-[42px] flex items-center justify-center"
              >
                {isSubmitting ? 'Registering Grievance...' : 'Submit Grievance'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
