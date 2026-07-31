/**
 * Wallet-scoped vault UI state.
 *
 * Shelby blobs and on-chain access are the source of truth. This store only
 * keeps local UI state such as virtual folders and optimistic upload rows.
 */

import { create } from "zustand";
import type { UploadProgress, VaultFile, VaultFolder, VaultStats } from "@/types";
import { getNetworkScopedStorageKey, SHELBY_NETWORK_NAME } from "@/lib/shelby";

const STORAGE_PREFIX = "blobsafe-vault";
const LEGACY_RECEIPTS_KEY = "blobsafe-file-receipts";

interface FileStore {
  accountScope: string;
  files: VaultFile[];
  folders: VaultFolder[];
  folderOverrides: Record<string, string>;
  activeFolder: string;
  uploadQueue: UploadProgress[];

  setAccountScope: (account?: string) => void;
  addFile: (file: VaultFile) => void;
  updateFile: (id: string, updates: Partial<VaultFile>) => void;
  removeFile: (id: string) => void;
  createFolder: (name: string) => void;
  renameFolder: (path: string, name: string) => void;
  deleteFolder: (path: string, blobNames?: string[]) => void;
  moveBlobToFolder: (blobName: string, folder: string) => void;
  getFolderForBlob: (blobName: string, fallbackFolder: string) => string;
  setActiveFolder: (folder: string) => void;
  setUploadProgress: (progress: UploadProgress) => void;
  clearUploadProgress: (fileId: string) => void;
  getStats: () => VaultStats;
  getFilesByFolder: (folder: string) => VaultFile[];
}

type PersistedVaultState = {
  files: VaultFile[];
  folders: VaultFolder[];
  folderOverrides?: Record<string, string>;
  activeFolder: string;
};

type LegacyZustandPersistState = {
  state?: Partial<PersistedVaultState>;
};

const rootFolder = (): VaultFolder => ({
  path: "/",
  name: "vault",
  fileCount: 0,
  totalSize: 0,
  createdAt: new Date().toISOString(),
});

const emptyScopedState = (): PersistedVaultState => ({
  files: [],
  folders: [rootFolder()],
  folderOverrides: {},
  activeFolder: "/",
});

const normalizeAccount = (account?: string) => account?.trim().toLowerCase() || "";

const legacyStorageKey = (account?: string) => {
  const normalized = normalizeAccount(account);
  return normalized ? `${STORAGE_PREFIX}:${normalized}` : STORAGE_PREFIX;
};

const storageKey = (account?: string) =>
  getNetworkScopedStorageKey(STORAGE_PREFIX, account);

const migrationKey = (account: string) => `${STORAGE_PREFIX}:${SHELBY_NETWORK_NAME}:legacy-migrated:${account}`;

const coercePersistedState = (value: unknown): PersistedVaultState => {
  const maybePersisted = value as Partial<PersistedVaultState> | LegacyZustandPersistState | null;
  const rawState = "state" in (maybePersisted ?? {})
    ? (maybePersisted as LegacyZustandPersistState).state
    : maybePersisted as Partial<PersistedVaultState> | null;

  return {
    files: Array.isArray(rawState?.files) ? rawState.files : [],
    folders: Array.isArray(rawState?.folders) && rawState.folders.length > 0
      ? rawState.folders
      : [rootFolder()],
    folderOverrides: rawState?.folderOverrides && typeof rawState.folderOverrides === "object"
      ? rawState.folderOverrides as Record<string, string>
      : {},
    activeFolder: typeof rawState?.activeFolder === "string" ? rawState.activeFolder : "/",
  };
};

const readScopedState = (account?: string): PersistedVaultState => {
  try {
    const stored = window.localStorage.getItem(storageKey(account));
    if (!stored) {
      const legacyStored = SHELBY_NETWORK_NAME === "shelbynet"
        ? window.localStorage.getItem(legacyStorageKey(account))
        : null;
      return legacyStored ? coercePersistedState(JSON.parse(legacyStored)) : emptyScopedState();
    }

    return coercePersistedState(JSON.parse(stored));
  } catch {
    return emptyScopedState();
  }
};

const hasUserState = (state: PersistedVaultState) =>
  state.files.length > 0 ||
  state.folders.some((folder) => folder.path !== "/");

