import { useMemo } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  FileKey2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ReceiptText,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";

const pipeline = [
  { label: "select", value: "vault file", icon: FileKey2 },
  { label: "seal", value: "local key", icon: LockKeyhole },
  { label: "commit", value: "access proof", icon: Boxes },
  { label: "store", value: "Shelby blob", icon: Database },
];

const proofPoints = [
  {
    icon: ShieldCheck,
    title: "Local encryption first",
    copy: "AES-256-GCM runs in the browser before bytes touch Shelby storage.",
  },
  {
    icon: KeyRound,
    title: "Wallet-owned control",
    copy: "Aptos signatures bind ownership, sharing, and revocation to the connected account.",
  },
  {
    icon: Terminal,
    title: "Gateway-compatible paths",
    copy: "Stable blob names keep the vault readable from Shelby S3 Gateway workflows.",
  },
];

const trustSignals = [
  { icon: LockKeyhole, label: "AES-256-GCM", value: "local encryption" },
  { icon: KeyRound, label: "Aptos L1", value: "signed access" },
  { icon: ReceiptText, label: "Receipts", value: "hash and owner proof" },
  { icon: Server, label: "ShelbyNet", value: "object storage" },
  { icon: Terminal, label: "S3 gateway", value: "tool handoff" },
];

export function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="relative z-10">
      <section className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1760px] grid-cols-1 gap-12 px-4 pb-16 pt-10 md:grid-cols-[1.08fr_0.92fr] md:px-6 md:pb-20 md:pt-12 lg:gap-16 2xl:px-8">
        <div className="flex flex-col justify-center">
          <div className="accent-chip motion-stagger motion-delay-1 mb-7 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--acid)]" />
            wallet-owned private storage
          </div>

          <h1 className="motion-stagger motion-delay-2 max-w-[12.4ch] font-display text-[clamp(3rem,7.4vw,7.2rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-frost">
            Wallet-owned private storage.
          </h1>

          <p className="motion-stagger motion-delay-3 mt-7 max-w-[61ch] text-base leading-8 text-frost-dim md:text-lg">
            BlobSafe seals sensitive files locally, commits access on Aptos, and stores the encrypted bytes as owner-scoped Shelby blobs.
          </p>

          <div className="motion-stagger motion-delay-4 mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate("/app")}
              className="premium-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-base font-semibold shadow-[0_18px_40px_-28px_rgba(156,206,118,0.75)] focus:outline-none focus:ring-2 focus:ring-acid/50 focus:ring-offset-2 focus:ring-offset-obsidian-950"
            >
              Open vault
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <a
              href="#protocol"
              className="themed-secondary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
            >
              Inspect protocol path
            </a>
          </div>

          <DataRibbon />
        </div>

        <div className="flex items-center md:justify-end">
          <ProductPreview />
        </div>
      </section>

      <section id="protocol" className="relative border-y themed-divider bg-[var(--surface-muted)]">
        <div className="mx-auto grid max-w-[1760px] gap-10 px-4 py-16 md:grid-cols-[0.7fr_1.3fr] md:px-6 md:py-20 2xl:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--acid)]">
              storage path
            </p>
            <h2 className="mt-4 max-w-[11ch] font-display text-4xl font-semibold leading-none tracking-[-0.04em] md:text-6xl">
              A sealed file keeps its proof close.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-border)] sm:grid-cols-3">
            {proofPoints.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="group bg-[var(--surface)] p-6 transition-colors duration-200 hover:bg-[var(--surface-raised)] md:p-8">
                  <Icon size={20} className="mb-8 text-[var(--acid)] transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <h3 className="font-display text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-frost-dim">{item.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1760px] px-4 py-16 md:px-6 md:py-20 2xl:px-8">
        <TrustSignalStrip />

        <div className="premium-surface mt-5 grid gap-8 rounded-2xl p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-frost-muted">vault operations</p>
            <h2 className="mt-3 max-w-[16ch] font-display text-3xl font-semibold leading-none tracking-[-0.04em] md:text-5xl">
              Seal files, grant access, recover receipts, inspect proof.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("/app")}
            className="themed-secondary group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-base font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
          >
            Open vault
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>
    </main>
  );
}

