import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { FaUniversity, FaArrowRight, FaEye, FaEyeSlash, FaLock, FaEnvelope, FaChevronDown, FaArrowLeft, FaCheckCircle } from 'react-icons/fa'
import { api } from '../lib/api'

const schema = z.object({
  college: z.string().min(1, 'Select college'),
  email: z.string().email('Enter a valid institutional email address'),
  password: z.string().min(1, 'Password required'),
})

type FormData = z.infer<typeof schema>
const COLLEGES = [{ id: '1', name: 'Demo College' }]

export default function Login() {
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSuccess, setForgotSuccess] = useState('')
  const [forgotError, setForgotError] = useState('')

  const { user, login, loading } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { college: '1', email: '', password: '' },
  })

  useEffect(() => {
    if (!loading && user) navigate('/dashboard')
  }, [loading, user, navigate])

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await login(data.email, data.password, data.college)
      navigate('/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed. Please try again.')
    }
  }

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError('')
    setForgotSuccess('')
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your institutional email address.')
      return
    }
    setForgotSubmitting(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email: forgotEmail.trim() })
      setForgotSuccess(data.message || 'If your institutional email is registered in the system, you will receive a password reset link shortly.')
    } catch (err: any) {
      setForgotError(err?.response?.data?.detail || 'Failed to submit password reset request. Please try again.')
    } finally {
      setForgotSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="FacultyEval introduction">
        <div className="login-story-top">
          <div className="login-brand-mark"><FaUniversity /></div>
          <div><span className="login-brand-name">Faculty<span>Eval</span></span><span className="login-brand-sub">ACADEMIC RECORDS PLATFORM</span></div>
        </div>

        <div className="story-content">
          <div className="eyebrow"><span /> ACADEMIC YEAR 2026</div>
          <h1>A year's work.<br /><em>Clearly</em> accounted for.</h1>
          <p>A considered space to document teaching, research and the work that strengthens an institution.</p>
          <div className="story-rule" />
          <div className="story-footnote"><span>01</span><span>TEACHING</span><i /> <span>02</span><span>RESEARCH</span><i /> <span>03</span><span>INSTITUTION</span></div>
        </div>

        <div className="login-story-bottom">
          <span>BUILT FOR ACADEMIC ACCOUNTABILITY</span>
          <span>01 — 03</span>
        </div>
        <div className="story-orbit story-orbit-one" />
        <div className="story-orbit story-orbit-two" />
      </section>

      <section className="login-panel">
        <div className="login-panel-top"><span>INSTITUTIONAL ACCESS</span><span className="secure-label"><FaLock /> SECURE SIGN IN</span></div>
        <div className="login-box">
          {isForgotPassword ? (
            <div>
              <div className="login-heading-index">ACCOUNT RECOVERY <span> / 2026</span></div>
              <h2 className="login-title">Reset your<br /><em>password.</em></h2>
              <p className="login-subtitle">Enter your registered institutional email to receive a secure reset link.</p>

              {forgotSuccess ? (
                <div style={{ padding: '1rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    <FaCheckCircle style={{ color: '#059669' }} /> Reset Link Dispatched
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{forgotSuccess}</div>
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setForgotSuccess(''); setForgotEmail(''); }}
                    className="btn btn-primary btn-block"
                    style={{ marginTop: '1rem' }}
                  >
                    <FaArrowLeft style={{ marginRight: '0.5rem' }} /> Return to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="login-form">
                  <div className="form-group">
                    <label className="form-label" htmlFor="forgot-email">REGISTERED EMAIL ADDRESS</label>
                    <div className="login-field">
                      <FaEnvelope className="field-icon" />
                      <input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="input"
                        placeholder="name@institution.edu"
                        required
                      />
                    </div>
                  </div>

                  {forgotError && <div className="login-error" role="alert">{forgotError}</div>}

                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="btn btn-primary btn-block btn-lg login-submit"
                    style={{ marginTop: '0.5rem' }}
                  >
                    <span>{forgotSubmitting ? 'Sending Link…' : 'Send Reset Link'}</span>
                    <FaArrowRight />
                  </button>

                  <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setForgotError(''); setForgotSuccess(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <FaArrowLeft /> Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div>
              <div className="login-heading-index">WELCOME BACK <span> / 2026</span></div>
              <h2 className="login-title">Sign in to your<br /><em>workspace.</em></h2>
              <p className="login-subtitle">Use your institutional credentials to continue.</p>

              <form onSubmit={handleSubmit(onSubmit)} className="login-form">
                <div className="form-group">
                  <label className="form-label" htmlFor="college">INSTITUTION</label>
                  <div className="login-field select-field">
                    <FaUniversity className="field-icon" />
                    <select id="college" {...register('college')} className="input">
                      {COLLEGES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <FaChevronDown className="select-chevron" />
                  </div>
                  {errors.college && <p className="form-error">{errors.college.message}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="email">EMAIL ADDRESS</label>
                  <div className="login-field">
                    <FaEnvelope className="field-icon" />
                    <input id="email" type="text" autoComplete="username" {...register('email')} className="input" placeholder="name@institution.edu" />
                  </div>
                  {errors.email && <p className="form-error">{errors.email.message}</p>}
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" htmlFor="password" style={{ marginBottom: 0 }}>PASSWORD</label>
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setError(''); setForgotError(''); setForgotSuccess(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="login-field" style={{ marginTop: '0.35rem' }}>
                    <FaLock className="field-icon" />
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} className="input" placeholder="Enter your password" />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {errors.password && <p className="form-error">{errors.password.message}</p>}
                </div>

                {error && <div className="login-error" role="alert">{error}</div>}
                <button type="submit" disabled={isSubmitting || loading} className="btn btn-primary btn-block btn-lg login-submit">
                  <span>{isSubmitting ? 'Signing in…' : 'Enter workspace'}</span><FaArrowRight />
                </button>
              </form>
            </div>
          )}
          <div className="login-assurance"><span className="assurance-mark">✓</span><span>Your session is protected and your records remain institutionally managed.</span></div>
        </div>
        <div className="login-panel-bottom"><span>FACULTY PERFORMANCE EVALUATION</span><span>© 2026</span></div>
      </section>
    </main>
  )
}