const maybeMigrateLegacyState = (account: string, scoped: PersistedVaultState) => {
  const sanitizedScoped = sanitizePossiblyBadMigration(account, scoped);
  if (!account || hasUserState(scoped) || window.localStorage.getItem(migrationKey(account))) {
    return sanitizedScoped;
  }

  const legacy = readScopedState();
  if (!hasUserState(legacy)) return scoped;

  const matchingFolders = readLegacyReceiptFolders(account);
  if (matchingFolders.size === 0) return scoped;

  const migratedFolders = [
    rootFolder(),
    ...legacy.folders.filter((folder) => folder.path !== "/" && matchingFolders.has(folder.path)),
  ];

  const migratedState: PersistedVaultState = {
    files: [],
    folders: migratedFolders,
    folderOverrides: {},
    activeFolder: matchingFolders.has(legacy.activeFolder) ? legacy.activeFolder : "/",
  };

  writeScopedState(account, migratedState);
  window.localStorage.setItem(migrationKey(account), new Date().toISOString());
  return migratedState;
};

const sanitizePossiblyBadMigration = (account: string, scoped: PersistedVaultState) => {
  if (!account || !window.localStorage.getItem(migrationKey(account)) || !hasUserState(scoped)) {
    return scoped;
  }

  const matchingFolders = readLegacyReceiptFolders(account);
  if (matchingFolders.size > 0) return scoped;

  const cleaned = emptyScopedState();
  writeScopedState(account, cleaned);
  return cleaned;
};

const writeScopedState = (account: string, state: PersistedVaultState) => {
  if (!account) return;
  window.localStorage.setItem(storageKey(account), JSON.stringify(state));
};

const readLegacyReceiptFolders = (account: string) => {
  const folders = new Set<string>();
  try {
    const stored = window.localStorage.getItem(LEGACY_RECEIPTS_KEY);
    if (!stored) return folders;

    const parsed = JSON.parse(stored) as Record<string, { account?: string; folder?: string }>;
    for (const receipt of Object.values(parsed)) {
      if (normalizeAccount(receipt?.account) === account && receipt?.folder) {
        folders.add(receipt.folder);
      }
    }
  } catch {
    return folders;
  }
  return folders;
};

