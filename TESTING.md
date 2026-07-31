# BlobSafe Testing Guide

This guide documents the manual checks used to verify BlobSafe on ShelbyNet and Shelby Testnet.

Production app:

```text
https://blobsafe.vercel.app
```

Local app:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Preflight

Before testing:

- Petra or another Aptos-compatible wallet is installed.
- Wallet has ShelbyNet funds for writes.
- `.env.local` or Vercel env contains Shelby API keys.
- `VITE_BLOBSAFE_CONTRACT_ADDRESS` points to the published BlobSafe access module.
- The selected app network matches the wallet network.

Expected result:

- Settings shows network, API key, contract, gateway, and wallet state as configured.
- Upload preflight is not blocked once a file is selected.

## 1. Public Upload

1. Connect wallet A.
2. Go to `Upload`.
3. Select public/plain storage mode.
4. Upload a small image.
5. Open `Files`.
6. Preview and download the file.
7. Open the same app in a different browser with wallet A.

Pass criteria:

- File appears under the same wallet.
- Preview works without receipt restore.
- Metadata shows `Plaintext`.
- S3/raw download returns a readable public object.

## 2. Encrypted Seal

1. Connect wallet A.
2. Go to `Upload`.
3. Enable encrypted seal mode.
4. Upload a file.
5. Approve the wallet transaction for upload/registration if requested.
6. Open the receipt/details modal.
7. Preview and download the file.

Pass criteria:

- File is stored under `blobsafe/encrypted/...`.
- Metadata shows `Per-file AES-256-GCM`.
- Integrity check shows `SHA-256 verified`.
- Preview/download requires wallet signature, not gas.
- Downloaded file opens correctly after BlobSafe decrypts it.

## 3. Receipt Recovery

1. After encrypted upload, click `Save recovery point`.
2. Open BlobSafe in a new browser profile or device.
3. Connect the same wallet A.
4. Confirm BlobSafe detects a recovery point.
5. Click `Restore now`.
6. Open encrypted files and preview/download.

Pass criteria:

- Recovery point is detected for the wallet.
- Restore requires wallet signature.
- Encrypted files become previewable after restore.
- Public files remain previewable even without restore.

## 4. Single Recipient Grant

1. Connect wallet A as owner.
2. Open an encrypted file detail.
3. Enter wallet B as recipient.
4. Choose a grant duration.
5. Create access grant.
6. Copy the recipient grant JSON and access code.
7. Connect wallet B.
8. Open `Shared`.
9. Import the grant JSON and enter the access code.
10. Download the shared file.

Pass criteria:

- Grant transaction succeeds.
- Recipient sees the shared file.
- Download works only while grant is active.
- Audit trail records access grant.

## 5. Revoke Grant

1. Connect wallet A.
2. Open the encrypted file detail.
3. Revoke wallet B.
4. Connect wallet B.
5. Attempt to download the shared file again.

Pass criteria:

- Revoke transaction succeeds.
- Wallet B sees the grant as unavailable or revoked.
- Download is blocked by on-chain grant check.
- Audit trail records revoke.

## 6. Timed Grant Expiry

1. Connect wallet A.
2. Grant wallet B access for a short preset duration.
3. Connect wallet B before expiry and confirm download works.
4. Wait until expiry.
5. Refresh grant status.
6. Attempt download again.

Pass criteria:

- Grant is active before expiry.
- Grant is expired after the timestamp.
- Download is unavailable after expiry.

## 7. Group Grant

1. Connect wallet A.
2. Create or select a team group.
3. Add multiple recipient wallets.
4. Open an encrypted file.
5. Choose group grant.
6. Create the group grant.
7. Copy each recipient's own grant JSON and code.
8. Import each package from the matching recipient wallet.

Pass criteria:

- Each recipient receives only their own package for normal delivery.
- Full backup package remains available for owner backup.
- Each member can download only with their own active grant.
- Revoke/expiry affects access as expected.

## 8. Wallet Isolation

1. Connect wallet A and upload files/folders.
2. Disconnect and connect wallet B in the same browser.
3. Open Overview, Upload, Files, Shared, and Settings.
4. Switch back to wallet A.

Pass criteria:

- Wallet B does not see wallet A's local-only receipt state.
- Wallet-scoped files are fetched for the connected account.
- Folder state does not leak across wallets.
- Wallet A state returns when wallet A reconnects.

## 9. Cross-Browser File Consistency

1. Use browser 1 with wallet A.
2. Upload public and encrypted files.
3. Save a recovery point.
4. Use browser 2 with wallet A.
5. Refresh files and restore receipts.

Pass criteria:

- Public files show and preview without restore.
- Encrypted files show from Shelby/account index.
- Encrypted previews/downloads work after recovery restore.
- Internal backup/sidecar blobs are hidden from normal file lists.

## 10. Network Switch

1. Open Settings.
2. Switch between ShelbyNet and Shelby Testnet.
3. Confirm status cards update.
4. Return to ShelbyNet.

Pass criteria:

- Switch motion is smooth.
- Network-specific contract/API state updates.
- No stale wallet data is shown as the wrong network.

## 11. S3 Gateway Validation

Start local gateway:

```powershell
Copy-Item tools/s3/shelby.config.example.yaml shelby.config.yaml
npx @shelby-protocol/s3-gateway --config shelby.config.yaml --port 9000
```

Run validator:

```powershell
$env:SHELBY_S3_GATEWAY_URL="http://localhost:9000"
$env:SHELBY_S3_BUCKET="0xyour_wallet_address"
$env:SHELBY_S3_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
$env:SHELBY_S3_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
npm run s3:validate
```

Optional object read:

```powershell
$env:BLOBSAFE_S3_OBJECT_KEY="blobsafe/public/<folder>/<file>"
npm run s3:validate
```

Optional write:

```powershell
$env:BLOBSAFE_S3_PUT_TEST="true"
npm run s3:validate
```

Pass criteria:

- Gateway lists BlobSafe namespaces.
- Public object read returns readable bytes.
- Encrypted object read returns sealed bytes.
- Optional PUT writes and reads back a test object when gateway account is funded.

## 12. Audit Trail

1. Register/upload an encrypted file.
2. Save recovery point.
3. Grant access.
4. Revoke access.
5. Delete file metadata.
6. Refresh audit log.

Pass criteria:

- Events are grouped and paginated.
- Transaction links open the Shelby explorer.
- Blob links open the Shelby blob/explorer target.
- Events match the user action and connected wallet.

## Release Checklist

Before public submission:

- Production app loads from `https://blobsafe.vercel.app`.
- `/app`, `/app/files`, `/app/shared`, and direct deep links return HTTP 200.
- Public upload works.
- Encrypted upload works.
- Grant, revoke, expiry, and group access work.
- Recovery works in a new browser.
- S3 validator passes.
- README and environment docs match the deployed contract/network.
- No `.env.local`, `.aptos`, `shelby.config.yaml`, private keys, or S3 secrets are committed.
