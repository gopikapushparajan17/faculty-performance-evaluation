import { useState, useRef } from 'react'
import { api } from '../lib/api'

interface ProofUploadProps {
  value?: string
  onChange: (url: string) => void
  prefix?: string
  disabled?: boolean
  className?: string
}

export default function ProofUpload({ value, onChange, prefix = '', disabled, className = '' }: ProofUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (prefix) form.append('prefix', prefix)
      const { data } = await api.post<{ url: string }>('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChange(data.url)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null
      setError(typeof msg === 'string' ? msg : msg && typeof msg === 'object' ? JSON.stringify(msg) : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const fileName = value ? value.split('/').pop()?.split('?')[0] : null

  return (
    <div className={`proof-upload ${className}`}>
      <div className="proof-upload-row">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFile}
          disabled={disabled || uploading}
        />
        {uploading && <span className="loading-text">Uploading…</span>}
      </div>
      {fileName && <span className="proof-filename" title={value}>{fileName}</span>}
      {error && <span className="proof-error">{error}</span>}
    </div>
  )
}
