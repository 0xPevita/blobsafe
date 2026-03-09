"use client";

import { Shield, Zap, Globe, Lock } from "lucide-react";

export function StatsBar() {
  const stats = [
    { icon: <Shield size={13} />, label: "AES-256-GCM", sublabel: "Client-side encryption" },
    { icon: <Zap size={13} />, label: "Shelby Protocol", sublabel: "Private fiber network" },
    { icon: <Globe size={13} />, label: "Aptos L1", sublabel: "On-chain access control" },
    { icon: <Lock size={13} />, label: "Zero knowledge", sublabel: "We never see your data" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-obsidian-900 border border-obsidian-700 hover:border-obsidian-600 transition-colors"
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <div className="w-7 h-7 rounded-lg bg-acid/10 flex items-center justify-center text-acid flex-shrink-0">
            {stat.icon}
          </div>
          <div>
            <p className="text-xs font-mono font-medium text-frost leading-none">{stat.label}</p>
            <p className="text-[10px] text-frost-muted mt-0.5">{stat.sublabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
