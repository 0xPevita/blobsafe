import { AccountAddress, Hex, Network } from "@aptos-labs/ts-sdk";
import {
  createBlobKey,
  createDefaultErasureCodingProvider,
  expectedTotalChunksets,
  generateCommitments,
  ShelbyBlobClient,
  ShelbyClient,
  type BlobCommitments,
  type FullObjectMetadata,
  type StorageProviderAck,
} from "@shelby-protocol/sdk/browser";

import {
  SHELBY_EXPLORER_URL,
  SHELBY_FULLNODE_URL,
  SHELBY_INDEXER_URL,
  SHELBY_NETWORK_LABEL,
  SHELBY_NETWORK_NAME,
  SHELBY_NETWORK_OPTIONS,
  SHELBY_RPC_URL,
  getNetworkScopedStorageKey,
  setPreferredShelbyNetwork,
  type ShelbyNetworkName,
} from "@/lib/shelbyNetwork";

export {
  SHELBY_EXPLORER_URL,
  SHELBY_FULLNODE_URL,
  SHELBY_INDEXER_URL,
  SHELBY_NETWORK_LABEL,
  SHELBY_NETWORK_NAME,
  SHELBY_NETWORK_OPTIONS,
  SHELBY_RPC_URL,
  getNetworkScopedStorageKey,
  setPreferredShelbyNetwork,
  type ShelbyNetworkName,
};

export const SHELBY_NETWORK = SHELBY_NETWORK_NAME === "testnet" ? Network.TESTNET : Network.SHELBYNET;
export const APTOS_EXPLORER_URL = "https://explorer.aptoslabs.com";

const rawShelbyApiKey = SHELBY_NETWORK_NAME === "testnet"
  ? (import.meta.env.VITE_SHELBY_TESTNET_API_KEY || import.meta.env.VITE_SHELBYNET_API_KEY || import.meta.env.VITE_APTOS_API_KEY || "")
  : (import.meta.env.VITE_SHELBYNET_API_KEY || import.meta.env.VITE_APTOS_API_KEY || "");

const isUsableApiKey = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !trimmed.includes("your-") && !trimmed.includes("replace-") && trimmed !== "AG-";
};

const isUsableGatewayUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed) && !trimmed.includes("your-") && !trimmed.includes("replace-");
};

export const SHELBY_API_KEY = isUsableApiKey(rawShelbyApiKey) ? rawShelbyApiKey.trim() : undefined;
export const HAS_SHELBY_API_KEY = Boolean(SHELBY_API_KEY);
export const SHELBY_API_KEY_STATUS = HAS_SHELBY_API_KEY ? "configured" : "missing";

export const SHELBY_S3_GATEWAY_URL = typeof import.meta.env.VITE_SHELBY_S3_GATEWAY_URL === "string"
  ? import.meta.env.VITE_SHELBY_S3_GATEWAY_URL.trim()
  : "";
export const SHELBY_S3_GATEWAY_STATUS = isUsableGatewayUrl(SHELBY_S3_GATEWAY_URL) ? "configured" : "not configured";

const rawShelbyWriteLocation = SHELBY_NETWORK_NAME === "testnet"
  ? (import.meta.env.VITE_SHELBY_TESTNET_WRITE_LOCATION || import.meta.env.VITE_SHELBY_WRITE_LOCATION || "")
  : (import.meta.env.VITE_SHELBYNET_WRITE_LOCATION || import.meta.env.VITE_SHELBY_WRITE_LOCATION || "shelbynet-1");

export const SHELBY_WRITE_LOCATION = String(rawShelbyWriteLocation || "").trim();

export const shelbyClient = new ShelbyClient({
  network: SHELBY_NETWORK,
  apiKey: SHELBY_API_KEY,
  aptos: {
    network: SHELBY_NETWORK,
    fullnode: SHELBY_FULLNODE_URL,
    clientConfig: SHELBY_API_KEY ? { API_KEY: SHELBY_API_KEY } : undefined,
  },
  rpc: {
    baseUrl: SHELBY_RPC_URL,
    apiKey: SHELBY_API_KEY,
  },
  indexer: {
    baseUrl: SHELBY_INDEXER_URL,
    apiKey: SHELBY_API_KEY,
  },
  locationHint: SHELBY_WRITE_LOCATION || undefined,
});

