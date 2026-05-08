import type { WrappedFileKey } from "@/lib/encryption";
import type { AccessControlReceipt } from "@/lib/accessControl";
import { getNetworkScopedStorageKey, SHELBY_NETWORK_NAME } from "@/lib/shelby";

export interface StoredReceipt {
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

const RECEIPTS_STORAGE_KEY = "blobsafe-file-receipts";

const normalizeReceiptAccount = (account?: string) => account?.trim().toLowerCase() || "";

const legacyStorageKeyForAccount = (account?: string) => {
  const normalized = normalizeReceiptAccount(account);
  return normalized ? `${RECEIPTS_STORAGE_KEY}:${normalized}` : RECEIPTS_STORAGE_KEY;
};

const storageKeyForAccount = (account?: string) =>
  getNetworkScopedStorageKey(RECEIPTS_STORAGE_KEY, account);

const readReceiptsFromKey = (key: string): Record<string, StoredReceipt> => {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const readReceipts = (account?: string): Record<string, StoredReceipt> => {
  const scoped = readReceiptsFromKey(storageKeyForAccount(account));
  if (Object.keys(scoped).length > 0 || SHELBY_NETWORK_NAME !== "shelbynet") {
    return scoped;
  }
  return readReceiptsFromKey(legacyStorageKeyForAccount(account));
};

export const getStoredReceipts = (account?: string) => readReceipts(account);

export const getStoredReceipt = (blobName: string, account?: string): StoredReceipt | undefined => {
  const scopedReceipt = readReceipts(account)[blobName];
  if (scopedReceipt) return scopedReceipt;

  const legacyReceipt = readReceipts()[blobName];
  if (!legacyReceipt || !account) return legacyReceipt;

  return normalizeReceiptAccount(legacyReceipt.account) === normalizeReceiptAccount(account)
    ? legacyReceipt
    : undefined;
};

export const saveStoredReceipt = (receipt: StoredReceipt) => {
  const receipts = readReceipts(receipt.account);
  receipts[receipt.blobName] = receipt;
  window.localStorage.setItem(storageKeyForAccount(receipt.account), JSON.stringify(receipts));
};

export const removeStoredReceipt = (blobName: string, account?: string) => {
  const receipts = readReceipts(account);
  delete receipts[blobName];
  window.localStorage.setItem(storageKeyForAccount(account), JSON.stringify(receipts));
};
