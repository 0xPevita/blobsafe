# Contributing to BlobSafe

Thank you for your interest in contributing to BlobSafe! This document outlines
how to get started and what we expect from contributors.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env.local` and fill in your API keys
5. Run the dev server: `npm run dev`

## Development Guidelines

- All code must be written in TypeScript
- Components go in `src/components/`
- Utility functions go in `src/lib/`
- Follow existing code style and naming conventions

## Commit Message Format

Use clear, descriptive commit messages:
```
feat: add file download with decryption
fix: handle upload error for large files
docs: update README with S3 gateway setup
refactor: extract encryption logic to separate module
```

## Areas We Need Help

- [ ] File download with client-side decryption
- [ ] Team workspace / multi-user access
- [ ] Mobile-responsive UI improvements
- [ ] Unit tests for encryption module
- [ ] Integration tests for Shelby SDK calls
- [ ] S3 Gateway setup documentation

## Pull Request Process

1. Create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Test thoroughly
4. Submit a PR with a clear description of what changed and why

## Questions?

Open an issue or reach out on Twitter [@ohmypevita](https://x.com/ohmypevita)
