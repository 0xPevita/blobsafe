/**
 * BlobSafe Encryption Module
 * Client-side AES-256-GCM encryption using Web Crypto API
 * Keys are derived from the user's Aptos wallet address
 */
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

// Derive a deterministic encryption key from an Aptos address + passphrase
export const deriveKey = async (aptosAddress: string, passphrase: string = "blobsafe-v1"): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${aptosAddress}:${passphrase}`),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(aptosAddress),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
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
export const packEncrypted = (encrypted: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const buffer = new ArrayBuffer(12 + encrypted.length);
  const packed = new Uint8Array(buffer);
  packed.set(iv, 0);
  packed.set(encrypted, 12);
  return packed;
};

// Unpack iv and encrypted data from a packed blob
export const unpackEncrypted = (packed: Uint8Array<ArrayBuffer>): { encrypted: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> } => {
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
