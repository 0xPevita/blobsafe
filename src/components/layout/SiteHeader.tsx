import { lazy, Suspense } from "react";
import { ExternalLink, Moon, Server, Sun } from "lucide-react";
import { BirdLogo } from "@/components/brand/BirdLogo";
import { useShelbyNetwork } from "@/providers";
import { SHELBY_NETWORK_OPTIONS, type ShelbyNetworkName } from "@/lib/shelbyNetwork";

const WalletButton = lazy(() =>
  import("@/components/WalletButton").then((module) => ({ default: module.WalletButton }))
);

export function SiteHeader({
  page,
  theme,
  onThemeChange,
  onNavigate,
  showWallet = false,
}: {
  page: "landing" | "dapp";
  theme: "dark" | "light";
  onThemeChange: () => void;
  onNavigate: (path: string) => void;
  showWallet?: boolean;
}) {
  const { networkName, networkLabel, pendingNetworkName, setNetworkName } = useShelbyNetwork();

  return (
    <header className="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto grid h-[74px] max-w-[1760px] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr] md:px-6 2xl:px-8">
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="group flex min-h-12 w-fit items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
        >
          <div className="logo-tile flex h-11 w-11 items-center justify-center rounded-xl text-[var(--acid)] transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
            <BirdLogo className="h-8 w-8" />
          </div>
          <div className="leading-none">
            <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">BlobSafe</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-frost-muted">
              Private Shelby vault
            </p>
          </div>
        </button>

        <nav className="nav-shell hidden items-center gap-1 rounded-2xl p-1 font-mono text-xs uppercase tracking-[0.13em] text-frost-dim md:flex">
          {page === "landing" ? (
            <>
              <a href="#protocol" className="rounded-xl px-4 py-2.5 transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30">Protocol</a>
              <button type="button" onClick={() => onNavigate("/app")} className="rounded-xl px-4 py-2.5 transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30">
                Open vault
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onNavigate("/")} className="rounded-xl px-4 py-2.5 transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30">
              Home
            </button>
          )}
          <a
            href="https://docs.shelby.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30"
          >
            Docs <ExternalLink size={11} />
          </a>
        </nav>

        <div className="flex items-center justify-end gap-2">
          <NetworkSwitch
            activeNetwork={networkName}
            activeLabel={networkLabel}
            pendingNetwork={pendingNetworkName}
            onChange={setNetworkName}
          />
          <button
            type="button"
            onClick={onThemeChange}
            className="icon-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate(page === "landing" ? "/app" : "/")}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-frost-dim transition-colors hover:border-acid/30 hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30 md:hidden"
          >
            {page === "landing" ? "Vault" : "Home"}
          </button>
          {showWallet && (
            <Suspense fallback={<WalletButtonSkeleton />}>
              <WalletButton />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}

function WalletButtonSkeleton() {
  return (
    <div className="hidden h-12 w-[154px] animate-pulse rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] md:block" />
  );
}

function NetworkSwitch({
  activeNetwork,
  activeLabel,
  pendingNetwork,
  onChange,
}: {
  activeNetwork: ShelbyNetworkName;
  activeLabel: string;
  pendingNetwork: ShelbyNetworkName | null;
  onChange: (network: ShelbyNetworkName) => void;
}) {
  const visualNetwork = pendingNetwork ?? activeNetwork;

  return (
    <div
      className={`network-switch hidden items-center rounded-xl p-1 sm:flex ${pendingNetwork ? "is-switching" : ""}`}
      aria-label={`Active network ${activeLabel}`}
      aria-busy={Boolean(pendingNetwork)}
    >
      <div className="flex min-h-9 items-center gap-2 px-2.5 text-frost-dim lg:px-3">
        <Server size={13} />
        <span className="crisp-label hidden font-mono uppercase lg:inline">
          Network
        </span>
      </div>
      <div className="flex items-center gap-1">
        {SHELBY_NETWORK_OPTIONS.map((option) => {
          const active = visualNetwork === option.name;
          const switching = pendingNetwork === option.name;
          return (
            <button
              key={option.name}
              type="button"
              onClick={() => onChange(option.name)}
              disabled={Boolean(pendingNetwork)}
              aria-pressed={active}
              className={`network-switch-option min-h-9 rounded-lg px-3 font-mono uppercase transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-acid/30 ${
                active ? "is-active" : ""
              } ${
                switching ? "is-switching" : ""
              }`}
            >
              <span className="hidden lg:inline">{option.label}</span>
              <span className="lg:hidden">{option.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
