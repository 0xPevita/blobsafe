'use client'

import { useCallback, useRef, useState } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { Lock, Upload, ShieldCheck } from 'lucide-react'
import { useUpload } from '@/hooks/useUpload'
import { useFileStore } from '@/store/useFileStore'
import { formatFileSize } from '@/lib/shelby'

export function FileUpload() {
  const { connected } = useWallet()
  const { uploadFiles, isUploading } = useUpload()
  const uploadQueue = useFileStore(s => s.uploadQueue)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (files: File[]) => { if (files.length) uploadFiles(files) },
    [uploadFiles]
  )

  const currentUpload = uploadQueue[0] ?? null

  return (
    <div
      className={`
        relative rounded border-2 border-dashed p-8 text-center cursor-pointer
        transition-all duration-150
        ${isDragging
          ? 'border-[var(--acid)] bg-[var(--acid-glow)]'
          : 'border-[var(--border2)] hover:border-[var(--acid-dim)] hover:bg-[var(--acid-glow)]'
        }
      `}
      onClick={() => !isUploading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        handleFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
        disabled={isUploading}
      />

      {isUploading && currentUpload ? (
        <div className="space-y-3">
          {/* Spinning lock */}
          <div className="mx-auto w-10 h-10 flex items-center justify-center">
            <Lock
              size={28}
              className="animate-encrypt text-[var(--acid)]"
            />
          </div>

          {/* Stage label */}
          <p className="font-mono text-xs tracking-widest uppercase text-[var(--acid)]">
            {currentUpload.stage === 'encrypting' && '[ SEALING... ]'}
            {currentUpload.stage === 'uploading' && '[ STORING ON SHELBY... ]'}
            {currentUpload.stage === 'confirming' && '[ CONFIRMING ON-CHAIN... ]'}
          </p>

          <p className="text-xs text-[var(--text-muted)] truncate max-w-[220px] mx-auto font-mono">
            {currentUpload.fileName}
          </p>

          {/* Progress bar */}
          <div className="w-full h-px bg-[var(--border)] overflow-hidden">
            <div
              className="h-full bg-[var(--acid)] transition-all duration-100"
              style={{ width: `${currentUpload.progress}%` }}
            />
          </div>

          <p className="font-mono text-xs text-[var(--text-dim)]">
            {currentUpload.progress}%
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <ShieldCheck size={28} className="mx-auto text-[var(--text-dim)]" />
          <p className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted)]">
            {connected ? 'Drop files to seal and store' : 'Connect wallet to seal files'}
          </p>
          <p className="text-[11px] text-[var(--text-dim)]">
            AES-256-GCM · Shelby Network · Any file type
          </p>
        </div>
      )}
    </div>
  )
}
