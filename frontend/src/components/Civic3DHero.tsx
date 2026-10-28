import React, { useState } from 'react';
import { ShieldCheck, Cpu, Clock, CheckCircle2, GitCommit, FileCheck } from 'lucide-react';

export const Civic3DHero: React.FC = () => {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // Limit rotation angle between -15 and 15 deg
    setRotateX(-y / 15);
    setRotateY(x / 15);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      className="relative w-full max-w-[280px] xs:max-w-[340px] sm:max-w-md lg:max-w-lg aspect-square mx-auto perspective-1000 select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 3D Canvas Container */}
      <div
        className="w-full h-full relative transition-transform duration-200 ease-out preserve-3d"
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        }}
      >
        {/* Ambient radial lighting glows */}
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-600/20 via-blue-600/10 to-violet-600/20 rounded-3xl blur-3xl -z-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 sm:w-72 h-48 sm:h-72 bg-cyan-500/15 rounded-full blur-2xl -z-10 animate-pulse" />

        {/* Outer Layer: Holographic Grid Ring */}
        <div
          className="absolute inset-4 sm:inset-8 rounded-3xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md shadow-2xl flex items-center justify-center transition-all duration-300"
          style={{ transform: 'translateZ(20px)' }}
        >
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* Concentric rings */}
          <div className="absolute w-48 sm:w-64 h-48 sm:h-64 rounded-full border border-cyan-500/20 animate-spin [animation-duration:40s]" />
          <div className="absolute w-36 sm:w-48 h-36 sm:h-48 rounded-full border border-dashed border-blue-400/30 animate-spin [animation-duration:25s] [animation-direction:reverse]" />

          {/* Central 3D Shield Core */}
          <div
            className="relative z-10 w-22 h-22 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-blue-600/30 to-violet-600/30 border border-cyan-400/40 backdrop-blur-xl flex items-center justify-center shadow-2xl shadow-cyan-500/30 transition-transform duration-300 group hover:scale-105"
            style={{ transform: 'translateZ(60px)' }}
          >
            <ShieldCheck className="w-12 h-12 sm:w-16 sm:h-16 text-cyan-400 drop-shadow-[0_0_16px_rgba(6,182,212,0.8)]" />
          </div>
        </div>

        {/* Floating Satellites / Nodes at different Z depths (hidden on mobile, visible on sm and above) */}

        {/* Node 1: Early-Warning SLA Engine */}
        <div
          className="hidden sm:flex absolute top-4 left-4 glass-panel px-3.5 py-2.5 rounded-xl border border-cyan-500/30 items-center gap-2.5 shadow-xl transition-all duration-300 hover:border-cyan-400"
          style={{ transform: 'translateZ(75px)' }}
        >
          <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Early-Warning</div>
            <div className="text-xs font-semibold text-slate-200">Explainable SLA Risk</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
        </div>

        {/* Node 2: Duplicate Intelligence */}
        <div
          className="hidden sm:flex absolute bottom-6 left-6 glass-panel px-3.5 py-2.5 rounded-xl border border-violet-500/30 items-center gap-2.5 shadow-xl transition-all duration-300 hover:border-violet-400"
          style={{ transform: 'translateZ(90px)' }}
        >
          <div className="p-1.5 rounded-lg bg-violet-950 text-violet-400">
            <GitCommit className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Duplicate Engine</div>
            <div className="text-xs font-semibold text-slate-200">Local Difflib Co-Signing</div>
          </div>
        </div>

        {/* Node 3: Immutable Audit Chain */}
        <div
          className="hidden sm:flex absolute top-10 right-4 glass-panel px-3.5 py-2.5 rounded-xl border border-blue-500/30 items-center gap-2.5 shadow-xl transition-all duration-300 hover:border-blue-400"
          style={{ transform: 'translateZ(85px)' }}
        >
          <div className="p-1.5 rounded-lg bg-blue-950 text-blue-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Audit Chain</div>
            <div className="text-xs font-semibold text-slate-200">Immutable Timeline</div>
          </div>
        </div>

        {/* Node 4: Proof of Resolution */}
        <div
          className="hidden sm:flex absolute bottom-8 right-6 glass-panel px-3.5 py-2.5 rounded-xl border border-emerald-500/30 items-center gap-2.5 shadow-xl transition-all duration-300 hover:border-emerald-400"
          style={{ transform: 'translateZ(70px)' }}
        >
          <div className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400">
            <FileCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Proof of Resolution</div>
            <div className="text-xs font-semibold text-slate-200">Verified Evidence & Notes</div>
          </div>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      </div>
    </div>
  );
};
