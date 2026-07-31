import { computeHash, decryptData, encryptData, packEncrypted, unpackEncrypted } from "@/lib/encryption";
import { normalizeAddress, shelbyClient } from "@/lib/shelby";
import type { StoredReceipt } from "@/lib/receipts";

const RECEIPT_PREFIX = "blobsafe/receipts";
const RECEIPT_VERSION = "blobsafe-receipt-v1";

type ReceiptSidecar = {
  version: typeof RECEIPT_VERSION;
  receipt: StoredReceipt;
};

const textToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  return bytes;
};

const bytesToText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

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

export const isReceiptSidecarBlob = (blobName: string): boolean =>
  blobName.startsWith(`${RECEIPT_PREFIX}/`);

export const buildReceiptSidecarBlobName = async (account: string, blobName: string): Promise<string> => {
  const digest = await computeHash(textToBytes(`${normalizeAddress(account)}:${blobName}`));
  return `${RECEIPT_PREFIX}/${digest.slice(0, 40)}.r`;
};

export const createReceiptSidecarBlob = async (
  receipt: StoredReceipt,
  masterKey: CryptoKey
): Promise<{ blobName: string; blobData: Uint8Array<ArrayBuffer> }> => {
  const payload: ReceiptSidecar = {
    version: RECEIPT_VERSION,
    receipt,
  };
  const { encrypted, iv } = await encryptData(
    textToBytes(JSON.stringify(payload)),
    masterKey
  );

  return {
    blobName: await buildReceiptSidecarBlobName(receipt.account, receipt.blobName),
    blobData: packEncrypted(encrypted, iv),
  };
};

export const downloadReceiptSidecar = async ({
  account,
  blobName,
  masterKey,
}: {
  account: string;
  blobName: string;
  masterKey: CryptoKey;
}): Promise<StoredReceipt | undefined> => {
  try {
    const sidecarBlobName = await buildReceiptSidecarBlobName(account, blobName);
    const blob = await shelbyClient.download({
      account,
      blobName: sidecarBlobName,
    });
    const storedBytes = await readStream(blob.readable);
    const { encrypted, iv } = unpackEncrypted(storedBytes);
    const decrypted = await decryptData(
      new Uint8Array(encrypted),
      new Uint8Array(iv),
      masterKey
    );
    const parsed = JSON.parse(bytesToText(decrypted)) as Partial<ReceiptSidecar>;

    if (
      parsed.version !== RECEIPT_VERSION ||
      !parsed.receipt ||
      parsed.receipt.blobName !== blobName
    ) {
      return undefined;
    }

    return parsed.receipt;
  } catch {
    return undefined;
  }
};
