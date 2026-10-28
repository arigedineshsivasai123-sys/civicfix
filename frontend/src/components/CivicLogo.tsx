import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface CivicLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const CivicLogo: React.FC<CivicLogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-11 h-11',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div className="flex items-center gap-3 select-none group cursor-pointer">
      <div className="relative flex items-center justify-center">
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl blur-md opacity-40 group-hover:opacity-75 transition-opacity" />
        
        {/* Shield Icon container */}
        <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 border border-cyan-500/30 p-2 rounded-xl shadow-lg shadow-cyan-950/50 flex items-center justify-center">
          <ShieldCheck className={`${iconSizes[size]} text-cyan-400 group-hover:text-cyan-300 transition-colors drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]`} />
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={`font-black tracking-tight text-white ${textSizes[size]}`}>
            Civic<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Fix</span>
          </span>
          <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/40 text-cyan-400">
            HACK-P423
          </span>
        </div>
        {showSubtitle && (
          <span className="hidden lg:inline text-[11px] font-medium text-slate-400 tracking-wide mt-1">
            Intelligent Grievance Accountability Engine
          </span>
        )}
      </div>
    </div>
  );
};
