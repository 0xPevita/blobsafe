'use client'

import { useFileStore } from '@/store/useFileStore'
import { formatFileSize } from '@/lib/shelby'
import { Shield, HardDrive, FolderOpen, Lock } from 'lucide-react'

export function StatsBar() {
  const getStats = useFileStore(s => s.getStats)
  const stats = getStats()

  const items = [
    { icon: <Lock size={13} />, label: 'Encrypted', value: stats.totalEncrypted.toString() },
    { icon: <HardDrive size={13} />, label: 'Stored', value: formatFileSize(stats.totalSize) },
    { icon: <FolderOpen size={13} />, label: 'Folders', value: stats.folders.toString() },
    { icon: <Shield size={13} />, label: 'Protocol', value: 'AES-256-GCM' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)]">
      {items.map((item, i) => (
        <div key={i} className="bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
          <span className="text-[var(--text-dim)]">{item.icon}</span>
          <div>
            <p className="font-mono text-[10px] text-[var(--text-dim)] uppercase tracking-widest">
              {item.label}
            </p>
            <p className="font-mono text-xs text-[var(--text)] font-medium">
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
