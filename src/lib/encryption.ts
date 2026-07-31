/**
 * BlobSafe Encryption Module
 * Client-side AES-256-GCM encryption using Web Crypto API.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const KEY_UNLOCK_MESSAGE =
  "Unlock BlobSafe local encryption key. This signature does not submit a transaction or grant network access.";
const KEY_UNLOCK_NONCE = "blobsafe:v2:wallet-key";

type SignMessage = (payload: {
  address?: boolean;
  application?: boolean;
  chainId?: boolean;
  message: string;
  nonce: string;
}) => Promise<unknown>;

export interface WrappedFileKey {
  version: "file-key-v1";
  algorithm: "AES-256-GCM";
  wrappedKey: string;
  wrapIv: string;
}

const walletKeyCache = new Map<string, CryptoKey>();

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

const importAesKey = async (material: string, salt: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
};

// Legacy v1 key. Kept only so files uploaded before wallet-signature keys still decrypt.
export const deriveKey = async (aptosAddress: string, passphrase: string = "blobsafe-v1"): Promise<CryptoKey> =>
  importAesKey(`${aptosAddress}:${passphrase}`, aptosAddress);

const signatureToStableString = (signature: unknown): string => {
  if (typeof signature === "string") return signature;
  if (
    signature &&
    typeof signature === "object" &&
    "toString" in signature &&
    typeof signature.toString === "function"
  ) {
    return signature.toString();
  }
  return JSON.stringify(signature);
};

export const getWalletEncryptionKey = async (
  aptosAddress: string,
  signMessage: SignMessage
): Promise<CryptoKey> => {
  const cacheKey = aptosAddress.toLowerCase();
  const cached = walletKeyCache.get(cacheKey);
  if (cached) return cached;

  const response = await signMessage({
    address: true,
    application: false,
    chainId: true,
    message: KEY_UNLOCK_MESSAGE,
    nonce: KEY_UNLOCK_NONCE,
  });

  const result = response as {
    fullMessage?: string;
    message?: string;
    nonce?: string;
    signature?: unknown;
  };

  if (!result.signature) {
    throw new Error("Wallet did not return a signature for local encryption.");
  }

  const signedMaterial = [
    "blobsafe:v2",
    aptosAddress,
    result.fullMessage ?? result.message ?? KEY_UNLOCK_MESSAGE,
    result.nonce ?? KEY_UNLOCK_NONCE,
    signatureToStableString(result.signature),
  ].join(":");

  const key = await importAesKey(signedMaterial, `${aptosAddress}:blobsafe:v2`);
  walletKeyCache.set(cacheKey, key);
  return key;
};

export const decryptWithWalletKey = async (
  encrypted: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  aptosAddress: string,
  signMessage: SignMessage
): Promise<Uint8Array<ArrayBuffer>> => {
  const walletKey = await getWalletEncryptionKey(aptosAddress, signMessage);
  try {
    return await decryptData(encrypted, iv, walletKey);
  } catch (walletKeyError) {
    try {
      const legacyKey = await deriveKey(aptosAddress);
      return await decryptData(encrypted, iv, legacyKey);
    } catch {
      throw walletKeyError;
    }
  }
};

export const generateFileKey = async (): Promise<CryptoKey> =>
  crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );

export const wrapFileKey = async (
  fileKey: CryptoKey,
  masterKey: CryptoKey
): Promise<WrappedFileKey> => {
  const rawKey = copyBytes(new Uint8Array(await crypto.subtle.exportKey("raw", fileKey)));
  const { encrypted, iv } = await encryptData(rawKey, masterKey);

  return {
    version: "file-key-v1",
    algorithm: "AES-256-GCM",
    wrappedKey: bytesToBase64(encrypted),
    wrapIv: bytesToBase64(iv),
  };
};

export const unwrapFileKey = async (
  wrapped: WrappedFileKey,
  masterKey: CryptoKey
): Promise<CryptoKey> => {
  const rawKey = await decryptData(
    base64ToBytes(wrapped.wrappedKey),
    base64ToBytes(wrapped.wrapIv),
    masterKey
  );

  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
};

export const decryptWithWrappedFileKey = async (
  encrypted: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  wrapped: WrappedFileKey,
  aptosAddress: string,
  signMessage: SignMessage
): Promise<Uint8Array<ArrayBuffer>> => {
  const masterKey = await getWalletEncryptionKey(aptosAddress, signMessage);
  const fileKey = await unwrapFileKey(wrapped, masterKey);
  return decryptData(encrypted, iv, fileKey);
};

// Encrypt a Uint8Array, returns { encrypted, iv } both as Uint8Array
export const encryptData = async (
  data: Uint8Array<ArrayBuffer>,
  key: CryptoKey
): Promise<{ encrypted: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> }> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );
  return { encrypted: new Uint8Array(encrypted), iv };
};

// Decrypt encrypted data using the same key + iv
export const decryptData = async (
  encrypted: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  key: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> => {
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted
  );
  return new Uint8Array(decrypted);
};

// Bundle iv + encrypted into single blob for storage (iv is first 12 bytes)
export const packEncrypted = (
  encrypted: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>
): Uint8Array<ArrayBuffer> => {
  const packed = new Uint8Array(12 + encrypted.length);
  packed.set(iv, 0);
  packed.set(encrypted, 12);
  return packed;
};

// Unpack iv and encrypted data from a packed blob
export const unpackEncrypted = (packed: Uint8Array): { encrypted: Uint8Array; iv: Uint8Array } => {
  const iv = packed.slice(0, 12);
  const encrypted = packed.slice(12);
  return { iv, encrypted };
};

// Compute SHA-256 hash of data (for integrity verification / storage receipt)
export const computeHash = async (data: Uint8Array<ArrayBuffer>): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return file.arrayBuffer();
};

export const encryptFile = async (
  data: ArrayBuffer,
  key: CryptoKey
): Promise<{ encrypted: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; sha256: string }> => {
  const bytes = new Uint8Array(data);
  const sha256 = await computeHash(bytes);
  const { encrypted, iv } = await encryptData(bytes, key);
  return { encrypted, iv, sha256 };
};

export const packForStorage = packEncrypted;
