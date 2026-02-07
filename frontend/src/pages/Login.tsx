import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  college: z.string().min(1, 'Select college'),
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})

type FormData = z.infer<typeof schema>

const COLLEGES = [{ id: '1', name: 'Demo College' }]

export default function Login() {
  const [error, setError] = useState('')
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
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
      setError(e instanceof Error ? e.message : 'Login failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-box">
          <h1 className="login-title">Faculty Performance Evaluation</h1>
          <p className="login-subtitle">Sign in to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} className="login-form">
            <div className="form-group">
              <label className="form-label">College</label>
              <select {...register('college')} className="input">
                {COLLEGES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.college && <p className="form-error">{errors.college.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Email / Username</label>
              <input
                type="text"
                {...register('email')}
                className="input"
                placeholder="you@college.edu"
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" {...register('password')} className="input" />
              {errors.password && <p className="form-error">{errors.password.message}</p>}
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg">
              Login
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
