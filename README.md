# BlobSafe

Decentralized encrypted file storage built on Shelby Protocol and Aptos.

BlobSafe is a browser dApp for wallet-owned file storage. Files are encrypted locally with Web Crypto before upload, then committed and stored on ShelbyNet through the Shelby React SDK.

## Features

- Client-side AES-GCM encryption before files leave the browser.
- ShelbyNet upload flow via `@shelby-protocol/react` and `@shelby-protocol/sdk/browser`.
- Aptos wallet signing through `@aptos-labs/wallet-adapter-react`.
- Account blob listing with `useAccountBlobs`.
- Dedicated landing page at `/` and dApp workspace routes at `/app`, `/app/upload`, `/app/files`, `/app/shared`, `/app/teams`, and `/app/settings`.
- Upload receipts with blob name, account, hash, size, expiry, explorer link, and copyable JSON.
- On-chain access-control module for file registration, grant, revoke, delete marking, and access views.
- Share Access flow that commits recipient grants on-chain and verifies active access before shared downloads.
- On-chain team recipient groups with member roles, then bulk grants for every member.
- Wallet-encrypted receipt backup and restore to recover decrypt metadata after browser storage is cleared.
- Shelby S3 Gateway handoff with config template, AWS CLI validation script, rclone, and boto3 examples.
- Tailwind CSS interface tuned for a focused storage workflow.

## Stack

| Layer | Technology |
| --- | --- |
| App | Vite + React 18 |
| Storage | Shelby Protocol SDK / React SDK |
| Chain | Aptos TypeScript SDK |
| Wallet | Aptos Wallet Adapter |
| Encryption | Web Crypto API |
| State/query | TanStack Query, Zustand |
| Styling | Tailwind CSS |

## Setup

```bash
npm install
cp .env.example .env.local
```

Set your ShelbyNet API key:

```bash
VITE_SHELBYNET_API_KEY=aptoslabs_your_key_here
```

For production on-chain access control, deploy the Move package in `move/`, initialize it, then set:

```bash
VITE_BLOBSAFE_CONTRACT_ADDRESS=0x...
```

`401 Unauthorized` from `api.shelbynet.aptoslabs.com` means the dev server is running without this key or was not restarted after editing `.env.local`.

Run locally:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`.

## Build

```bash
npm run build
npm run preview
```

The production build is emitted to `dist/` and can be deployed as a static site.

Run browser smoke tests:

```bash
npm run test:e2e
```

## Project Structure

```text
src/
  App.tsx                  Lightweight SPA routing
  main.tsx                 Vite React entrypoint
  providers.tsx            Query, Shelby, and wallet providers
  globals.css              Tailwind and design tokens
  pages/
    LandingPage.tsx        Public product landing page
    DappPage.tsx           Wallet, upload, and blob listing workspace
  components/layout/
    SiteHeader.tsx
    SiteBackground.tsx
  components/
    WalletButton.tsx
    FileUpload.tsx
    FileList.tsx
    SharedAccess.tsx
    TeamAccess.tsx
    StatsBar.tsx
  lib/
    accessControl.ts       BlobSafeAccess contract client
    shelby.ts              ShelbyNet client and helpers
    encryption.ts          AES-GCM helpers
    receiptBackups.ts      Wallet-encrypted Shelby receipt backups
    teams.ts               On-chain/local recipient team helpers
    shareGrants.ts         Encrypted on-chain grant payload helpers
  store/
    useFileStore.ts
move/
  Move.toml
  sources/
    access_control.move    Aptos Move access-control module
```

## Shelby Integration

BlobSafe targets ShelbyNet:

- `Network.SHELBYNET`
- RPC: `https://api.shelbynet.shelby.xyz/shelby`
- Explorer: `https://explorer.shelby.xyz/shelbynet`

Uploads use `useUploadBlobs` with a wallet signer:

```ts
await uploadBlobs.mutateAsync({
  signer: {
    account: accountAddress,
    signAndSubmitTransaction,
  },
  blobs: [{ blobName, blobData }],
  expirationMicros,
});
```

