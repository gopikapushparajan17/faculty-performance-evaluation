import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FaUniversity, FaLock, FaArrowRight, FaEye, FaEyeSlash, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa'
import { api } from '../lib/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!token) {
      setVerifying(false)
      setTokenValid(false)
      setTokenError('Password reset token is missing or incomplete.')
      return
    }

    const checkToken = async () => {
      try {
        await api.get(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
        setTokenValid(true)
      } catch (err: any) {
        setTokenValid(false)
        setTokenError(err?.response?.data?.detail || 'This password reset link is invalid, expired, or has already been used.')
      } finally {
        setVerifying(false)
      }
    }

    checkToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!password) {
      setError('Please enter a new password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/reset-password', {
        token,
        new_password: password,
      })
      setSuccess(data.message || 'Password has been successfully updated.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update password. Please check your link or try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="FacultyEval introduction">
        <div className="login-story-top">
          <div className="login-brand-mark"><FaUniversity /></div>
          <div>
            <span className="login-brand-name">Faculty<span>Eval</span></span>
            <span className="login-brand-sub">ACADEMIC RECORDS PLATFORM</span>
          </div>
        </div>
        <div className="story-content">
          <div className="eyebrow"><span /> SECURITY PORTAL</div>
          <h1>Create your<br /><em>new</em> credentials.</h1>
          <p>Set a strong institutional password to protect your faculty performance evaluation records.</p>
          <div className="story-rule" />
        </div>
        <div className="login-story-bottom">
          <span>BUILT FOR ACADEMIC ACCOUNTABILITY</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-top">
          <span>PASSWORD RECOVERY</span>
          <span className="secure-label"><FaLock /> SECURE TOKEN</span>
        </div>

        <div className="login-box">
          <div className="login-heading-index">SECURITY <span> / 2026</span></div>
          <h2 className="login-title">Choose a new<br /><em>password.</em></h2>
          <p className="login-subtitle">Enter and confirm your new institutional account password.</p>

          {verifying ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              Verifying security token…
            </div>
          ) : !tokenValid ? (
            <div style={{ padding: '1.25rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                <FaExclamationTriangle style={{ color: '#dc2626' }} /> Invalid or Expired Link
              </div>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
                {tokenError}
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="btn btn-primary btn-block"
                style={{ marginTop: '1.25rem' }}
              >
                Return to Sign In
              </button>
            </div>
          ) : success ? (
            <div style={{ padding: '1.25rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                <FaCheckCircle style={{ color: '#059669' }} /> Password Updated
              </div>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
                {success}
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="btn btn-primary btn-block btn-lg"
                style={{ marginTop: '1.25rem' }}
              >
                Sign In Now <FaArrowRight style={{ marginLeft: '0.5rem' }} />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">NEW PASSWORD</label>
                <div className="login-field">
                  <FaLock className="field-icon" />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="Enter new password (min. 6 characters)"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">CONFIRM NEW PASSWORD</label>
                <div className="login-field">
                  <FaLock className="field-icon" />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {error && <div className="login-error" role="alert">{error}</div>}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary btn-block btn-lg login-submit"
                style={{ marginTop: '0.5rem' }}
              >
                <span>{submitting ? 'Updating Password…' : 'Update Password'}</span>
                <FaArrowRight />
              </button>

              <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  Cancel and Return to Sign In
                </button>
              </div>
            </form>
          )}

          <div className="login-assurance">
            <span className="assurance-mark">✓</span>
            <span>Passwords are securely hashed and encrypted.</span>
          </div>
        </div>

        <div className="login-panel-bottom">
          <span>FACULTY PERFORMANCE EVALUATION</span>
          <span>© 2026</span>
        </div>
      </section>
    </main>
  )
}
