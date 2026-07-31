import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAccountBlobs } from "@shelby-protocol/react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings,
  Upload,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FileList } from "@/components/FileList";
import { FileUpload, type UploadReceipt } from "@/components/FileUpload";
import { ReceiptBackupPanel } from "@/components/ReceiptBackupPanel";
import { SharedAccess } from "@/components/SharedAccess";
import { StatsBar } from "@/components/StatsBar";
import { TeamAccess } from "@/components/TeamAccess";
import {
  formatBytes,
  formatDate,
  getBlobCreationMicros,
  getBlobStoredName,
  getExplorerUrl,
  getShelbyBlobExplorerUrl,
  getWalletAccountAddress,
  SHELBY_API_KEY_STATUS,
  SHELBY_EXPLORER_URL,
  SHELBY_FULLNODE_URL,
  SHELBY_INDEXER_URL,
  SHELBY_NETWORK_LABEL,
  SHELBY_NETWORK_NAME,
  SHELBY_RPC_URL,
  shelbyClient,
  SHELBY_S3_GATEWAY_STATUS,
  SHELBY_S3_GATEWAY_URL,
  truncateAddress,
} from "@/lib/shelby";
import { getWalletEncryptionKey } from "@/lib/encryption";
import {
  downloadReceiptBackup,
  getLastSeenReceiptBackup,
  isReceiptBackupBlob,
  listLocalReceiptsForBackup,
  markReceiptBackupSeen,
  restoreReceiptBackup,
} from "@/lib/receiptBackups";
import {
  BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
  BLOBSAFE_ACCESS_MODULE,
  BLOBSAFE_ACCESS_STATUS,
  type AccessRuntimeStatus,
  validateAccessControlRuntime,
} from "@/lib/accessControl";
import {
  getAuditEventCopy,
  getAuditEventTitle,
  readAuditEvents,
  type AuditEvent,
} from "@/lib/auditTrail";

type AppSection = "overview" | "upload" | "files" | "shared" | "teams" | "activity" | "settings";

const getWalletName = (wallet: unknown): string | undefined => (wallet as { name?: string } | null)?.name;

const RECEIPTS_STORAGE_KEY = "blobsafe-session-receipts";
const ACTIVITY_PAGE_SIZE = 5;

const normalizeStorageAccount = (account?: string) => account?.trim().toLowerCase() || "";

const sessionReceiptsKey = (account: string) => {
  const normalized = normalizeStorageAccount(account);
  return `${RECEIPTS_STORAGE_KEY}:${SHELBY_NETWORK_NAME}:${normalized}`;
};

const legacySessionReceiptsKey = (account: string) => {
  const normalized = normalizeStorageAccount(account);
  return `${RECEIPTS_STORAGE_KEY}:${normalized}`;
};

