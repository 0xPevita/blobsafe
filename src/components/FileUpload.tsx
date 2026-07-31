import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAccountBlobs } from "@shelby-protocol/react";
import { Upload, X, Lock, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Copy, ExternalLink } from "lucide-react";
import { FolderRail } from "@/components/FolderRail";
import {
  buildBlobName,
  formatBytes,
  formatDate,
  getDefaultExpiration,
  getFileType,
  getBlobStoredName,
  getShelbyBlobExplorerUrl,
  getWalletAccountAddress,
  HAS_SHELBY_API_KEY,
  SHELBY_NETWORK_LABEL,
  shelbyClient,
  truncateAddress,
  uploadWalletBlobs,
} from "@/lib/shelby";
import {
  getWalletEncryptionKey,
  generateFileKey,
  wrapFileKey,
  encryptData,
  packEncrypted,
  computeHash,
  type WrappedFileKey,
} from "@/lib/encryption";
import { useFileStore } from "@/store/useFileStore";
import { saveStoredReceipt } from "@/lib/receipts";
import {
  createReceiptBackupBlob,
  isReceiptBackupBlob,
  listLocalReceiptsForBackup,
  markReceiptBackupSeen,
} from "@/lib/receiptBackups";
import { isReceiptSidecarBlob } from "@/lib/sidecarReceipts";
import {
  BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
  IS_ACCESS_CONTROL_CONFIGURED,
  registerFileOnChain,
  validateAccessControlRuntime,
  type AccessRuntimeStatus,
  type AccessControlReceipt,
} from "@/lib/accessControl";
import { recordAuditEvent } from "@/lib/auditTrail";
import { explainError, formatRecoveryMessage } from "@/lib/errorRecovery";

const UPLOAD_TIMEOUT_MS = 90_000;
const UPLOAD_TX_OPTIONS = {
  build: {
    options: {
      maxGasAmount: 500_000,
    },
  },
};

interface UploadFile {
  file: File;
  id: string;
  status: "pending" | "encrypting" | "uploading" | "done" | "error";
  progress: number;
  hash?: string;
  error?: string;
}

export interface UploadReceipt {
  id: string;
  fileName: string;
  blobName: string;
  account: string;
  originalSize: number;
  storedSize: number;
  sha256: string;
  encryption: "AES-256-GCM" | "plaintext";
  expirationMicros: number;
  uploadedAt: string;
  folder: string;
  encryptionModel?: "per-file-key-v1" | "wallet-master-v2" | "legacy-address-v1" | "plaintext";
  key?: WrappedFileKey;
  receiptStorage?: "local" | "sidecar-v1";
  accessControl?: AccessControlReceipt;
}

interface FileUploadProps {
  onUploadComplete?: (receipts: UploadReceipt[]) => void;
  onOpenRecovery?: () => void;
}

