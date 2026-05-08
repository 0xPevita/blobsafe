import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useAccountBlobs, useDeleteBlob } from "@shelby-protocol/react";
import {
  AlertCircle,
  ArrowDownAZ,
  Copy,
  Download,
  RefreshCw,
  Loader2,
  FolderOpen,
  Lock,
  Globe,
  ExternalLink,
  Clock,
  Eye,
  FileText,
  Info,
  KeyRound,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  formatBlobName,
  formatBytes,
  formatDate,
  getBlobCreationMicros,
  getBlobExpirationMicros,
  getBlobFolderPath,
  getBlobFullName,
  getBlobMerkleRootHex,
  getBlobSize,
  getBlobStoredName,
  getExplorerUrl,
  getFileType,
  getShelbyBlobExplorerUrl,
  getWalletAccountAddress,
  shelbyClient,
} from "@/lib/shelby";
import {
  computeHash,
  decryptWithWalletKey,
  decryptWithWrappedFileKey,
  getWalletEncryptionKey,
  unpackEncrypted,
  unwrapFileKey,
} from "@/lib/encryption";
import { FolderRail } from "@/components/FolderRail";
import { useFileStore } from "@/store/useFileStore";
import { getStoredReceipt, removeStoredReceipt, saveStoredReceipt, type StoredReceipt } from "@/lib/receipts";
import { isReceiptBackupBlob } from "@/lib/receiptBackups";
import { downloadReceiptSidecar, isReceiptSidecarBlob } from "@/lib/sidecarReceipts";
import { createShareGrant, generateAccessCode, isShareableReceipt, type ShareGrant } from "@/lib/shareGrants";
import {
  readSentSharePackagesForBlob,
  saveSentSharePackage,
  type SentSharePackage,
} from "@/lib/sentSharePackages";
import { readTeams, teamToRecipientList, type TeamProfile } from "@/lib/teams";
import {
  BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
  IS_ACCESS_CONTROL_CONFIGURED,
  buildGrantCiphertextPayload,
  grantAccessOnChain,
  getOnChainGrant,
  getOnChainRecipients,
  getOnChainTeamsForOwner,
  markBlobDeletedOnChain,
  revokeAccessOnChain,
  type GrantExpiryPreset,
  type OnChainTeamView,
  type OnChainGrantView,
} from "@/lib/accessControl";
import {
  getAuditEventCopy,
  getAuditEventTitle,
  readAuditEventsForBlob,
  recordAuditEvent,
  type AuditEvent,
} from "@/lib/auditTrail";
import { formatRecoveryMessage } from "@/lib/errorRecovery";

type DownloadMode = "encrypted" | "public";
type FileFilter = "all" | "encrypted" | "public";
type FileSort = "newest" | "name" | "size" | "expiry";

type DownloadState = {
  blobName: string;
  status: "loading" | "error";
  message?: string;
} | null;

const AUDIT_TIMELINE_PAGE_SIZE = 3;

type BlobActivityView = {
  type: string;
  transactionHash: string;
  timestamp: string;
};

type ActivityState = {
  status: "idle" | "loading" | "ready" | "error";
  items: BlobActivityView[];
  message?: string;
};

type DeleteState = {
  blobName: string;
  status: "loading" | "error";
  message?: string;
} | null;

type BlobPayload = {
  bytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  receipt?: StoredReceipt;
};

type FilePreviewData =
  | { type: "image"; url: string; fileName: string }
  | { type: "pdf"; url: string; fileName: string }
  | { type: "text"; text: string; fileName: string }
  | { type: "unsupported"; fileName: string; message: string };

type GrantExpiryMode = "none" | GrantExpiryPreset | "custom";
type GrantExpiryUnit = "minutes" | "hours" | "days";

type ShareState = {
  blobName: string;
  mode: "single" | "team";
  grant?: ShareGrant;
  grants?: Array<{ recipient: string; grant: ShareGrant; accessCode: string }>;
  accessCode?: string;
  teamName?: string;
} | null;

