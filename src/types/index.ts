// ─── Wallet / User ───────────────────────────────────────────────────────────

export interface ConnectedWallet {
  address: string
  publicKey: string
  network: string
}

// ─── File & Blob ──────────────────────────────────────────────────────────────

export type FileStatus = 'pending' | 'encrypting' | 'uploading' | 'confirmed' | 'error'

export interface VaultFile {
  id: string
  name: string                  // Original filename
  encryptedName: string         // Stored name on Shelby (hashed)
  size: number                  // Original size in bytes
  encryptedSize: number         // Size after encryption
  mimeType: string
  folder: string                // Virtual folder path e.g. "/documents"
  uploadedAt: string            // ISO timestamp
  sha256: string                // SHA-256 of original plaintext
  blobId?: string               // Shelby blob ID (post-upload)
  txHash?: string               // Aptos transaction hash
  status: FileStatus
  isShared: boolean
  sharedWith: string[]          // Aptos addresses with access
}

export interface UploadProgress {
  fileId: string
  fileName: string
  stage: 'encrypting' | 'uploading' | 'confirming'
  progress: number              // 0-100
}

// ─── Encryption ───────────────────────────────────────────────────────────────

export interface EncryptionResult {
  encrypted: ArrayBuffer
  iv: Uint8Array                // 12-byte AES-GCM IV
  sha256: string                // SHA-256 hex of original plaintext
}

export interface DecryptionResult {
  decrypted: ArrayBuffer
  verified: boolean             // SHA-256 integrity check passed
}

// ─── Folder ───────────────────────────────────────────────────────────────────

export interface VaultFolder {
  path: string                  // e.g. "/documents/work"
  name: string                  // e.g. "work"
  fileCount: number
  totalSize: number
  createdAt: string
}

// ─── Shelby SDK (until official types available) ──────────────────────────────

export interface ShelbyUploadResult {
  blobId: string
  txHash: string
  size: number
  name: string
  createdAt: string
}

export interface ShelbyBlobMetadata {
  blobId: string
  name: string
  size: number
  owner: string
  createdAt: string
  txHash: string
}

export interface ShelbyConfig {
  rpcUrl: string
  network: 'shelbynet' | 'mainnet'
  aptosNodeUrl: string
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface VaultStats {
  totalFiles: number
  totalSize: number
  totalEncrypted: number
  folders: number
  lastUpload: string | null
}
