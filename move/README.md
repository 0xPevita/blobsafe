# BlobSafeAccess Move Package

This package contains the on-chain access-control layer for BlobSafe.

## What It Does

- Registers each uploaded Shelby blob under the file owner.
- Stores file hash, size, expiry, and blob name on-chain.
- Grants access to recipient wallet addresses.
- Stores timed grants in a flat expiry ledger so wallet simulation avoids nested table creation.
- Revokes recipient access.
- Stores owner-managed teams and member roles on-chain.
- Marks files deleted.
- Exposes view functions used by the dApp.

The contract stores encrypted key payloads only. It must never receive plaintext file keys.

## Compile And Test

Restart the terminal after installing Aptos CLI so `aptos` is in `PATH`.

```powershell
$env:BLOBSAFE_ADDR="0x123"
npm run move:compile
npm run move:test
```

Use your real publisher address for production.

## Publish To ShelbyNet

Initialize Aptos CLI with the publisher account and ShelbyNet fullnode, then publish:

```powershell
$env:BLOBSAFE_ADDR="<publisher-address>"
npm run move:publish
npm run move:init
aptos move run --function-id <publisher-address>::access_control::init_access_index
aptos move run --function-id <publisher-address>::access_control::init_team_registry
aptos move run --function-id <publisher-address>::access_control::init_grant_expiry_index
aptos move run --function-id <publisher-address>::access_control::init_grant_expiry_ledger
```

After publishing, set the same address in the dApp env:

```env
VITE_BLOBSAFE_CONTRACT_ADDRESS=<publisher-address>
```

Restart Vite after editing `.env.local`.

## Current Local Deployment

This workspace has a local Aptos CLI profile named `shelbynet-publisher`.

Published module:

```text
0x852058e9eff548bc28eb315812d3c92f0baff51f4673ce14e1e1cfd2be956300::access_control
```

Latest ShelbyNet recovery:

- Date: 2026-07-31
- Reason: ShelbyNet ledger/module state was reset or updated, so the previously published module was no longer available at the configured address.
- Status: republished and re-initialized at the same publisher address.
- Runtime validation:
  - `module_version() == 6`
  - `runtime_status() == (true, true, true)`
  - `grant_expiry_ledger_status() == true`
Transactions:

- ShelbyNet recovery publish: `0xd4c9cf4b62f947b5c016816c3e3d4287189e082d20e5160d3a2926cf628ce230`
- ShelbyNet recovery init AccessIndex: `0x17cceb446dba9daf532fa4b363e46244d04c261397bf71439dedb38fa9450fc1`
- ShelbyNet recovery init TeamRegistry: `0xf6031f103f1e6e6d475c82952d99d6c208af18d2040e87611f056d466df9a035`
- ShelbyNet recovery init GrantExpiryIndex: `0x17d75a2458be7fd031ad957b0631ccd0c67b866115c1303d27984a9225d394de`
- ShelbyNet recovery init GrantExpiryLedger: `0x6bc839888e48cda1e86b9089ec60c17fb073df5a370b38f2c6490c14c1ea0dbf`
- Publish: `0xb9ed1fb9973ba2e3a7e9b9d3190fa58d61543f28d133ca11bfd0c2cf09fe01fa`
- Init: `0xed753d7a4ed6bd70414f161d0d24928f6b1fded81a822a636398f307a987f118`
- AccessIndex upgrade: `0xc57305333f9b9c8fcb616af7f0ad3faece966a57e5164d3eaf1a78149d0c99f9`
- AccessIndex init: `0x0d0dc119dfa5e901df3a610cd7d83ea5da6c47cfd3bd558ab6323d6ab810ec1d`
- TeamRegistry upgrade: `0xf881cec132d8bd2576472882cfd0b617634c411080c15b6d93164a41e338dc0f`
- TeamRegistry init: `0x3d924627d11b1582a398d57f51a930126bc99875c6eb6f92e5c6f728fc22e117`
- Runtime validation upgrade: `0x6b65c7e356ad23b6312926ad9cdc797062fb5196107fb466b73f2a633129805e`
- Grant expiry upgrade: `0x36f5c95503e84c8d76ed6643872b63cdf6f43253fff53156afbc1ba52077c876`
- GrantExpiryIndex init: `0x5c28c1337853bf786fa6ae2ab18cf6dee47537d6dabd3869c6d5298a944ce853`
- Split grant expiry v3 upgrade: `0xd376808d5e3060ed63c911503361353fbdb8d1c3a3159f54002099968d753e0d`
- Preset grant expiry v4 upgrade: `0xdc77e9c029de49b4a082c167c54854898e4c188867255cb35513e73dd888f0d2`
- One-step timed grant v5 upgrade: `0x65f1b160a4e60a4ff3d24a896f50e4d47610b0009c4b9f9b98675a5199764087`
- Flat expiry ledger v6 upgrade: `0x1c19b99cefdfa19d18393138185213e0cbce02ecdc2344d90dfe3591fefbe590`
- GrantExpiryLedger init: `0x82255de2fd544cfd145a63c2d7311e23bbb1e70d022eab34b333f5e4a999e395`
- Flat expiry ledger smoke test grant: `0xa50ac9ea1bc892da20bf828d5f098b7386be51efc9688b948e11fef0f4f96a03`

Current source version: `module_version() == 6`.

## Required End-to-End Test

1. Upload a new encrypted file as owner.
2. Confirm the receipt shows `chain registered`.
3. Open file details and grant access to a second wallet.
4. Copy the grant JSON and access code.
5. Connect as the recipient wallet.
6. Import the grant under `Shared`.
7. Download the shared file.
8. Reconnect as owner and revoke the recipient.
9. Reconnect as recipient and confirm download is blocked by the on-chain grant check.
