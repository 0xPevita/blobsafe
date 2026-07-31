import { lazy, Suspense, useEffect, useState } from "react";
import { ExternalLink, Menu, Moon, Server, Sun, X } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [page]);

  const goTo = (path: string) => {
    setMobileMenuOpen(false);
    onNavigate(path);
  };

  return (
    <header className="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="site-header-inner mx-auto grid h-[74px] max-w-[1760px] grid-cols-[1fr_auto] items-center gap-4 px-4 md:px-6 lg:grid-cols-[1fr_auto_1fr] 2xl:px-8">
        <button
          type="button"
          onClick={() => goTo("/")}
          className="brand-lockup group flex min-h-12 w-fit min-w-0 items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
        >
          <div className="logo-tile flex h-11 w-11 items-center justify-center rounded-xl text-[var(--acid)] transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
            <BirdLogo className="h-8 w-8" />
          </div>
          <div className="brand-copy min-w-0 leading-none">
            <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">BlobSafe</p>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-frost-muted">
              Private Shelby vault
            </p>
          </div>
        </button>

        <nav className="nav-shell hidden items-center gap-1 rounded-2xl p-1 font-mono text-xs uppercase tracking-[0.13em] text-frost-dim lg:flex">
          {page === "landing" ? (
            <>
              <a href="#protocol" className="nav-shell-item rounded-xl px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30">Protocol</a>
              <button type="button" onClick={() => goTo("/app")} className="nav-shell-item rounded-xl px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30">
                Open vault
              </button>
            </>
          ) : (
            <button type="button" onClick={() => goTo("/")} className="nav-shell-item rounded-xl px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30">
              Home
            </button>
          )}
          <a
            href="https://docs.shelby.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-shell-item flex items-center gap-1.5 rounded-xl px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
          >
            Docs <ExternalLink size={11} />
          </a>
        </nav>

        <div className="header-actions flex min-w-0 items-center justify-end gap-2">
          <NetworkSwitch
            activeNetwork={networkName}
            activeLabel={networkLabel}
            pendingNetwork={pendingNetworkName}
            onChange={setNetworkName}
          />
          <button
            type="button"
            onClick={onThemeChange}
            className="theme-button icon-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span key={theme} className="theme-icon-swap inline-flex">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label="Open navigation menu"
            className="mobile-menu-button icon-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 lg:hidden"
          >
            {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
          {showWallet && (
            <Suspense fallback={<WalletButtonSkeleton />}>
              <WalletButton />
            </Suspense>
          )}
        </div>
      </div>
      {mobileMenuOpen && (
        <>
          <div className="mobile-nav-backdrop fixed inset-0 top-[74px] z-30 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-menu lg:hidden">
            <div className="grid gap-2">
              {page === "landing" ? (
                <>
                  <a
                    href="#protocol"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mobile-nav-item"
                  >
                    Protocol
                  </a>
                  <button type="button" onClick={() => goTo("/app")} className="mobile-nav-item text-left">
                    Open vault
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => goTo("/")} className="mobile-nav-item text-left">
                  Home
                </button>
              )}
              <a
                href="https://docs.shelby.xyz"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="mobile-nav-item flex items-center justify-between gap-3"
              >
                Docs <ExternalLink size={13} />
              </a>
              <div className="mobile-network-panel mt-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-2">
                <div className="mb-2 flex items-center gap-2 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">
                  <Server size={12} />
                  Network
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SHELBY_NETWORK_OPTIONS.map((option) => {
                    const active = (pendingNetworkName ?? networkName) === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setNetworkName(option.name);
                        }}
                        disabled={Boolean(pendingNetworkName)}
                        className={`mobile-network-option ${active ? "is-active" : ""}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

function WalletButtonSkeleton() {
  return (
    <div className="wallet-skeleton hidden h-12 w-[154px] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] md:block" />
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
  const activeIndex = SHELBY_NETWORK_OPTIONS.findIndex((option) => option.name === visualNetwork);

  return (
    <div
      className={`network-switch hidden items-center rounded-xl p-1 lg:flex ${pendingNetwork ? "is-switching" : ""}`}
      aria-label={`Active network ${activeLabel}`}
      aria-busy={Boolean(pendingNetwork)}
    >
      <div className="flex min-h-9 items-center gap-2 px-2.5 text-frost-dim lg:px-3">
        <Server size={13} />
        <span className="crisp-label hidden font-mono uppercase lg:inline">
          Network
        </span>
      </div>
      <div className="network-switch-options relative grid grid-cols-2 items-center gap-1">
        <span
          className="network-switch-indicator"
          style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
        />
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