export function FileList() {
  const { connected, account, signMessage, signAndSubmitTransaction } = useWallet();
  const accountAddress = getWalletAccountAddress(account);
  const [downloadState, setDownloadState] = useState<DownloadState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);
  const [pendingDeleteBlobName, setPendingDeleteBlobName] = useState<string | null>(null);
  const [selectedBlob, setSelectedBlob] = useState<unknown | null>(null);
  const [activityState, setActivityState] = useState<ActivityState>({
    status: "idle",
    items: [],
  });
  const [copiedDetail, setCopiedDetail] = useState(false);
  const [verifiedBlobNames, setVerifiedBlobNames] = useState<Set<string>>(() => new Set());
  const [shareState, setShareState] = useState<ShareState>(null);
  const [accessListVersion, setAccessListVersion] = useState(0);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [auditVersion, setAuditVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [sort, setSort] = useState<FileSort>("newest");
  const activeFolder = useFileStore((state) => state.activeFolder);
  const folders = useFileStore((state) => state.folders);
  const getFolderForBlob = useFileStore((state) => state.getFolderForBlob);
  const moveBlobToFolder = useFileStore((state) => state.moveBlobToFolder);

  const { data: blobs, isLoading, isFetching, isError, error, refetch } = useAccountBlobs({
    client: shelbyClient,
    account: accountAddress,
    enabled: !!connected && !!accountAddress,
  });
  const deleteBlob = useDeleteBlob({ client: shelbyClient });

  useEffect(() => {
    const handleAuditUpdate = () => setAuditVersion((version) => version + 1);
    window.addEventListener("blobsafe:audit-updated", handleAuditUpdate);
    return () => window.removeEventListener("blobsafe:audit-updated", handleAuditUpdate);
  }, []);

  useEffect(() => {
    if (!selectedBlob || !accountAddress) {
      setActivityState({ status: "idle", items: [] });
      return;
    }

    let cancelled = false;
    const fullBlobName = getBlobFullName(selectedBlob, accountAddress);
    setActivityState({ status: "loading", items: [] });

    shelbyClient.coordination
      .getBlobActivities({
        where: {
          blob_name: { _eq: fullBlobName },
        },
        pagination: { limit: 8 },
      })
      .then((activities) => {
        if (cancelled) return;
        setActivityState({
          status: "ready",
          items: activities.map((activity) => ({
            type: activity.type,
            transactionHash: activity.transactionHash,
            timestamp: activity.timestamp,
          })),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setActivityState({
          status: "error",
          items: [],
        message: error instanceof Error ? error.message : "Chain activity is not available yet.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accountAddress, selectedBlob, activityRefreshKey]);

  if (!connected) {
    return (
      <div className="premium-surface flex min-h-[260px] flex-col items-center justify-center rounded-xl px-6 py-12 text-center">
        <div className="accent-chip mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
          <Lock size={20} />
        </div>
        <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">
          Connect wallet to view owned files
        </p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-frost-dim">
          Blob lists are scoped to the connected Aptos account and active Shelby network.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <FileListSkeleton />;
  }

  if (isError) {
    return (
      <div className="premium-surface flex min-h-[260px] flex-col items-center justify-center rounded-xl px-6 py-14 text-center">
        <AlertCircle size={28} className="mb-4 text-danger" />
        <p className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">Vault index unavailable</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-frost-dim">
          {error instanceof Error ? error.message : "BlobSafe could not read the Shelby index for this wallet."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="premium-button mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-display text-sm font-semibold"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  const allBlobs = (blobs || []).filter((blob) => {
    const blobName = getBlobStoredName(blob);
    return !isReceiptSidecarBlob(blobName) && !isReceiptBackupBlob(blobName);
  });
  const allBlobNames = allBlobs.map((blob) => getBlobStoredName(blob));
  const availableFolders = buildAvailableFolders(folders, allBlobNames, getFolderForBlob);
  const folderBlobs = allBlobs.filter((blob) =>
    getBlobFolderPath(getBlobStoredName(blob)) === activeFolder
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBlobs = folderBlobs
    .filter((blob) => {
      const blobName = getBlobStoredName(blob);
      const isEncrypted = blobName.includes("/encrypted/");
      if (filter === "encrypted" && !isEncrypted) return false;
      if (filter === "public" && isEncrypted) return false;
      if (!normalizedQuery) return true;
      return `${formatBlobName(blobName)} ${blobName}`.toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => compareBlobs(a, b, sort));
  const encryptedBlobs = visibleBlobs.filter((blob) =>
    getBlobStoredName(blob).includes("encrypted/")
  );
  const publicBlobs = visibleBlobs.filter((blob) =>
    getBlobStoredName(blob).includes("public/")
  );
  const activeFolderLabel = activeFolder === "/" ? "Vault root" : activeFolder;
  const selectedBlobName = selectedBlob ? getBlobStoredName(selectedBlob) : "";
  const selectedReceipt = selectedBlobName ? getStoredReceipt(selectedBlobName, accountAddress) : undefined;
  const selectedAuditEvents = selectedBlobName
    ? readAuditEventsForBlob(accountAddress, selectedBlobName)
    : [];
  void auditVersion;

  const readBlobPayload = async (blobName: string, mode: DownloadMode): Promise<BlobPayload> => {
    if (!accountAddress) {
      throw new Error("Connect the wallet that owns this file.");
    }

    const blob = await shelbyClient.download({
      account: accountAddress,
      blobName,
    });
    const storedBytes = await readStream(blob.readable);
    const storedReceipt = getStoredReceipt(blobName, accountAddress);
    const fileName = storedReceipt?.fileName ?? stripUniqueBlobSuffix(formatBlobName(blobName));

    if (mode !== "encrypted") {
      if (storedReceipt?.sha256) {
        const downloadedHash = await computeHash(storedBytes);
        if (downloadedHash !== storedReceipt.sha256) {
          throw new Error(
            `Integrity check failed. Expected ${storedReceipt.sha256.slice(0, 12)}..., got ${downloadedHash.slice(0, 12)}....`
          );
        }
        markBlobVerified(blobName, setVerifiedBlobNames);
      }
      return { bytes: storedBytes, fileName, receipt: storedReceipt };
    }

    let receipt = storedReceipt;
    const { encrypted, iv } = unpackEncrypted(storedBytes);
    const encryptedBytes = new Uint8Array(encrypted);
    const ivBytes = new Uint8Array(iv);
    let decrypted: Uint8Array<ArrayBuffer>;

    try {
      if (!receipt?.key) {
        const masterKey = await getWalletEncryptionKey(accountAddress, signMessage);
        const recoveredReceipt = await downloadReceiptSidecar({
          account: accountAddress,
          blobName,
          masterKey,
        });
        if (recoveredReceipt) {
          receipt = recoveredReceipt;
          saveStoredReceipt(recoveredReceipt);
        }
      }

      if (receipt?.key?.version === "file-key-v1") {
        decrypted = await decryptWithWrappedFileKey(
          encryptedBytes,
          ivBytes,
          receipt.key,
          accountAddress,
          signMessage
        );
      } else {
        decrypted = await decryptWithWalletKey(encryptedBytes, ivBytes, accountAddress, signMessage);
      }
    } catch (wrappedKeyError) {
      if (!receipt?.key) throw wrappedKeyError;
      decrypted = await decryptWithWalletKey(encryptedBytes, ivBytes, accountAddress, signMessage);
    }

    if (receipt?.sha256) {
      const downloadedHash = await computeHash(decrypted);
      if (downloadedHash !== receipt.sha256) {
        throw new Error(
          `Integrity check failed. Expected ${receipt.sha256.slice(0, 12)}..., got ${downloadedHash.slice(0, 12)}....`
        );
      }
      markBlobVerified(blobName, setVerifiedBlobNames);
    }

    return { bytes: decrypted, fileName, receipt };
  };

  const handleDownload = async (blobName: string, mode: DownloadMode) => {
    if (!accountAddress) return;

    setDownloadState({ blobName, status: "loading" });

    try {
      const payload = await readBlobPayload(blobName, mode);
      saveBytes(payload.fileName, payload.bytes);
      setDownloadState(null);
    } catch (error) {
      const message = formatRecoveryMessage(error, "download");
      setDownloadState({
        blobName,
        status: "error",
        message,
      });
    }
  };

  const handlePreview = async (blobName: string, mode: DownloadMode): Promise<FilePreviewData> => {
    const payload = await readBlobPayload(blobName, mode);
    return createPreviewData(payload.fileName, payload.bytes);
  };

  const handleDelete = async (blobName: string) => {
    if (!accountAddress || !signAndSubmitTransaction) return;

    setDeleteState({ blobName, status: "loading" });

    try {
      const transaction = await deleteBlob.mutateAsync({
        blobName,
        signer: { signAndSubmitTransaction },
      });

      if (transaction.hash) {
        await shelbyClient.coordination.aptos.waitForTransaction({
          transactionHash: transaction.hash,
          options: { waitForIndexer: true },
        });
      }

      removeStoredReceipt(blobName, accountAddress);
      if (IS_ACCESS_CONTROL_CONFIGURED) {
        const deleteTxHash = await markBlobDeletedOnChain({
          signAndSubmitTransaction,
          blobName,
        });
        recordAuditEvent({
          account: accountAddress,
          type: "file_deleted",
          source: "aptos",
          blobName,
          txHash: deleteTxHash,
        });
      } else if (transaction.hash) {
        recordAuditEvent({
          account: accountAddress,
          type: "file_deleted",
          source: "shelby",
          blobName,
          txHash: transaction.hash,
        });
      }
      setPendingDeleteBlobName(null);
      setDeleteState(null);
      if (selectedBlob && getBlobStoredName(selectedBlob) === blobName) {
        setSelectedBlob(null);
      }
      await refetch();
    } catch (error) {
      setDeleteState({
        blobName,
        status: "error",
        message: formatRecoveryMessage(error, "delete"),
      });
    }
  };

  const handleMoveBlob = (blobName: string, folder: string) => {
    moveBlobToFolder(blobName, folder);
    const receipt = getStoredReceipt(blobName, accountAddress);
    if (receipt) {
      saveStoredReceipt({ ...receipt, folder });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-frost">Owned files</h2>
          <span className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs text-frost-muted">
            {visibleBlobs.length}/{allBlobs.length} blob{allBlobs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            refetch();
          }}
          disabled={isFetching}
          className="themed-secondary inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-3 font-mono text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-acid/40 focus:ring-offset-2 focus:ring-offset-obsidian-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <FolderRail blobNames={allBlobNames} accountAddress={accountAddress} />

      <FileControls
        query={query}
        filter={filter}
        sort={sort}
        resultCount={visibleBlobs.length}
        folderCount={folderBlobs.length}
        onQueryChange={setQuery}
        onFilterChange={setFilter}
        onSortChange={setSort}
      />

      {allBlobs.length === 0 ? (
        <div className="premium-surface flex min-h-[300px] flex-col items-center justify-center rounded-xl px-6 py-20 text-center">
          <FolderOpen size={34} className="mb-4 text-frost-muted" />
          <p className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">No sealed files yet</p>
          <p className="max-w-sm text-sm leading-6 text-frost-dim">Seal a file to create the first wallet-owned Shelby blob.</p>
        </div>
      ) : folderBlobs.length === 0 ? (
        <div className="premium-surface flex min-h-[260px] flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
          <FolderOpen size={32} className="mb-4 text-frost-muted" />
          <p className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">No files in this folder</p>
          <p className="max-w-sm text-sm leading-6 text-frost-dim">
            Seal a file into {activeFolderLabel} or switch to another vault folder.
          </p>
        </div>
      ) : visibleBlobs.length === 0 ? (
        <div className="premium-surface flex min-h-[260px] flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
          <Search size={32} className="mb-4 text-frost-muted" />
          <p className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-frost">No matching files</p>
          <p className="max-w-sm text-sm leading-6 text-frost-dim">
            Broaden the search or change the file filter.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {encryptedBlobs.length > 0 && (
            <BlobSection
              title="Sealed"
              icon={<Lock size={13} className="text-acid" />}
              blobs={encryptedBlobs}
              accountAddress={accountAddress}
              badge="E2E"
              badgeColor="text-acid"
              mode="encrypted"
              downloadState={downloadState}
              verifiedBlobNames={verifiedBlobNames}
              deleteState={deleteState}
              pendingDeleteBlobName={pendingDeleteBlobName}
              folders={availableFolders}
              getDisplayFolder={(blobName) => getBlobFolderPath(blobName)}
              onDownload={handleDownload}
              onSelectBlob={setSelectedBlob}
              onMoveBlob={handleMoveBlob}
              onRequestDelete={setPendingDeleteBlobName}
              onCancelDelete={() => setPendingDeleteBlobName(null)}
              onDelete={handleDelete}
            />
          )}
          {publicBlobs.length > 0 && (
            <BlobSection
              title="Public"
              icon={<Globe size={13} className="text-info" />}
              blobs={publicBlobs}
              accountAddress={accountAddress}
              badge="PUBLIC"
              badgeColor="text-info"
              mode="public"
              downloadState={downloadState}
              verifiedBlobNames={verifiedBlobNames}
              deleteState={deleteState}
              pendingDeleteBlobName={pendingDeleteBlobName}
              folders={availableFolders}
              getDisplayFolder={(blobName) => getBlobFolderPath(blobName)}
              onDownload={handleDownload}
              onSelectBlob={setSelectedBlob}
              onMoveBlob={handleMoveBlob}
              onRequestDelete={setPendingDeleteBlobName}
              onCancelDelete={() => setPendingDeleteBlobName(null)}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {selectedBlob !== null && accountAddress && (
        <FileDetailDrawer
          blob={selectedBlob}
          accountAddress={accountAddress}
          receipt={selectedReceipt}
          displayFolder={getBlobFolderPath(selectedBlobName)}
          verified={verifiedBlobNames.has(selectedBlobName)}
          activityState={activityState}
          auditEvents={selectedAuditEvents}
          copied={copiedDetail}
          pendingDelete={pendingDeleteBlobName === selectedBlobName}
          deleteState={deleteState}
          shareState={shareState}
          onCopy={() => {
            const payload = buildDetailReceipt(selectedBlob, accountAddress, selectedReceipt, activityState.items);
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            setCopiedDetail(true);
            window.setTimeout(() => setCopiedDetail(false), 1400);
          }}
          onRequestDelete={() => setPendingDeleteBlobName(selectedBlobName)}
          onCancelDelete={() => setPendingDeleteBlobName(null)}
          onDelete={() => handleDelete(selectedBlobName)}
          onLoadPreview={() => handlePreview(
            selectedBlobName,
            selectedBlobName.includes("/encrypted/") ? "encrypted" : "public"
          )}
          onCreateShareGrant={async (recipient, expiresAtSecs, expiryPreset) => {
            if (!IS_ACCESS_CONTROL_CONFIGURED) {
              throw new Error("Configure the BlobSafe access registry before creating on-chain grants.");
            }
            if (!recipient.trim()) {
              throw new Error("Recipient wallet address is required for on-chain access grants.");
            }
            if (!selectedReceipt || !isShareableReceipt(selectedReceipt)) {
              throw new Error("This file needs a local per-file key receipt before sharing.");
            }
            if (isSameAptosAddress(recipient, selectedReceipt.account)) {
              throw new Error("Choose a different recipient wallet. The owner already controls this file, so BlobSafe does not create self-grants.");
            }
            if (!signAndSubmitTransaction) {
              throw new Error("Connected wallet cannot submit transactions.");
            }
            const masterKey = await getWalletEncryptionKey(accountAddress, signMessage);
            const fileKey = await unwrapFileKey(selectedReceipt.key, masterKey);
            const accessCode = generateAccessCode();
            const localGrant = await createShareGrant({
              receipt: selectedReceipt,
              fileKey,
              accessCode,
              recipient,
            });
            const grantTxHash = await grantAccessOnChain({
              signAndSubmitTransaction,
              blobName: selectedReceipt.blobName,
              recipient,
              encryptedKey: buildGrantCiphertextPayload(localGrant.wrappedFileKey),
              expiresAtSecs,
              expiryPreset,
            });
            const grant = {
              ...localGrant,
              chain: {
                moduleAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
                grantTxHash,
                grantedAt: new Date().toISOString(),
              },
            };
            saveSentSharePackage({
              id: grant.id,
              mode: "single",
              createdAt: new Date().toISOString(),
              ownerAccount: accountAddress,
              blobName: selectedReceipt.blobName,
              recipient,
              grant,
              accessCode,
            });
            recordAuditEvent({
              account: accountAddress,
              type: "access_granted",
              source: "aptos",
              blobName: selectedReceipt.blobName,
              fileName: selectedReceipt.fileName,
              recipient,
              txHash: grantTxHash,
              message: expiresAtSecs
                ? `Access granted until ${new Date(expiresAtSecs * 1000).toLocaleString()}.`
                : undefined,
            });
            setShareState({ blobName: selectedBlobName, mode: "single", grant, accessCode });
            setAccessListVersion((version) => version + 1);
            await navigator.clipboard.writeText(JSON.stringify(grant, null, 2));
          }}
          onCreateTeamShareGrant={async (team, expiresAtSecs, expiryPreset) => {
            if (!IS_ACCESS_CONTROL_CONFIGURED) {
              throw new Error("Configure the BlobSafe access registry before creating on-chain grants.");
            }
            if (!selectedReceipt || !isShareableReceipt(selectedReceipt)) {
              throw new Error("This file needs a local per-file key receipt before sharing.");
            }
            if (!signAndSubmitTransaction) {
              throw new Error("Connected wallet cannot submit transactions.");
            }

            const recipients = teamToRecipientList(team);
            if (recipients.length === 0) {
              throw new Error("Selected group has no valid recipient wallet addresses.");
            }
            const ownerRecipient = recipients.find((recipient) => isSameAptosAddress(recipient, selectedReceipt.account));
            if (ownerRecipient) {
              throw new Error(`Remove ${formatShortAddress(ownerRecipient)} from this group before sharing. BlobSafe does not create self-grants for the owner wallet.`);
            }

            const masterKey = await getWalletEncryptionKey(accountAddress, signMessage);
            const fileKey = await unwrapFileKey(selectedReceipt.key, masterKey);
            const grants: Array<{ recipient: string; grant: ShareGrant; accessCode: string }> = [];

            for (const recipient of recipients) {
              const accessCode = generateAccessCode();
              const localGrant = await createShareGrant({
                receipt: selectedReceipt,
                fileKey,
                accessCode,
                recipient,
              });
              const grantTxHash = await grantAccessOnChain({
                signAndSubmitTransaction,
                blobName: selectedReceipt.blobName,
                recipient,
                encryptedKey: buildGrantCiphertextPayload(localGrant.wrappedFileKey),
                expiresAtSecs,
                expiryPreset,
              });
              recordAuditEvent({
                account: accountAddress,
                type: "access_granted",
                source: "aptos",
                blobName: selectedReceipt.blobName,
                fileName: selectedReceipt.fileName,
                recipient,
                txHash: grantTxHash,
                message: expiresAtSecs
                  ? `Group grant for ${team.name} was written for ${formatShortAddress(recipient)} until ${new Date(expiresAtSecs * 1000).toLocaleString()}.`
                  : `Group grant for ${team.name} was written for ${formatShortAddress(recipient)}.`,
              });
              grants.push({
                recipient,
                accessCode,
                grant: {
                  ...localGrant,
                  chain: {
                    moduleAddress: BLOBSAFE_ACCESS_CONTRACT_ADDRESS,
                    grantTxHash,
                    grantedAt: new Date().toISOString(),
                  },
                },
              });
            }

            const packagePayload = {
              version: "blobsafe-team-share-v1",
              team: team.name,
              blobName: selectedReceipt.blobName,
              createdAt: new Date().toISOString(),
              grants,
            };
            saveSentSharePackage({
              id: `${selectedReceipt.blobName}:${team.id}:${Date.now()}`,
              mode: "team",
              createdAt: packagePayload.createdAt,
              ownerAccount: accountAddress,
              blobName: selectedReceipt.blobName,
              teamName: team.name,
              grants,
            });
            setShareState({ blobName: selectedBlobName, mode: "team", grants, teamName: team.name });
            setAccessListVersion((version) => version + 1);
            await navigator.clipboard.writeText(JSON.stringify(packagePayload, null, 2));
          }}
          onRenewShareGrant={async (recipient, encryptedKey, expiresAtSecs, expiryPreset) => {
            if (!IS_ACCESS_CONTROL_CONFIGURED) {
              throw new Error("Access registry needs setup for this network.");
            }
            if (!recipient.trim()) {
              throw new Error("Recipient wallet address is required.");
            }
            if (!encryptedKey.trim()) {
              throw new Error("This grant has no wrapped file key to renew.");
            }
            if (!signAndSubmitTransaction) {
              throw new Error("Connected wallet cannot submit transactions.");
            }

            const renewTxHash = await grantAccessOnChain({
              signAndSubmitTransaction,
              blobName: selectedBlobName,
              recipient,
              encryptedKey,
              expiresAtSecs,
              expiryPreset,
            });
            recordAuditEvent({
              account: accountAddress,
              type: "access_granted",
              source: "aptos",
              blobName: selectedBlobName,
              fileName: selectedReceipt?.fileName,
              recipient,
              txHash: renewTxHash,
              message: expiresAtSecs
                ? `Access renewed until ${new Date(expiresAtSecs * 1000).toLocaleString()}.`
                : "Access renewed with no automatic expiry.",
            });
            setAccessListVersion((version) => version + 1);
          }}
          onRevokeShareGrant={async (recipient) => {
            if (!IS_ACCESS_CONTROL_CONFIGURED) {
              throw new Error("Access registry needs setup for this network.");
            }
            if (!recipient.trim()) {
              throw new Error("Recipient wallet address is required.");
            }
            if (!signAndSubmitTransaction) {
              throw new Error("Connected wallet cannot submit transactions.");
            }
            const revokeTxHash = await revokeAccessOnChain({
              signAndSubmitTransaction,
              blobName: selectedBlobName,
              recipient,
            });
            recordAuditEvent({
              account: accountAddress,
              type: "access_revoked",
              source: "aptos",
              blobName: selectedBlobName,
              fileName: selectedReceipt?.fileName,
              recipient,
              txHash: revokeTxHash,
            });
            setAccessListVersion((version) => version + 1);
          }}
          onClearShareGrant={() => setShareState(null)}
          accessListVersion={accessListVersion}
          onRetryActivity={() => setActivityRefreshKey((key) => key + 1)}
          onClose={() => setSelectedBlob(null)}
        />
      )}
    </div>
  );
}

function BlobSection({
  title,
  icon,
  blobs,
  accountAddress,
  badge,
  badgeColor,
  mode,
  downloadState,
  verifiedBlobNames,
  deleteState,
  pendingDeleteBlobName,
  folders,
  getDisplayFolder,
  onDownload,
  onSelectBlob,
  onMoveBlob,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  blobs: unknown[];
  accountAddress: string;
  badge: string;
  badgeColor: string;
  mode: DownloadMode;
  downloadState: DownloadState;
  verifiedBlobNames: Set<string>;
  deleteState: DeleteState;
  pendingDeleteBlobName: string | null;
  folders: Array<{ path: string; name: string }>;
  getDisplayFolder: (blobName: string) => string;
  onDownload: (blobName: string, mode: DownloadMode) => void;
  onSelectBlob: (blob: unknown) => void;
  onMoveBlob: (blobName: string, folder: string) => void;
  onRequestDelete: (blobName: string) => void;
  onCancelDelete: () => void;
  onDelete: (blobName: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        {icon}
        <span className="text-xs font-mono text-frost-muted uppercase tracking-widest">{title}</span>
        <span className="text-xs font-mono text-frost-muted/50">({blobs.length})</span>
      </div>

      <div className="premium-surface overflow-hidden rounded-xl">
        {blobs.map((blob, index) => (
          <BlobRow
            key={index}
            blob={blob}
            accountAddress={accountAddress}
            badge={badge}
            badgeColor={badgeColor}
            mode={mode}
            downloadState={downloadState}
            verified={verifiedBlobNames.has(getBlobStoredName(blob))}
            deleteState={deleteState}
            pendingDeleteBlobName={pendingDeleteBlobName}
            folders={folders}
            displayFolder={getDisplayFolder(getBlobStoredName(blob))}
            onDownload={onDownload}
            onSelectBlob={onSelectBlob}
            onMoveBlob={onMoveBlob}
            onRequestDelete={onRequestDelete}
            onCancelDelete={onCancelDelete}
            onDelete={onDelete}
            isLast={index === blobs.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function BlobRow({
  blob,
  accountAddress,
  badge,
  badgeColor,
  mode,
  downloadState,
  verified,
  deleteState,
  pendingDeleteBlobName,
  folders,
  displayFolder,
  onDownload,
  onSelectBlob,
  onMoveBlob,
  onRequestDelete,
  onCancelDelete,
  onDelete,
  isLast,
}: {
  blob: unknown;
  accountAddress: string;
  badge: string;
  badgeColor: string;
  mode: DownloadMode;
  downloadState: DownloadState;
  verified: boolean;
  deleteState: DeleteState;
  pendingDeleteBlobName: string | null;
  folders: Array<{ path: string; name: string }>;
  displayFolder: string;
  onDownload: (blobName: string, mode: DownloadMode) => void;
  onSelectBlob: (blob: unknown) => void;
  onMoveBlob: (blobName: string, folder: string) => void;
  onRequestDelete: (blobName: string) => void;
  onCancelDelete: () => void;
  onDelete: (blobName: string) => void;
  isLast: boolean;
}) {
  const blobName = getBlobStoredName(blob);
  const receipt = getStoredReceipt(blobName, accountAddress);
  const name = receipt?.fileName ?? stripUniqueBlobSuffix(formatBlobName(blobName));
  const fileType = getFileType(name);
  const size = getBlobSize(blob);
  const expirationMicros = getBlobExpirationMicros(blob);
  const isCurrentDownload = downloadState?.blobName === blobName;
  const isDownloading = isCurrentDownload && downloadState?.status === "loading";
  const downloadError = isCurrentDownload && downloadState?.status === "error"
    ? downloadState.message
    : null;
  const isPendingDelete = pendingDeleteBlobName === blobName;
  const isDeleting = deleteState?.blobName === blobName && deleteState.status === "loading";
  const deleteError = deleteState?.blobName === blobName && deleteState.status === "error"
    ? deleteState.message
    : null;
  return (
    <div className={`group px-4 py-3 transition-colors hover:bg-[var(--soft-hover)] ${!isLast ? "border-b border-[var(--surface-border)]" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] group-hover:border-[var(--surface-border-strong)]">
          <span className="text-[9px] font-mono font-bold text-frost-muted tracking-wider">{fileType}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-frost truncate">{name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-[10px] font-mono ${badgeColor} opacity-70`}>{badge}</span>
            {verified && (
              <>
                <span className="text-frost-muted/30">-</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--acid)]">
                  <ShieldCheck size={10} />
                  Verified
                </span>
              </>
            )}
            {size && (
              <>
                <span className="text-frost-muted/30">-</span>
                <span className="text-xs text-frost-muted">{formatBytes(size)}</span>
              </>
            )}
            {expirationMicros && (
              <>
                <span className="text-frost-muted/30">-</span>
                <span className="flex items-center gap-1 text-xs text-frost-muted">
                  <Clock size={10} />
                  {formatDate(expirationMicros)}
                </span>
              </>
            )}
            <span className="text-frost-muted/30">-</span>
            <span className="flex items-center gap-1 text-xs text-frost-muted">
              <FolderOpen size={10} />
              {displayFolder === "/" ? "root" : displayFolder}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          <label className="sr-only" htmlFor={`move-${blobName}`}>Current folder</label>
          <select
            id={`move-${blobName}`}
            value={displayFolder}
            onChange={(event) => event.currentTarget.value = displayFolder}
            disabled
            className="folder-move-select hidden min-h-9 max-w-[150px] rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 font-mono text-[11px] text-frost outline-none opacity-80 md:block"
            title="Folder is set by the Shelby blob path"
          >
            {folders.map((folder) => (
              <option key={folder.path} value={folder.path}>
                {folder.path === "/" ? "Vault root" : folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSelectBlob(blob)}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-frost-muted transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30"
            title="File details"
          >
            <Info size={13} />
          </button>
          <a
            href={getExplorerUrl("account", accountAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-frost-muted transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30"
            title="View account on Shelby Explorer"
          >
            <ExternalLink size={13} />
          </a>
          <button
            type="button"
            onClick={() => onDownload(blobName, mode)}
            disabled={isDownloading}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-frost-muted transition-colors hover:bg-[var(--soft-hover)] hover:text-frost focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-60"
            title={mode === "encrypted" ? "Decrypt and download" : "Download"}
          >
            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(blobName)}
            disabled={isDeleting}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-frost-muted transition-colors hover:bg-danger/10 hover:text-danger focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-60"
            title="Delete blob"
          >
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      {isPendingDelete && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="font-display text-sm font-semibold text-danger">Delete this blob?</p>
              <p className="mt-1 text-xs leading-5 text-danger/80">
                This submits a wallet-signed Shelby transaction and removes the blob from your account metadata.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancelDelete}
                className="themed-secondary inline-flex min-h-9 items-center justify-center rounded-lg px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDelete(blobName)}
                disabled={isDeleting}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/15 px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting && <Loader2 size={12} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {downloadError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-5">{downloadError}</p>
        </div>
      )}

      {deleteError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-5">{deleteError}</p>
        </div>
      )}
    </div>
  );
}

function FileControls({
  query,
  filter,
  sort,
  resultCount,
  folderCount,
  onQueryChange,
  onFilterChange,
  onSortChange,
}: {
  query: string;
  filter: FileFilter;
  sort: FileSort;
  resultCount: number;
  folderCount: number;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: FileFilter) => void;
  onSortChange: (value: FileSort) => void;
}) {
  return (
    <section className="premium-surface rounded-xl p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-center">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-frost-muted">
            <Search size={15} />
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search files or blob paths"
            className="min-h-11 w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-10 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 inline-flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-lg text-frost-muted transition-colors hover:bg-[var(--soft-hover)] hover:text-frost"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1">
          {[
            ["all", "All"],
            ["encrypted", "Encrypted"],
            ["public", "Public"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value as FileFilter)}
              className={`min-h-9 rounded-lg px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 ${
                filter === value
                  ? "bg-[var(--acid-glow)] text-frost"
                  : "text-frost-muted hover:bg-[var(--soft-hover)] hover:text-frost"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="grid min-h-11 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3">
          <ArrowDownAZ size={15} className="text-frost-muted" />
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as FileSort)}
            className="w-full bg-transparent font-mono text-sm text-frost outline-none"
            aria-label="Sort files"
          >
            <option value="newest">Newest first</option>
            <option value="name">Name A-Z</option>
            <option value="size">Size largest</option>
            <option value="expiry">Expiry soon</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-frost-muted">
        <span>{resultCount} shown</span>
        <span>{folderCount} in folder</span>
      </div>
    </section>
  );
}

function FileDetailDrawer({
  blob,
  accountAddress,
  receipt,
  displayFolder,
  verified,
  activityState,
  auditEvents,
  copied,
  pendingDelete,
  deleteState,
  shareState,
  onCopy,
  onRequestDelete,
  onCancelDelete,
  onDelete,
  onLoadPreview,
  onCreateShareGrant,
  onCreateTeamShareGrant,
  onRenewShareGrant,
  onRevokeShareGrant,
  onClearShareGrant,
  accessListVersion,
  onRetryActivity,
  onClose,
}: {
  blob: unknown;
  accountAddress: string;
  receipt?: StoredReceipt;
  displayFolder: string;
  verified: boolean;
  activityState: ActivityState;
  auditEvents: AuditEvent[];
  copied: boolean;
  pendingDelete: boolean;
  deleteState: DeleteState;
  shareState: ShareState;
  onCopy: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onLoadPreview: () => Promise<FilePreviewData>;
  onCreateShareGrant: (recipient: string, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
  onCreateTeamShareGrant: (team: TeamProfile, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
  onRenewShareGrant: (recipient: string, encryptedKey: string, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
  onRevokeShareGrant: (recipient: string) => Promise<void>;
  onClearShareGrant: () => void;
  accessListVersion: number;
  onRetryActivity: () => void;
  onClose: () => void;
}) {
  const blobName = getBlobStoredName(blob);
  const fileName = receipt?.fileName ?? stripUniqueBlobSuffix(formatBlobName(blobName));
  const folder = displayFolder || getBlobFolderPath(blobName);
  const size = getBlobSize(blob);
  const expirationMicros = getBlobExpirationMicros(blob);
  const creationMicros = getBlobCreationMicros(blob);
  const merkleRoot = getBlobMerkleRootHex(blob);
  const encryption = getEncryptionLabel(blobName, receipt);
  const keyModel = getKeyModelLabel(blobName, receipt);
  const isPublicBlob = blobName.includes("/public/");
  const receiptStorage = receipt?.receiptStorage === "sidecar-v1"
    ? "Shelby sidecar + local cache"
    : receipt
      ? "Local browser cache"
      : isPublicBlob
        ? "Not restored on this browser"
        : "Restore required for decrypt";
  const integrityStatus = receipt
    ? verified
      ? "SHA-256 verified"
      : "Pending preview or download"
    : isPublicBlob
      ? "Preview available; restore receipt to verify hash"
      : "Restore receipt to verify and decrypt";
  const originalHashValue = receipt?.sha256 ?? (isPublicBlob
    ? "Restore receipt to compare the original file hash"
    : "Restore receipt to recover the original file hash");
  const isDeleting = deleteState?.blobName === blobName && deleteState.status === "loading";
  const deleteError = deleteState?.blobName === blobName && deleteState.status === "error"
    ? deleteState.message
    : null;
  const activeShareState = shareState?.blobName === blobName ? shareState : null;
  const [previewState, setPreviewState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: FilePreviewData;
    message?: string;
  }>({ status: "idle" });

  useEffect(() => {
    setPreviewState((current) => {
      if (current.data && "url" in current.data) {
        URL.revokeObjectURL(current.data.url);
      }
      return { status: "idle" };
    });
  }, [blobName]);

  useEffect(() => {
    return () => {
      if (previewState.data && "url" in previewState.data) {
        URL.revokeObjectURL(previewState.data.url);
      }
    };
  }, [previewState.data]);

  const loadPreview = async () => {
    setPreviewState((current) => {
      if (current.data && "url" in current.data) {
        URL.revokeObjectURL(current.data.url);
      }
      return { status: "loading" };
    });

    try {
      const data = await onLoadPreview();
      setPreviewState({ status: "ready", data });
    } catch (error) {
      setPreviewState({
        status: "error",
        message: formatRecoveryMessage(error, "preview"),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close file details"
        onClick={onClose}
      />

      <aside className="relative h-full w-full max-w-[560px] overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--obsidian-950)] p-5 shadow-2xl md:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--acid)]">
                file receipt
              </p>
              {verified && (
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--acid)]">
                  <ShieldCheck size={11} />
                  Verified
                </span>
              )}
            </div>
            <h3 className="mt-2 break-words font-display text-2xl font-semibold leading-[1.05] tracking-[-0.035em] text-frost md:text-3xl">
              {fileName}
            </h3>
            <p className="mt-2 break-all font-mono text-xs leading-5 text-frost-muted">{blobName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="themed-secondary inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-acid/30"
            aria-label="Close file details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="Mode" value={blobName.includes("/public/") ? "Public" : "Encrypted"} icon={<ShieldCheck size={15} />} />
          <MetricCard label="Stored" value={size ? formatBytes(size) : "unknown"} icon={<FileText size={15} />} />
          <MetricCard label="Folder" value={folder === "/" ? "root" : folder} icon={<FolderOpen size={15} />} />
          <MetricCard label="Integrity" value={verified ? "Verified" : "Unchecked"} icon={<ShieldCheck size={15} />} />
        </div>

        <FilePreviewPanel
          fileName={fileName}
          encrypted={blobName.includes("/encrypted/")}
          state={previewState}
          onLoadPreview={loadPreview}
        />

        <section className="premium-surface mt-5 rounded-2xl p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
            <p className="font-display text-base font-semibold text-frost">Receipt metadata</p>
              <p className="mt-1 text-sm text-frost-muted">
                Shelby object metadata paired with the local BlobSafe receipt.
              </p>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
            >
              <Copy size={13} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="divide-y divide-[var(--surface-border)] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
            <DetailRow label="Owner" value={accountAddress} wrap="hash" />
            <DetailRow label="Blob path" value={blobName} wrap="hash" />
            <DetailRow label="Encryption" value={encryption} />
            <DetailRow label="Key model" value={keyModel} />
            <DetailRow label="Receipt storage" value={receiptStorage} />
            <DetailRow label="Access control" value={formatAccessControlStatus(receipt)} />
            <DetailRow label="Integrity check" value={integrityStatus} />
            <DetailRow label="Original SHA-256" value={originalHashValue} wrap={receipt?.sha256 ? "hash" : "word"} />
            <DetailRow label="Original size" value={receipt ? formatBytes(receipt.originalSize) : "unknown"} />
            <DetailRow label="Stored size" value={formatBytes(receipt?.storedSize ?? size ?? 0)} />
            <DetailRow label="Uploaded" value={receipt?.uploadedAt ? new Date(receipt.uploadedAt).toLocaleString() : creationMicros ? new Date(creationMicros / 1000).toLocaleString() : "unknown"} />
            <DetailRow label="Expires" value={expirationMicros ? formatDate(expirationMicros) : "unknown"} />
            <DetailRow label="Merkle root" value={merkleRoot ?? "unknown"} wrap="hash" />
          </div>
        </section>

        <ShareAccessPanel
          receipt={receipt}
          shareState={activeShareState}
          onCreateShareGrant={onCreateShareGrant}
          onCreateTeamShareGrant={onCreateTeamShareGrant}
          onRevokeShareGrant={onRevokeShareGrant}
          onClearShareGrant={onClearShareGrant}
        />

        <AccessListPanel
          blobName={blobName}
          refreshKey={accessListVersion}
          onRevokeAccess={onRevokeShareGrant}
          onRenewAccess={onRenewShareGrant}
        />

        <AuditTimeline
          blobName={blobName}
          ownerAccount={accountAddress}
          receipt={receipt}
          activityState={activityState}
          auditEvents={auditEvents}
          onRetry={onRetryActivity}
        />

        <section className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-danger">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-base font-semibold">Delete file metadata</p>
              <p className="mt-1 text-sm leading-6 text-danger/80">
                Submit a wallet-signed Shelby transaction to remove this blob from the connected account.
              </p>
            </div>
            {!pendingDelete && (
              <button
                type="button"
                onClick={onRequestDelete}
                disabled={isDeleting}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>

          {pendingDelete && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onCancelDelete}
                className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting && <Loader2 size={13} className="animate-spin" />}
                Delete file
              </button>
            </div>
          )}

          {deleteError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <p className="text-xs leading-5">{deleteError}</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function FilePreviewPanel({
  fileName,
  encrypted,
  state,
  onLoadPreview,
}: {
  fileName: string;
  encrypted: boolean;
  state: {
    status: "idle" | "loading" | "ready" | "error";
    data?: FilePreviewData;
    message?: string;
  };
  onLoadPreview: () => void;
}) {
  return (
    <section className="file-preview-panel premium-surface mt-5 overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-[var(--surface-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-semibold text-frost">File preview</p>
          <p className="mt-1 text-sm leading-6 text-frost-muted">
            {encrypted
              ? "Preview decrypts locally after wallet approval."
              : "Preview reads the stored Shelby object without leaving this page."}
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadPreview}
          disabled={state.status === "loading"}
          className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state.status === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          {state.status === "ready" ? "Reload preview" : "Preview"}
        </button>
      </div>

      <div className="preview-stage">
        {state.status === "idle" && (
          <div className="preview-empty">
            <Eye size={20} />
            <p>Load preview when you need to inspect this file.</p>
          </div>
        )}

        {state.status === "loading" && (
          <div className="preview-empty">
            <Loader2 size={20} className="animate-spin text-acid" />
            <p>Preparing local preview...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="m-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-3 text-danger">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-5">{state.message}</p>
          </div>
        )}

        {state.status === "ready" && state.data?.type === "image" && (
          <div className="preview-media">
            <img src={state.data.url} alt={state.data.fileName || fileName} />
          </div>
        )}

        {state.status === "ready" && state.data?.type === "pdf" && (
          <iframe
            className="preview-pdf"
            src={state.data.url}
            title={`${state.data.fileName || fileName} preview`}
          />
        )}

        {state.status === "ready" && state.data?.type === "text" && (
          <pre className="preview-text">{state.data.text}</pre>
        )}

        {state.status === "ready" && state.data?.type === "unsupported" && (
          <div className="preview-empty">
            <FileText size={20} />
            <p>{state.data.message}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AuditTimeline({
  blobName,
  ownerAccount,
  receipt,
  activityState,
  auditEvents,
  onRetry,
}: {
  blobName: string;
  ownerAccount: string;
  receipt?: StoredReceipt;
  activityState: ActivityState;
  auditEvents: AuditEvent[];
  onRetry: () => void;
}) {
  const [page, setPage] = useState(1);
  const receiptEvent = receipt?.accessControl?.status === "registered" && receipt.accessControl.txHash
    ? [{
        id: `receipt-${receipt.accessControl.txHash}`,
        title: "File registered",
        copy: "Local receipt confirms this blob has an on-chain ownership record.",
        createdAt: receipt.accessControl.registeredAt ?? receipt.uploadedAt,
        txHash: receipt.accessControl.txHash,
        source: "aptos",
      }]
    : [];
  const localEvents = auditEvents.map((event) => ({
    id: event.id,
    title: getAuditEventTitle(event.type),
    copy: getAuditEventCopy(event),
    createdAt: event.createdAt,
    txHash: event.txHash,
    source: event.source,
  }));
  const chainEvents = activityState.items.map((activity) => ({
    id: `chain-${activity.transactionHash}-${activity.type}`,
    title: activity.type.replace(/_/g, " "),
    copy: "Shelby indexer activity for this blob.",
    createdAt: activity.timestamp,
    txHash: activity.transactionHash,
    source: "shelby",
  }));
  const seen = new Set<string>();
  const timeline = [...localEvents, ...receiptEvent, ...chainEvents]
    .filter((event) => {
      const key = event.txHash || event.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestTx = timeline.find((event) => event.txHash)?.txHash;
  const totalPages = Math.max(1, Math.ceil(timeline.length / AUDIT_TIMELINE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEvents = timeline.slice(
    (currentPage - 1) * AUDIT_TIMELINE_PAGE_SIZE,
    currentPage * AUDIT_TIMELINE_PAGE_SIZE
  );
  const firstEvent = timeline.length === 0 ? 0 : (currentPage - 1) * AUDIT_TIMELINE_PAGE_SIZE + 1;
  const lastEvent = Math.min(currentPage * AUDIT_TIMELINE_PAGE_SIZE, timeline.length);

  useEffect(() => {
    setPage(1);
  }, [blobName, timeline.length]);

  return (
    <section className="premium-surface mt-5 rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold text-frost">Audit trail</p>
          <p className="mt-1 text-sm text-frost-muted">
            Ownership, access, and storage events tied to this file.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {timeline.length > 0 && (
            <span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
              {firstEvent}-{lastEvent} of {timeline.length}
            </span>
          )}
          <button
            type="button"
            onClick={onRetry}
            disabled={activityState.status === "loading"}
            className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={13} className={activityState.status === "loading" ? "animate-spin" : ""} />
            Refresh
          </button>
          <a
            href={getShelbyBlobExplorerUrl(receipt?.account ?? ownerAccount, blobName)}
            target="_blank"
            rel="noopener noreferrer"
            className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30"
            title="Open blob in Shelby Explorer"
          >
            <ExternalLink size={13} />
            Blob
          </a>
        </div>
      </div>

      {activityState.status === "loading" && timeline.length === 0 && <AuditTimelineSkeleton />}

      {activityState.status === "error" && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="text-sm leading-6">{activityState.message}</p>
          </div>
          <button type="button" onClick={onRetry} className="font-mono text-[11px] uppercase tracking-[0.08em]">
            Retry
          </button>
        </div>
      )}

      {timeline.length === 0 && activityState.status !== "loading" ? (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-4 text-sm text-frost-muted">
          No audit events are indexed for this file yet. Refresh after a new transaction settles.
        </div>
      ) : (
        <div className="space-y-2">
          {pageEvents.map((event) => (
            <div key={event.id} className="grid gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--acid)]">{event.title}</p>
                  <span className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-frost-muted">
                    {event.source}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-frost-dim">{event.copy}</p>
                {event.txHash && (
                  <a
                    href={getExplorerUrl("tx", event.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block truncate font-mono text-xs text-frost-muted hover:text-frost"
                  >
                    {event.txHash}
                  </a>
                )}
              </div>
              <span className="font-mono text-[11px] text-frost-muted">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-frost-muted">
                Page {currentPage} of {totalPages}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage === totalPages}
                  className="themed-secondary inline-flex min-h-10 items-center justify-center rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {latestTx && (
        <a
          href={getExplorerUrl("tx", latestTx)}
          target="_blank"
          rel="noopener noreferrer"
          className="premium-button mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40"
        >
          <ExternalLink size={14} />
          Open latest transaction
        </a>
      )}
    </section>
  );
}

function AuditTimelineSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-4">
          <div className="h-3 w-36 animate-pulse rounded bg-[var(--surface-border)]" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-[var(--surface-border)]" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-[var(--surface-border)]" />
        </div>
      ))}
    </div>
  );
}

function FileListSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 animate-pulse rounded bg-[var(--surface-border)]" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-[var(--surface-border)]" />
      </div>
      <div className="premium-surface rounded-xl p-4">
        <div className="h-11 w-full animate-pulse rounded-xl bg-[var(--surface-border)]" />
      </div>
      <div className="premium-surface overflow-hidden rounded-xl">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-[var(--surface-border)] px-4 py-4 last:border-b-0">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-[var(--surface-border)]" />
            <div>
              <div className="h-4 w-56 max-w-full animate-pulse rounded bg-[var(--surface-border)]" />
              <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--surface-border)]" />
            </div>
            <div className="hidden h-9 w-28 animate-pulse rounded-lg bg-[var(--surface-border)] sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function getEncryptionLabel(blobName: string, receipt?: StoredReceipt) {
  if (receipt?.encryption === "plaintext" || blobName.includes("/public/")) {
    return "Plaintext";
  }

  if (receipt?.encryptionModel === "per-file-key-v1") {
    return "Per-file AES-256-GCM";
  }

  if (receipt?.encryptionModel === "wallet-master-v2") {
    return "Wallet-signature AES-256-GCM";
  }

  if (receipt?.encryptionModel === "legacy-address-v1") {
    return "Legacy address-derived AES-256-GCM";
  }

  return receipt?.encryption ?? "Wallet-signature AES-256-GCM";
}

function ShareAccessPanel({
  receipt,
  shareState,
  onCreateShareGrant,
  onCreateTeamShareGrant,
  onRevokeShareGrant,
  onClearShareGrant,
}: {
  receipt?: StoredReceipt;
  shareState: ShareState;
  onCreateShareGrant: (recipient: string, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
  onCreateTeamShareGrant: (team: TeamProfile, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
  onRevokeShareGrant: (recipient: string) => Promise<void>;
  onClearShareGrant: () => void;
}) {
  const [chainTeams, setChainTeams] = useState<TeamProfile[]>([]);
  const localTeams = receipt?.account ? readTeams(receipt.account) : [];
  const teams = mergeTeamProfiles(chainTeams, localTeams);
  const [shareMode, setShareMode] = useState<"single" | "team">("single");
  const [recipient, setRecipient] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<"idle" | "creating" | "revoking" | "revoked" | "error">("idle");
  const [message, setMessage] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedGrant, setCopiedGrant] = useState(false);
  const [copiedTeamTarget, setCopiedTeamTarget] = useState("");
  const [expiryMode, setExpiryMode] = useState<GrantExpiryMode>("none");
  const [customExpiryValue, setCustomExpiryValue] = useState("2");
  const [customExpiryUnit, setCustomExpiryUnit] = useState<GrantExpiryUnit>("hours");
  const shareable = isShareableReceipt(receipt);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const expiryPreset = getGrantExpiryPreset(expiryMode, customExpiryValue, customExpiryUnit);
  const customExpiryInvalid = expiryMode === "custom" && !expiryPreset;
  const expiresAtSecs = customExpiryInvalid
    ? undefined
    : getGrantExpirySecs(expiryPreset);
  const recipientIsOwner = shareMode === "single" && isSameAptosAddress(recipient, receipt?.account);
  const selectedTeamOwnerMember = selectedTeam?.members.find((member) =>
    isSameAptosAddress(member.address, receipt?.account)
  );
  const savedPackages = receipt
    ? readSentSharePackagesForBlob(receipt.account, receipt.blobName)
    : [];
  const latestSinglePackage = getLatestSentPackage(savedPackages, "single");
  const latestTeamPackage = getLatestSentPackage(savedPackages, "team");
  const displayedSinglePackage = shareState?.mode === "single" && shareState.grant && shareState.accessCode
    ? {
        source: "new" as const,
        createdAt: shareState.grant.createdAt,
        recipient: shareState.grant.recipient ?? recipient,
        grant: shareState.grant,
        accessCode: shareState.accessCode,
      }
    : latestSinglePackage
      ? {
          source: "saved" as const,
          createdAt: latestSinglePackage.createdAt,
          recipient: latestSinglePackage.recipient,
          grant: latestSinglePackage.grant,
          accessCode: latestSinglePackage.accessCode,
        }
      : null;
  const displayedTeamPackage = shareState?.mode === "team" && shareState.grants
    ? {
        source: "new" as const,
        teamName: shareState.teamName ?? "Recipient group",
        grants: shareState.grants,
      }
    : latestTeamPackage
      ? {
          source: "saved" as const,
          teamName: latestTeamPackage.teamName,
          grants: latestTeamPackage.grants,
        }
      : null;
  const singleGrantJson = displayedSinglePackage
    ? JSON.stringify(displayedSinglePackage.grant, null, 2)
    : "";

  useEffect(() => {
    let cancelled = false;

    const loadTeams = async () => {
      if (!receipt?.account || !IS_ACCESS_CONTROL_CONFIGURED) {
        setChainTeams([]);
        return;
      }

      try {
        const onChainTeams = await getOnChainTeamsForOwner(receipt.account);
        if (!cancelled) {
          setChainTeams(onChainTeams.map(onChainTeamToTeamProfile));
        }
      } catch {
        if (!cancelled) setChainTeams([]);
      }
    };

    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, [receipt?.account]);

  const handleCreate = async () => {
    if (!shareable) return;
    setStatus("creating");
    setMessage("");

    try {
      if (shareMode === "team") {
        if (!selectedTeam) throw new Error("Choose a recipient group before creating grants.");
        if (selectedTeamOwnerMember) {
          throw new Error(`Remove ${formatShortAddress(selectedTeamOwnerMember.address)} from this group before sharing. BlobSafe does not create self-grants for the owner wallet.`);
        }
        await onCreateTeamShareGrant(selectedTeam, expiresAtSecs, expiryPreset);
      } else {
        if (recipientIsOwner) {
          throw new Error("Choose a different recipient wallet. The owner already controls this file, so BlobSafe does not create self-grants.");
        }
        await onCreateShareGrant(recipient, expiresAtSecs, expiryPreset);
      }
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Access grant could not be created.");
    }
  };

  const handleRevoke = async () => {
    if (!shareable) return;
    setStatus("revoking");
    setMessage("");

    try {
      await onRevokeShareGrant(recipient);
      setStatus("revoked");
      setMessage("Access revoked on-chain.");
      onClearShareGrant();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Access grant could not be revoked.");
    }
  };

  return (
    <section className="premium-surface mt-5 rounded-2xl p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-base font-semibold text-frost">Grant access</p>
          <p className="mt-1 max-w-[58ch] text-sm leading-6 text-frost-muted">
            Create a wallet-signed grant for this file. Send the grant package and access code through separate channels.
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--acid)]">
          <KeyRound size={15} />
        </div>
      </div>

      {!shareable ? (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-4 text-sm leading-6 text-frost-muted">
          Sharing requires a per-file key receipt. Re-seal older files that do not have one.
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1">
            {(["single", "team"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setShareMode(mode)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                  shareMode === mode
                    ? "bg-[var(--acid-glow)] text-frost"
                    : "text-frost-muted hover:bg-[var(--soft-hover)] hover:text-frost"
                }`}
              >
                {mode === "team" ? <UsersRound size={13} /> : <KeyRound size={13} />}
                {mode === "team" ? "group" : "single"}
              </button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">
              {shareMode === "team" ? "recipient group" : "recipient wallet address"}
            </span>
            {shareMode === "team" ? (
              <select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
              >
                <option value="">{teams.length ? "Choose recipient group" : "No groups saved"}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} - {team.members.length} recipients
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x..."
                className="min-h-11 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
              />
            )}
          </label>

          {shareMode === "team" && selectedTeam && (
            <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
              selectedTeamOwnerMember
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-[var(--surface-border)] bg-[var(--surface-muted)] text-frost-dim"
            }`}>
              {selectedTeamOwnerMember
                ? `This group includes the owner wallet ${formatShortAddress(selectedTeamOwnerMember.address)}. Remove it before creating grants.`
                : `${selectedTeam.members.length} recipients will receive separate on-chain grants.`}
            </div>
          )}

          {recipientIsOwner && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p className="text-sm leading-6">
                This is the owner wallet. Use a different recipient address to create a share grant.
              </p>
            </div>
          )}

          <div className="grid gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">grant duration</p>
              <p className="text-xs text-frost-muted">
                {customExpiryInvalid
                  ? "choose 1 minute to 365 days"
                  : expiresAtSecs
                    ? `expires ${new Date(expiresAtSecs * 1000).toLocaleString()}`
                    : "no automatic expiry"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
              {([
                ["none", "No expiry"],
                ["3m", "3 min"],
                ["15m", "15 min"],
                ["1h", "1 hour"],
                ["6h", "6 hours"],
                ["24h", "24h"],
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["custom", "Custom"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setExpiryMode(mode)}
                  className={`min-h-9 rounded-lg px-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30 ${
                    expiryMode === mode
                      ? "bg-[var(--acid-glow)] text-frost"
                      : "text-frost-muted hover:bg-[var(--soft-hover)] hover:text-frost"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {expiryMode === "custom" && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_180px]">
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">custom amount</span>
                  <input
                    value={customExpiryValue}
                    onChange={(event) => setCustomExpiryValue(event.target.value)}
                    inputMode="decimal"
                    className="min-h-10 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">unit</span>
                  <select
                    value={customExpiryUnit}
                    onChange={(event) => setCustomExpiryUnit(event.target.value as GrantExpiryUnit)}
                    className="min-h-10 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </label>
                {customExpiryInvalid && (
                  <p className="sm:col-span-2 text-xs leading-5 text-danger">
                    ShelbyNet wallet signing supports 3 or 15 minutes; 1, 2, 6, 12, or 24 hours; 7 or 30 days.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={handleCreate}
              disabled={status === "creating" || status === "revoking" || recipientIsOwner || Boolean(selectedTeamOwnerMember) || customExpiryInvalid}
              className="premium-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "creating" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {shareMode === "team" ? "Create group grants" : "Create access grant"}
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={status === "creating" || status === "revoking"}
              className="themed-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {status === "revoking" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Revoke
            </button>
          </div>

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p className="text-sm leading-6">{message}</p>
            </div>
          )}

          {status === "revoked" && (
            <div className="rounded-xl border border-[var(--surface-border-strong)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-frost">
              {message}
            </div>
          )}

          {displayedSinglePackage && (
            <div className="share-output rounded-2xl border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] p-4">
              <div className="mb-4 flex flex-col gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-base font-semibold text-frost">
                      {displayedSinglePackage.source === "new" ? "Grant package ready" : "Saved grant package"}
                    </p>
                    <span className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-frost-muted">
                      {displayedSinglePackage.source === "new" ? "new package" : "local package"}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[62ch] text-sm leading-6 text-frost-dim">
                    Send the grant JSON and access code through separate channels. The recipient imports the JSON in Shared, then uses the code to unlock the file.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(singleGrantJson);
                      setCopiedGrant(true);
                      window.setTimeout(() => setCopiedGrant(false), 1400);
                    }}
                    className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    <Copy size={13} />
                    {copiedGrant ? "Copied" : "Grant JSON"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(displayedSinglePackage.accessCode);
                      setCopiedCode(true);
                      window.setTimeout(() => setCopiedCode(false), 1400);
                    }}
                    className="premium-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-display text-sm font-semibold"
                  >
                    <Copy size={13} />
                    {copiedCode ? "Copied" : "Code"}
                  </button>
                  {displayedSinglePackage.source === "new" && (
                    <button
                      type="button"
                      onClick={onClearShareGrant}
                      className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="share-output-card">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--acid)]">Access code</p>
                      <p className="mt-1 text-sm leading-6 text-frost-muted">
                        Send this separately from the JSON.
                      </p>
                    </div>
                    <p className="break-all rounded-xl border border-[var(--surface-border-strong)] bg-[var(--surface-raised)] px-4 py-3 text-center font-mono text-sm font-semibold leading-6 text-frost sm:min-w-[210px]">
                    {displayedSinglePackage.accessCode}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">Recipient</p>
                      <p className="mt-1 font-mono text-xs text-frost">{formatShortAddress(displayedSinglePackage.recipient)}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">Grant transaction</p>
                      <p className="mt-1 truncate font-mono text-xs text-frost-muted">
                        {displayedSinglePackage.grant.chain?.grantTxHash ?? "pending local package"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="share-output-card">
                  <div className="mb-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--acid)]">Grant JSON</p>
                    <p className="mt-1 text-sm text-frost-muted">Paste this into the recipient's Shared page.</p>
                  </div>
                  <textarea
                    readOnly
                    value={singleGrantJson}
                    className="share-json-preview min-h-[150px] w-full resize-none rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-3 font-mono text-[11px] leading-5 text-frost-dim outline-none"
                    aria-label="Generated share grant JSON"
                  />
                </div>
              </div>
            </div>
          )}

          {displayedTeamPackage && (
            <div className="share-output rounded-2xl border border-[var(--surface-border-strong)] bg-[var(--acid-glow)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-frost">
                    {displayedTeamPackage.source === "new" ? "Group delivery ready" : "Saved group delivery"}
                  </p>
                  <p className="mt-1 max-w-[62ch] text-sm leading-6 text-frost-dim">
                    Send each recipient only their own grant JSON and access code. The full package is available for backup, not normal delivery.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(JSON.stringify({
                        version: "blobsafe-team-share-v1",
                        team: displayedTeamPackage.teamName,
                        blobName: receipt?.blobName,
                        grants: displayedTeamPackage.grants,
                      }, null, 2));
                      setCopiedGrant(true);
                      window.setTimeout(() => setCopiedGrant(false), 1400);
                    }}
                    className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                  >
                    <Copy size={13} />
                    {copiedGrant ? "Copied" : "Full backup"}
                  </button>
                  {displayedTeamPackage.source === "new" && (
                    <button
                      type="button"
                      onClick={onClearShareGrant}
                      className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {displayedTeamPackage.grants.map((item, index) => {
                  const grantJson = JSON.stringify(item.grant, null, 2);
                  const grantTarget = `grant:${item.recipient}`;
                  const codeTarget = `code:${item.recipient}`;
                  return (
                    <div
                      key={item.recipient}
                      className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-frost-muted">
                              recipient {index + 1}
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--acid)]">
                              {formatShortAddress(item.recipient)}
                            </span>
                          </div>
                          <p className="mt-2 break-all font-mono text-xs leading-5 text-frost">
                            {item.recipient}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(grantJson);
                              setCopiedTeamTarget(grantTarget);
                              window.setTimeout(() => setCopiedTeamTarget(""), 1400);
                            }}
                            className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em]"
                          >
                            <Copy size={13} />
                            {copiedTeamTarget === grantTarget ? "Copied" : "JSON"}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(item.accessCode);
                              setCopiedTeamTarget(codeTarget);
                              window.setTimeout(() => setCopiedTeamTarget(""), 1400);
                            }}
                            className="premium-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-display text-sm font-semibold"
                          >
                            <Copy size={13} />
                            {copiedTeamTarget === codeTarget ? "Copied" : "Code"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.45fr)]">
                        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">grant json</p>
                          <p className="mt-1 truncate font-mono text-[11px] leading-5 text-frost-dim">
                            {item.grant.blobName}
                          </p>
                        </div>
                        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2">
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">access code</p>
                          <p className="mt-1 break-all font-mono text-xs font-semibold leading-5 text-frost">
                            {item.accessCode}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function getLatestSentPackage<TMode extends SentSharePackage["mode"]>(
  packages: SentSharePackage[],
  mode: TMode
): Extract<SentSharePackage, { mode: TMode }> | undefined {
  return packages
    .filter((item): item is Extract<SentSharePackage, { mode: TMode }> => item.mode === mode)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function isSameAptosAddress(a?: string, b?: string) {
  const left = canonicalAptosAddress(a);
  const right = canonicalAptosAddress(b);
  return Boolean(left && right && left === right);
}

function canonicalAptosAddress(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";
  const hex = normalized.replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(hex)) return normalized;
  return `0x${hex.padStart(64, "0")}`;
}

type AccessListState = {
  status: "idle" | "loading" | "ready" | "error";
  recipients: Array<{
    address: string;
    grant: OnChainGrantView;
  }>;
  message?: string;
};

type RenewGrantMode = "none" | GrantExpiryPreset;

const RENEW_GRANT_OPTIONS: Array<{ value: RenewGrantMode; label: string }> = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "none", label: "No expiry" },
];

function AccessListPanel({
  blobName,
  refreshKey,
  onRevokeAccess,
  onRenewAccess,
}: {
  blobName: string;
  refreshKey: number;
  onRevokeAccess: (recipient: string) => Promise<void>;
  onRenewAccess: (recipient: string, encryptedKey: string, expiresAtSecs?: number, expiryPreset?: GrantExpiryPreset) => Promise<void>;
}) {
  const [state, setState] = useState<AccessListState>({
    status: "idle",
    recipients: [],
  });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [renewModes, setRenewModes] = useState<Record<string, RenewGrantMode>>({});

  const loadRecipients = async () => {
    if (!IS_ACCESS_CONTROL_CONFIGURED) {
      setState({ status: "ready", recipients: [] });
      return;
    }

    setState((current) => ({ ...current, status: "loading" }));

    try {
      const recipients = await getOnChainRecipients(blobName);
      const grants = await Promise.all(
        recipients.map(async (recipient) => ({
          address: recipient,
          grant: await getOnChainGrant(blobName, recipient),
        }))
      );
      setState({ status: "ready", recipients: grants });
    } catch (error) {
      setState({
        status: "error",
        recipients: [],
        message: error instanceof Error ? error.message : "Active grants could not be loaded.",
      });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!IS_ACCESS_CONTROL_CONFIGURED) {
        setState({ status: "ready", recipients: [] });
        return;
      }

      setState((current) => ({ ...current, status: "loading" }));

      try {
        const recipients = await getOnChainRecipients(blobName);
        const grants = await Promise.all(
          recipients.map(async (recipient) => ({
            address: recipient,
            grant: await getOnChainGrant(blobName, recipient),
          }))
        );
        if (!cancelled) setState({ status: "ready", recipients: grants });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            recipients: [],
            message: error instanceof Error ? error.message : "Active grants could not be loaded.",
          });
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [blobName, refreshKey]);

  const revoke = async (recipient: string) => {
    setRevoking(recipient);
    try {
      await onRevokeAccess(recipient);
      await loadRecipients();
    } finally {
      setRevoking(null);
    }
  };

  const renew = async (recipient: string, encryptedKey: string) => {
    const mode = renewModes[recipient] ?? "15m";
    const expiryPreset = mode === "none" ? undefined : mode;
    const expiresAtSecs = getGrantExpirySecs(expiryPreset);
    setRenewing(recipient);
    try {
      await onRenewAccess(recipient, encryptedKey, expiresAtSecs, expiryPreset);
      await loadRecipients();
    } finally {
      setRenewing(null);
    }
  };

  return (
    <section className="premium-surface mt-5 rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold text-frost">Active grants</p>
          <p className="mt-1 text-sm leading-6 text-frost-muted">
            Wallets with indexed access to this blob.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRecipients}
          disabled={state.status === "loading"}
          className="themed-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw size={13} className={state.status === "loading" ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {state.status === "error" && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p className="text-sm leading-6">{state.message}</p>
        </div>
      )}

      {state.status === "loading" && state.recipients.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-4 text-frost-muted">
          <Loader2 size={15} className="animate-spin" />
          <span className="font-mono text-sm">Loading grants...</span>
        </div>
      )}

      {state.status === "ready" && state.recipients.length === 0 && (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-4 text-sm leading-6 text-frost-muted">
          No active grants are indexed for this blob.
        </div>
      )}

      {state.recipients.length > 0 && (
        <div className="divide-y divide-[var(--surface-border)] rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]">
          {state.recipients.map((item) => {
            const active = item.grant.exists && item.grant.active && !item.grant.expired;
            const canRevoke = item.grant.exists && item.grant.active;
            const canRenew = item.grant.exists && Boolean(item.grant.encryptedKey);
            const isRevoking = revoking === item.address;
            const isRenewing = renewing === item.address;
            const grantStatus = item.grant.expired ? "expired" : active ? "active" : "revoked";
            const renewMode = renewModes[item.address] ?? "15m";
            const renewLabel = active ? "Extend" : "Renew";
            return (
              <div key={item.address} className="grid gap-4 px-4 py-4">
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">
                      Recipient wallet
                    </p>
                    <span className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
                      active
                        ? "border-[var(--surface-border-strong)] bg-[var(--acid-glow)] text-[var(--acid)]"
                        : "border-danger/30 bg-danger/10 text-danger"
                    }`}>
                      {grantStatus}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2">
                    <p className="break-all font-mono text-xs leading-5 text-frost">{item.address}</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">Granted</p>
                      <p className="mt-1 font-mono text-xs leading-5 text-frost">
                        {item.grant.grantedAtSecs ? new Date(item.grant.grantedAtSecs * 1000).toLocaleString() : "unknown"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-frost-muted">Expires</p>
                      <p className="mt-1 font-mono text-xs leading-5 text-frost">
                        {item.grant.expiresAtSecs
                          ? new Date(item.grant.expiresAtSecs * 1000).toLocaleString()
                          : "no expiry"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <select
                    value={renewMode}
                    onChange={(event) => {
                      const value = event.target.value as RenewGrantMode;
                      setRenewModes((current) => ({ ...current, [item.address]: value }));
                    }}
                    disabled={!canRenew || isRenewing || isRevoking}
                    className="min-h-10 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-frost outline-none transition-colors focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {RENEW_GRANT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => renew(item.address, item.grant.encryptedKey)}
                    disabled={!canRenew || isRenewing || isRevoking}
                    className="premium-button inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRenewing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {renewLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(item.address)}
                    disabled={!canRevoke || isRevoking || isRenewing}
                    className="themed-secondary inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus:outline-none focus:ring-2 focus:ring-acid/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRevoking ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getKeyModelLabel(blobName: string, receipt?: StoredReceipt) {
  if (receipt?.encryption === "plaintext" || blobName.includes("/public/")) {
    return "Plaintext file";
  }

  if (receipt?.key?.version === "file-key-v1") {
    return "Per-file key, wrapped by wallet signature";
  }

  if (receipt?.encryptionModel === "per-file-key-v1") {
    return "Per-file key receipt unavailable locally";
  }

  if (receipt?.encryptionModel === "wallet-master-v2") {
    return "Wallet signature key";
  }

  if (receipt?.encryptionModel === "legacy-address-v1") {
    return "Legacy wallet key";
  }

  return "Wallet key fallback";
}

function formatAccessControlStatus(receipt?: StoredReceipt) {
  if (!receipt?.accessControl) {
    return IS_ACCESS_CONTROL_CONFIGURED ? "Not registered in local receipt" : "Access registry needs setup";
  }

  if (receipt.accessControl.status === "registered") {
    return receipt.accessControl.txHash
      ? `Registered: ${receipt.accessControl.txHash}`
      : "Registered";
  }

  if (receipt.accessControl.status === "failed") {
    return `Registration failed: ${receipt.accessControl.error ?? "unknown error"}`;
  }

  return "Access registry needs setup";
}

function onChainTeamToTeamProfile(team: OnChainTeamView): TeamProfile {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.createdAtSecs ? new Date(team.createdAtSecs * 1000).toISOString() : new Date().toISOString(),
    updatedAt: team.updatedAtSecs ? new Date(team.updatedAtSecs * 1000).toISOString() : new Date().toISOString(),
    members: team.members.map((member) => ({
      id: member.address,
      address: member.address.toLowerCase(),
      label: member.label || undefined,
      role: member.role === "operator" ? "operator" : "viewer",
    })),
    chain: { status: "registered" },
  };
}

function mergeTeamProfiles(primary: TeamProfile[], fallback: TeamProfile[]) {
  const seen = new Set(primary.map((team) => team.id));
  return [...primary, ...fallback.filter((team) => !seen.has(team.id))];
}

function getGrantExpiryPreset(
  mode: GrantExpiryMode,
  customValue: string,
  customUnit: GrantExpiryUnit
): GrantExpiryPreset | undefined {
  if (mode === "none") return undefined;
  if (mode !== "custom") return mode;

  const amount = Number(customValue);
  if (!Number.isFinite(amount)) return undefined;
  if (customUnit === "minutes") {
    if (amount === 3) return "3m";
    if (amount === 15) return "15m";
  }
  if (customUnit === "hours") {
    if (amount === 1) return "1h";
    if (amount === 2) return "2h";
    if (amount === 6) return "6h";
    if (amount === 12) return "12h";
    if (amount === 24) return "24h";
  }
  if (customUnit === "days") {
    if (amount === 7) return "7d";
    if (amount === 30) return "30d";
  }
  return undefined;
}

function getGrantExpirySecs(preset?: GrantExpiryPreset) {
  if (!preset) return 0;
  const secondsByPreset: Record<GrantExpiryPreset, number> = {
    "3m": 3 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
    "2h": 2 * 60 * 60,
    "6h": 6 * 60 * 60,
    "12h": 12 * 60 * 60,
    "24h": 24 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    "30d": 30 * 24 * 60 * 60,
  };
  return Math.floor(Date.now() / 1000 + secondsByPreset[preset]);
}

function buildAvailableFolders(
  folders: Array<{ path: string; name: string; fileCount?: number; totalSize?: number; createdAt?: string }>,
  blobNames: string[],
  getFolderForBlob: (blobName: string, fallbackFolder: string) => string
) {
  const merged = new Map(folders.map((folder) => [folder.path, folder]));

  for (const blobName of blobNames) {
    const path = getFolderForBlob(blobName, getBlobFolderPath(blobName));
    if (!merged.has(path)) {
      merged.set(path, {
        path,
        name: path === "/" ? "vault" : path.split("/").filter(Boolean).pop() ?? path,
        fileCount: 0,
        totalSize: 0,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.name.localeCompare(b.name);
  });
}

function markBlobVerified(
  blobName: string,
  setVerifiedBlobNames: Dispatch<SetStateAction<Set<string>>>
) {
  setVerifiedBlobNames((current) => {
    if (current.has(blobName)) return current;
    const next = new Set(current);
    next.add(blobName);
    return next;
  });
}

function stripUniqueBlobSuffix(fileName: string) {
  return fileName.replace(/-{1,2}[a-z0-9]{8}(\.[^./]+)?$/i, "$1");
}

function formatShortAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="premium-surface rounded-xl p-3">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--acid)]">
        {icon}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-frost">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  wrap = "word",
}: {
  label: string;
  value: string;
  wrap?: "word" | "hash";
}) {
  return (
    <div className="grid gap-2 px-4 py-3 md:grid-cols-[136px_minmax(0,1fr)] md:gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-frost-muted">{label}</p>
      <p className={`font-mono text-xs leading-6 text-frost ${wrap === "hash" ? "break-all" : "break-words"}`}>
        {value}
      </p>
    </div>
  );
}

function buildDetailReceipt(
  blob: unknown,
  accountAddress: string,
  receipt: StoredReceipt | undefined,
  activities: BlobActivityView[]
) {
  const blobName = getBlobStoredName(blob);
  return {
    fileName: formatBlobName(blobName),
    blobName,
    fullBlobName: getBlobFullName(blob, accountAddress),
    owner: accountAddress,
    folder: getBlobFolderPath(blobName),
    shelby: {
      size: getBlobSize(blob),
      expirationMicros: getBlobExpirationMicros(blob),
      creationMicros: getBlobCreationMicros(blob),
      merkleRoot: getBlobMerkleRootHex(blob),
    },
    blobsafe: receipt ?? null,
    activities,
  };
}

function compareBlobs(a: unknown, b: unknown, sort: FileSort) {
  const aName = getBlobStoredName(a);
  const bName = getBlobStoredName(b);

  if (sort === "name") {
    return formatBlobName(aName).localeCompare(formatBlobName(bName));
  }

  if (sort === "size") {
    return (getBlobSize(b) ?? 0) - (getBlobSize(a) ?? 0);
  }

  if (sort === "expiry") {
    return (getBlobExpirationMicros(a) ?? Number.MAX_SAFE_INTEGER) -
      (getBlobExpirationMicros(b) ?? Number.MAX_SAFE_INTEGER);
  }

  return (getBlobCreationMicros(b) ?? 0) - (getBlobCreationMicros(a) ?? 0);
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

function createPreviewData(fileName: string, bytes: Uint8Array<ArrayBuffer>): FilePreviewData {
  const extension = getFileExtension(fileName);
  const mimeType = getPreviewMimeType(extension);
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);

  if (mimeType?.startsWith("image/")) {
    return {
      type: "image",
      fileName,
      url: URL.createObjectURL(new Blob([payload.buffer as ArrayBuffer], { type: mimeType })),
    };
  }

  if (mimeType === "application/pdf") {
    return {
      type: "pdf",
      fileName,
      url: URL.createObjectURL(new Blob([payload.buffer as ArrayBuffer], { type: mimeType })),
    };
  }

  if (isTextPreviewExtension(extension)) {
    if (bytes.byteLength > 1_000_000) {
      return {
        type: "unsupported",
        fileName,
        message: "Text preview is limited to files under 1 MB. Download the file to inspect the full content.",
      };
    }

    return {
      type: "text",
      fileName,
      text: new TextDecoder().decode(bytes),
    };
  }

  return {
    type: "unsupported",
    fileName,
    message: "Preview is available for images, PDFs, and common text files. Use Download for this file type.",
  };
}

function getPreviewMimeType(extension: string) {
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };

  return mimeTypes[extension];
}

function isTextPreviewExtension(extension: string) {
  return [
    "txt",
    "md",
    "json",
    "csv",
    "tsv",
    "log",
    "yaml",
    "yml",
    "toml",
    "xml",
    "html",
    "css",
    "js",
    "ts",
  ].includes(extension);
}

function getFileExtension(fileName: string) {
  const cleanName = fileName.split("?")[0]?.split("#")[0] ?? fileName;
  const index = cleanName.lastIndexOf(".");
  if (index < 0 || index === cleanName.length - 1) return "";
  return cleanName.slice(index + 1).toLowerCase();
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
