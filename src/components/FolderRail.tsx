import { useEffect, useMemo, useState } from "react";
import { Check, Folder, FolderOpen, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { getBlobFolderPath } from "@/lib/shelby";
import { useFileStore } from "@/store/useFileStore";

interface FolderRailProps {
  blobNames?: string[];
  compact?: boolean;
  accountAddress?: string;
}

export function FolderRail({ blobNames = [], compact = false, accountAddress }: FolderRailProps) {
  const folders = useFileStore((state) => state.folders);
  const activeFolder = useFileStore((state) => state.activeFolder);
  const setActiveFolder = useFileStore((state) => state.setActiveFolder);
  const createFolder = useFileStore((state) => state.createFolder);
  const renameFolder = useFileStore((state) => state.renameFolder);
  const deleteFolder = useFileStore((state) => state.deleteFolder);
  const setAccountScope = useFileStore((state) => state.setAccountScope);
  const [isCreating, setIsCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setAccountScope(accountAddress);
  }, [accountAddress, setAccountScope]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const blobName of blobNames) {
      const folderPath = getBlobFolderPath(blobName);
      map.set(folderPath, (map.get(folderPath) ?? 0) + 1);
    }
    return map;
  }, [blobNames]);

  const visibleFolders = useMemo(() => {
    const merged = new Map(folders.map((folder) => [folder.path, folder]));

    for (const path of counts.keys()) {
      if (!merged.has(path)) {
        merged.set(path, {
          path,
          name: path === "/" ? "vault" : path.split("/").filter(Boolean).pop() ?? path,
          fileCount: counts.get(path) ?? 0,
          totalSize: 0,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      if (a.path === "/") return -1;
      if (b.path === "/") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [counts, folders]);

  const submitFolder = () => {
    const nextName = folderName.trim();
    if (!nextName) return;
    createFolder(nextName);
    setFolderName("");
    setIsCreating(false);
  };

  const beginRename = (path: string, name: string) => {
    setMenuPath(null);
    setRenamingPath(path);
    setRenameValue(name);
  };

  const submitRename = () => {
    if (!renamingPath) return;
    renameFolder(renamingPath, renameValue);
    setRenamingPath(null);
    setRenameValue("");
  };

  const submitDelete = (path: string) => {
    const namesInFolder = blobNames.filter((blobName) =>
      getBlobFolderPath(blobName) === path
    );
    deleteFolder(path, namesInFolder);
    setMenuPath(null);
  };

  return (
    <section className={`folder-rail premium-surface rounded-2xl ${menuPath ? "is-menu-open" : ""} ${compact ? "p-4" : "p-5"}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-frost-muted">
            destination
          </p>
          <p className="mt-1 font-display text-lg font-semibold tracking-[-0.025em] text-frost">
            Choose vault folder
          </p>
          <p className="mt-1 max-w-xl text-sm leading-5 text-frost-muted">
            New files are sealed into the selected wallet-owned namespace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating((current) => !current)}
          className="themed-secondary inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-acid/30"
          aria-label={isCreating ? "Cancel folder creation" : "Create vault folder"}
        >
          {isCreating ? <X size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {isCreating && (
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitFolder();
              if (event.key === "Escape") setIsCreating(false);
            }}
            placeholder="client-reports"
            className="min-h-10 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-frost outline-none transition-colors placeholder:text-frost-muted focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-acid/20"
          />
          <button
            type="button"
            onClick={submitFolder}
            className="premium-button inline-flex min-h-10 items-center justify-center rounded-lg px-4 font-display text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-acid/40"
          >
            Create folder
          </button>
        </div>
      )}

      <div className={`folder-list flex gap-2 pb-1 lg:grid lg:grid-cols-1 lg:pb-0 ${menuPath ? "overflow-visible" : "overflow-x-auto lg:overflow-visible"}`}>
        {visibleFolders.map((folder) => {
          const active = activeFolder === folder.path;
          const Icon = active ? FolderOpen : Folder;
          const count = counts.get(folder.path) ?? 0;
          const isRenaming = renamingPath === folder.path;

          return (
            <div
              key={folder.path}
              className="relative min-w-[210px] lg:min-w-0"
            >
              <div
                className={`folder-row group grid min-h-[62px] w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl px-3.5 text-left transition-all duration-200 ${active ? "is-active text-frost" : "text-frost-dim"}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveFolder(folder.path)}
                  className="folder-main-button grid min-w-0 grid-cols-[30px_minmax(0,1fr)] items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-acid/30"
                >
                  <span className="folder-icon flex h-8 w-8 items-center justify-center rounded-lg">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0">
                    {isRenaming ? (
                      <input
                        value={renameValue}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") submitRename();
                          if (event.key === "Escape") setRenamingPath(null);
                        }}
                        className="h-8 w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 font-mono text-xs text-frost outline-none focus:border-[var(--surface-border-strong)]"
                        autoFocus
                      />
                    ) : (
                      <span className="block truncate font-display text-base font-semibold tracking-[-0.015em]">
                        {folder.path === "/" ? "Vault root" : folder.name}
                      </span>
                    )}
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-frost-muted">
                      {folder.path}
                    </span>
                  </span>
                </button>
                <span className="folder-count rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-semibold text-frost-muted" aria-label={`${count} files`}>
                  {count}
                </span>
                {folder.path !== "/" && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isRenaming) {
                        submitRename();
                      } else {
                        setMenuPath(menuPath === folder.path ? null : folder.path);
                      }
                    }}
                    className={`folder-action-button inline-flex h-9 w-9 items-center justify-center rounded-lg text-frost-muted ${menuPath === folder.path ? "is-open" : ""}`}
                    aria-label={isRenaming ? "Save folder name" : "Folder actions"}
                  >
                    {isRenaming ? <Check size={13} /> : <MoreHorizontal size={14} />}
                  </button>
                )}
              </div>

              {menuPath === folder.path && (
                <div className="folder-action-menu absolute right-2 top-[calc(100%+8px)] z-[90] w-48 overflow-hidden rounded-xl p-1.5 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => beginRename(folder.path, folder.name)}
                    className="folder-menu-item flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-mono text-xs text-frost-dim"
                  >
                    <Pencil size={13} />
                    Rename folder
                  </button>
                  <button
                    type="button"
                    onClick={() => submitDelete(folder.path)}
                    className="folder-menu-item danger flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-mono text-xs text-danger"
                  >
                    <Trash2 size={13} />
                    Remove folder
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
