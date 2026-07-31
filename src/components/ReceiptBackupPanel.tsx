import { useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAccountBlobs } from "@shelby-protocol/react";
import { ArchiveRestore, CheckCircle2, CloudUpload, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { getWalletEncryptionKey } from "@/lib/encryption";
import {
  createReceiptBackupBlob,
  downloadReceiptBackup,
  isReceiptBackupBlob,
  markReceiptBackupSeen,
  listLocalReceiptsForBackup,
  parseReceiptBackupSummary,
  restoreReceiptBackup,
} from "@/lib/receiptBackups";
import {
  formatDate,
  getBlobCreationMicros,
  getBlobStoredName,
  getDefaultExpiration,
  getWalletAccountAddress,
  HAS_SHELBY_API_KEY,
  SHELBY_NETWORK_LABEL,
  shelbyClient,
  uploadWalletBlobs,
} from "@/lib/shelby";
import { recordAuditEvent } from "@/lib/auditTrail";

const BACKUP_TIMEOUT_MS = 90_000;
const BACKUP_TX_OPTIONS = {
  build: {
    options: {
      maxGasAmount: 500_000,
    },
  },
};

type BackupStatus =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function ReceiptBackupPanel() {
  const { connected, account, signAndSubmitTransaction, signMessage } = useWallet();
  const accountAddress = getWalletAccountAddress(account);
  const [status, setStatus] = useState<BackupStatus>({ type: "idle" });
  const [selectedBackup, setSelectedBackup] = useState("");
  const localReceipts = accountAddress ? listLocalReceiptsForBackup(accountAddress) : [];

  const { data: blobs, refetch, isFetching } = useAccountBlobs({
    client: shelbyClient,
    account: accountAddress ?? "0x0",
    enabled: !!connected && !!accountAddress,
  });

  const backups = useMemo(() => {
    return (blobs || [])
      .map((blob) => ({
        blobName: getBlobStoredName(blob),
        createdMicros: getBlobCreationMicros(blob) ?? 0,
      }))
      .filter((blob) => isReceiptBackupBlob(blob.blobName))
      .sort((a, b) => {
        if (a.createdMicros !== b.createdMicros) return b.createdMicros - a.createdMicros;
        return b.blobName.localeCompare(a.blobName);
      });
  }, [blobs]);

  const latestBackup = backups[0]?.blobName ?? "";
  const restoreBlobName = selectedBackup || latestBackup;
  const busy = status.type === "loading";

  const createBackup = async () => {
    if (!connected || !accountAddress || !signAndSubmitTransaction || !signMessage) {
      setStatus({ type: "error", message: "Connect the owner wallet before backing up receipts." });
      return;
    }
    if (!HAS_SHELBY_API_KEY) {
      setStatus({ type: "error", message: `${SHELBY_NETWORK_LABEL} API key is required before receipt recovery can write to Shelby.` });
      return;
    }
    if (localReceipts.length === 0) {
      setStatus({ type: "error", message: "This wallet has no receipts to recover yet." });
      return;
    }

    try {
      setStatus({ type: "loading", message: "Unlocking wallet-wrapped receipt key..." });
      const masterKey = await getWalletEncryptionKey(accountAddress, signMessage);
      const { blobName, blobData } = await createReceiptBackupBlob({
        account: accountAddress ?? "0x0",
        receipts: localReceipts,
        masterKey,
      });

      setStatus({ type: "loading", message: `Backing up encrypted receipts to ${SHELBY_NETWORK_LABEL}...` });
      await withTimeout(
        uploadWalletBlobs({
          signer: {
              account: accountAddress ?? "0x0",
              publicKey: account?.publicKey,
              signAndSubmitTransaction,
              signMessage,
            },
          blobs: [{ blobName, blobData }],
          expirationMicros: getDefaultExpiration(),
          options: BACKUP_TX_OPTIONS,
        }),
        BACKUP_TIMEOUT_MS,
        "Receipt recovery backup is taking longer than expected. Refresh recovery points before retrying."
      );

      await refetch();
      setSelectedBackup(blobName);
      markReceiptBackupSeen(accountAddress, blobName);
      recordAuditEvent({
        account: accountAddress ?? "0x0",
        type: "receipt_backup",
        source: "shelby",
        blobName,
        message: `${localReceipts.length} local receipt${localReceipts.length === 1 ? "" : "s"} protected in an encrypted recovery point.`,
      });
      setStatus({ type: "success", message: `${localReceipts.length} receipt${localReceipts.length === 1 ? "" : "s"} saved as an encrypted recovery point on ${SHELBY_NETWORK_LABEL}.` });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Receipt recovery backup could not be created." });
    }
  };

  const restoreBackup = async () => {
    if (!connected || !accountAddress || !signMessage) {
      setStatus({ type: "error", message: "Connect the owner wallet before restoring receipts." });
      return;
    }
    if (!restoreBlobName) {
      setStatus({ type: "error", message: "No recovery point is available for this wallet." });
      return;
    }

    try {
      setStatus({ type: "loading", message: "Unlocking wallet-wrapped receipt key..." });
      const masterKey = await getWalletEncryptionKey(accountAddress, signMessage);

      setStatus({ type: "loading", message: "Restoring encrypted receipts..." });
      const payload = await downloadReceiptBackup({
        account: accountAddress ?? "0x0",
        blobName: restoreBlobName,
        masterKey,
      });
      const restored = restoreReceiptBackup(payload, accountAddress);
      markReceiptBackupSeen(accountAddress, restoreBlobName);
      recordAuditEvent({
        account: accountAddress ?? "0x0",
        type: "receipt_restored",
        source: "local",
        blobName: restoreBlobName,
        message: `${restored} receipt${restored === 1 ? "" : "s"} restored from an encrypted recovery point.`,
      });
      window.dispatchEvent(new CustomEvent("blobsafe:receipts-restored"));
      setStatus({ type: "success", message: `${restored} receipt${restored === 1 ? "" : "s"} restored to this wallet scope.` });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Receipt recovery point could not be restored." });
    }
  };

  return (
    <section className="receipt-recovery-panel premium-surface rounded-2xl p-5 md:p-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex items-center gap-3">
            <div className="accent-chip flex h-10 w-10 items-center justify-center rounded-xl">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--acid)]">
                receipt recovery
              </p>
              <h4 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-frost">
                Receipt recovery
              </h4>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-frost-dim">
            Save the receipts needed to verify and decrypt sealed files as a wallet-encrypted {SHELBY_NETWORK_LABEL} blob.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[300px]">
          <button
            type="button"
            onClick={createBackup}
            disabled={busy || !connected || localReceipts.length === 0}
            className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
            Save recovery point
          </button>
          <button
            type="button"
            onClick={restoreBackup}
            disabled={busy || !connected || !restoreBlobName}
            className="themed-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
            Restore receipts
          </button>
        </div>
      </div>

      <RecoveryGuide connected={connected} localCount={localReceipts.length} backupCount={backups.length} loading={isFetching} />

      <div className="recovery-metrics-grid mt-5 grid gap-3 md:grid-cols-3">
        <Metric label="Local receipts" value={String(localReceipts.length)} loading={isFetching && connected} />
        <Metric label="Recovery points" value={String(backups.length)} loading={isFetching && connected} />
        <Metric
          label="Latest recovery point"
          value={latestBackup ? formatBackupDate(latestBackup, backups[0]?.createdMicros) : "No backup"}
          loading={isFetching && connected}
        />
      </div>

      <div className="recovery-selector-row mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <select
          value={selectedBackup}
          onChange={(event) => setSelectedBackup(event.target.value)}
          className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 font-mono text-xs text-frost outline-none transition-colors focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
        >
          <option value="">{latestBackup ? "Latest recovery point" : "No recovery point found"}</option>
          {backups.map((backup) => (
            <option key={backup.blobName} value={backup.blobName}>
              {formatBackupDate(backup.blobName, backup.createdMicros)} - {backup.blobName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching || busy || !connected}
          className="themed-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-mono text-xs uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {status.type !== "idle" && (
        <div
          className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            status.type === "error"
              ? "border-danger/30 bg-danger/10 text-danger"
              : status.type === "success"
                ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-frost"
                : "border-[var(--surface-border)] bg-[var(--surface-muted)] text-frost-dim"
          }`}
        >
          {status.type === "loading" ? (
            <Loader2 size={16} className="mt-0.5 animate-spin" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5" />
          )}
          <p className="leading-6">{status.message}</p>
        </div>
      )}
    </section>
  );
}

function RecoveryGuide({
  connected,
  localCount,
  backupCount,
  loading,
}: {
  connected: boolean;
  localCount: number;
  backupCount: number;
  loading: boolean;
}) {
  const title = !connected
    ? "Connect the owner wallet"
    : localCount === 0 && backupCount > 0
      ? "Recovery point ready"
      : localCount === 0
        ? "No recoverable receipts yet"
        : backupCount === 0
          ? "Create your first recovery point"
          : "Recovery is ready";
  const copy = !connected
    ? "Receipt recovery is scoped to the wallet and active Shelby network."
    : loading
      ? "Checking encrypted recovery points for this wallet."
      : localCount === 0 && backupCount > 0
        ? "Restore receipts on this device before decrypting older sealed files."
        : localCount === 0
          ? "Seal a file first, then save an encrypted recovery point for future devices."
          : backupCount === 0
            ? "Save a wallet-encrypted backup so this vault can be restored on another browser."
            : "Local receipts and encrypted recovery points are both available.";

  return (
    <div className="recovery-guide-card mt-5 grid gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="font-display text-base font-semibold text-frost">{title}</p>
        <p className="mt-1 text-sm leading-6 text-frost-dim">{copy}</p>
      </div>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-frost-muted">
        <span className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-2">wallet scoped</span>
        <span className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-2">encrypted</span>
        <span className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-2">restorable</span>
      </div>
    </div>
  );
}

function Metric({ label, value, loading = false }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="recovery-metric-card rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{label}</p>
      {loading ? (
        <div className="skeleton-line mt-2 h-4 w-28 rounded" />
      ) : (
        <p className="mt-1 truncate font-mono text-sm text-frost">{value}</p>
      )}
    </div>
  );
}

function formatBackupDate(blobName: string, createdMicros?: number) {
  if (createdMicros) return formatDate(createdMicros);
  const parsed = parseReceiptBackupSummary(blobName).createdAt;
  if (!parsed) return "unknown";
  return new Date(parsed).toLocaleString();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}
