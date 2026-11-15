import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { FaUniversity, FaArrowRight, FaEye, FaEyeSlash, FaLock, FaEnvelope, FaChevronDown } from 'react-icons/fa'

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
              <label className="form-label" htmlFor="password">PASSWORD</label>
              <div className="login-field">
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
          <div className="login-assurance"><span className="assurance-mark">✓</span><span>Your session is protected and your records remain institutionally managed.</span></div>
        </div>
        <div className="login-panel-bottom"><span>FACULTY PERFORMANCE EVALUATION</span><span>© 2026</span></div>
      </section>
    </main>
  )
}
