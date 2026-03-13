# BlobSafe
Link Demo [https://blobsafe-8u5h.vercel.app/]

Decentralized encrypted file storage built on Shelby Protocol and Aptos L1.

Files are encrypted client-side using AES-256-GCM before they leave your browser. Access control is enforced on-chain via Aptos smart contracts. No server ever sees your plaintext data.

Built as an early access dApp on Shelby testnet.

---

## Live

Landing page and dApp are served from the same Next.js project:

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/app` | dApp (upload, view files) |

---

## Features

- Client-side AES-256-GCM encryption via Web Crypto API
- Key derivation from Aptos wallet address using PBKDF2
- File upload and storage via Shelby Protocol SDK
- On-chain blob metadata and verifiable receipts via SHA-256
- Erasure coding across 16 storage providers using Clay Codes
- S3-compatible gateway support
- Petra Wallet integration via Aptos Wallet Adapter
- Virtual folder structure using blob naming conventions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Storage | @shelby-protocol/sdk, @shelby-protocol/react |
| Blockchain | @aptos-labs/ts-sdk |
| Wallet | @aptos-labs/wallet-adapter-react, Petra |
| Encryption | Web Crypto API (AES-256-GCM + PBKDF2) |
| State | TanStack Query v5 |
| Styling | Tailwind CSS |
| API Keys | geomi.dev |

---

## Project Structure

```
src/
  app/
    page.tsx          # Landing page
    layout.tsx        # Root layout (no wallet providers)
    globals.css       # Global styles, design tokens, cursor effects
    providers.tsx     # Wallet adapter providers
    app/
      page.tsx        # dApp (upload + file list)
      layout.tsx      # dApp layout (wraps with providers)
  components/
    WalletButton.tsx  # Connect, disconnect, copy address
    FileUpload.tsx    # Drag and drop, encrypt toggle, upload
    FileList.tsx      # Blob list grouped by type
    StatsBar.tsx      # Trust badges (encryption, chain, protocol)
  lib/
    shelby.ts         # ShelbyClient setup, helpers
    encryption.ts     # AES-256-GCM, PBKDF2 key derivation
```

---

## Getting Started

### Requirements

- Node.js 18+
- Petra Wallet browser extension
- API key from [geomi.dev](https://geomi.dev)
- APT from Shelby faucet

### Install

```bash
git clone https://github.com/0xPevita/blobsafe.git
cd blobsafe
npm install --legacy-peer-deps
```

### Configure

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_APTOS_API_KEY=aptoslabs_your_key_here
```

Get your key from [geomi.dev](https://geomi.dev).

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

### Fund your wallet

Get testnet APT:
```
https://docs.shelby.xyz/apis/faucet/aptos
```

Get ShelbyUSD:
```
https://docs.shelby.xyz/apis/faucet/shelbyusd
```

---

## Network Configuration

This project connects to Shelby testnet (`Network.SHELBYNET`) for storage operations and Aptos testnet for the wallet adapter.

| Config | Value |
|--------|-------|
| Shelby RPC | `https://api.shelbynet.shelby.xyz/shelby` |
| Aptos API | `https://api.testnet.aptoslabs.com/v1` |
| Explorer | `https://explorer.shelby.xyz/testnet` |

---

## How Encryption Works

1. User connects Petra Wallet
2. A 256-bit key is derived from the wallet address using PBKDF2 with SHA-256 and 100,000 iterations
3. Each file is encrypted using AES-256-GCM with a random 12-byte IV
4. The IV is prepended to the encrypted data before upload
5. The resulting blob is uploaded to Shelby with a SHA-256 hash committed on-chain

Decryption reverses this process locally in the browser. The derived key never leaves the device.

---

## Related Projects

- [shelby-analytics-dashboard](https://github.com/0xPevita/shelby-analytics-dashboard) - CLI dashboard for Shelby storage metrics
- [shelby-s3-sync](https://github.com/0xPevita/shelby-s3-sync) - S3 sync tool for Shelby
- [aptos-account-scanner](https://github.com/0xPevita/aptos-account-scanner) - Aptos account scanner

---

## Links

- Shelby Protocol docs: https://docs.shelby.xyz
- Aptos developer docs: https://aptos.dev
- Petra Wallet: https://petra.app
- geomi.dev API keys: https://geomi.dev
- Shelby Explorer: https://explorer.shelby.xyz/testnet

---

## License

MIT
