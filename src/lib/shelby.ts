import { Network } from "@aptos-labs/ts-sdk";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
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
} from "@/lib/shelbyNetwork";

export const SHELBY_NETWORK = SHELBY_NETWORK_NAME === "testnet"
  ? Network.TESTNET
  : Network.SHELBYNET;
export const APTOS_EXPLORER_URL = "https://explorer.aptoslabs.com";

const rawShelbyApiKey = SHELBY_NETWORK_NAME === "testnet"
  ? (
      import.meta.env.VITE_SHELBY_TESTNET_API_KEY ||
      import.meta.env.VITE_SHELBYNET_API_KEY ||
      import.meta.env.VITE_APTOS_API_KEY ||
      ""
    )
  : (
      import.meta.env.VITE_SHELBYNET_API_KEY ||
      import.meta.env.VITE_APTOS_API_KEY ||
      ""
    );

export const isUsableApiKey = (value: string | undefined): value is string => {
  if (!value) return false;
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    !normalized.includes("your_key_here") &&
    !normalized.includes("your-api-key")
  );
};

const isUsableGatewayUrl = (value: string | undefined): value is string => {
  if (!value) return false;
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    !normalized.includes("your-shelby-s3-gateway") &&
    /^https?:\/\//.test(normalized)
  );
};

export const SHELBY_S3_GATEWAY_URL = import.meta.env.VITE_SHELBY_S3_GATEWAY_URL || "";
export const SHELBY_S3_GATEWAY_STATUS = isUsableGatewayUrl(SHELBY_S3_GATEWAY_URL)
  ? "configured"
  : "not configured";

export const SHELBY_API_KEY = isUsableApiKey(rawShelbyApiKey)
  ? rawShelbyApiKey.trim()
  : undefined;

export const HAS_SHELBY_API_KEY = Boolean(SHELBY_API_KEY);

export const SHELBY_API_KEY_STATUS = HAS_SHELBY_API_KEY
  ? "configured"
  : "missing";

export const shelbyClient = new ShelbyClient({
  network: SHELBY_NETWORK,
  apiKey: SHELBY_API_KEY,
});

// Default expiration: 30 days from now (in microseconds)
export const getDefaultExpiration = () =>
  (Date.now() * 1000) + (30 * 24 * 60 * 60 * 1000 * 1000);

// Format bytes to human-readable
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const formatFileSize = formatBytes;

export const normalizeAddress = (address: unknown): string => {
  if (!address) return "";
  return typeof address === "string" ? address : address.toString();
};

export const getWalletAccountAddress = (account: unknown): string => {
  const walletAccount = account as {
    address?: unknown;
    accountAddress?: unknown;
  } | null;

  return normalizeAddress(walletAccount?.accountAddress ?? walletAccount?.address);
};

export const getBlobStoredName = (blob: unknown): string => {
  const metadata = blob as {
    blobNameSuffix?: string;
    blobName?: string;
    name?: string;
  } | null;

  const storedName = metadata?.blobNameSuffix ?? metadata?.blobName ?? metadata?.name ?? "";
  return storedName.startsWith("@") ? storedName.split("/").slice(1).join("/") : storedName;
};

export const getBlobFullName = (blob: unknown, account?: string): string => {
  const metadata = blob as {
    name?: string;
    blobName?: string;
    blobNameSuffix?: string;
  } | null;

  if (metadata?.name?.startsWith("@")) return metadata.name;
  const storedName = getBlobStoredName(blob);
  if (!account || !storedName) return metadata?.name ?? storedName;
  return `@${normalizeAddress(account).replace(/^0x/, "")}/${storedName}`;
};

export const getBlobSize = (blob: unknown): number | undefined => {
  const metadata = blob as {
    size?: number;
    num_bytes?: number;
    blobSize?: number;
  } | null;

  return metadata?.size ?? metadata?.num_bytes ?? metadata?.blobSize;
};

export const getBlobExpirationMicros = (blob: unknown): number | undefined => {
  const metadata = blob as {
    expirationMicros?: number;
    expiration_micros?: number;
  } | null;

  return metadata?.expirationMicros ?? metadata?.expiration_micros;
};

export const getBlobCreationMicros = (blob: unknown): number | undefined => {
  const metadata = blob as {
    creationMicros?: number;
    creation_micros?: number;
    created_at?: number | string;
  } | null;

  const value = metadata?.creationMicros ?? metadata?.creation_micros ?? metadata?.created_at;
  return value === undefined ? undefined : Number(value);
};