Receipt recovery backups are stored as encrypted Shelby blobs under `blobsafe/backups/`.
They are encrypted with the same wallet-signature-derived local key used to unwrap per-file keys, and are hidden from the normal file list.

BlobSafe also keeps its user files in stable blob namespaces such as `blobsafe/encrypted/<folder>/<file>`.
External S3-compatible tools can use the Shelby S3 Gateway against those paths, while BlobSafe should remain the place where sensitive files are encrypted before they are uploaded.
The Settings page includes copyable `shelby.config.yaml`, gateway startup, rclone, boto3, and AWS CLI snippets. By default this project points `VITE_SHELBY_S3_GATEWAY_URL` at `http://localhost:9000`, matching Shelby's local gateway quick start.

## Shelby S3 Gateway Validation

BlobSafe is gateway-ready through predictable Shelby blob paths:

```text
blobsafe/encrypted/<folder>/<file>
blobsafe/public/<folder>/<file>
blobsafe/backups/receipt-backup-...
```

Public/plain files downloaded through S3 open directly. Encrypted files downloaded through S3 remain sealed bytes and must be decrypted through BlobSafe with the owner wallet or an active access grant.

To run a local Shelby S3 Gateway:

```powershell
Copy-Item tools/s3/shelby.config.example.yaml shelby.config.yaml
# Edit shelby.config.yaml with your Shelby API key, account bucket, and S3 signing secret.
npx @shelby-protocol/s3-gateway --config shelby.config.yaml
```

Validate the gateway with AWS CLI from a separate terminal:

```powershell
$env:SHELBY_S3_GATEWAY_URL="http://localhost:9000"
$env:SHELBY_S3_BUCKET="0xyour_wallet_address"
$env:SHELBY_S3_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
$env:SHELBY_S3_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
npm run s3:validate
```

Optional object download check:

```powershell
$env:BLOBSAFE_S3_OBJECT_KEY="blobsafe/public/<folder>/<file>"
npm run s3:validate
```

Optional write/read check through the gateway:

```powershell
$env:BLOBSAFE_S3_PUT_TEST="true"
npm run s3:validate
```

S3 writes require the gateway config to use an `aptosPrivateKey` for the same account as `SHELBY_S3_BUCKET`, and that account must have enough Shelby storage funds. The gateway also requires an object expiration, so BlobSafe's validator sends `x-amz-meta-expiration-seconds: 2592000` for PUT checks.

Pass criteria:

- `aws s3 ls` lists the configured Shelby account bucket.
- `aws s3 ls s3://<account>/blobsafe/ --recursive` lists BlobSafe objects.
- Public objects can be copied and opened directly.
- Encrypted objects can be copied but remain encrypted outside BlobSafe.
- Optional PUT validation writes and reads back a small public test object when the gateway key belongs to a funded bucket owner.
- `receipt-backup` and receipt sidecar objects may appear in raw S3 listings, but BlobSafe hides them from the dApp file list.

Do not put S3 access keys, S3 secret keys, or Aptos private keys in `VITE_*` variables. Frontend env vars are public in the built app.

## On-chain Access Control

BlobSafe includes a deploy-ready Aptos Move module at `move/sources/access_control.move`.

Contract responsibilities:

- `register_file`: records owner, blob name, filename, SHA-256 hash, size, and expiry.
- `grant_access`: owner grants a recipient wallet access and stores the encrypted file-key payload on-chain.
- `revoke_access`: owner revokes a recipient wallet.
- `mark_deleted`: owner marks a blob deleted in access metadata.
- `has_access`, `get_file`, `get_grant`: view functions used by the dApp.

Deploy with the Aptos CLI after installing it:

```powershell
$env:BLOBSAFE_ADDR="<publisher-address>"
npm run move:compile
npm run move:test
npm run move:publish
npm run move:init
```

Then put `<publisher-address>` in `.env.local` as `VITE_BLOBSAFE_CONTRACT_ADDRESS` and restart Vite.

Until that address is configured, upload/download still works, but production grant/revoke is disabled because the dApp cannot honestly claim on-chain access control.

## License

MIT License. See [LICENSE](LICENSE).
