import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  name:       z.string().min(2, 'Full name required'),
  email:      z.string().email('Invalid email'),
  department: z.string().min(1, 'Department required'),
  password:   z.string().min(6, 'Password must be at least 6 characters'),
  confirm:    z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

type FormData = z.infer<typeof schema>

export default function Signup() {
  const [serverError, setServerError] = useState('')
  const { user, register: registerFn, loading } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!loading && user) navigate('/dashboard')
  }, [loading, user, navigate])

  const onSubmit = async (data: FormData) => {
    setServerError('')
    try {
      await registerFn(data.name, data.email, data.password, data.department)
      navigate('/dashboard')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setServerError(typeof detail === 'string' ? detail : 'Registration failed. Try again.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-box">
          <h1 className="login-title">Create Faculty Account</h1>
          <p className="login-subtitle">Register to submit your performance evaluation</p>

          <form onSubmit={handleSubmit(onSubmit)} className="login-form">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="input" {...register('name')} placeholder="Dr. Jane Smith" />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="input" {...register('email')} placeholder="you@college.edu" />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Department</label>
              <input className="input" {...register('department')} placeholder="Computer Science & Engineering" />
              {errors.department && <p className="form-error">{errors.department.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" className="input" {...register('password')} />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input type="password" className="input" {...register('confirm')} />
              {errors.confirm && <p className="form-error">{errors.confirm.message}</p>}
            </div>

            {serverError && <p className="form-error">{serverError}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--secondary)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
