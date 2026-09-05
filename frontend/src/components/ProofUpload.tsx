import { useState, useRef, useEffect } from 'react'
import { api } from '../lib/api'

interface ProofUploadProps {
  value?: string
  onChange: (url: string) => void
  prefix?: string
  disabled?: boolean
  className?: string
  mode?: 'scopus' | 'file'
}

const PUBLICATION_REGEX = /^(https?:\/\/.+|10\.\d{4,9}\/\S+)$/i

export default function ProofUpload({
  value,
  onChange,
  prefix = '',
  disabled,
  className = '',
  mode = 'file',
}: ProofUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUrl(value ?? '')
  }, [value])

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
      onChange('')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const fileName = value ? value.split('/').pop()?.split('?')[0] : null

  const handleScopusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setUrl(next)
    const trimmed = next.trim()
    if (!trimmed) {
      setError('')
      onChange('')
      return
    }
    if (!PUBLICATION_REGEX.test(trimmed)) {
      setError('Enter a valid DOI or publication URL')
      onChange('')
      return
    }
    setError('')
    onChange(trimmed)
  }

  return (
    <div className={`proof-upload ${className}`}>
      {mode === 'scopus' ? (
        <div className="proof-upload-row" style={{ width: '100%' }}>
          <input
            type="url"
            className="input"
            style={{ width: '100%' }}
            placeholder="https://www.scopus.com/..."
            value={url}
            onChange={handleScopusChange}
            disabled={disabled}
          />
        </div>
      ) : (
        <>
          <div className="proof-upload-row">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              onChange={handleFile}
              disabled={disabled || uploading}
            />
            {uploading && <span className="loading-text">Uploading…</span>}
          </div>
          {fileName && <span className="proof-filename" title={value}>{fileName}</span>}
        </>
      )}
      {error && <span className="proof-error">{error}</span>}
    </div>
  )
}