function loadStoredReceipts(account?: string): UploadReceipt[] {
  if (!account) return [];

  try {
    const stored =
      window.localStorage.getItem(sessionReceiptsKey(account)) ||
      (SHELBY_NETWORK_NAME === "shelbynet"
        ? window.localStorage.getItem(legacySessionReceiptsKey(account))
        : null);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    const receipts = Array.isArray(parsed) ? parsed : [];
    return receipts
      .filter((receipt) =>
        !account || normalizeStorageAccount(receipt?.account) === normalizeStorageAccount(account)
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function storeReceipts(receipts: UploadReceipt[], account?: string) {
  if (!account) return;
  window.localStorage.setItem(sessionReceiptsKey(account), JSON.stringify(receipts.slice(0, 5)));
}

function clearStoredReceipts(account?: string) {
  if (!account) return;
  window.localStorage.removeItem(sessionReceiptsKey(account));
  if (SHELBY_NETWORK_NAME === "shelbynet") {
    window.localStorage.removeItem(legacySessionReceiptsKey(account));
  }
}

const appNav: Array<{
  section: AppSection;
  label: string;
  path: string;
  icon: LucideIcon;
}> = [
  { section: "overview", label: "Overview", path: "/app", icon: Gauge },
  { section: "upload", label: "Seal", path: "/app/upload", icon: Upload },
  { section: "files", label: "Files", path: "/app/files", icon: FolderOpen },
  { section: "shared", label: "Shared", path: "/app/shared", icon: KeyRound },
  { section: "teams", label: "Groups", path: "/app/teams", icon: UsersRound },
  { section: "activity", label: "Activity", path: "/app/activity", icon: Clock },
  { section: "settings", label: "Settings", path: "/app/settings", icon: Settings },
];

function getSection(path: string): AppSection {
  if (path === "/upload" || path.endsWith("/upload")) return "upload";
  if (path.endsWith("/files")) return "files";
  if (path.endsWith("/shared")) return "shared";
  if (path.endsWith("/teams")) return "teams";
  if (path.endsWith("/activity")) return "activity";
  if (path.endsWith("/settings")) return "settings";
  return "overview";
}

export function DappPage({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const { connected, account, wallet, signMessage } = useWallet();
  const accountAddress = getWalletAccountAddress(account);
  const activeAccountAddress = connected ? accountAddress : undefined;
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [latestReceipts, setLatestReceipts] = useState<UploadReceipt[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [autoRecovery, setAutoRecovery] = useState<{
    status: "idle" | "available" | "restoring" | "restored" | "error";
    message?: string;
    blobName?: string;
  }>({ status: "idle" });
  const [attemptedRecoveryBlob, setAttemptedRecoveryBlob] = useState("");
  const activeSection = getSection(currentPath);

  const { data: recoveryBlobs } = useAccountBlobs({
    client: shelbyClient,
    account: activeAccountAddress || "0x0",
    enabled: !!connected && !!activeAccountAddress,
  });

  const latestRecoveryBlob = useMemo(() => {
    return (recoveryBlobs || [])
      .map((blob) => ({
        blobName: getBlobStoredName(blob),
        createdMicros: getBlobCreationMicros(blob) ?? 0,
      }))
      .filter((blob) => isReceiptBackupBlob(blob.blobName))
      .sort((a, b) => {
        if (a.createdMicros !== b.createdMicros) return b.createdMicros - a.createdMicros;
        return b.blobName.localeCompare(a.blobName);
      })[0]?.blobName ?? "";
  }, [recoveryBlobs]);

  useEffect(() => {
    setLatestReceipts(loadStoredReceipts(activeAccountAddress));
    setAuditEvents(readAuditEvents(activeAccountAddress));
    setRefreshTrigger((key) => key + 1);
    setAutoRecovery({ status: "idle" });
    setAttemptedRecoveryBlob("");
  }, [activeAccountAddress]);

  useEffect(() => {
    if (!connected || !activeAccountAddress || !latestRecoveryBlob) return;
    if (attemptedRecoveryBlob === latestRecoveryBlob) return;
    if (getLastSeenReceiptBackup(activeAccountAddress) === latestRecoveryBlob) return;

    setAttemptedRecoveryBlob(latestRecoveryBlob);
    const localCount = listLocalReceiptsForBackup(activeAccountAddress).length;
    if (localCount > 0) {
      markReceiptBackupSeen(activeAccountAddress, latestRecoveryBlob);
      setAutoRecovery({ status: "idle" });
      return;
    }

    setAutoRecovery({
      status: "available",
      blobName: latestRecoveryBlob,
      message: "Encrypted receipt recovery is available for this wallet. Restore it when you need preview or download on this browser.",
    });
  }, [activeAccountAddress, attemptedRecoveryBlob, connected, latestRecoveryBlob]);

  const handleRestoreRecovery = async () => {
    const blobName = autoRecovery.blobName || latestRecoveryBlob;
    if (!connected || !activeAccountAddress || !signMessage || !blobName) return;

    setAutoRecovery({
      status: "restoring",
      blobName,
      message: "Approve the local decrypt signature to restore encrypted receipts. No transaction is submitted.",
    });

    try {
      const masterKey = await getWalletEncryptionKey(activeAccountAddress, signMessage);
      const payload = await downloadReceiptBackup({
        account: activeAccountAddress,
        blobName,
        masterKey,
      });
      const before = listLocalReceiptsForBackup(activeAccountAddress).length;
      const restored = restoreReceiptBackup(payload, activeAccountAddress);
      const after = listLocalReceiptsForBackup(activeAccountAddress).length;
      markReceiptBackupSeen(activeAccountAddress, blobName);
      window.dispatchEvent(new CustomEvent("blobsafe:receipts-restored"));
      setRefreshTrigger((key) => key + 1);
      setAutoRecovery({
        status: "restored",
        blobName,
        message: after > before
          ? `${restored} receipt${restored === 1 ? "" : "s"} restored from ${SHELBY_NETWORK_LABEL}.`
          : "Wallet recovery point is already in sync.",
      });
    } catch (error) {
      setAutoRecovery({
        status: "error",
        blobName,
        message: error instanceof Error
          ? error.message
          : "Receipt recovery could not be restored.",
      });
    }
  };

  useEffect(() => {
    const handleRestore = () => {
      setLatestReceipts(loadStoredReceipts(activeAccountAddress));
      setAuditEvents(readAuditEvents(activeAccountAddress));
      setRefreshTrigger((key) => key + 1);
    };

    window.addEventListener("blobsafe:receipts-restored", handleRestore);
    window.addEventListener("blobsafe:audit-updated", handleRestore);
    return () => {
      window.removeEventListener("blobsafe:receipts-restored", handleRestore);
      window.removeEventListener("blobsafe:audit-updated", handleRestore);
    };
  }, [activeAccountAddress]);

  const handleUploadComplete = (receipts: UploadReceipt[]) => {
    if (receipts.length > 0 && activeAccountAddress) {
      setLatestReceipts((prev) => {
        const next = [...receipts, ...prev].slice(0, 5);
        storeReceipts(next, activeAccountAddress);
        return next;
      });
      setRefreshTrigger((key) => key + 1);
    }
  };

  const handleClearRecentReceipts = () => {
    clearStoredReceipts(activeAccountAddress);
    setLatestReceipts([]);
    setRefreshTrigger((key) => key + 1);
  };

  return (
    <main className="relative z-10 w-full px-4 py-8 md:px-6 md:py-12 2xl:px-8">
      <div className="mx-auto mb-8 grid max-w-[1760px] gap-7 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <button
            type="button"
            onClick={() => onNavigate("/")}
            className="mb-5 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-2 font-mono text-sm uppercase tracking-[0.12em] text-frost-dim transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950"
          >
            <ArrowRight size={13} className="rotate-180" />
            Home
          </button>

          <div className="premium-surface overflow-hidden rounded-2xl p-4">
            <div className="px-2 pb-4 pt-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--acid)]">
                vault
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold leading-none tracking-[-0.04em] text-frost">
                Vault
              </h1>
            </div>

            <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {appNav.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.section;
                return (
                  <button
                    key={item.section}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left font-mono text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-acid/30 ${
                      active
                        ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-frost shadow-[inset_0_1px_0_color-mix(in_srgb,var(--frost)_8%,transparent),0_18px_36px_-34px_color-mix(in_srgb,var(--acid)_55%,transparent)]"
                        : "border-transparent text-frost-dim hover:border-[var(--surface-border)] hover:bg-[var(--soft-hover)] hover:text-frost"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-[var(--acid)]" : ""} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-5 border-t border-[var(--surface-border)] px-2 pt-5">
              <div className="relative min-h-[144px] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">
                  wallet scope
                </p>
                <p className="mt-8 max-w-[19ch] font-display text-xl font-semibold leading-6 tracking-[-0.02em] text-frost">
                  Vault state follows the connected wallet.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <AppHeader
            activeSection={activeSection}
            connected={connected}
            accountAddress={accountAddress}
            walletName={getWalletName(wallet)}
          />

          <AutoRecoveryNotice state={autoRecovery} onRestore={handleRestoreRecovery} />

          <div key={activeSection} className="app-route-shell">
            {activeSection === "overview" && (
              <OverviewPanel
                connected={connected}
                latestReceipts={latestReceipts}
                onClearRecentReceipts={handleClearRecentReceipts}
                onNavigate={onNavigate}
              />
            )}

            {activeSection === "upload" && (
              <Panel title="Seal files" eyebrow="encrypted commit">
                <FileUpload onUploadComplete={handleUploadComplete} onOpenRecovery={() => onNavigate("/app/settings")} />
              </Panel>
            )}

            {activeSection === "files" && (
              <Panel title="Owned files" eyebrow="account blobs">
                <FileList key={refreshTrigger} />
              </Panel>
            )}

            {activeSection === "shared" && (
              <Panel title="Shared access" eyebrow="access grants">
                <SharedAccess />
              </Panel>
            )}

            {activeSection === "teams" && (
              <Panel title="Recipient groups" eyebrow="access groups">
                <TeamAccess />
              </Panel>
            )}

            {activeSection === "activity" && (
              <ActivityPanel
                connected={connected}
                accountAddress={activeAccountAddress}
                events={auditEvents}
                latestReceipts={latestReceipts}
                onRefresh={() => setAuditEvents(readAuditEvents(activeAccountAddress))}
              />
            )}

            {activeSection === "settings" && (
              <SettingsPanel
                connected={connected}
                accountAddress={accountAddress}
                walletName={getWalletName(wallet)}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AppHeader({
  activeSection,
  connected,
  accountAddress,
  walletName,
}: {
  activeSection: AppSection;
  connected: boolean;
  accountAddress?: string;
  walletName?: string;
}) {
  const titleMap: Record<AppSection, string> = {
    overview: "Overview",
    upload: "Seal",
    files: "Files",
    shared: "Shared",
    teams: "Groups",
    activity: "Activity",
    settings: "Settings",
  };

  return (
    <div className="mb-7 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--acid)]">
          {SHELBY_NETWORK_LABEL} vault
        </p>
        <h2 className="mt-2 font-display text-5xl font-semibold leading-none tracking-[-0.045em] text-frost md:text-6xl">
          {titleMap[activeSection]}
        </h2>
      </div>

      <div className="premium-surface rounded-2xl p-5">
        {connected && accountAddress ? (
          <div className="flex min-w-0 items-center justify-between gap-4 md:min-w-[260px]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">
                {walletName || "connected wallet"}
              </p>
              <p className="mt-1 font-mono text-base text-frost">{truncateAddress(accountAddress)}</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-[var(--acid)]" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3 text-frost-dim md:min-w-[260px]">
            <Wallet size={16} />
            <p className="text-base">Connect wallet to unlock vault state</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="premium-surface overflow-hidden rounded-2xl">
      <div className="border-b border-[var(--surface-border)] px-6 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">{eyebrow}</p>
        <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-frost">{title}</h3>
      </div>
      <div className="p-5 md:p-7">{children}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  copy,
  action,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state-premium flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-6 py-12 text-center">
      <div className="empty-state-icon mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
        <Icon size={21} />
      </div>
      <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-frost-dim">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function AutoRecoveryNotice({
  state,
  onRestore,
}: {
  state: {
    status: "idle" | "available" | "restoring" | "restored" | "error";
    message?: string;
    blobName?: string;
  };
  onRestore: () => void;
}) {
  if (state.status === "idle") return null;

  const isActive = state.status === "restoring";
  const isError = state.status === "error";
  const canRestore = state.status === "available" || state.status === "error";

  return (
    <div
      className={`mb-5 rounded-2xl border px-4 py-3 ${
        isError
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-frost"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex min-w-0 items-start gap-3">
          {isActive ? (
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--acid)]" />
          )}
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold">
              {isActive
                ? "Restoring wallet recovery"
                : state.status === "available"
                  ? "Recovery point found"
                  : isError
                    ? "Recovery restore needs attention"
                    : "Wallet recovery synced"}
            </p>
            <p className="mt-1 text-sm leading-6 opacity-80">
              {state.message || "BlobSafe found wallet-encrypted receipt recovery."}
            </p>
          </div>
        </div>
        {canRestore && (
          <button
            type="button"
            onClick={onRestore}
            className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
          >
            {state.status === "error" ? "Retry restore" : "Restore now"}
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewPanel({
  connected,
  latestReceipts,
  onClearRecentReceipts,
  onNavigate,
}: {
  connected: boolean;
  latestReceipts: UploadReceipt[];
  onClearRecentReceipts: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-5">
      <VaultCommand connected={connected} onNavigate={onNavigate} />
      <StatsBar />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ReceiptPanel
          connected={connected}
          latestReceipts={latestReceipts}
          onClearRecentReceipts={onClearRecentReceipts}
        />
        <ActionDock onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function VaultCommand({
  connected,
  onNavigate,
}: {
  connected: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="vault-command relative overflow-hidden rounded-3xl border border-[var(--surface-border-strong)] bg-[var(--command-bg)] p-6 md:p-9">
      <div className="absolute right-[-7rem] top-[-9rem] h-80 w-80 rotate-12 border border-[var(--surface-border)]" />
      <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--acid)]">
            wallet vault
          </p>
          <h3 className="mt-4 max-w-[15ch] font-display text-4xl font-semibold leading-[0.95] tracking-[-0.045em] text-frost md:text-6xl">
            Encrypt, register, and store wallet-owned files.
          </h3>
          <p className="mt-6 max-w-[68ch] text-base leading-8 text-frost-dim md:text-lg">
            BlobSafe encrypts in the browser, commits ownership metadata on Aptos, and stores the sealed bytes in {SHELBY_NETWORK_LABEL}.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate("/app/upload")}
              className="premium-button inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-display text-base font-semibold focus:outline-none focus:ring-2 focus:ring-acid/50 focus:ring-offset-2 focus:ring-offset-obsidian-950"
            >
              <Upload size={16} />
              Seal file
            </button>
            <button
              type="button"
              onClick={() => onNavigate("/app/files")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-5 font-display text-base font-semibold text-frost transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--soft-hover)] focus:outline-none focus:ring-2 focus:ring-acid/30"
            >
              <FolderOpen size={16} />
              Open files
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">
            storage flow
            </p>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-[var(--acid)]" : "bg-frost-muted"}`} />
          </div>
          <div className="space-y-3">
            {[
              ["01", "Local seal", "AES-GCM before transit"],
              ["02", "Ownership proof", "Aptos signed write"],
              ["03", "Shelby commit", "Account-owned blob"],
            ].map(([step, title, copy]) => (
              <div key={step} className="grid grid-cols-[38px_1fr] gap-3">
                <span className="font-mono text-xs text-[var(--acid)]">{step}</span>
                <div className="border-b border-[var(--surface-border)] pb-3 last:border-b-0 last:pb-0">
                  <p className="font-mono text-sm text-frost">{title}</p>
                  <p className="mt-1 text-sm text-frost-muted">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReceiptPanel({
  connected,
  latestReceipts,
  onClearRecentReceipts,
}: {
  connected: boolean;
  latestReceipts: UploadReceipt[];
  onClearRecentReceipts: () => void;
}) {
  const [copiedReceiptId, setCopiedReceiptId] = useState<string | null>(null);

  const copyReceipt = async (receipt: UploadReceipt) => {
    await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopiedReceiptId(receipt.id);
    window.setTimeout(() => setCopiedReceiptId(null), 1400);
  };

  return (
    <div className="premium-surface overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b border-[var(--surface-border)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">vault activity</p>
          <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-frost">Recent sealed files</h3>
        </div>
        <button
          type="button"
          onClick={onClearRecentReceipts}
          disabled={latestReceipts.length === 0}
          className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      <div className="p-5 md:p-7">
      {latestReceipts.length > 0 ? (
        <div className="grid gap-3">
          {latestReceipts.map((receipt) => (
            <div
              key={receipt.id}
              className="group grid gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--soft-hover)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="grid min-w-0 gap-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:items-start">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-[var(--acid)]">
                  <CheckCircle2 size={17} />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 max-w-full truncate font-mono text-sm font-semibold text-frost">
                      {receipt.fileName}
                    </p>
                    <span className="accent-chip rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                      stored
                    </span>
                  </div>

                  <p className="mt-2 max-w-[82ch] truncate rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[11px] leading-5 text-frost-muted">
                    {receipt.blobName}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
                    <span>{receipt.encryption}</span>
                    <span>{formatBytes(receipt.storedSize)}</span>
                    <span>{truncateAddress(receipt.account)}</span>
                    <span>expires {formatDate(receipt.expirationMicros)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={() => copyReceipt(receipt)}
                  className={`themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 ${copiedReceiptId === receipt.id ? "is-feedback-success" : ""}`}
                >
                  <Copy size={13} />
                  {copiedReceiptId === receipt.id ? "Copied" : "Copy"}
                </button>
                <a
                  href={getShelbyBlobExplorerUrl(receipt.account, receipt.blobName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
                >
                  <ExternalLink size={13} />
                  View
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={connected ? FileText : Wallet}
          title={connected ? "No recent sealed files" : "Connect wallet to load activity"}
          copy={connected
            ? "Seal a file and its receipt will appear here for quick verification."
            : "Recent activity is scoped to the connected wallet and active Shelby network."}
        />
      )}
      </div>
    </div>
  );
}

function ActionDock({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions: Array<{
    label: string;
    copy: string;
    path: string;
    icon: LucideIcon;
  }> = [
    { label: "Seal", copy: "Encrypt and store a file", path: "/app/upload", icon: Upload },
    { label: "Files", copy: "Open owned blobs", path: "/app/files", icon: FolderOpen },
    { label: "Shared", copy: "Use received grants", path: "/app/shared", icon: KeyRound },
    { label: "Groups", copy: "Manage recipients", path: "/app/teams", icon: UsersRound },
    { label: "Activity", copy: "Review vault events", path: "/app/activity", icon: Clock },
    { label: "Settings", copy: "Network and recovery", path: "/app/settings", icon: Settings },
  ];

  return (
    <section className="premium-surface rounded-2xl p-3">
      <p className="px-3 pb-2 pt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">
        quick actions
      </p>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.path}
            type="button"
            onClick={() => onNavigate(action.path)}
            className="group grid min-h-[76px] w-full grid-cols-[38px_1fr_20px] items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-[var(--soft-hover)] focus:outline-none focus:ring-2 focus:ring-acid/30"
          >
            <Icon size={17} className="text-[var(--acid)]" />
            <span className="min-w-0">
              <span className="block font-display text-base font-semibold text-frost">{action.label}</span>
              <span className="mt-0.5 block truncate text-sm text-frost-muted">{action.copy}</span>
            </span>
            <ArrowRight size={16} className="text-frost-muted transition-transform group-hover:translate-x-0.5 group-hover:text-frost" />
          </button>
        );
      })}
    </section>
  );
}

function ActivityPanel({
  connected,
  accountAddress,
  events,
  latestReceipts,
  onRefresh,
}: {
  connected: boolean;
  accountAddress?: string;
  events: AuditEvent[];
  latestReceipts: UploadReceipt[];
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(1);
  const receiptEvents = latestReceipts.map((receipt) => ({
    id: `receipt-${receipt.id}`,
    title: "File sealed",
    copy: `${receipt.fileName} was stored in ${SHELBY_NETWORK_LABEL}.`,
    createdAt: receipt.uploadedAt,
    blobName: receipt.blobName,
    txHash: receipt.accessControl?.status === "registered" ? receipt.accessControl.txHash : undefined,
    source: "receipt",
  }));
  const auditRows = events.map((event) => ({
    id: event.id,
    title: getAuditEventTitle(event.type),
    copy: getAuditEventCopy(event),
    createdAt: event.createdAt,
    blobName: event.blobName,
    txHash: event.txHash,
    source: event.source,
  }));
  const seen = new Set<string>();
  const rows = [...auditRows, ...receiptEvents]
    .filter((row) => {
      const key = row.txHash || `${row.title}-${row.blobName}-${row.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 40);
  const totalPages = Math.max(1, Math.ceil(rows.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (currentPage - 1) * ACTIVITY_PAGE_SIZE,
    currentPage * ACTIVITY_PAGE_SIZE
  );
  const firstRow = rows.length === 0 ? 0 : (currentPage - 1) * ACTIVITY_PAGE_SIZE + 1;
  const lastRow = Math.min(currentPage * ACTIVITY_PAGE_SIZE, rows.length);

  useEffect(() => {
    setPage(1);
  }, [accountAddress, rows.length]);

  return (
    <Panel title="Vault activity" eyebrow="audit log">
      <div className="activity-command mb-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="max-w-3xl text-sm leading-6 text-frost-dim">
            Review the wallet-scoped record of file registration, sharing, revocation, deletion, and receipt recovery.
          </p>
          {accountAddress && (
            <p className="mt-2 break-all font-mono text-[11px] leading-5 text-frost-muted">{accountAddress}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {rows.length > 0 && (
            <span className="inline-flex min-h-11 items-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
              {firstRow}-{lastRow} of {rows.length}
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={!connected}
            className="themed-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={13} />
            Refresh log
          </button>
        </div>
      </div>

      {!connected ? (
        <div className="activity-empty-shell">
          <EmptyState
            icon={Wallet}
            title="Connect wallet to load activity"
            copy="Activity is scoped to the connected wallet and active Shelby network."
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="activity-empty-shell">
          <EmptyState
            icon={Clock}
            title="No activity recorded yet"
            copy="Seal a file, grant access, or save a recovery point to start the audit log."
          />
        </div>
      ) : (
        <div className="activity-timeline space-y-3">
          {pageRows.map((row) => (
            <div key={row.id} className="activity-event-card grid gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--soft-hover)] lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="activity-event-main min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`activity-source-pill activity-source-${row.source} rounded-md border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-frost-muted`}>
                    {formatActivitySource(row.source)}
                  </span>
                  <p className="font-display text-base font-semibold text-frost">{row.title}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-frost-dim">{row.copy}</p>
                {row.blobName && (
                  <p className="activity-blob-path mt-2 max-w-4xl truncate rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-[11px] text-frost-muted">
                    {row.blobName}
                  </p>
                )}
              </div>
              <div className="activity-event-side flex flex-col gap-2 lg:items-end">
                <span className="activity-time font-mono text-[11px] text-frost-muted">{new Date(row.createdAt).toLocaleString()}</span>
                {row.txHash && (
                  <a
                    href={getExplorerUrl("tx", row.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    <ExternalLink size={13} />
                    Transaction
                  </a>
                )}
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="activity-pagination flex flex-col gap-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
                Page {currentPage} of {totalPages}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage === totalPages}
                  className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function formatActivitySource(source: string) {
  if (source === "aptos") return "Aptos";
  if (source === "shelby") return "Shelby";
  if (source === "receipt") return "Receipt";
  return source;
}

function SettingsPanel({
  connected,
  accountAddress,
  walletName,
}: {
  connected: boolean;
  accountAddress?: string;
  walletName?: string;
}) {
  const [accessRuntime, setAccessRuntime] = useState<AccessRuntimeStatus | null>(null);
  const [accessRuntimeLoading, setAccessRuntimeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      setAccessRuntimeLoading(true);
      const runtime = await validateAccessControlRuntime();
      if (!cancelled) {
        setAccessRuntime(runtime);
        setAccessRuntimeLoading(false);
      }
    };

    void validate();

    return () => {
      cancelled = true;
    };
  }, []);

  const contractValue = accessRuntimeLoading
    ? "checking"
    : accessRuntime?.label ?? formatStatusValue(BLOBSAFE_ACCESS_STATUS);

  const statusRows = [
    ["Network", SHELBY_NETWORK_LABEL, "Active storage target"],
    ["API key", formatStatusValue(SHELBY_API_KEY_STATUS), "Shelby write authorization"],
    ["Contract", contractValue, "Runtime access registry"],
    ["Gateway", formatStatusValue(SHELBY_S3_GATEWAY_STATUS), "S3 handoff"],
    ["Wallet", connected ? walletName || "connected" : "disconnected", accountAddress ? truncateAddress(accountAddress) : "No account loaded"],
  ];
  const advancedRows = [
    ["Shelby RPC", SHELBY_RPC_URL],
    ["Fullnode", SHELBY_FULLNODE_URL],
    ["Explorer", SHELBY_EXPLORER_URL],
    ["Contract address", BLOBSAFE_ACCESS_CONTRACT_ADDRESS || "needs deployment"],
    ["Module", BLOBSAFE_ACCESS_MODULE || "needs deployment"],
    ["Registry version", accessRuntime?.version ? `v${accessRuntime.version}` : "not verified"],
  ];

  return (
    <div className="space-y-5">
      <section className="settings-control-panel premium-surface rounded-2xl p-5 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--acid)]">
            settings
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-frost md:text-3xl">
              Vault controls
            </h3>
            <p className="mt-2 max-w-[72ch] text-sm leading-6 text-frost-dim">
              Review the active network, access registry, wallet scope, and gateway handoff before moving sensitive files.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={SHELBY_EXPLORER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="themed-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
            >
              <ExternalLink size={13} />
              Explorer
            </a>
            <a
              href="https://docs.shelby.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="themed-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
            >
              <ExternalLink size={13} />
              Docs
            </a>
          </div>
        </div>

        <div className="settings-health-grid mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {statusRows.map(([label, value, helper]) => (
            <SettingsStatusCard key={label} label={label} value={value} helper={helper} />
          ))}
        </div>

        <AccessRuntimePanel runtime={accessRuntime} loading={accessRuntimeLoading} />

        <details className="settings-details-panel mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-mono text-[11px] uppercase tracking-[0.1em] text-frost-dim transition-colors hover:text-frost [&::-webkit-details-marker]:hidden">
            Endpoint details
            <ArrowRight size={14} />
          </summary>
          <div className="grid gap-3 border-t border-[var(--surface-border)] p-4 md:grid-cols-2">
            {advancedRows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{label}</p>
                <p className="mt-1 break-all font-mono text-xs leading-5 text-frost">{value}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      <ReceiptBackupPanel />
      <S3GatewayPanel accountAddress={accountAddress} />
    </div>
  );
}

function SettingsStatusCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  const warning = value === "needs key" || value === "none" || value === "disconnected" || value === "checking" || value.includes("needs ") || value.includes("check ");
  return (
    <div className="settings-status-card rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="crisp-label font-mono uppercase">{label}</p>
        <span className={`settings-status-dot h-2 w-2 shrink-0 rounded-full ${warning ? "is-warning bg-frost-muted" : "bg-[var(--acid)]"}`} />
      </div>
      <p className="crisp-value mt-2 truncate font-display text-base">{value}</p>
      <p className="crisp-helper mt-1 text-sm leading-5">{helper}</p>
    </div>
  );
}

function AccessRuntimePanel({
  runtime,
  loading,
}: {
  runtime: AccessRuntimeStatus | null;
  loading: boolean;
}) {
  const items = [
    ["File registry", runtime?.registry],
    ["Access index", runtime?.accessIndex],
    ["Recipient groups", runtime?.teamRegistry],
    ["Grant expiry", runtime?.grantExpiry],
  ] as const;
  const isReady = runtime?.status === "ready";
  const isProblem = runtime?.status === "invalid" || runtime?.status === "incomplete" || runtime?.status === "unconfigured";

  return (
    <div className={`settings-runtime-panel mt-4 rounded-xl border px-4 py-4 ${
      isReady
        ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)]"
        : isProblem
          ? "border-danger/30 bg-danger/10"
          : "border-[var(--surface-border)] bg-[var(--surface-muted)]"
    }`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${isProblem ? "text-danger" : "text-[var(--acid)]"}`}>
            runtime validation
          </p>
          <p className="mt-1 font-display text-base font-semibold text-frost">
            {loading ? (
              <span className="skeleton-line inline-block h-5 w-72 max-w-full rounded" aria-label="Verifying access registry" />
            ) : (
              runtime?.details ?? "Access registry status is not available."
            )}
          </p>
          {runtime?.moduleAddress && (
            <p className="mt-2 break-all font-mono text-[11px] leading-5 text-frost-muted">
              {runtime.moduleAddress}
            </p>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[520px] xl:grid-cols-4">
          {items.map(([label, ready]) => (
            <div key={label} className="settings-runtime-item rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2">
              <p className="crisp-label font-mono uppercase">{label}</p>
              <p className={`mt-1 font-display text-sm font-semibold ${
                loading ? "text-frost-muted" : ready ? "text-[var(--acid)]" : "text-danger"
              }`}>
                {loading ? <span className="skeleton-line inline-block h-4 w-16 rounded" /> : ready ? "ready" : "needs init"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatStatusValue(value: string) {
  if (value === "not configured") return "needs setup";
  if (value === "missing") return "needs key";
  return value;
}

function S3GatewayPanel({ accountAddress }: { accountAddress?: string }) {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const gatewayConfigured = SHELBY_S3_GATEWAY_STATUS === "configured";
  const endpoint = gatewayConfigured ? SHELBY_S3_GATEWAY_URL : "<SHELBY_S3_GATEWAY_URL>";
  const bucket = accountAddress || "<YOUR_SHELBY_ACCOUNT_ADDRESS>";
  const gatewayIndexerUrl = SHELBY_NETWORK_NAME === "shelbynet"
    ? "https://api.shelbynet.shelby.xyz/v1/graphql"
    : "https://api.testnet.shelby.xyz/v1/graphql";
  const gatewayConfigName = SHELBY_NETWORK_NAME === "shelbynet" ? "shelbynet" : "testnet";
  const rows = [
    ["Gateway", "Shelby S3 Gateway compatible"],
    ["Endpoint status", gatewayConfigured ? "configured" : "not configured"],
    ["Configured endpoint", endpoint],
    ["Owner account", accountAddress ? truncateAddress(accountAddress) : "connect wallet"],
    ["Vault namespace", "blobsafe/encrypted/<folder>/<file>"],
  ];
  const gatewayConfig = `network:
  name: ${gatewayConfigName}
  rpcEndpoint: ${SHELBY_RPC_URL}
  aptosFullnode: ${SHELBY_FULLNODE_URL}
  aptosIndexer: ${gatewayIndexerUrl}
  apiKey: <YOUR_SHELBY_API_KEY>

server:
  host: localhost
  port: 9000
  region: shelbyland

credentials:
  - accessKeyId: <S3_ACCESS_KEY_ID>
    secretAccessKey: <S3_SECRET_ACCESS_KEY>
    aptosPrivateKey: <YOUR_APTOS_PRIVATE_KEY>

buckets:
  - "${bucket}"`;
  const startCommand = `npx @shelby-protocol/s3-gateway --config shelby.config.yaml`;
  const rcloneCommand = `rclone config create shelby s3 provider=Other access_key_id=<S3_ACCESS_KEY_ID> secret_access_key=<S3_SECRET_ACCESS_KEY> endpoint=${endpoint} region=shelbyland force_path_style=true
rclone lsf shelby:${bucket}/blobsafe/encrypted/`;
  const awsCommand = `aws configure set profile.shelby.aws_access_key_id <S3_ACCESS_KEY_ID>
aws configure set profile.shelby.aws_secret_access_key <S3_SECRET_ACCESS_KEY>
aws configure set profile.shelby.region shelbyland
aws --profile shelby --endpoint-url ${endpoint} s3 ls s3://${bucket}/blobsafe/encrypted/ --recursive`;
  const awsSyncCommand = `aws --profile shelby --endpoint-url ${endpoint} s3 cp ./sealed-export/ s3://${bucket}/blobsafe/encrypted/imports/ --recursive
aws --profile shelby --endpoint-url ${endpoint} s3 sync s3://${bucket}/blobsafe/encrypted/ ./vault-export/`;
  const botoCommand = `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="${endpoint}",
    aws_access_key_id="<S3_ACCESS_KEY_ID>",
    aws_secret_access_key="<S3_SECRET_ACCESS_KEY>",
    region_name="shelbyland",
)

for item in s3.list_objects_v2(Bucket="${bucket}", Prefix="blobsafe/encrypted/").get("Contents", []):
    print(item["Key"], item["Size"])`;

  const copySnippet = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedSnippet(id);
    window.setTimeout(() => setCopiedSnippet(null), 1400);
  };

  return (
    <section className="s3-gateway-panel premium-surface rounded-2xl p-5 md:p-6" data-testid="s3-gateway-guide">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--acid)]">
            s3 compatibility
          </p>
          <h4 className="mt-2 font-display text-xl font-semibold tracking-[-0.02em] text-frost">
            Gateway handoff
          </h4>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-frost-dim">
            Use external S3-compatible tools against the same Shelby namespace after sensitive files are sealed by BlobSafe.
          </p>
        </div>
        <a
          href="https://docs.shelby.xyz/tools/s3-gateway"
          target="_blank"
          rel="noopener noreferrer"
          className="themed-secondary inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
        >
          <ExternalLink size={13} />
          Gateway docs
        </a>
      </div>

      <div className="s3-status-grid mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="s3-status-card rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{label}</p>
            <p className="mt-1 break-all font-mono text-xs leading-5 text-frost">{value}</p>
          </div>
        ))}
      </div>

      <div className="s3-security-note mt-4 grid gap-3 rounded-xl border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] px-4 py-4 md:grid-cols-[160px_1fr]">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--acid)]">security note</p>
        <p className="max-w-4xl text-sm leading-6 text-frost-dim">
          S3 clients read stored bytes exactly as written. Seal sensitive files in BlobSafe first, then expose paths to gateway tooling. Keep private keys, API keys, and S3 signing secrets out of the browser.
        </p>
      </div>

      <details className="s3-command-panel mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-mono text-[11px] uppercase tracking-[0.1em] text-frost-dim transition-colors hover:text-frost [&::-webkit-details-marker]:hidden">
          Gateway commands
          <ArrowRight size={14} />
        </summary>
        <div className="grid gap-4 border-t border-[var(--surface-border)] p-4 xl:grid-cols-2">
          <S3Snippet
            id="gateway-config"
            title="shelby.config.yaml"
            eyebrow="gateway config"
            value={gatewayConfig}
            copied={copiedSnippet === "gateway-config"}
            onCopy={copySnippet}
          />
          <S3Snippet
            id="start-gateway"
            title="Start gateway"
            eyebrow="local service"
            value={startCommand}
            copied={copiedSnippet === "start-gateway"}
            onCopy={copySnippet}
          />
          <S3Snippet
            id="rclone"
            title="rclone"
            eyebrow="list encrypted vault"
            value={rcloneCommand}
            copied={copiedSnippet === "rclone"}
            onCopy={copySnippet}
          />
          <S3Snippet
            id="aws"
            title="AWS CLI"
            eyebrow="list encrypted vault"
            value={awsCommand}
            copied={copiedSnippet === "aws"}
            onCopy={copySnippet}
          />
          <S3Snippet
            id="aws-sync"
            title="AWS CLI copy/sync"
            eyebrow="gateway transfer"
            value={awsSyncCommand}
            copied={copiedSnippet === "aws-sync"}
            onCopy={copySnippet}
          />
          <S3Snippet
            id="boto3"
            title="boto3"
            eyebrow="python client"
            value={botoCommand}
            copied={copiedSnippet === "boto3"}
            onCopy={copySnippet}
          />
        </div>
      </details>
    </section>
  );
}

function S3Snippet({
  id,
  eyebrow,
  title,
  value,
  copied,
  onCopy,
}: {
  id: string;
  eyebrow: string;
  title: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => Promise<void>;
}) {
  return (
    <div className="s3-snippet group overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] transition-colors duration-200 hover:border-[var(--surface-border-strong)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{eyebrow}</p>
          <p className="mt-1 font-display text-base font-semibold text-frost">{title}</p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(id, value)}
          className={`themed-secondary inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 ${copied ? "is-feedback-success" : ""}`}
        >
          <Copy size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="settings-code max-h-[260px] overflow-auto p-4 text-left font-mono text-[11px] leading-5 text-frost">
        <code>{value}</code>
      </pre>
    </div>
  );
}
