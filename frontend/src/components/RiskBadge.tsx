import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Info } from 'lucide-react';
import { RiskAnalysis } from '../types';

interface RiskBadgeProps {
  risk?: RiskAnalysis;
  showTimer?: boolean;
  interactive?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ risk, showTimer = true, interactive = true }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!risk) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        Calculating...
      </span>
    );
  }

  const badgeConfig = {
    RESOLVED: {
      bg: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
      dot: 'bg-emerald-400',
      icon: CheckCircle2,
      label: 'Resolved',
    },
    ON_TRACK: {
      bg: 'bg-emerald-950/50 text-emerald-400 border-emerald-600/40',
      dot: 'bg-emerald-400 animate-pulse',
      icon: CheckCircle2,
      label: 'On Track',
    },
    AT_RISK: {
      bg: 'bg-amber-950/60 text-amber-300 border-amber-600/50 glow-amber',
      dot: 'bg-amber-400 animate-ping',
      icon: AlertTriangle,
      label: 'At Risk',
    },
    OVERDUE: {
      bg: 'bg-rose-950/70 text-rose-300 border-rose-600/60 glow-rose animate-pulse',
      dot: 'bg-rose-500 animate-ping',
      icon: AlertCircle,
      label: 'Overdue (SLA Breached)',
    },
  }[risk.risk_level] || {
    bg: 'bg-slate-800 text-slate-300 border-slate-700',
    dot: 'bg-slate-400',
    icon: Clock,
    label: risk.risk_level,
  };

  const Icon = badgeConfig.icon;

  return (
    <div className="relative inline-block">
      <div
        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${badgeConfig.bg}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => interactive && setShowTooltip(!showTooltip)}
      >
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${badgeConfig.dot}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${badgeConfig.dot.replace('animate-ping', '').replace('animate-pulse', '')}`} />
        </span>

        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{badgeConfig.label}</span>

        {showTimer && risk.time_remaining_formatted && (
          <span className="font-mono text-[11px] opacity-80 border-l border-white/20 pl-2">
            {risk.time_remaining_formatted}
          </span>
        )}

        {interactive && <Info className="w-3 h-3 text-slate-400 hover:text-white transition-colors" />}
      </div>

      {/* Explainability Tooltip / Popover */}
      {interactive && showTooltip && (
        <div className="absolute z-50 left-0 bottom-full mb-2 w-72 p-3.5 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl backdrop-blur-xl text-left pointer-events-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-cyan-400" />
              SLA Risk Engine Breakdown
            </span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
              Score: {risk.risk_score}/100
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300">
            {risk.risk_reasons && risk.risk_reasons.length > 0 ? (
              risk.risk_reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-1.5 leading-relaxed">
                  <span className="text-cyan-400 font-bold shrink-0">•</span>
                  <span>{reason}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic">{risk.explanation || 'Operating normally within SLA timeframe.'}</p>
            )}
          </div>

          {risk.needs_manager_intervention && (
            <div className="mt-2.5 pt-2 border-t border-rose-900/50 flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              Managerial intervention flagged
            </div>
          )}
        </div>
      )}
    </div>
  );
};
