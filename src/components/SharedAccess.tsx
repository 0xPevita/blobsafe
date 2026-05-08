import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AlertCircle, Download, ExternalLink, FileKey2, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { computeHash, decryptData, unpackEncrypted } from "@/lib/encryption";
import {
  parseShareGrant,
  readShareGrants,
  removeShareGrant,
  saveShareGrant,
  unwrapShareGrantFileKey,
  type ShareGrant,
} from "@/lib/shareGrants";
import { formatBytes, formatDate, getShelbyBlobExplorerUrl, getWalletAccountAddress, shelbyClient, truncateAddress } from "@/lib/shelby";
import {
  BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
  IS_ACCESS_CONTROL_CONFIGURED,
  buildGrantCiphertextPayload,
  getOnChainGrant,
  type OnChainGrantView,
} from "@/lib/accessControl";

type DownloadState = {
  grantId: string;
  status: "loading" | "error" | "verified";
  message?: string;
} | null;

type GrantChainState = {
  status: "idle" | "loading" | "ready" | "error";
  grant?: OnChainGrantView;
  message?: string;
  checkedAt?: string;
};

export function SharedAccess() {
  const { connected, account } = useWallet();
  const accountAddress = getWalletAccountAddress(account);
  const [grants, setGrants] = useState<ShareGrant[]>(() => accountAddress ? readShareGrants(accountAddress) : []);
  const [grantJson, setGrantJson] = useState("");
  const [importError, setImportError] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [downloadState, setDownloadState] = useState<DownloadState>(null);
  const [chainStates, setChainStates] = useState<Record<string, GrantChainState>>({});
  const importedCount = useMemo(() => grants.length, [grants]);

  const refreshGrants = () => setGrants(accountAddress ? readShareGrants(accountAddress) : []);

  const refreshGrantStatuses = async (targetGrants = grants) => {
    if (!connected || !accountAddress || !IS_ACCESS_CONTROL_CONFIGURED || targetGrants.length === 0) {
      setChainStates({});
      return;
    }

    setChainStates((current) => {
      const next = { ...current };
      for (const grant of targetGrants) {
        next[grant.id] = { ...next[grant.id], status: "loading" };
      }
      return next;
    });

    const entries = await Promise.all(
      targetGrants.map(async (grant) => {
        try {
          const onChainGrant = await getOnChainGrant(grant.blobName, accountAddress);
          return [
            grant.id,
            {
              status: "ready",
              grant: onChainGrant,
              checkedAt: new Date().toISOString(),
            } satisfies GrantChainState,
          ] as const;
        } catch (error) {
          return [
            grant.id,
            {
              status: "error",
              message: error instanceof Error ? error.message : "Grant status could not be checked.",
              checkedAt: new Date().toISOString(),
            } satisfies GrantChainState,
          ] as const;
        }
      })
    );

    setChainStates(Object.fromEntries(entries));
  };

  useEffect(() => {
    setGrants(accountAddress ? readShareGrants(accountAddress) : []);
    setCodes({});
    setDownloadState(null);
    setImportError("");
    setChainStates({});
  }, [accountAddress]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!cancelled) await refreshGrantStatuses(grants);
    };

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountAddress, connected, grants]);

  const handleImport = () => {
    setImportError("");

    try {
      if (!connected || !accountAddress) {
        throw new Error("Connect the recipient wallet before importing a grant.");
      }
      const grant = parseShareGrant(grantJson);
      saveShareGrant(grant, accountAddress);
      setGrantJson("");
      const nextGrants = readShareGrants(accountAddress);
      setGrants(nextGrants);
      void refreshGrantStatuses(nextGrants);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Grant could not be imported.");
    }
  };

  const handleDownload = async (grant: ShareGrant) => {
    const accessCode = codes[grant.id]?.trim();
    if (!accessCode) {
      setDownloadState({
        grantId: grant.id,
        status: "error",
        message: "Enter the access code that was sent separately with this grant.",
      });
      return;
    }

    setDownloadState({ grantId: grant.id, status: "loading" });

    try {
      if (!IS_ACCESS_CONTROL_CONFIGURED) {
        throw new Error("Access registry needs setup for this network.");
      }
      if (!connected || !accountAddress) {
        throw new Error("Connect the recipient wallet before downloading a shared file.");
      }

      const onChainGrant = await getOnChainGrant(grant.blobName, accountAddress);
      if (!onChainGrant.exists || !onChainGrant.active) {
        throw new Error("No active on-chain grant exists for the connected wallet.");
      }
      if (onChainGrant.expired) {
        throw new Error("This on-chain grant has expired. Ask the owner to renew access.");
      }
      if (onChainGrant.expiresAtSecs > 0 && Math.floor(Date.now() / 1000) >= onChainGrant.expiresAtSecs) {
        throw new Error("This on-chain grant has expired. Ask the owner to renew access.");
      }

      const localCiphertext = buildGrantCiphertextPayload(grant.wrappedFileKey);
      if (onChainGrant.encryptedKey !== localCiphertext) {
        throw new Error("Imported grant does not match the active on-chain record.");
      }

      const fileKey = await unwrapShareGrantFileKey(grant, accessCode);
      const blob = await shelbyClient.download({
        account: grant.ownerAccount,
        blobName: grant.blobName,
      });
      const storedBytes = await readStream(blob.readable);
      const { encrypted, iv } = unpackEncrypted(storedBytes);
      const decrypted = await decryptData(new Uint8Array(encrypted), new Uint8Array(iv), fileKey);
      const downloadedHash = await computeHash(decrypted);

      if (downloadedHash !== grant.sha256) {
        throw new Error(
          `Integrity check failed. Expected ${grant.sha256.slice(0, 12)}..., got ${downloadedHash.slice(0, 12)}....`
        );
      }

      saveBytes(grant.fileName, decrypted);
      setDownloadState({
        grantId: grant.id,
        status: "verified",
        message: "File verified and downloaded",
      });
    } catch (error) {
      setDownloadState({
        grantId: grant.id,
        status: "error",
        message: error instanceof Error ? error.message : "Shared file could not be decrypted.",
      });
    }
  };

  return (
    <div className="grid gap-5">
      <section className="premium-surface rounded-2xl p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div>
            <p className="font-display text-base font-semibold text-frost">Import access grant</p>
            <p className="mt-1 max-w-[64ch] text-sm leading-6 text-frost-muted">
              Paste the owner-signed grant package. Keep the access code separate until download.
            </p>
          </div>
          <span className="accent-chip w-fit rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]">
            {importedCount} imported
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="shared-info-panel rounded-xl border border-[var(--surface-border)] px-4 py-3">
            <div className="grid gap-1 md:grid-cols-[160px_1fr] md:gap-4">
              <p className="crisp-label font-mono uppercase">contract</p>
              <p className="crisp-value break-all font-mono text-[13px] leading-5">
                {IS_ACCESS_CONTROL_CONFIGURED ? BLOBSAFE_ACCESS_CONTRACT_ADDRESS : "needs setup"}
              </p>
            </div>
            <div className="mt-2 grid gap-1 md:grid-cols-[160px_1fr] md:gap-4">
              <p className="crisp-label font-mono uppercase">recipient</p>
              <p className="crisp-value break-all font-mono text-[13px] leading-5">
                {connected && accountAddress ? accountAddress : "connect recipient wallet"}
              </p>
            </div>
          </div>

          <textarea
            value={grantJson}
            onChange={(event) => setGrantJson(event.target.value)}
            placeholder='Paste the BlobSafe grant JSON. Keep the access code separate.'
            className="min-h-[150px] resize-y rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-4 py-3 font-mono text-xs leading-6 text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleImport}
              className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40"
            >
              <Upload size={14} />
              Import grant
            </button>
            {grants.length > 0 && (
              <button
                type="button"
                onClick={() => refreshGrantStatuses()}
                className="themed-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
              >
                <RefreshCw size={13} />
                Refresh status
              </button>
            )}

            {importError && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <p className="text-xs leading-5">{importError}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {grants.length === 0 ? (
        <div className="premium-surface flex min-h-[220px] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
          <FileKey2 size={30} className="mb-4 text-frost-muted" />
          <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">No imported grants</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-frost-dim">
            Files shared with this wallet appear after you import a valid grant package.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {grants.map((grant) => (
            <SharedGrantCard
              key={grant.id}
              grant={grant}
              chainState={chainStates[grant.id] ?? { status: "idle" }}
              accessCode={codes[grant.id] ?? ""}
              downloadState={downloadState?.grantId === grant.id ? downloadState : null}
              onAccessCodeChange={(value) => setCodes((current) => ({ ...current, [grant.id]: value }))}
              onDownload={() => handleDownload(grant)}
              onRemove={() => {
                removeShareGrant(grant.id, accountAddress);
                refreshGrants();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SharedGrantCard({
  grant,
  chainState,
  accessCode,
  downloadState,
  onAccessCodeChange,
  onDownload,
  onRemove,
}: {
  grant: ShareGrant;
  chainState: GrantChainState;
  accessCode: string;
  downloadState: DownloadState;
  onAccessCodeChange: (value: string) => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const loading = downloadState?.status === "loading";
  const verified = downloadState?.status === "verified";
  const error = downloadState?.status === "error" ? downloadState.message : null;
  const status = getSharedGrantStatus(chainState);
  const blocked = status === "expired" || status === "revoked" || status === "missing";
  const statusClass = status === "active"
    ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-[var(--acid)]"
    : status === "unknown"
      ? "border-[var(--surface-border)] bg-[var(--surface-muted)] text-frost-muted"
      : "border-danger/30 bg-danger/10 text-danger";
  const statusLabel = chainState.status === "loading" ? "checking" : status;

  return (
    <section className="premium-surface rounded-2xl p-4 md:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 max-w-full break-words font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-frost">
              {grant.fileName}
            </p>
            {verified && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--acid)]">
                Verified
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${statusClass}`}>
              {chainState.status === "loading" && <Loader2 size={10} className="animate-spin" />}
              {statusLabel}
            </span>
          </div>

          <p className="mt-2 break-all font-mono text-xs leading-5 text-frost-muted">{grant.blobName}</p>

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
            <span>{formatBytes(grant.originalSize)}</span>
            <span>owner {truncateAddress(grant.ownerAccount)}</span>
            <span>expires {formatDate(grant.expirationMicros)}</span>
            <span>{grant.chain ? "on-chain grant" : "local grant"}</span>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">
            <div className="grid gap-1 font-mono text-[11px] text-frost-muted sm:grid-cols-2">
              <span>
                Grant expiry:{" "}
                <strong className="font-semibold text-frost">
                  {chainState.grant?.expiresAtSecs
                    ? new Date(chainState.grant.expiresAtSecs * 1000).toLocaleString()
                    : "no expiry"}
                </strong>
              </span>
              <span>
                Last checked:{" "}
                <strong className="font-semibold text-frost">
                  {chainState.checkedAt ? new Date(chainState.checkedAt).toLocaleTimeString() : "not checked"}
                </strong>
              </span>
            </div>
            {chainState.status === "error" && (
              <p className="mt-2 text-xs leading-5 text-danger">{chainState.message}</p>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-5">{error}</p>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <input
            value={accessCode}
            onChange={(event) => onAccessCodeChange(event.target.value)}
            placeholder="access code, e.g. proof-seal-10bvbn"
            className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
          />

          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={onDownload}
              disabled={loading || blocked}
              className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {blocked ? "Unavailable" : "Download"}
            </button>
            <a
              href={getShelbyBlobExplorerUrl(grant.ownerAccount, grant.blobName)}
              target="_blank"
              rel="noopener noreferrer"
              className="themed-secondary inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-acid/30"
              title="Open blob in explorer"
            >
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              onClick={onRemove}
              className="themed-secondary inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-frost-muted transition-colors hover:text-danger focus:outline-none focus:ring-2 focus:ring-acid/30"
              title="Remove imported grant"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function getSharedGrantStatus(chainState: GrantChainState) {
  const grant = chainState.grant;
  if (!grant || chainState.status === "idle" || chainState.status === "loading" || chainState.status === "error") {
    return "unknown";
  }
  if (!grant.exists) return "missing";
  if (grant.expired || (grant.expiresAtSecs > 0 && Math.floor(Date.now() / 1000) >= grant.expiresAtSecs)) {
    return "expired";
  }
  if (!grant.active) return "revoked";
  return "active";
}

async function readStream(readable: ReadableStream): Promise<Uint8Array<ArrayBuffer>> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = value instanceof Uint8Array
        ? value
        : new Uint8Array(value as ArrayBuffer);
      chunks.push(chunk);
      totalLength += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function saveBytes(fileName: string, bytes: Uint8Array) {
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const objectUrl = URL.createObjectURL(new Blob([payload.buffer as ArrayBuffer], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
