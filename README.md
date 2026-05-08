# BlobSafe

BlobSafe is a wallet-owned storage dApp for private team files on Shelby Protocol.

Live app: https://blobsafe.vercel.app
Repository: https://github.com/0xPevita/blobsafe

BlobSafe combines Shelby storage, Aptos wallet signatures, client-side encryption, and on-chain access control. Sensitive files are sealed in the browser before upload, while public files remain directly readable through Shelby and S3-compatible tooling.

## Why BlobSafe Exists

Most team file tools require trust in a centralized provider. The provider can see file contents, change access policy, or remove access. BlobSafe is designed around a different model:

- the browser encrypts private files before they touch the network;
- the wallet owner controls decrypt access;
- access grants and revocations are committed on-chain;
- Shelby stores the blobs and provides high-throughput reads;
- recovery metadata can be saved as wallet-encrypted Shelby blobs for cross-device use.

BlobSafe is not a generic cloud drive clone. It is a Web3-native vault for teams, DAOs, and developers who need verifiable ownership, cryptographic privacy for sealed files, and practical file workflows.

## Current Status

BlobSafe is running on ShelbyNet and Shelby Testnet configuration paths.

Implemented and tested:

- public file upload and preview;
- encrypted file seal, preview, download, and SHA-256 verification;
- wallet-scoped file and folder listing;
- on-chain file registration;
- on-chain access grant, timed grant, renewal, expiry, and revoke;
- group grant delivery with per-recipient grant JSON and access code;
- recipient import and shared-file download;
- recovery point save and restore across browsers/devices;
- audit log for storage, registry, grant, revoke, delete, and recovery events;
- network switch between ShelbyNet and Shelby Testnet;
- Shelby S3 Gateway validation tooling.

## Core Features

### Client-side encryption

Encrypted files use browser Web Crypto AES-256-GCM. Each file gets a per-file key. The key is wrapped with a wallet-signature-derived key, so BlobSafe does not receive plaintext file keys.

### Public storage mode

Public uploads are intentionally plaintext. They are useful for media, public artifacts, or files that should be readable from another browser without restoring private receipt metadata.

### On-chain access control

The Move contract records file ownership metadata and recipient access grants. Owners can grant, renew, expire, or revoke access. Recipients must have an active grant before BlobSafe lets them decrypt a shared encrypted file.

### Receipt recovery

Encrypted files need local receipt metadata to preview and decrypt. BlobSafe can save a wallet-encrypted recovery point back to Shelby. A new browser can detect that recovery point and restore the receipts after the same wallet signs.

### Virtual folders

BlobSafe uses predictable Shelby blob names:

```text
blobsafe/encrypted/<folder>/<file>
blobsafe/public/<folder>/<file>
blobsafe/backups/receipt-backup-...
```

This keeps folders portable across the dApp and S3-compatible clients.

### S3-compatible handoff

The repo includes a Shelby S3 Gateway config template and validator. Public files copied through S3 open directly. Encrypted files copied through S3 remain sealed bytes and must be decrypted through BlobSafe with the right wallet or active grant.

## Stack

| Layer | Technology |
| --- | --- |
| App | Vite, React 18, TypeScript |
| Styling | Tailwind CSS |
| Motion | Framer Motion |
| Storage | Shelby Protocol SDK / React SDK |
| Chain | Aptos TypeScript SDK |
| Wallet | Aptos Wallet Adapter |
| Encryption | Web Crypto API |
| State | TanStack Query, Zustand |
| Contract | Aptos Move |
| Deploy | Vercel |

## Environment

Copy the example file:

```bash
cp .env.example .env.local
```

Required frontend variables:

```env
VITE_SHELBYNET_API_KEY=aptoslabs_your_key_here
VITE_SHELBY_TESTNET_API_KEY=aptoslabs_your_key_here
VITE_SHELBY_NETWORK=shelbynet
VITE_BLOBSAFE_CONTRACT_ADDRESS=0xyour_contract_address
VITE_BLOBSAFE_SHELBYNET_CONTRACT_ADDRESS=0xyour_shelbynet_contract_address
VITE_BLOBSAFE_TESTNET_CONTRACT_ADDRESS=0xyour_testnet_contract_address
```

Optional:

