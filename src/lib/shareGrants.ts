import { decryptData, encryptData, type WrappedFileKey } from "@/lib/encryption";
import type { StoredReceipt } from "@/lib/receipts";
import { getNetworkScopedStorageKey, SHELBY_NETWORK_NAME } from "@/lib/shelby";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const SHARE_GRANTS_STORAGE_KEY = "blobsafe-share-grants";

export interface ShareGrant {
  version: "blobsafe-share-v1";
  id: string;
  createdAt: string;
  ownerAccount: string;
  recipient?: string;
  fileName: string;
  blobName: string;
  originalSize: number;
  storedSize: number;
  sha256: string;
  encryption: "AES-256-GCM";
  expirationMicros: number;
  chain?: {
    moduleAddress: string;
    grantTxHash?: string;
    grantedAt: string;
  };
  wrappedFileKey: {
    algorithm: "AES-256-GCM";
    salt: string;
    iv: string;
    ciphertext: string;
  };
}

const copyBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return copyBytes(bytes);
};

const randomId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const normalizeGrantAccount = (account?: string) => account?.trim().toLowerCase() || "";

const legacyStorageKeyForAccount = (account?: string) => {
  const normalized = normalizeGrantAccount(account);
  return normalized ? `${SHARE_GRANTS_STORAGE_KEY}:${normalized}` : SHARE_GRANTS_STORAGE_KEY;
};

const storageKeyForAccount = (account?: string) =>
  getNetworkScopedStorageKey(SHARE_GRANTS_STORAGE_KEY, account);

const readShareGrantsFromKey = (key: string): ShareGrant[] => {
  const stored = window.localStorage.getItem(key);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter(isShareGrant) : [];
};

export const generateAccessCode = () => {
  const words = ["seal", "vault", "fiber", "proof", "hash", "grant", "shelby", "aptos"];
  const random = crypto.getRandomValues(new Uint32Array(3));
  return [
    words[random[0] % words.length],
    words[random[1] % words.length],
    random[2].toString(36).slice(0, 6).padStart(6, "0"),
  ].join("-");
};

const deriveShareKey = async (accessCode: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(accessCode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150_000,
      hash: "SHA-256",
    },
    material,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
};

export const createShareGrant = async ({
  receipt,
  fileKey,
  accessCode,
  recipient,
}: {
  receipt: StoredReceipt;
  fileKey: CryptoKey;
  accessCode: string;
  recipient?: string;
}): Promise<ShareGrant> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const shareKey = await deriveShareKey(accessCode, copyBytes(salt));
  const rawFileKey = copyBytes(new Uint8Array(await crypto.subtle.exportKey("raw", fileKey)));
  const { encrypted, iv } = await encryptData(rawFileKey, shareKey);

  return {
    version: "blobsafe-share-v1",
    id: randomId(),
    createdAt: new Date().toISOString(),
    ownerAccount: receipt.account,
    recipient: recipient?.trim() || undefined,
    fileName: receipt.fileName,
    blobName: receipt.blobName,
    originalSize: receipt.originalSize,
    storedSize: receipt.storedSize,
    sha256: receipt.sha256,
    encryption: "AES-256-GCM",
    expirationMicros: receipt.expirationMicros,
    wrappedFileKey: {
      algorithm: "AES-256-GCM",
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(encrypted),
    },
  };
};

export const unwrapShareGrantFileKey = async (
  grant: ShareGrant,
  accessCode: string
): Promise<CryptoKey> => {
  const shareKey = await deriveShareKey(accessCode, base64ToBytes(grant.wrappedFileKey.salt));
  const rawFileKey = await decryptData(
    base64ToBytes(grant.wrappedFileKey.ciphertext),
    base64ToBytes(grant.wrappedFileKey.iv),
    shareKey
  );

  return crypto.subtle.importKey(
    "raw",
    rawFileKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["decrypt"]
  );
};

export const readShareGrants = (account?: string): ShareGrant[] => {
  try {
    const scoped = readShareGrantsFromKey(storageKeyForAccount(account));
    if (scoped.length > 0 || SHELBY_NETWORK_NAME !== "shelbynet") return scoped;
    return readShareGrantsFromKey(legacyStorageKeyForAccount(account));
  } catch {
    return [];
  }
};

export const saveShareGrant = (grant: ShareGrant, account?: string) => {
  const grants = readShareGrants(account);
  const next = [grant, ...grants.filter((item) => item.id !== grant.id)].slice(0, 50);
  window.localStorage.setItem(storageKeyForAccount(account), JSON.stringify(next));
};

export const removeShareGrant = (id: string, account?: string) => {
  const next = readShareGrants(account).filter((grant) => grant.id !== id);
  window.localStorage.setItem(storageKeyForAccount(account), JSON.stringify(next));
};

export const parseShareGrant = (value: string): ShareGrant => {
  const input = value.trim();
  if (!input) {
    throw new Error("Paste the share grant JSON from the owner.");
  }
  if (!input.startsWith("{")) {
    throw new Error("This looks like an access code. Paste the grant JSON here first, then enter the access code after the file appears.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Grant JSON is incomplete or invalid. Copy the full grant JSON from the owner.");
  }

  if (!isShareGrant(parsed)) {
    throw new Error("Invalid BlobSafe share grant. Expected version blobsafe-share-v1.");
  }
  return parsed;
};

export const isShareableReceipt = (
  receipt?: StoredReceipt
): receipt is StoredReceipt & { key: WrappedFileKey } =>
  Boolean(receipt?.key?.version === "file-key-v1" && receipt.encryption === "AES-256-GCM");

function isShareGrant(value: unknown): value is ShareGrant {
  const grant = value as ShareGrant | null;
  return Boolean(
    grant &&
      grant.version === "blobsafe-share-v1" &&
      typeof grant.id === "string" &&
      typeof grant.ownerAccount === "string" &&
      typeof grant.blobName === "string" &&
      typeof grant.fileName === "string" &&
      grant.wrappedFileKey?.algorithm === "AES-256-GCM" &&
      typeof grant.wrappedFileKey.salt === "string" &&
      typeof grant.wrappedFileKey.iv === "string" &&
      typeof grant.wrappedFileKey.ciphertext === "string"
  );
}
