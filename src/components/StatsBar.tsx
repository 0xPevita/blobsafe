import { Shield, Zap, Globe, Lock } from "lucide-react";

export function StatsBar() {
  const stats = [
    { icon: <Shield size={13} />, label: "AES-256-GCM", sublabel: "Client-side encryption" },
    { icon: <Zap size={13} />, label: "Shelby Protocol", sublabel: "Private fiber network" },
    { icon: <Globe size={13} />, label: "Aptos L1", sublabel: "On-chain access control" },
    { icon: <Lock size={13} />, label: "Zero knowledge", sublabel: "We never see your data" },
  ];

  return (
    <div className="premium-surface grid overflow-hidden rounded-xl md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={i}
          className={`flex min-h-[88px] items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--soft-hover)] ${i < stats.length - 1 ? "border-b border-[var(--surface-border)] md:border-r xl:border-b-0" : ""} ${i === 1 ? "md:border-r-0 xl:border-r" : ""}`}
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-acid">
            {stat.icon}
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium leading-none text-frost">{stat.label}</p>
            <p className="mt-1.5 line-clamp-2 text-xs leading-4 text-frost-muted">{stat.sublabel}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
