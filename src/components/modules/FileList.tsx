'use client'

import { useFileStore } from '@/store/useFileStore'
import { formatFileSize, getFileIcon, getExplorerUrl, shortenAddress } from '@/lib/shelby'
import { Shield, ExternalLink, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function FileList() {
  const { files, activeFolder } = useFileStore()
  const folderFiles = files.filter(f => f.folder === activeFolder)

  if (folderFiles.length === 0) {
    return (
      <div className="border border-[var(--border)] rounded p-8 text-center">
        <Shield size={24} className="mx-auto text-[var(--text-dim)] mb-3" />
        <p className="font-mono text-xs text-[var(--text-muted)] tracking-wider uppercase">
          No sealed files yet
        </p>
        <p className="text-[11px] text-[var(--text-dim)] mt-1">
          Seal a file to create the first Shelby blob
        </p>
      </div>
    )
  }

  return (
    <div className="border border-[var(--border)] rounded overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_80px_120px_32px] gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
        {['FILE', 'SIZE', 'STATUS', 'UPLOADED', ''].map((h, i) => (
          <span key={i} className="font-mono text-[10px] tracking-widest text-[var(--text-dim)] uppercase">
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-[var(--border)]">
        {folderFiles.map(file => (
          <div
            key={file.id}
            className="grid grid-cols-[1fr_80px_80px_120px_32px] gap-3 px-4 py-3 items-center hover:bg-[var(--card-hover)] transition-colors animate-fade-in-up"
          >
            {/* Name */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">{getFileIcon(file.mimeType)}</span>
              <span className="font-mono text-xs text-[var(--text)] truncate">
                {file.name}
              </span>
              {file.status === 'confirmed' && (
                <span className="shrink-0 text-[10px] font-mono text-[var(--acid)] border border-[var(--acid)] border-opacity-30 px-1 rounded">
                  ENC
                </span>
              )}
            </div>

            {/* Size */}
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {formatFileSize(file.size)}
            </span>

            {/* Status */}
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${
                file.status === 'confirmed' ? 'bg-[var(--green)]' :
                file.status === 'error' ? 'bg-[var(--red)]' :
                'bg-[var(--amber)] animate-pulse'
              }`} />
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                {file.status}
              </span>
            </div>

            {/* Time */}
            <div className="flex items-center gap-1 text-[var(--text-dim)]">
              <Clock size={10} />
              <span className="font-mono text-[10px]">
                {formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}
              </span>
            </div>

            {/* Explorer link */}
            <div className="flex justify-end">
              {file.txHash && (
                <a
                  href={getExplorerUrl('tx', file.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--text-dim)] hover:text-[var(--acid)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