const ONE_DAY_MICROS = 24 * 60 * 60 * 1_000_000;
const DEFAULT_EXPIRATION_DAYS = 30;
const MAX_UPLOAD_CONCURRENCY = 2;
const STORAGE_UPLOAD_TIMEOUT_MS = 90_000;

export const getDefaultExpiration = () => Date.now() * 1000 + DEFAULT_EXPIRATION_DAYS * ONE_DAY_MICROS;

export const normalizeAddress = (address: string) => AccountAddress.from(address, { maxMissingChars: 63 }).toStringLong();

export const getWalletAccountAddress = (account: { address?: unknown } | null | undefined) => {
  const value = account?.address;
  if (!value) return undefined;
  if (typeof value === "string") return normalizeAddress(value);
  if (typeof value === "object" && "toString" in value) return normalizeAddress(String(value));
  return undefined;
};

export const formatBytes = (bytes?: number | null) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

export const formatFileSize = formatBytes;

export const formatDate = (value?: number | string | Date | null) => {
  if (!value) return "unknown";
  const date = value instanceof Date ? value : new Date(typeof value === "number" && value > 10_000_000_000 ? value / 1000 : value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export const truncateAddress = (address?: string | null, chars = 6) => {
  if (!address) return "unknown";
  const normalized = String(address);
  if (normalized.length <= chars * 2 + 5) return normalized;
  return `${normalized.slice(0, chars + 2)}...${normalized.slice(-chars)}`;
};

export const shortenAddress = truncateAddress;

export const formatBlobName = (name?: string | null) => {
  if (!name) return "Unnamed file";
  const suffix = name.split("/").filter(Boolean).pop();
  return suffix || name;
};

export const getFileType = (blobName?: string | null) => {
  const ext = (blobName?.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["pdf"].includes(ext)) return "pdf";
  if (["csv", "json", "txt", "md", "log"].includes(ext)) return "doc";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return "file";
};

export const getFileIcon = (blobName?: string | null) => getFileType(blobName).toUpperCase().slice(0, 3);

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? value as Record<string, unknown> : {});

export const getBlobStoredName = (blob: unknown): string => {
  if (typeof blob === "string") return blob;
  const record = asRecord(blob);
  const suffix = record.blobNameSuffix ?? record.blob_name_suffix ?? record.blobName ?? record.name;
  if (typeof suffix === "string") return suffix.replace(/^@[^/]+\//, "");
  if (suffix && typeof suffix === "object" && "toString" in suffix) return String(suffix).replace(/^@[^/]+\//, "");
  return "";
};

export const getBlobFullName = (blob: unknown, owner?: string) => {
  const record = asRecord(blob);
  const name = record.name;
  if (typeof name === "string") return name;
  const suffix = getBlobStoredName(blob);
  if (!owner) return suffix;
  return createBlobKey({ account: AccountAddress.from(owner, { maxMissingChars: 63 }), blobName: suffix });
};

export const getBlobSize = (blob: unknown): number | undefined => {
  const record = asRecord(blob);
  const value = record.size ?? record.blobSize ?? record.blob_size;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const getBlobExpirationMicros = (blob: unknown): number | undefined => {
  const record = asRecord(blob);
  const value = record.expirationMicros ?? record.expiration_micros ?? record.expires_at;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const getBlobCreationMicros = (blob: unknown): number | undefined => {
  const record = asRecord(blob);
  const value = record.creationMicros ?? record.creation_micros ?? record.created_at;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const getBlobMerkleRootHex = (blob: unknown): string | undefined => {
  const record = asRecord(blob);
  const root = record.blobMerkleRoot ?? record.blob_merkle_root ?? record.merkleRoot;
  if (typeof root === "string") return root;
  if (root instanceof Uint8Array) return Hex.fromHexInput(root).toString();
  if (Array.isArray(root)) return Hex.fromHexInput(Uint8Array.from(root as number[])).toString();
  return undefined;
};

export const getBlobFolderPath = (blobName?: string | null) => {
  const clean = (blobName || "").replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
};

type BuildBlobNameInput = {
  address: string;
  fileName: string;
  folder?: string;
  encrypted?: boolean;
};

const buildBlobNameFromParts = (fileName: string, folder = "/", encrypted = true) => {
  const safeFolder = folder === "/" ? "" : folder.replace(/^\/+|\/+$/g, "");
  const namespace = encrypted ? "encrypted" : "public";
  return `blobsafe/${namespace}/${safeFolder ? `${safeFolder}/` : ""}${fileName}`;
};

export function buildBlobName(input: BuildBlobNameInput): string;
export function buildBlobName(owner: string, fileName: string, folder?: string, encrypted?: boolean): string;
export function buildBlobName(inputOrOwner: BuildBlobNameInput | string, fileName?: string, folder = "/", encrypted = true) {
  if (typeof inputOrOwner === "object") {
    return buildBlobNameFromParts(inputOrOwner.fileName, inputOrOwner.folder ?? "/", inputOrOwner.encrypted ?? true);
  }
  return buildBlobNameFromParts(fileName ?? "file", folder, encrypted);
}

export const getBlobName = buildBlobName;

export const getShelbyBlobUrl = (account: string, blobName: string) =>
  `${SHELBY_RPC_URL.replace(/\/+$/, "")}/v1/blobs/${normalizeAddress(account)}/${encodeURIComponent(blobName).replace(/%2F/g, "/")}`;

export const getExplorerUrl = (typeOrHash?: string | null, maybeHash?: string | null) => {
  const txHash = maybeHash ?? typeOrHash;
  if (!txHash || txHash === "tx") return SHELBY_EXPLORER_URL;
  return `${SHELBY_EXPLORER_URL.replace(/\/+$/, "")}/txn/${txHash}`;
};

export const getShelbyBlobExplorerUrl = (account: string, blobName: string) => {
  const owner = normalizeAddress(account);
  return `${SHELBY_EXPLORER_URL.replace(/\/+$/, "")}/account/${owner}/blob/${encodeURIComponent(blobName).replace(/%2F/g, "/")}`;
};

type WalletSignMessagePayload = {
  address?: boolean;
  application?: boolean;
  chainId?: boolean;
  message: string;
  nonce: string;
};

type WalletUploadSigner = {
  account: { address?: unknown; publicKey?: unknown } | string;
  publicKey?: unknown;
  signAndSubmitTransaction: (...args: any[]) => Promise<{ hash?: string } | string>;
  signMessage?: (payload: WalletSignMessagePayload) => Promise<unknown>;
};

type UploadProgressPhase = "checking" | "encrypting" | "registering" | "uploading" | "committing" | "done";

type UploadWalletBlobsParams = {
  signer: WalletUploadSigner;
  blobs: Array<{ blobName: string; blobData: Uint8Array; originalFile?: File }>;
  expirationMicros?: number;
  encrypted?: boolean;
  options?: unknown;
  onProgress?: (event: { blobName: string; phase: UploadProgressPhase; uploadedBytes?: number; totalBytes?: number }) => void;
};

const getSignerAddress = (signer: WalletUploadSigner) => {
  if (typeof signer.account === "string") return normalizeAddress(signer.account);
  const address = getWalletAccountAddress(signer.account);
  if (!address) throw new Error("Connect a wallet before sealing files.");
  return address;
};

const getShelbyWriteLocationArgument = () => SHELBY_WRITE_LOCATION || undefined;

const toBytes = (value: unknown): Uint8Array | undefined => {
  if (!value) return undefined;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) return Hex.fromHexInput(trimmed).toUint8Array();
    try {
      return Uint8Array.from(atob(trimmed), (char) => char.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(trimmed);
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.toUint8Array === "function") return (record.toUint8Array as () => Uint8Array)();
    return toBytes(record.data ?? record.key ?? record.bytes ?? record.value ?? record.signature);
  }
  return undefined;
};

const getPublicKeyBytes = (signer: WalletUploadSigner, signMessageResult?: unknown) => {
  const account = typeof signer.account === "object" ? signer.account : undefined;
  return toBytes(signer.publicKey) ?? toBytes(account?.publicKey) ?? toBytes(asRecord(signMessageResult).publicKey);
};

const buildRpcUrl = (path: string) => {
  const base = SHELBY_RPC_URL.endsWith("/") ? SHELBY_RPC_URL : `${SHELBY_RPC_URL}/`;
  return new URL(path.replace(/^\/+/, ""), base).toString();
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = STORAGE_UPLOAD_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

const createWalletOwnerAuth = async (signer: WalletUploadSigner, accountAddress: string) => {
  if (!signer.signMessage) {
    throw new Error("This wallet does not expose signMessage, which Shelby storage needs for browser uploads.");
  }

  const challengeResponse = await fetch(buildRpcUrl("/v1/auth/challenge"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SHELBY_API_KEY ? { Authorization: `Bearer ${SHELBY_API_KEY}` } : {}),
    },
    body: JSON.stringify({ account: accountAddress }),
  });

  if (!challengeResponse.ok) {
    const body = await challengeResponse.text().catch(() => "");
    throw new Error(`Shelby storage challenge failed: ${challengeResponse.status} ${body}`);
  }

  const challengeJson = await challengeResponse.json() as { challenge?: string };
  const challenge = challengeJson.challenge;
  if (!challenge) throw new Error("Shelby storage challenge response did not include a challenge.");

  const signResult = await signer.signMessage({
    address: false,
    application: false,
    chainId: false,
    message: challenge,
    nonce: "blobsafe-shelby-storage",
  });

  const signature = toBytes(asRecord(signResult).signature ?? signResult);
  const publicKey = getPublicKeyBytes(signer, signResult);
  if (!signature) throw new Error("Wallet did not return a signature for the Shelby storage challenge.");
  if (!publicKey) throw new Error("Wallet did not expose the public key required by Shelby storage.");

  const signatureBase64 = btoa(Array.from(signature, (byte) => String.fromCharCode(byte)).join(""));
  return {
    "X-Shelby-Challenge": challenge,
    "X-Shelby-Signature": signatureBase64,
    "X-Shelby-Public-Key": Hex.fromHexInput(publicKey).toString(),
  };
};

const encodeInclusionProof = (siblings: Uint8Array[]) => {
  if (siblings.length === 0) return "NONE";
  const combined = new Uint8Array(siblings.length * 32);
  siblings.forEach((sibling, index) => combined.set(sibling, index * 32));
  return btoa(Array.from(combined, (byte) => String.fromCharCode(byte)).join(""));
};

const concatHashParts = async (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
};

const readBlobChunksets = function* (blobData: Uint8Array, chunksetSize: number): Generator<[number, Uint8Array]> {
  if (blobData.length === 0) {
    yield [0, new Uint8Array(chunksetSize)];
    return;
  }
  let index = 0;
  for (let offset = 0; offset < blobData.byteLength; offset += chunksetSize) {
    yield [index, blobData.subarray(offset, Math.min(offset + chunksetSize, blobData.byteLength))];
    index += 1;
  }
};

const generateChunksetInclusionProof = async (roots: Uint8Array[], chunksetIndex: number) => {
  if (roots.length === 0) throw new Error("Cannot generate inclusion proof without chunkset roots.");
  if (roots.length === 1) return [];
  const zeroHash = new Uint8Array(32);
  const siblings: Uint8Array[] = [];
  let currentLeaves: Uint8Array[] = roots.map((root) => Uint8Array.from(root));
  let currentIndex = chunksetIndex;

  while (currentLeaves.length > 1) {
    if (currentLeaves.length % 2 !== 0) currentLeaves.push(zeroHash);
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    siblings.push(currentLeaves[siblingIndex]);
    const nextLeaves: Uint8Array[] = [];
    for (let i = 0; i < currentLeaves.length; i += 2) {
      const parent = await concatHashParts([currentLeaves[i], currentLeaves[i + 1]]);
      nextLeaves.push(parent);
    }
    currentLeaves = nextLeaves;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return siblings;
};

const getChunksetSize = (commitments: BlobCommitments, totalBytes: number, providerConfig: { erasure_k?: number; erasure_d?: number; chunkSizeBytes?: number }) => {
  const erasureK = Number(providerConfig.erasure_k ?? 10);
  const requiredAcks = Number(providerConfig.erasure_d ?? 13);
  const chunkSizeBytes = Number(providerConfig.chunkSizeBytes ?? 1024 * 1024);
  const chunksetSize = erasureK * chunkSizeBytes;
  const expected = totalBytes === 0 ? 1 : Math.ceil(totalBytes / chunksetSize);
  if (expected !== commitments.chunkset_commitments.length) {
    throw new Error(`Shelby chunkset count mismatch: expected ${expected}, got ${commitments.chunkset_commitments.length}.`);
  }
  return { chunksetSize, requiredAcks };
};

const uploadChunksetsWithWallet = async ({
  signer,
  accountAddress,
  uid,
  blobData,
  commitments,
  providerConfig,
  onProgress,
  blobName,
}: {
  signer: WalletUploadSigner;
  accountAddress: string;
  uid: bigint;
  blobData: Uint8Array;
  commitments: BlobCommitments;
  providerConfig: { erasure_k?: number; erasure_d?: number; chunkSizeBytes?: number };
  blobName: string;
  onProgress?: UploadWalletBlobsParams["onProgress"];
}) => {
  if (commitments.raw_data_size !== blobData.length) {
    throw new Error("Shelby commitments do not match the selected file bytes.");
  }

  const { chunksetSize, requiredAcks } = getChunksetSize(commitments, blobData.length, providerConfig);
  const authHeaders = await createWalletOwnerAuth(signer, accountAddress);
  const roots = commitments.chunkset_commitments.map((commitment) => Hex.fromHexInput(commitment.chunkset_root).toUint8Array());
  const aggregatedAcks = new Map<number, Uint8Array>();
  let uploadedBytes = 0;

  for (const [chunksetIndex, chunksetData] of readBlobChunksets(blobData, chunksetSize)) {
    const proof = encodeInclusionProof(await generateChunksetInclusionProof(roots, chunksetIndex));
    let lastError = "";

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetchWithTimeout(buildRpcUrl(`/v2/chunksets/${accountAddress}/${chunksetIndex}/${uid.toString()}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(SHELBY_API_KEY ? { Authorization: `Bearer ${SHELBY_API_KEY}` } : {}),
          ...authHeaders,
          "X-Shelby-Inclusion-Proof": proof,
        },
        body: new Uint8Array(chunksetData),
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({})) as { spAcks?: Array<{ slot: number; signature: string }> };
        for (const ack of result.spAcks ?? []) {
          aggregatedAcks.set(ack.slot, Uint8Array.from(atob(ack.signature), (char) => char.charCodeAt(0)));
        }
        uploadedBytes += chunksetData.byteLength;
        onProgress?.({ blobName, phase: "uploading", uploadedBytes, totalBytes: blobData.length });
        lastError = "";
        break;
      }

      const body = await response.text().catch(() => "");
      lastError = `status ${response.status}, body: ${body}`;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === 5) break;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(30000, 250 * 2 ** attempt)));
    }

    if (lastError) {
      throw new Error(`Shelby storage rejected chunkset ${chunksetIndex}: ${lastError}`);
    }
  }

  const spAcks: StorageProviderAck[] = Array.from(aggregatedAcks.entries()).map(([slot, signature]) => ({ slot, signature }));
  if (spAcks.length < requiredAcks) {
    throw new Error(`Shelby storage returned ${spAcks.length} provider acknowledgements; ${requiredAcks} are required to finalize this file.`);
  }
  return spAcks;
};

const submitWalletTransaction = async (signer: WalletUploadSigner, data: unknown, options?: unknown) => {
  const response = await signer.signAndSubmitTransaction({ data, options });
  const hash = typeof response === "string" ? response : response.hash;
  if (!hash) throw new Error("Wallet did not return a transaction hash.");
  return hash;
};

const getTransactionEvents = (tx: unknown): ReadonlyArray<{ type: string; data: unknown }> => {
  const events = asRecord(tx).events;
  return Array.isArray(events) ? events as ReadonlyArray<{ type: string; data: unknown }> : [];
};

export const uploadWalletBlobs = async ({
  signer,
  blobs,
  expirationMicros = getDefaultExpiration(),
  encrypted = true,
  options,
  onProgress,
}: UploadWalletBlobsParams) => {
  if (!HAS_SHELBY_API_KEY) throw new Error("Shelby API key is not configured.");
  if (!blobs.length) return [];

  const accountAddress = getSignerAddress(signer);
  const account = AccountAddress.from(accountAddress, { maxMissingChars: 63 });
  const provider = await createDefaultErasureCodingProvider();

  const prepared = await Promise.all(blobs.map(async (blob) => {
    onProgress?.({ blobName: blob.blobName, phase: "checking" });
    const commitments = await generateCommitments(provider, blob.blobData);
    return {
      ...blob,
      commitments,
      numChunksets: expectedTotalChunksets(blob.blobData.length),
    };
  }));

  for (const item of prepared) onProgress?.({ blobName: item.blobName, phase: "registering" });

  const registerPayload = ShelbyBlobClient.createBatchRegisterBlobsPayload({
    account,
    selectedLocation: getShelbyWriteLocationArgument(),
    locationHint: getShelbyWriteLocationArgument(),
    expirationMicros,
    blobs: prepared.map((item) => ({
      blobName: item.blobName,
      blobSize: item.blobData.length,
      blobMerkleRoot: item.commitments.blob_merkle_root,
      numChunksets: item.numChunksets,
    })),
    encoding: provider.config.enumIndex,
    encryption: encrypted ? "AES_GCM_V1" : "Unencrypted",
  });

  const registerHash = await submitWalletTransaction(signer, registerPayload, options);
  const registerTx = await shelbyClient.coordination.aptos.waitForTransaction({ transactionHash: registerHash });
  if (!asRecord(registerTx).success) {
    throw new Error(`Shelby register transaction failed: ${String(asRecord(registerTx).vm_status ?? "unknown")}`);
  }

  const uidByObjectName = new Map(
    ShelbyBlobClient.registeredBlobUids(getTransactionEvents(registerTx), shelbyClient.coordination.deployer)
      .map((registered) => [registered.objectName, registered.uid]),
  );

  const results: Array<{ blobName: string; transactionHash: string; commitHash: string; uid: string; metadata?: FullObjectMetadata }> = [];

  for (let index = 0; index < prepared.length; index += MAX_UPLOAD_CONCURRENCY) {
    const batch = prepared.slice(index, index + MAX_UPLOAD_CONCURRENCY);
    await Promise.all(batch.map(async (item) => {
      const objectName = createBlobKey({ account, blobName: item.blobName });
      const uid = uidByObjectName.get(objectName);
      if (uid === undefined) {
        throw new Error(`Shelby did not emit a BlobRegisteredEvent for ${item.blobName}.`);
      }

      onProgress?.({ blobName: item.blobName, phase: "uploading", uploadedBytes: 0, totalBytes: item.blobData.length });
      const spAcks = await uploadChunksetsWithWallet({
        signer,
        accountAddress,
        uid,
        blobData: item.blobData,
        commitments: item.commitments,
        providerConfig: provider.config,
        blobName: item.blobName,
        onProgress,
      });

      onProgress?.({ blobName: item.blobName, phase: "committing" });
      const commitPayload = ShelbyBlobClient.createCommitObjectPayload({
        uid,
        blobName: item.blobName,
        overwrite: true,
        storageProviderAcks: spAcks,
      });
      const commitHash = await submitWalletTransaction(signer, commitPayload, options);
      const commitTx = await shelbyClient.coordination.aptos.waitForTransaction({ transactionHash: commitHash });
      if (!asRecord(commitTx).success) {
        throw new Error(`Shelby commit transaction failed for ${item.blobName}: ${String(asRecord(commitTx).vm_status ?? "unknown")}`);
      }
      const rejection = ShelbyBlobClient.findObjectCommitRejection(getTransactionEvents(commitTx), shelbyClient.coordination.deployer, uid);
      if (rejection) throw new Error(`Shelby rejected commit for ${item.blobName}: ${rejection}`);

      const metadata = await shelbyClient.coordination.getFullObjectMetadata({ account, name: item.blobName }).catch(() => undefined);
      onProgress?.({ blobName: item.blobName, phase: "done", uploadedBytes: item.blobData.length, totalBytes: item.blobData.length });
      results.push({ blobName: item.blobName, transactionHash: registerHash, commitHash, uid: uid.toString(), metadata });
    }));
  }

  return results;
};

export const uploadEncryptedBlob = async () => {
  throw new Error("uploadEncryptedBlob has been replaced by uploadWalletBlobs.");
};
