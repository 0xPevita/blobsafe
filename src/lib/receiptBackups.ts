import { decryptData, encryptData, packEncrypted, unpackEncrypted } from "@/lib/encryption";
import { getStoredReceipts, saveStoredReceipt, type StoredReceipt } from "@/lib/receipts";
import { getNetworkScopedStorageKey, normalizeAddress, shelbyClient } from "@/lib/shelby";

const BACKUP_PREFIX = "blobsafe/backups";
const BACKUP_VERSION = "blobsafe-receipt-backup-v1";
const AUTO_RESTORE_STORAGE_KEY = "blobsafe-receipt-auto-restore";

export type ReceiptBackupPayload = {
  version: typeof BACKUP_VERSION;
  account: string;
  createdAt: string;
  receipts: StoredReceipt[];
};

export type ReceiptBackupSummary = {
  blobName: string;
  createdAt?: string;
};

const normalizeBackupAccount = (account?: string) => normalizeAddress(account ?? "0x0").trim().toLowerCase();

const textToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  return bytes;
};

const bytesToText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const readStream = async (readable: ReadableStream): Promise<Uint8Array<ArrayBuffer>> => {
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
};

export const isReceiptBackupBlob = (blobName: string): boolean =>
  blobName.startsWith(`${BACKUP_PREFIX}/`);

export const listLocalReceiptsForBackup = (account: string): StoredReceipt[] => {
  const normalizedAccount = normalizeBackupAccount(account);
  return Object.values(getStoredReceipts(account)).filter(
    (receipt) => normalizeBackupAccount(receipt.account) === normalizedAccount
  );
};

export const buildReceiptBackupBlobName = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${BACKUP_PREFIX}/receipt-backup-${stamp}-${suffix}.rb`;
};

export const createReceiptBackupBlob = async ({
  account,
  receipts,
  masterKey,
}: {
  account: string;
  receipts: StoredReceipt[];
  masterKey: CryptoKey;
}): Promise<{ blobName: string; blobData: Uint8Array<ArrayBuffer>; payload: ReceiptBackupPayload }> => {
  const payload: ReceiptBackupPayload = {
    version: BACKUP_VERSION,
    account: normalizeAddress(account),
    createdAt: new Date().toISOString(),
    receipts,
  };

  const { encrypted, iv } = await encryptData(
    textToBytes(JSON.stringify(payload)),
    masterKey
  );

  return {
    blobName: buildReceiptBackupBlobName(),
    blobData: packEncrypted(encrypted, iv),
    payload,
  };
};

export const downloadReceiptBackup = async ({
  account,
  blobName,
  masterKey,
}: {
  account: string;
  blobName: string;
  masterKey: CryptoKey;
}): Promise<ReceiptBackupPayload> => {
  const blob = await shelbyClient.download({
    account,
    blobName,
  });
  const storedBytes = await readStream(blob.readable);
  const { encrypted, iv } = unpackEncrypted(storedBytes);
  const decrypted = await decryptData(
    new Uint8Array(encrypted),
    new Uint8Array(iv),
    masterKey
  );
  const parsed = JSON.parse(bytesToText(decrypted)) as Partial<ReceiptBackupPayload>;

  if (
    parsed.version !== BACKUP_VERSION ||
    normalizeBackupAccount(parsed.account) !== normalizeBackupAccount(account) ||
    !Array.isArray(parsed.receipts)
  ) {
    throw new Error("Receipt backup is invalid or belongs to another wallet.");
  }

  return parsed as ReceiptBackupPayload;
};

export const restoreReceiptBackup = (payload: ReceiptBackupPayload, account: string): number => {
  const normalizedAccount = normalizeBackupAccount(account);
  const validReceipts = payload.receipts.filter(
    (receipt) =>
      receipt?.blobName &&
      receipt?.fileName &&
      normalizeBackupAccount(receipt.account) === normalizedAccount
  );

  validReceipts.forEach(saveStoredReceipt);
  return validReceipts.length;
};

export const parseReceiptBackupSummary = (blobName: string): ReceiptBackupSummary => {
  const match = blobName.match(/receipt-backup-(.+)-[a-z0-9]+\.rb$/i);
  const createdAt = match?.[1]?.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z"
  );

  return {
    blobName,
    createdAt,
  };
};

export const getLastSeenReceiptBackup = (account: string): string => {
  try {
    return window.localStorage.getItem(getNetworkScopedStorageKey(AUTO_RESTORE_STORAGE_KEY, account)) || "";
  } catch {
    return "";
  }
};

export const markReceiptBackupSeen = (account: string, blobName: string) => {
  try {
    window.localStorage.setItem(getNetworkScopedStorageKey(AUTO_RESTORE_STORAGE_KEY, account), blobName);
  } catch {
    // Ignore storage failures; recovery still works for the current session.
  }
};