export const getBlobMerkleRootHex = (blob: unknown): string | undefined => {
  const metadata = blob as {
    blobMerkleRoot?: Uint8Array;
    blob_merkle_root?: string;
    blobCommitment?: string;
  } | null;

  if (metadata?.blob_merkle_root) return metadata.blob_merkle_root;
  if (metadata?.blobCommitment) return metadata.blobCommitment;
  if (!metadata?.blobMerkleRoot) return undefined;
  return Array.from(metadata.blobMerkleRoot)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

// Format blob name for display (strip account prefix)
export const formatBlobName = (blobName: string): string => {
  const parts = blobName.split("/");
  return parts[parts.length - 1] || blobName;
};

// Get file extension icon label
export const getFileType = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    pdf: "PDF",
    png: "IMG", jpg: "IMG", jpeg: "IMG", gif: "IMG", webp: "IMG", svg: "IMG",
    mp4: "VID", mov: "VID", avi: "VID", mkv: "VID",
    mp3: "AUD", wav: "AUD", flac: "AUD",
    zip: "ZIP", tar: "ZIP", gz: "ZIP", rar: "ZIP",
    js: "CODE", ts: "CODE", py: "CODE", rs: "CODE", go: "CODE", sol: "CODE",
    json: "JSON", yaml: "YAML", toml: "TOML",
    md: "DOC", txt: "DOC", doc: "DOC", docx: "DOC",
    csv: "DATA", parquet: "DATA", xlsx: "DATA",
  };
  return map[ext] || "FILE";
};

export const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.startsWith("video/")) return "VID";
  if (mimeType.startsWith("audio/")) return "AUD";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "ZIP";
  if (mimeType.includes("json")) return "JSON";
  if (mimeType.startsWith("text/")) return "DOC";
  return "FILE";
};

// Truncate address for display
export const truncateAddress = (addr: string): string => {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export const shortenAddress = truncateAddress;

// Format date from microseconds
export const formatDate = (micros: number): string => {
  return new Date(micros / 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};

export const getBlobName = (address: string, fileName: string, folder = "/"): string => {
  return buildBlobName({
    address,
    fileName,
    folder,
    encrypted: true,
  });
};

export const normalizeFolderPath = (folder = "/"): string => {
  const clean = folder
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
  return clean ? `/${clean}` : "/";
};

const sanitizeBlobSegment = (value: string, fallback: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return (normalized || fallback).slice(0, 96);
};

const sanitizeBlobFileName = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return sanitizeBlobSegment(fileName, "file");
  }

  const baseName = sanitizeBlobSegment(fileName.slice(0, dotIndex), "file");
  const extension = sanitizeBlobSegment(fileName.slice(dotIndex + 1), "bin").replace(/\./g, "");
  return `${baseName}.${extension || "bin"}`;
};

const sanitizeBlobFolder = (folder: string): string => {
  const parts = normalizeFolderPath(folder)
    .split("/")
    .filter(Boolean)
    .map((part) => sanitizeBlobSegment(part, "folder"));

  return parts.length > 0 ? `${parts.join("/")}/` : "";
};

export const buildBlobName = ({
  address: _address,
  fileName,
  folder = "/",
  encrypted = true,
}: {
  address: string;
  fileName: string;
  folder?: string;
  encrypted?: boolean;
}): string => {
  const namespace = encrypted ? "encrypted" : "public";
  return `blobsafe/${namespace}/${sanitizeBlobFolder(folder)}${sanitizeBlobFileName(fileName)}`;
};

export const getBlobFolderPath = (blobName: string): string => {
  const parts = getBlobStoredName({ blobName }).split("/");
  const namespaceIndex = parts.findIndex((part) => part === "encrypted" || part === "public");
  if (namespaceIndex < 0) return "/";

  const pathParts = parts.slice(namespaceIndex + 1, -1);
  const folderParts = pathParts[0]?.startsWith("0x") ? pathParts.slice(1) : pathParts;
  return folderParts.length > 0 ? `/${folderParts.join("/")}` : "/";
};

export const getShelbyBlobUrl = (account: string, blobName: string): string => {
  const normalizedAccount = encodeURIComponent(normalizeAddress(account));
  return `${SHELBY_RPC_URL}/v1/blobs/${normalizedAccount}/${blobName}`;
};

export const getExplorerUrl = (type: "account" | "tx" | "blob", value: string): string => {
  if (type === "account") return `${SHELBY_EXPLORER_URL}/account/${value}`;
  if (type === "tx") return `${APTOS_EXPLORER_URL}/txn/${value}?network=${SHELBY_NETWORK_NAME}`;
  return `${SHELBY_EXPLORER_URL}/blob/${value}`;
};

export const getShelbyBlobExplorerUrl = (account: string, blobName: string): string => {
  const owner = normalizeAddress(account);
  const storedName = getBlobStoredName({ blobName });
  return `${SHELBY_EXPLORER_URL}/blobs/${owner}?blobName=${encodeURIComponent(storedName)}`;
};

export const uploadEncryptedBlob = async (
  ..._args: unknown[]
): Promise<{ blobId: string; txHash: string }> => {
  throw new Error(
    "uploadEncryptedBlob is deprecated. Use @shelby-protocol/react useUploadBlobs with a connected wallet signer."
  );
};
