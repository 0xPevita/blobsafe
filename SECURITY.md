# Security Policy

## Supported Versions

BlobSafe is currently in active development on Shelby testnet.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes    |

---

## Encryption Model

BlobSafe uses a client-side encryption model. Here is what this means in practice:

**What is encrypted:**
- All file contents are encrypted locally using AES-256-GCM before upload
- Encryption keys are derived from the user's Aptos private key via PBKDF2
- The IV (initialization vector) is randomly generated per file

**What is NOT encrypted:**
- Blob names / file paths (stored as plaintext on Shelby)
- File size and expiration metadata (stored on Aptos blockchain)
- Upload/download timestamps

**Zero-knowledge principle:**
- BlobSafe servers never handle encryption keys
- Decryption can only happen in the user's browser with their wallet
- Losing your Aptos private key means losing access to encrypted files permanently

---

## Known Limitations

- **No forward secrecy** - all files encrypted with keys derived from the same wallet
- **Metadata leakage** - file names and sizes are visible on-chain
- **Testnet only** - not audited for production use

---

## Reporting a Vulnerability

If you discover a security vulnerability in BlobSafe, please do NOT open a public issue.

Instead, report it privately via:

- **Twitter DM:** [@ohmypevita](https://x.com/ohmypevita)
- **Telegram:** [@ohmypevita](https://t.me/ohmypevita)

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and credit you in the fix.

---

*BlobSafe is experimental software. Use on testnet only.*