export const useFileStore = create<FileStore>()((set, get) => ({
  accountScope: "",
  files: [],
  folders: [rootFolder()],
  folderOverrides: {},
  activeFolder: "/",
  uploadQueue: [],

  setAccountScope: (account) => {
    const nextScope = normalizeAccount(account);
    if (get().accountScope === nextScope) return;

    const scoped = maybeMigrateLegacyState(nextScope, readScopedState(nextScope));
    set({
      accountScope: nextScope,
      files: scoped.files,
      folders: scoped.folders,
      folderOverrides: scoped.folderOverrides ?? {},
      activeFolder: scoped.activeFolder,
      uploadQueue: [],
    });
  },

  addFile: (file) => {
    set((state) => {
      const files = [file, ...state.files];
      const existingFolder = state.folders.find((folder) => folder.path === file.folder);
      const folders = existingFolder
        ? state.folders.map((folder) =>
            folder.path === file.folder
              ? { ...folder, fileCount: folder.fileCount + 1, totalSize: folder.totalSize + file.size }
              : folder
          )
        : [
            ...state.folders,
            {
              path: file.folder,
              name: file.folder.split("/").filter(Boolean).pop() ?? file.folder,
              fileCount: 1,
              totalSize: file.size,
              createdAt: new Date().toISOString(),
            },
          ];

      writeScopedState(state.accountScope, {
        files,
        folders,
        folderOverrides: state.folderOverrides,
        activeFolder: state.activeFolder,
      });
      return { files, folders };
    });
  },

  updateFile: (id, updates) => {
    set((state) => {
      const files = state.files.map((file) => file.id === id ? { ...file, ...updates } : file);
      writeScopedState(state.accountScope, {
        files,
        folders: state.folders,
        folderOverrides: state.folderOverrides,
        activeFolder: state.activeFolder,
      });
      return { files };
    });
  },

  removeFile: (id) => {
    set((state) => {
      const files = state.files.filter((file) => file.id !== id);
      writeScopedState(state.accountScope, {
        files,
        folders: state.folders,
        folderOverrides: state.folderOverrides,
        activeFolder: state.activeFolder,
      });
      return { files };
    });
  },

  createFolder: (name) => {
    const folderName = name
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._ -]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    if (!folderName) return;

    const path = `/${folderName}`;
    set((state) => {
      const folders = state.folders.some((folder) => folder.path === path)
        ? state.folders
        : [
            ...state.folders,
            {
              path,
              name: folderName,
              fileCount: 0,
              totalSize: 0,
              createdAt: new Date().toISOString(),
            },
          ];

      writeScopedState(state.accountScope, {
        files: state.files,
        folders,
        folderOverrides: state.folderOverrides,
        activeFolder: path,
      });
      return { activeFolder: path, folders };
    });
  },

  renameFolder: (path, name) => {
    if (path === "/") return;
    const folderName = sanitizeFolderName(name);
    if (!folderName) return;
    const nextPath = `/${folderName}`;

    set((state) => {
      if (state.folders.some((folder) => folder.path === nextPath && folder.path !== path)) {
        return {};
      }

      const folders = state.folders.map((folder) =>
        folder.path === path
          ? { ...folder, path: nextPath, name: folderName }
          : folder
      );
      const folderOverrides = Object.fromEntries(
        Object.entries(state.folderOverrides).map(([blobName, folderPath]) => [
          blobName,
          folderPath === path ? nextPath : folderPath,
        ])
      );
      const activeFolder = state.activeFolder === path ? nextPath : state.activeFolder;

      writeScopedState(state.accountScope, {
        files: state.files,
        folders,
        folderOverrides,
        activeFolder,
      });
      return { folders, folderOverrides, activeFolder };
    });
  },

  deleteFolder: (path, blobNames = []) => {
    if (path === "/") return;

    set((state) => {
      const folders = state.folders.filter((folder) => folder.path !== path);
      const folderOverrides = { ...state.folderOverrides };
      for (const blobName of blobNames) {
        folderOverrides[blobName] = "/";
      }
      for (const [blobName, folderPath] of Object.entries(folderOverrides)) {
        if (folderPath === path) {
          folderOverrides[blobName] = "/";
        }
      }
      const activeFolder = state.activeFolder === path ? "/" : state.activeFolder;

      writeScopedState(state.accountScope, {
        files: state.files,
        folders,
        folderOverrides,
        activeFolder,
      });
      return { folders, folderOverrides, activeFolder };
    });
  },

  moveBlobToFolder: (blobName, folder) => {
    set((state) => {
      const folderPath = folder || "/";
      const folderName = folderPath === "/" ? "vault" : folderPath.split("/").filter(Boolean).pop() ?? folderPath;
      const folders = state.folders.some((item) => item.path === folderPath)
        ? state.folders
        : [
            ...state.folders,
            {
              path: folderPath,
              name: folderName,
              fileCount: 0,
              totalSize: 0,
              createdAt: new Date().toISOString(),
            },
          ];
      const folderOverrides = { ...state.folderOverrides, [blobName]: folderPath };

      writeScopedState(state.accountScope, {
        files: state.files,
        folders,
        folderOverrides,
        activeFolder: state.activeFolder,
      });
      return { folders, folderOverrides };
    });
  },

  getFolderForBlob: (blobName, fallbackFolder) =>
    get().folderOverrides[blobName] ?? fallbackFolder,

  setActiveFolder: (folder) => {
    set((state) => {
      writeScopedState(state.accountScope, {
        files: state.files,
        folders: state.folders,
        folderOverrides: state.folderOverrides,
        activeFolder: folder,
      });
      return { activeFolder: folder };
    });
  },

  setUploadProgress: (progress) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.some((item) => item.fileId === progress.fileId)
        ? state.uploadQueue.map((item) => item.fileId === progress.fileId ? progress : item)
        : [...state.uploadQueue, progress],
    }));
  },

  clearUploadProgress: (fileId) => {
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((item) => item.fileId !== fileId),
    }));
  },

  getStats: () => {
    const { files, folders } = get();
    return {
      totalFiles: files.length,
      totalSize: files.reduce((acc, file) => acc + file.size, 0),
      totalEncrypted: files.filter((file) => file.status === "confirmed").length,
      folders: folders.length,
      lastUpload: files.length > 0 ? files[0].uploadedAt : null,
    };
  },

  getFilesByFolder: (folder) => get().files.filter((file) => file.folder === folder),
})); 

function sanitizeFolderName(name: string) {
  return name
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