function DataRibbon() {
  const checks = useMemo(
    () => ["zero app custody", "wallet-scoped storage", "Shelby network ready"],
    []
  );

  return (
    <div className="motion-stagger motion-delay-5 mt-10 grid gap-3 sm:grid-cols-3">
      {checks.map((check) => (
        <div key={check} className="data-ribbon-item group flex min-h-12 items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--soft-hover)]">
          <CheckCircle2 size={14} className="shrink-0 text-[var(--acid)] transition-transform duration-200 group-hover:scale-105" />
          <span>{check}</span>
        </div>
      ))}
    </div>
  );
}

function TrustSignalStrip() {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-border)] sm:grid-cols-2 xl:grid-cols-5">
      {trustSignals.map((signal) => {
        const Icon = signal.icon;
        return (
          <div key={signal.label} className="group bg-[var(--surface)] px-4 py-5 transition-colors duration-200 hover:bg-[var(--surface-raised)]">
            <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--acid)] transition-transform duration-200 group-hover:-translate-y-0.5">
              <Icon size={16} />
            </div>
            <p className="font-display text-base font-semibold tracking-[-0.02em] text-frost">{signal.label}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">{signal.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="motion-stagger motion-delay-3 w-full max-w-[680px]">
      <div className="premium-surface landing-preview relative rounded-[18px] p-3">
        <div className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--acid),transparent)] opacity-60" />
        <div className="raised-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-frost-muted">BlobSafe vault</p>
              <p className="mt-1 font-display text-lg font-semibold tracking-[-0.02em]">sealed upload</p>
            </div>
            <div className="accent-chip rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
              shelbynet
            </div>
          </div>

          <div className="grid gap-px bg-[var(--surface-border)] md:grid-cols-4">
            {pipeline.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="group bg-[var(--surface-raised)] p-4">
                  <Icon size={18} className="text-[var(--acid)] transition-transform duration-200 group-hover:-translate-y-0.5" />
                  <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-frost-muted">{step.label}</p>
                  <p className="mt-1 font-display text-base font-semibold">{step.value}</p>
                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--acid)] animate-bar-breathe"
                      style={{ width: `${52 + index * 13}%`, animationDelay: `${index * 110}ms` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4">
            <div className="grid gap-3">
              {[
                ["treasury-ledger.csv", "sealed - 2.8 MB", "0x43c7...9af2"],
                ["identity-pack.png", "encrypting - 64%", "wallet required"],
                ["board-resolution.pdf", "stored - 1.1 MB", "commit confirmed"],
              ].map(([name, meta, owner], index) => (
                <div
                  key={name}
                  className="preview-file-row grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-[var(--surface-border)] px-3 py-3 transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--soft-hover)]"
                  style={{ animationDelay: `${420 + index * 90}ms` }}
                >
                  <div className="min-w-0">
                    <p className="preview-file-name truncate">{name}</p>
                    <p className="preview-file-meta mt-1 font-mono text-[10px] uppercase tracking-[0.08em]">{meta}</p>
                  </div>
                  <p className="preview-file-owner self-center font-mono text-[10px]">{owner}</p>
                </div>
              ))}
            </div>

            <div className="preview-receipt mt-4 grid gap-3 rounded-xl border border-[var(--surface-border-strong)] px-4 py-3 md:grid-cols-[28px_1fr_auto] md:items-center">
              <Fingerprint size={16} className="text-[var(--acid)]" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--acid)]">receipt sealed</p>
                <p className="preview-receipt-value mt-1 truncate font-mono">sha256:f7c9...a91e / owner wallet required</p>
              </div>
              <span className="live-status inline-flex w-fit items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-frost-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--acid)]" />
                live
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="preview-tech-strip mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-border)] font-mono text-[10px] uppercase">
        <div className="bg-[var(--surface-raised)] px-3 py-3">AES-GCM</div>
        <div className="bg-[var(--surface-raised)] px-3 py-3">Aptos sign</div>
        <div className="bg-[var(--surface-raised)] px-3 py-3">on-chain proof</div>
        <div className="bg-[var(--surface-raised)] px-3 py-3">Shelby blob</div>
      </div>
    </div>
  );
}
