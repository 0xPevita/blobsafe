# BlobSafe

> **Decentralized encrypted file storage built natively on the Shelby Protocol.**

BlobSafe is a privacy-first file storage platform that combines client-side AES-256-GCM encryption with on-chain access control via Aptos smart contracts. Your files are encrypted before they leave your device — zero knowledge on our end.

[![Built on Shelby](https://img.shields.io/badge/Built%20on-Shelby%20Protocol-c6ff00?style=flat-square&labelColor=0a0a0f)](https://shelby.xyz)
[![Aptos](https://img.shields.io/badge/Chain-Aptos-blue?style=flat-square)](https://aptoslabs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-white?style=flat-square)](LICENSE)

---

## ✨ Features

- **🔐 Client-side AES-256-GCM encryption** — Files are encrypted locally using keys derived from your Aptos wallet. We never see your plaintext data.
- **⛓️ On-chain access control** — File permissions are enforced by Aptos smart contracts, not by our servers.
- **📦 Native Shelby SDK integration** — Uses `@shelby-protocol/react` and `@shelby-protocol/sdk/browser` directly.
- **🪣 S3-compatible** — Works with the Shelby S3 Gateway for use with existing tools (AWS CLI, rclone, boto3, DuckDB).
- **📋 Verifiable storage receipts** — Every upload produces a SHA-256 hash for integrity verification.
- **🗂️ Virtual folder structure** — Organized blob naming system that mirrors a familiar folder UX.
- **🌑 Beautiful dark UI** — Industrial-minimal design, no compromise.

---

## 🏗️ Architecture

```
User → [Browser] → AES-256-GCM Encrypt → Shelby RPC → Storage Providers (16x)
                                       ↕
                              Aptos Smart Contract
                        (blob metadata, access control)
```

- **Encryption**: Web Crypto API, AES-256-GCM, key derived via PBKDF2 from Aptos address
- **Storage**: Shelby Protocol — erasure-coded across 16 storage providers via Clay Codes
- **Coordination**: Aptos L1 — blob metadata, micropayment channels, audit proofs
- **Network**: DoubleZero private fiber between RPC servers and Storage Providers

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- [Petra Wallet](https://petra.app) browser extension
- Aptos API key from [Aptos Labs](https://developers.aptoslabs.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/blobsafe.git
cd blobsafe

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your NEXT_PUBLIC_APTOS_API_KEY

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your Petra wallet.

### Getting Testnet Tokens

1. **APT tokens** — Use the Aptos faucet via the SDK or [faucet.testnet.aptoslabs.com](https://faucet.testnet.aptoslabs.com)
2. **ShelbyUSD tokens** — Available from the Shelby faucet in the upload UI

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Storage SDK | `@shelby-protocol/sdk`, `@shelby-protocol/react` |
| Blockchain | Aptos via `@aptos-labs/ts-sdk` |
| Wallet | `@aptos-labs/wallet-adapter-react` |
| Encryption | Web Crypto API (AES-256-GCM + PBKDF2) |
| State | TanStack Query v5 |
| Styling | Tailwind CSS |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── layout.tsx        # Root layout + metadata
│   ├── page.tsx          # Main application page
│   ├── providers.tsx     # Wallet + Query providers
│   └── globals.css       # Global styles + design tokens
├── components/
│   ├── WalletButton.tsx  # Aptos wallet connect/disconnect
│   ├── FileUpload.tsx    # Drag-and-drop upload with encryption
│   ├── FileList.tsx      # Blob list from Shelby account
│   └── StatsBar.tsx      # Protocol feature highlights
└── lib/
    ├── shelby.ts         # Shelby client + formatting utils
    └── encryption.ts     # AES-256-GCM encryption primitives
```

---

## 🔐 Encryption Details

```typescript
// Key derivation (PBKDF2)
const key = await deriveKey(aptosAddress); // 100,000 iterations SHA-256

// Encryption (AES-256-GCM)
const { encrypted, iv } = await encryptData(fileData, key);

// Storage format: [12-byte IV][encrypted data]
const packed = packEncrypted(encrypted, iv);

// Integrity verification
const hash = await computeHash(originalData); // SHA-256
```

The IV is randomly generated per file and prepended to the encrypted blob. Decryption requires both the correct Aptos private key and the stored IV.

---

## 🧪 Shelby Protocol Integration

BlobSafe leverages these Shelby features:

- **`ShelbyClient.upload()`** — Erasure-codes and distributes blobs across 16 storage providers
- **`useAccountBlobs()`** — React hook for querying all blobs owned by an Aptos address
- **Blob naming** — Virtual folders via path-like names (`blobsafe/encrypted/filename.pdf`)
- **Micropayment channels** — Per-read payments without on-chain overhead per transaction
- **S3 Gateway** — Point any S3-compatible tool at `http://localhost:9000` to interact with your blobs

---

## 🤝 Contributing

Contributions are welcome! This project is intended as a reference implementation for building on Shelby Protocol.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Shelby Protocol](https://shelby.xyz) — Decentralized blob storage
- [Aptos Labs](https://aptoslabs.com) — L1 blockchain infrastructure
- [Jump Trading Group](https://jumpcrypto.com) — Shelby engineering foundation

---

*Built with ❤️ on the Shelby testnet. Not production-ready — use at your own risk.*