```env
VITE_APTOS_API_KEY=aptoslabs_your_key_here
VITE_SHELBY_S3_GATEWAY_URL=http://localhost:9000
```

Do not put Aptos private keys, S3 secret keys, or Shelby gateway signing secrets in `VITE_*` variables. Vite exposes those variables to the browser by design.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Production build:

```bash
npm run build
npm run preview
```

Smoke tests:

```bash
npm run test:e2e
```

Manual end-to-end coverage is documented in [TESTING.md](TESTING.md).

## Move Contract

The access-control contract lives in:

```text
move/sources/access_control.move
```

Main responsibilities:

- register file metadata;
- store file owner, blob name, file hash, size, expiry, and deleted state;
- grant and revoke single-recipient access;
- write timed grants and grant expiry state;
- manage team recipient groups;
- expose view functions used by the dApp.

Compile and test:

```powershell
$env:BLOBSAFE_ADDR="<publisher-address>"
npm run move:compile
npm run move:test
```

Publish and initialize:

```powershell
$env:BLOBSAFE_ADDR="<publisher-address>"
npm run move:publish
npm run move:init
aptos move run --function-id <publisher-address>::access_control::init_access_index
aptos move run --function-id <publisher-address>::access_control::init_team_registry
aptos move run --function-id <publisher-address>::access_control::init_grant_expiry_index
aptos move run --function-id <publisher-address>::access_control::init_grant_expiry_ledger
```

Then set the publisher address in `.env.local` and restart the app.

## Shelby S3 Gateway

BlobSafe includes a local gateway template:

```text
tools/s3/shelby.config.example.yaml
```

Start a local Shelby S3 Gateway:

```powershell
Copy-Item tools/s3/shelby.config.example.yaml shelby.config.yaml
# Edit shelby.config.yaml with your Shelby API key, bucket owner account, and local S3 signing secret.
npx @shelby-protocol/s3-gateway --config shelby.config.yaml --port 9000
```

Validate list and read:

```powershell
$env:SHELBY_S3_GATEWAY_URL="http://localhost:9000"
$env:SHELBY_S3_BUCKET="0xyour_wallet_address"
$env:SHELBY_S3_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
$env:SHELBY_S3_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
npm run s3:validate
```

Validate a specific object:

```powershell
$env:BLOBSAFE_S3_OBJECT_KEY="blobsafe/public/<folder>/<file>"
npm run s3:validate
```

Optional PUT validation:

```powershell
$env:BLOBSAFE_S3_PUT_TEST="true"
npm run s3:validate
```

PUT validation requires the gateway account to be the same account as the bucket owner and to have enough Shelby storage funds.

## Security Model

BlobSafe separates storage from decryption authority.

- Shelby stores blobs.
- Aptos records ownership and access metadata.
- The browser performs encryption and decryption.
- The wallet signs messages used to derive local wrapping keys.
- Grant payloads contain encrypted key material, not plaintext keys.

Important boundaries:

- public files are not encrypted;
- encrypted files require a receipt or recovery point to decrypt;
- recovery points are encrypted and wallet-scoped;
- S3 downloads of encrypted objects return sealed bytes;
- `VITE_*` values are public browser config, not server secrets.

## Known Limitations

- This is a browser-first dApp. Large-file UX should still be tested under real community load.
- Aptos wallet adapter dependencies currently emit peer dependency warnings during install, but production builds complete successfully.
- S3 Gateway validation is local-tooling based. BlobSafe does not embed S3 signing secrets in the browser.
- Encrypted-file recovery depends on users saving or restoring wallet-encrypted receipt recovery points.

## Project Structure

```text
src/
  pages/
    LandingPage.tsx
    DappPage.tsx
    DappRoute.tsx
  components/
    FileUpload.tsx
    FileList.tsx
    SharedAccess.tsx
    TeamAccess.tsx
    ReceiptBackupPanel.tsx
  lib/
    accessControl.ts
    encryption.ts
    receiptBackups.ts
    shareGrants.ts
    shelby.ts
    teams.ts
  store/
    useFileStore.ts
move/
  sources/access_control.move
tools/
  s3/
    validate-s3.mjs
    shelby.config.example.yaml
```

## License

MIT. See [LICENSE](LICENSE).
