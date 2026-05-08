import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useState } from "react";
import { Wallet, ChevronDown, LogOut, Copy, CheckCheck, ExternalLink, PlugZap } from "lucide-react";
import { truncateAddress } from "@/lib/shelby";

export function WalletButton() {
  const { connect, disconnect, connected, account, wallet, wallets, notDetectedWallets } = useWallet();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const walletOptions = [...wallets, ...notDetectedWallets].filter(
    (option, index, allOptions) =>
      allOptions.findIndex((item) => item.name === option.name) === index
  );

  const handleCopy = async () => {
    if (!account) return;
    await navigator.clipboard.writeText(account.address.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (connected && account) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-2 font-mono text-sm text-frost-dim transition-colors hover:border-acid/30 hover:bg-[var(--soft-hover)] focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
        >
          <div className="h-2 w-2 rounded-full bg-acid" />
          <span className="text-frost">{truncateAddress(account.address.toString())}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="wallet-menu absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] backdrop-blur-xl animate-fade-in">
            <div className="border-b border-[var(--surface-border)] px-4 py-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-frost-muted">Connected wallet</p>
              <p className="font-mono text-xs text-frost">{wallet?.name || "Wallet"}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex min-h-12 w-full items-center gap-2 px-4 text-sm text-frost-dim transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-inset focus:ring-acid/30"
            >
              {copied ? <CheckCheck size={14} className="text-acid" /> : <Copy size={14} />}
              {copied ? "Address copied" : "Copy address"}
            </button>
            <button
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex min-h-12 w-full items-center gap-2 px-4 text-sm text-danger/80 transition-colors hover:bg-[var(--soft-hover)] hover:text-danger focus:outline-none focus:ring-2 focus:ring-inset focus:ring-danger/30"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        )}

        {open && (
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="premium-button flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-2 font-display text-base font-semibold shadow-[0_18px_40px_-28px_rgba(156,206,118,0.75)] focus:outline-none focus:ring-2 focus:ring-acid/50 focus:ring-offset-2 focus:ring-offset-obsidian-950"
      >
        <Wallet size={15} />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="wallet-menu absolute right-0 top-full z-50 mt-3 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] backdrop-blur-xl animate-fade-in">
          <div className="border-b border-[var(--surface-border)] px-5 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--acid)]">
              connect wallet
            </p>
            <p className="mt-2 max-w-[28ch] text-sm leading-5 text-frost-dim">
              Choose an Aptos wallet to scope encryption, ownership, and access grants.
            </p>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {walletOptions.length > 0 ? (
              walletOptions.map((option) => {
                const installed = option.readyState === "Installed";

                if (!installed) {
                  return (
                    <a
                      key={option.name}
                      href={option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid min-h-16 grid-cols-[38px_1fr_auto] items-center gap-3 rounded-xl px-3 transition-colors hover:bg-[var(--soft-hover)] focus:outline-none focus:ring-2 focus:ring-acid/30"
                    >
                      <WalletIcon src={option.icon} name={option.name} muted />
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm font-semibold text-frost">{option.name}</span>
                        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">install wallet</span>
                      </span>
                      <ExternalLink size={14} className="text-frost-muted" />
                    </a>
                  );
                }

                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => {
                      connect(option.name);
                      setOpen(false);
                    }}
                    className="grid min-h-16 w-full grid-cols-[38px_1fr_auto] items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[var(--soft-hover)] focus:outline-none focus:ring-2 focus:ring-acid/30"
                  >
                    <WalletIcon src={option.icon} name={option.name} />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm font-semibold text-frost">{option.name}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--acid)]">available</span>
                    </span>
                    <PlugZap size={14} className="text-[var(--acid)]" />
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] text-frost-muted">
                  <Wallet size={17} />
                </div>
                <p className="font-display text-sm font-semibold text-frost">No Aptos wallet detected</p>
                <p className="mt-1 text-xs leading-5 text-frost-muted">Install a supported wallet extension, then reload BlobSafe.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

function WalletIcon({
  src,
  name,
  muted = false,
}: {
  src?: string;
  name: string;
  muted?: boolean;
}) {
  return (
    <span className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border ${muted ? "border-[var(--surface-border)] bg-[var(--surface-muted)] opacity-70" : "border-[var(--surface-border-strong)] bg-[var(--acid-glow)]"}`}>
      {src ? (
        <img src={src} alt={`${name} icon`} className="h-6 w-6 rounded-md object-contain" />
      ) : (
        <Wallet size={15} className={muted ? "text-frost-muted" : "text-[var(--acid)]"} />
      )}
    </span>
  );
}