export function FileUpload({ onUploadComplete, onOpenRecovery }: FileUploadProps) {
  const { connected, account, signAndSubmitTransaction, signMessage } = useWallet();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const [receipts, setReceipts] = useState<UploadReceipt[]>([]);
  const [copiedReceiptId, setCopiedReceiptId] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<{
    type: "idle" | "saving" | "saved" | "error";
    message?: string;
  }>({ type: "idle" });
  const [runtimeStatus, setRuntimeStatus] = useState<AccessRuntimeStatus | null>(null);
  const [runtimeCheck, setRuntimeCheck] = useState<"idle" | "checking" | "ready" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeFolder = useFileStore((state) => state.activeFolder);
  const accountAddress = getWalletAccountAddress(account);
  const { data: accountBlobs } = useAccountBlobs({
    client: shelbyClient,
    account: accountAddress ?? "0x0",
    enabled: !!connected && !!accountAddress,
  });
  const accountBlobNames = useMemo(
    () => (Array.isArray(accountBlobs)
      ? accountBlobs
          .map((blob) => getBlobStoredName(blob))
          .filter((blobName) => !isReceiptBackupBlob(blobName) && !isReceiptSidecarBlob(blobName))
      : []),
    [accountBlobs]
  );

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const uploadFiles: UploadFile[] = fileArray.map((f) => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  useEffect(() => {
    let cancelled = false;

    setRuntimeCheck("checking");
    validateAccessControlRuntime()
      .then((status) => {
        if (cancelled) return;
        setRuntimeStatus(status);
        setRuntimeCheck(status.status === "invalid" ? "error" : "ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeStatus({
          status: "invalid",
          label: "check address",
          details: formatRecoveryMessage(error, "runtime"),
          contractAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
          moduleAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS ? `${BLOBSAFE_ACCESS_CONTRACT_ADDRESS}::access_control` : "",
          registry: false,
          accessIndex: false,
          teamRegistry: false,
          grantExpiry: false,
          version: null,
        });
        setRuntimeCheck("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const preflight = useMemo(() => buildUploadPreflight({
    connected,
    accountAddress,
    canSign: Boolean(signAndSubmitTransaction),
    canSignMessage: Boolean(signMessage),
    hasApiKey: HAS_SHELBY_API_KEY,
    runtimeStatus,
    runtimeCheck,
    files,
    encrypt,
  }), [accountAddress, connected, encrypt, files, runtimeCheck, runtimeStatus, signAndSubmitTransaction, signMessage]);

  const handleUploadAll = async () => {
    if (!connected || !account || !signAndSubmitTransaction) return;
    if (!accountAddress) return;

    const blockers = preflight.items.filter((item) => item.severity === "blocker");
    if (blockers.length > 0) {
      const message = blockers.map((item) => `${item.label}: ${item.detail}`).join(" ");
      setFiles((prev) => prev.map((f) =>
        f.status === "pending" ? { ...f, status: "error", error: message } : f
      ));
      return;
    }

    if (!HAS_SHELBY_API_KEY) {
      const hint = explainError("Shelby API key is missing", "upload");
      setFiles((prev) => prev.map((f) =>
        f.status === "pending"
          ? {
              ...f,
              status: "error",
              error: `${hint.title}. ${hint.action}`,
            }
          : f
      ));
      return;
    }

    const completedReceipts: UploadReceipt[] = [];

    let masterKey: CryptoKey | null = null;
    if (encrypt) {
      try {
        masterKey = await getWalletEncryptionKey(accountAddress, signMessage);
      } catch (err) {
        const message = formatRecoveryMessage(err, "upload");
        setFiles((prev) => prev.map((f) =>
          f.status === "pending" ? { ...f, status: "error", error: message } : f
        ));
        return;
      }
    }

    for (const uploadFile of files) {
      if (uploadFile.status !== "pending") continue;
      try {
        const arrayBuffer = await uploadFile.file.arrayBuffer();
        let blobData = new Uint8Array(arrayBuffer);
        let keyMetadata: WrappedFileKey | undefined;

        setFiles((prev) => prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "encrypting", progress: 20 } : f
        ));

        const fileHash = await computeHash(blobData);

        if (encrypt && masterKey) {
          const fileKey = await generateFileKey();
          const { encrypted, iv } = await encryptData(blobData, fileKey);
          keyMetadata = await wrapFileKey(fileKey, masterKey);
          blobData = packEncrypted(encrypted, iv);
        }

        setFiles((prev) => prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "uploading", progress: 50 } : f
        ));

        const uniqueFileName = createUniqueBlobFileName(uploadFile.file.name, uploadFile.id);
        const blobName = buildBlobName({
          address: accountAddress,
          fileName: uniqueFileName,
          folder: activeFolder,
          encrypted: encrypt,
        });

        const expirationMicros = getDefaultExpiration();

        const receipt: UploadReceipt = {
          id: uploadFile.id,
          fileName: uploadFile.file.name,
          blobName,
          account: accountAddress ?? "0x0",
          originalSize: uploadFile.file.size,
          storedSize: blobData.byteLength,
          sha256: fileHash,
          encryption: encrypt ? "AES-256-GCM" : "plaintext",
          expirationMicros,
          uploadedAt: new Date().toISOString(),
          folder: activeFolder,
          encryptionModel: encrypt ? "per-file-key-v1" : "plaintext",
          key: keyMetadata,
          receiptStorage: "local",
          accessControl: IS_ACCESS_CONTROL_CONFIGURED
            ? undefined
            : {
                status: "unconfigured",
                error: "Access registry needs setup for this network.",
              },
        };

        await withTimeout(
          uploadWalletBlobs({
            signer: {
              account: accountAddress ?? "0x0",
              publicKey: account?.publicKey,
              signAndSubmitTransaction,
              signMessage,
            },
            blobs: [{ blobName, blobData }],
            expirationMicros,
            options: UPLOAD_TX_OPTIONS,
          }),
          UPLOAD_TIMEOUT_MS,
          "Seal is taking longer than expected. Refresh Files before retrying; the Shelby transaction may still settle in the background."
        );

        if (IS_ACCESS_CONTROL_CONFIGURED) {
          try {
            setFiles((prev) => prev.map((f) =>
              f.id === uploadFile.id ? { ...f, status: "uploading", progress: 82 } : f
            ));
            const txHash = await registerFileOnChain({
              signAndSubmitTransaction,
              receipt,
            });
            receipt.accessControl = {
              status: "registered",
              moduleAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
              txHash,
              registeredAt: new Date().toISOString(),
            };
            recordAuditEvent({
              account: accountAddress ?? "0x0",
              type: "file_registered",
              source: "aptos",
              blobName,
              fileName: uploadFile.file.name,
              txHash,
            });
          } catch (error) {
            const message = formatRecoveryMessage(error, "upload");
            receipt.accessControl = {
              status: "failed",
              moduleAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
              error: message,
            };
            saveStoredReceipt(receipt);
            throw new Error(`File is stored, but ownership registration did not complete. ${message}`);
          }
        }

        saveStoredReceipt(receipt);
        completedReceipts.push(receipt);
        setReceipts((prev) => [receipt, ...prev]);

        setFiles((prev) => prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "done", progress: 100, hash: fileHash } : f
        ));
      } catch (err: unknown) {
        const message = formatRecoveryMessage(err, "upload");
        setFiles((prev) => prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "error", error: message } : f
        ));
      }
    }

    const encryptedReceipts = completedReceipts.filter((receipt) => receipt.encryption === "AES-256-GCM");
    if (encryptedReceipts.length > 0 && masterKey) {
      try {
        setRecoveryStatus({
          type: "saving",
          message: `Saving wallet-encrypted recovery point to ${SHELBY_NETWORK_LABEL}...`,
        });
        const backupReceipts = listLocalReceiptsForBackup(accountAddress);
        const { blobName, blobData } = await createReceiptBackupBlob({
          account: accountAddress ?? "0x0",
          receipts: backupReceipts,
          masterKey,
        });

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
            options: UPLOAD_TX_OPTIONS,
          }),
          UPLOAD_TIMEOUT_MS,
          "Recovery point is taking longer than expected. The files are sealed; save recovery again from Settings if needed."
        );

        markReceiptBackupSeen(accountAddress, blobName);
        recordAuditEvent({
          account: accountAddress ?? "0x0",
          type: "receipt_backup",
          source: "shelby",
          blobName,
          message: `${backupReceipts.length} receipt${backupReceipts.length === 1 ? "" : "s"} protected in an automatic encrypted recovery point.`,
        });
        setRecoveryStatus({
          type: "saved",
          message: `${backupReceipts.length} receipt${backupReceipts.length === 1 ? "" : "s"} protected for browser and device recovery.`,
        });
      } catch (error) {
        setRecoveryStatus({
          type: "error",
          message: error instanceof Error
            ? error.message
            : "Files are sealed, but automatic recovery backup could not be saved.",
        });
      }
    }

    onUploadComplete?.(completedReceipts);
  };

  const copyReceipt = async (receipt: UploadReceipt) => {
    await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopiedReceiptId(receipt.id);
    setTimeout(() => setCopiedReceiptId(null), 1600);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const isUploading = files.some((f) => f.status === "uploading" || f.status === "encrypting");
  const hasFiles = files.length > 0;

  if (!connected) {
    return (
      <div className="empty-state-premium flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-6 py-12 text-center md:px-10">
        <div className="empty-state-icon mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl">
          <Lock size={20} />
        </div>
        <p className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">
          Connect wallet to seal files
        </p>
        <p className="max-w-sm text-sm leading-6 text-frost-dim">
          Files are encrypted locally before {SHELBY_NETWORK_LABEL} receives the sealed bytes.
        </p>
      </div>
    );
  }

  return (
    <div className="seal-workbench space-y-4">
      {!HAS_SHELBY_API_KEY && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
          <p className="font-display text-sm font-semibold">{SHELBY_NETWORK_LABEL} API key required</p>
          <p className="mt-1 text-sm leading-6">
            Add the active network API key to `.env.local`, then restart the dev server.
          </p>
        </div>
      )}

      <div className="seal-section-shell">
        <FolderRail compact accountAddress={accountAddress} blobNames={accountBlobNames} />
      </div>

      <UploadPreflightPanel summary={preflight} />

      <div className={`security-mode-card seal-control-card flex items-center justify-between gap-4 rounded-2xl px-4 py-4 ${encrypt ? "is-encrypted" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="security-mode-icon flex h-10 w-10 items-center justify-center rounded-xl">
            <ShieldCheck size={16} />
          </div>
          <div className="min-w-0">
            <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${encrypt ? "text-[var(--acid)]" : "text-frost-dim"}`}>
              {encrypt ? "Wallet-wrapped AES-256-GCM" : "Public plaintext storage"}
            </p>
            <p className="mt-1 text-sm leading-5 text-frost-muted">
              {encrypt ? "Each file gets its own key, wrapped by wallet signature" : "Plaintext mode for public, non-sensitive files"}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={encrypt}
          aria-label="Toggle AES-256-GCM encryption"
          onClick={() => setEncrypt(!encrypt)}
          className={`security-switch relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950 ${encrypt ? "is-on" : ""}`}
        >
          <span className="security-switch-knob absolute left-1 top-1 h-6 w-6 rounded-full transition-transform duration-200" />
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`dropzone-shell seal-dropzone relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-12 text-center transition-all duration-300 md:px-10 ${isDragging ? "is-active drop-zone-active" : "premium-surface"}`}
        style={{
          borderColor: isDragging ? "var(--acid)" : "var(--surface-border)",
          background: isDragging ? "var(--acid-glow)" : undefined,
          boxShadow: isDragging ? "0 0 0 1px var(--surface-border-strong) inset" : "none",
        }}
      >
        <span className="dropzone-sweep" />
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />

        <div className="dropzone-icon mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300"
          style={{ background: isDragging ? "var(--acid-glow)" : "var(--surface-muted)", border: `1px solid ${isDragging ? "var(--surface-border-strong)" : "var(--surface-border)"}` }}>
          <Upload size={20} style={{ color: isDragging ? "var(--acid)" : "var(--frost-muted)" }} />
        </div>

        <p className={`mb-1 font-display text-lg font-semibold tracking-[-0.02em] ${isDragging ? "text-[var(--acid)]" : "text-frost"}`}>
          {isDragging ? "Release to add files" : "Choose files to seal"}
        </p>
        <p className="max-w-sm font-mono text-xs leading-5 text-frost-muted">
          Drag files here or browse from your device. BlobSafe seals bytes before they leave the browser.
        </p>

        {encrypt && (
          <div className="accent-chip absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2 py-1">
            <Lock size={9} />
            <span className="font-mono text-[9px] uppercase tracking-widest">
              E2E ENCRYPTED
            </span>
          </div>
        )}
      </div>

      {hasFiles && <UploadPipeline files={files} />}

      {files.length > 0 && (
        <div className="seal-queue space-y-2">
          {files.map((f) => (
            <div key={f.id}
              className={`seal-file-row premium-surface flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${f.status}`}
            >
              <div className="seal-file-type flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]">
                <span className="font-mono text-[9px] font-bold tracking-wider text-frost-muted">
                  {getFileType(f.file.name)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-sm text-frost">
                  {f.file.name}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="font-mono text-xs text-frost-muted">
                    {formatBytes(f.file.size)}
                  </span>
                  {f.hash && (
                    <span className="max-w-[120px] truncate font-mono text-xs text-frost-muted">
                      #{f.hash.slice(0, 8)}
                    </span>
                  )}
                </div>
                {(f.status === "uploading" || f.status === "encrypting") && (
                  <div className="seal-file-progress mt-2 h-1 overflow-hidden rounded-full bg-[var(--acid-glow)]">
                    <div className="h-full rounded-full bg-[var(--acid)] transition-all duration-500" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
                {f.error && (
                  <p className="mt-1 font-mono text-xs text-danger">
                    {f.error}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {f.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-frost-muted transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30"
                    aria-label={`Remove ${f.file.name}`}
                  >
                    <X size={14} />
                  </button>
                )}
                {(f.status === "encrypting" || f.status === "uploading") && (
                  <div className="flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin text-[var(--acid)]" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--acid)]">
                      {f.status === "encrypting" ? "SEALING" : "STORING"}
                    </span>
                  </div>
                )}
                {f.status === "done" && <CheckCircle2 size={16} className="text-[var(--acid)]" />}
                {f.status === "error" && <AlertCircle size={16} className="text-danger" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={handleUploadAll}
          disabled={isUploading}
          className="premium-button seal-submit-button flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/50 focus:ring-offset-2 focus:ring-offset-obsidian-950"
        >
          {isUploading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Sealing...
            </>
          ) : (
            <>
              <Upload size={15} />
              Seal {pendingCount} file{pendingCount > 1 ? "s" : ""}
              {encrypt ? " (encrypted)" : ""}
            </>
          )}
        </button>
      )}

      {recoveryStatus.type !== "idle" && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            recoveryStatus.type === "error"
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-frost"
          }`}
        >
          <div className="flex items-start gap-3">
            {recoveryStatus.type === "saving" ? (
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
            ) : recoveryStatus.type === "saved" ? (
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--acid)]" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-display font-semibold">
                {recoveryStatus.type === "saving"
                  ? "Securing recovery point"
                  : recoveryStatus.type === "saved"
                    ? "Recovery point saved"
                    : "Recovery backup needs attention"}
              </p>
              {recoveryStatus.message && (
                <p className="mt-1 leading-6 opacity-80">{recoveryStatus.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {receipts.length > 0 && recoveryStatus.type !== "saved" && (
        <div className="recovery-reminder seal-recovery-card rounded-2xl border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--acid)]">
                {recoveryStatus.type === "error" ? "manual recovery available" : "recovery recommended"}
              </p>
              <p className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">
                {recoveryStatus.type === "error" ? "Save recovery manually" : "Save a recovery point for these receipts"}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-frost-dim">
                {recoveryStatus.type === "error"
                  ? "The files are sealed. Save a recovery point from Settings so the same wallet can restore them on another device."
                  : "This browser can decrypt the files now. A wallet-encrypted recovery point lets the same wallet restore receipts on another device."}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenRecovery}
              className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold"
            >
              <ShieldCheck size={14} />
              Save recovery point
            </button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="premium-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold text-frost">Sealed receipts</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">
                saved to this wallet scope
              </p>
            </div>
            <span className="accent-chip rounded-md px-2 py-1 font-mono text-[10px]">
              {receipts.length}
            </span>
          </div>

          <div className="divide-y divide-[var(--surface-border)]">
            {receipts.slice(0, 5).map((receipt) => (
              <div key={receipt.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-frost">{receipt.fileName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-frost-muted">
                    <span>{receipt.encryption}</span>
                    <span className="text-frost-muted/40">-</span>
                    <span>{formatBytes(receipt.storedSize)}</span>
                    <span className="text-frost-muted/40">-</span>
                    <span>chain {receipt.accessControl?.status ?? "local"}</span>
                    <span className="text-frost-muted/40">-</span>
                    <span>expires {formatDate(receipt.expirationMicros)}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-frost-muted">
                    {truncateAddress(receipt.account)} / {receipt.blobName}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyReceipt(receipt)}
                    className={`themed-secondary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-mono text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 ${copiedReceiptId === receipt.id ? "is-feedback-success" : ""}`}
                  >
                    <Copy size={12} />
                    {copiedReceiptId === receipt.id ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={getShelbyBlobExplorerUrl(receipt.account, receipt.blobName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="themed-secondary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-mono text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
                  >
                    <ExternalLink size={12} />
                    Explorer
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

function createUniqueBlobFileName(fileName: string, uploadId: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const suffix = uploadId.slice(0, 8);
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return `${fileName}--${suffix}`;
  }

  return `${fileName.slice(0, dotIndex)}--${suffix}${fileName.slice(dotIndex)}`;
}

type PreflightSeverity = "ready" | "warning" | "blocker" | "checking" | "waiting";

type PreflightItem = {
  label: string;
  detail: string;
  severity: PreflightSeverity;
};

type UploadPreflightSummary = {
  status: PreflightSeverity;
  title: string;
  detail: string;
  items: PreflightItem[];
};

function buildUploadPreflight({
  connected,
  accountAddress,
  canSign,
  canSignMessage,
  hasApiKey,
  runtimeStatus,
  runtimeCheck,
  files,
  encrypt,
}: {
  connected: boolean;
  accountAddress?: string;
  canSign: boolean;
  canSignMessage: boolean;
  hasApiKey: boolean;
  runtimeStatus: AccessRuntimeStatus | null;
  runtimeCheck: "idle" | "checking" | "ready" | "error";
  files: UploadFile[];
  encrypt: boolean;
}): UploadPreflightSummary {
  const pendingFiles = files.filter((file) => file.status === "pending");
  const pendingSize = pendingFiles.reduce((total, file) => total + file.file.size, 0);
  const items: PreflightItem[] = [
    {
      label: "Wallet",
      detail: connected && accountAddress ? truncateAddress(accountAddress) : "Connect an Aptos wallet",
      severity: connected && accountAddress && canSign ? "ready" : "blocker",
    },
    {
      label: "Shelby key",
      detail: hasApiKey ? `${SHELBY_NETWORK_LABEL} write key loaded` : "Add the active network API key",
      severity: hasApiKey ? "ready" : "blocker",
    },
    {
      label: "Access registry",
      detail: getRuntimePreflightDetail(runtimeStatus, runtimeCheck),
      severity: getRuntimePreflightSeverity(runtimeStatus, runtimeCheck),
    },
    {
      label: "Encryption",
      detail: encrypt
        ? canSignMessage
          ? "Per-file key will be wrapped by wallet signature"
          : "Wallet message signing is required for encrypted files"
        : "Plaintext storage for public files",
      severity: encrypt && !canSignMessage ? "blocker" : encrypt ? "ready" : "warning",
    },
    {
      label: "Queue",
      detail: pendingFiles.length > 0
        ? `${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""} ready, ${formatBytes(pendingSize)} total`
        : "Waiting for files",
      severity: pendingFiles.length > 0 ? "ready" : "waiting",
    },
  ];

  const hasBlocker = items.some((item) => item.severity === "blocker");
  const hasChecking = items.some((item) => item.severity === "checking");
  const hasWaiting = items.some((item) => item.severity === "waiting");
  const hasWarning = items.some((item) => item.severity === "warning");
  const status: PreflightSeverity = hasBlocker ? "blocker" : hasChecking ? "checking" : hasWaiting ? "waiting" : hasWarning ? "warning" : "ready";

  return {
    status,
    title: status === "ready"
      ? "Ready to seal"
      : status === "checking"
        ? "Checking network readiness"
        : status === "waiting"
          ? "Ready for files"
        : status === "warning"
          ? "Ready with one caution"
          : "Resolve preflight blockers",
    detail: status === "ready"
      ? "BlobSafe can encrypt, register, and store this queue on the active network."
      : status === "checking"
        ? "Runtime checks are loading. Upload can start once required checks are clear."
        : status === "waiting"
          ? "Wallet, Shelby key, and access registry are ready. Add files to start a sealed upload."
        : status === "warning"
          ? "Upload can continue, but review the highlighted item first."
          : "Upload is paused until the required wallet, key, or registry checks pass.",
    items,
  };
}

function getRuntimePreflightDetail(
  runtimeStatus: AccessRuntimeStatus | null,
  runtimeCheck: "idle" | "checking" | "ready" | "error"
) {
  if (runtimeCheck === "checking" || runtimeCheck === "idle") return "Verifying access module";
  if (!runtimeStatus) return "Access module not checked";
  if (runtimeStatus.status === "ready") {
    return `BlobSafe access v${runtimeStatus.version} verified`;
  }
  return runtimeStatus.details;
}

function getRuntimePreflightSeverity(
  runtimeStatus: AccessRuntimeStatus | null,
  runtimeCheck: "idle" | "checking" | "ready" | "error"
): PreflightSeverity {
  if (runtimeCheck === "checking" || runtimeCheck === "idle") return "checking";
  if (!runtimeStatus) return "warning";
  if (runtimeStatus.status === "ready") return "ready";
  if (runtimeStatus.status === "unconfigured") return "warning";
  return "blocker";
}

function UploadPreflightPanel({ summary }: { summary: UploadPreflightSummary }) {
  return (
    <section className={`preflight-panel seal-preflight premium-surface rounded-2xl p-4 ${summary.status}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-frost-muted">
            seal readiness
          </p>
          <p className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">
            {summary.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-frost-dim">
            {summary.detail}
          </p>
        </div>
        <span className={`preflight-status ${summary.status}`}>
          {summary.status === "blocker" ? "blocked" : summary.status === "waiting" ? "standby" : summary.status}
        </span>
      </div>

      <div className="preflight-grid grid gap-2 md:grid-cols-5">
        {summary.items.map((item) => (
          <div key={item.label} className={`preflight-item ${item.severity}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="preflight-dot" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">
                {item.label}
              </span>
            </div>
            <p className="text-sm font-semibold leading-5 text-frost">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UploadPipeline({ files }: { files: UploadFile[] }) {
  const statuses = files.map((file) => file.status);
  const hasEncrypting = statuses.includes("encrypting");
  const hasUploading = statuses.includes("uploading");
  const hasDone = statuses.includes("done");
  const hasError = statuses.includes("error");
  const hasPending = statuses.includes("pending");
  const hasProcessing = hasEncrypting || hasUploading || hasDone || hasError;

  const steps = [
    {
      key: "queue",
      label: "Queue",
      state: hasProcessing ? "complete" : hasPending ? "active" : "idle",
    },
    {
      key: "encrypt",
      label: "Seal",
      state: hasEncrypting ? "active" : hasUploading || hasDone ? "complete" : hasError ? "error" : "idle",
    },
    {
      key: "upload",
      label: "Store",
      state: hasUploading ? "active" : hasDone ? "complete" : hasError ? "error" : "idle",
    },
    {
      key: "receipt",
      label: "Receipt",
      state: hasDone ? "complete" : hasError ? "error" : "idle",
    },
  ] as const;

  return (
    <div className="pipeline-shell seal-pipeline premium-surface rounded-2xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-frost-muted">
          seal pipeline
        </p>
        <span className="font-mono text-[11px] text-frost-muted">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.key} className={`pipeline-step ${step.state}`}>
            <div className="pipeline-step-top">
              <span className="pipeline-dot" />
              <span className="font-mono text-xs text-frost">{step.label}</span>
            </div>
            {index < steps.length - 1 && <span className="pipeline-rail" />}
          </div>
        ))}
      </div>
    </div>
  );
}
