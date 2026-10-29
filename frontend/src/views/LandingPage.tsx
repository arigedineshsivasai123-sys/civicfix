import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  GitCommit,
  FileCheck,
  Building,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Layers,
  Activity
} from 'lucide-react';
import { Civic3DHero } from '../components/Civic3DHero';
import { RiskBadge } from '../components/RiskBadge';
import { AnalyticsOverview, Grievance } from '../types';
import { api } from '../api/client';

interface LandingPageProps {
  onOpenSubmit: () => void;
  onOpenTrack: () => void;
  onSelectCase: (c: Grievance) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenSubmit,
  onOpenTrack,
  onSelectCase,
}) => {
  const [stats, setStats] = useState<AnalyticsOverview | null>(null);
  const [featuredCases, setFeaturedCases] = useState<Grievance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Unauthenticated landing page uses public feed; logged-in users use listGrievances
    const fetchCases = api.getPublicFeed().catch(() => []);
    Promise.all([
      api.getAnalyticsOverview().catch(() => null),
      fetchCases,
    ])
      .then(([overview, cases]) => {
        if (overview) setStats(overview);
        setFeaturedCases(cases.slice(0, 4));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-12 sm:space-y-20 pb-16 sm:pb-20 overflow-x-clip">
      {/* Hero Section */}
      <section className="relative pt-6 sm:pt-12 md:pt-20 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center md:text-left">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Text */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] sm:text-xs font-semibold shadow-sm max-w-full">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Next-Generation Civic Technology Platform</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1] break-words">
              Every Grievance Deserves{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500">
                Accountability.
              </span>
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-2xl leading-relaxed">
              CivicFix transforms municipal complaint handling with explainable SLA risk prediction, duplicate deduplication, and an immutable audit trail that prevents citizen grievances from falling through bureaucratic cracks.
            </p>

            {/* CTAs */}
            <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 pt-2 justify-center md:justify-start">
              <button
                onClick={onOpenSubmit}
                className="px-6 py-3.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-xl shadow-cyan-950/50 hover:shadow-cyan-500/30 transition-all flex items-center justify-center gap-2 group min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                <span>Report a Grievance</span>
              </button>

              <button
                onClick={onOpenTrack}
                className="px-6 py-3.5 rounded-xl text-xs sm:text-sm font-bold text-slate-200 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 transition-all flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Search className="w-4 h-4 text-cyan-400" />
                <span>Track My Complaint</span>
              </button>
            </div>

            {/* Micro proof points */}
            <div className="pt-4 sm:pt-6 border-t border-white/5 flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-slate-400 justify-center md:justify-start">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Explainable Risk Engine</span>
              </span>
              <span className="flex items-center gap-1.5">
                <GitCommit className="w-4 h-4 text-violet-400 shrink-0" />
                <span>Zero-External-API Detection</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Certified Audit Chain</span>
              </span>
            </div>
          </div>

          {/* Right 3D Visual */}
          <div className="lg:col-span-5 flex justify-center w-full min-w-0">
            <Civic3DHero />
          </div>
        </div>
      </section>

      {/* Real Live Database Metric Cards */}
      <section className="px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-panel p-3.5 sm:p-5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs font-semibold gap-1">
              <span className="truncate">Complaints Tracked</span>
              <Building className="w-4 h-4 text-cyan-400 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono truncate">
              {stats ? stats.total_grievances : '22+'}
            </div>
            <span className="text-[10px] sm:text-[11px] text-cyan-400/80 block truncate">Active SQLite registry</span>
          </div>

          <div className="glass-panel p-3.5 sm:p-5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs font-semibold gap-1">
              <span className="truncate">Verified Resolved</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono truncate">
              {stats ? stats.resolved_grievances : '4'}
            </div>
            <span className="text-[10px] sm:text-[11px] text-emerald-400/80 block truncate">With mandatory proof</span>
          </div>

          <div className="glass-panel p-3.5 sm:p-5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs font-semibold gap-1">
              <span className="truncate">Overdue / At-Risk SLA</span>
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-400 font-mono truncate">
              {stats ? (stats.overdue_grievances + stats.at_risk_grievances) : '7'}
            </div>
            <span className="text-[10px] sm:text-[11px] text-rose-400/80 block truncate">Flagged for manager action</span>
          </div>

          <div className="glass-panel p-3.5 sm:p-5 rounded-2xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs font-semibold gap-1">
              <span className="truncate">Avg Resolution Time</span>
              <TrendingUp className="w-4 h-4 text-blue-400 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-400 font-mono truncate">
              {stats ? `${stats.avg_resolution_hours}h` : '38.5h'}
            </div>
            <span className="text-[10px] sm:text-[11px] text-blue-400/80 block truncate">Across all municipal works</span>
          </div>
        </div>
      </section>

      {/* Feature Pillar Highlights */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Architecture Designed for Municipal Transparency
          </h2>
          <p className="text-sm text-slate-400">
            Engineered from first principles to enforce bureaucratic responsibility without paid API dependencies.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all space-y-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Early-Warning SLA Engine</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dynamically evaluates remaining hours, priority weight, and officer workload friction to flag bottlenecks before deadlines breach.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-violet-500/30 transition-all space-y-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-violet-950/80 border border-violet-800/60 flex items-center justify-center text-violet-400">
              <GitCommit className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Duplicate Intelligence</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Local difflib and spatial locality normalization warns citizens of existing complaints, empowering them to co-sign and amplify priority.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all space-y-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Immutable Audit Chain</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Persistent case history recording every assignment, priority shift, status step, and deadline modification with verified actor attributions.
            </p>
          </div>

          {/* Card 4 */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all space-y-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Verified Proof-of-Resolution</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mandatory completion notes and evidence photo uploads ensure real field resolution, backed by a citizen "Issue Not Fixed" contest workflow.
            </p>
          </div>
        </div>
      </section>

      {/* Live Cases Preview Feed */}
      <section className="px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Live Grievance Activity Feed</span>
            </h3>
            <p className="text-xs text-slate-400">Actual operational records from the municipal SQLite database</p>
          </div>

          <button
            onClick={onOpenTrack}
            className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1 self-start sm:self-auto min-h-[36px]"
          >
            <span>View All in Public Tracker</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featuredCases.map(item => (
            <div
              key={item.case_id}
              onClick={() => onSelectCase(item)}
              className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/5 hover:border-cyan-500/40 transition-all cursor-pointer text-left space-y-3 group min-w-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-cyan-400">{item.case_id}</span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.status}
                  </span>
                </div>
                <RiskBadge risk={item.risk_analysis} />
              </div>

              <div>
                <h4 className="font-bold text-slate-100 text-sm group-hover:text-cyan-300 transition-colors line-clamp-1">
                  {item.title}
                </h4>
                <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                  {item.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px] text-slate-500 font-mono">
                <span className="truncate">{item.department_name} • {item.locality}</span>
                <span className="text-cyan-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform shrink-0">
                  Details <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-8 sm:pt-12 border-t border-white/10 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <strong className="text-slate-300">CivicFix Platform</strong> — Public Grievance Tracker Problem Statement ID: <strong className="text-cyan-400">HACK-P423</strong>
        </div>
        <div>
          React • Vite • TypeScript • Tailwind • Framer Motion • Flask • SQLite • Difflib Engine
        </div>
      </footer>
    </div>
  );
};
