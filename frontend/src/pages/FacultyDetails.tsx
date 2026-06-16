import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { api } from '../lib/api'

// Validation schema matching backend FacultyAccountCreate exactly
const schema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  department: z.string().min(1, 'Department is required'),
  employee_id: z.string().min(1, 'Employee ID is required'),
  phone: z.string().min(1, 'Phone number is required'),
  orcid: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormData = z.infer<typeof schema>

export default function FacultyDetails() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      department: '',
      employee_id: '',
      phone: '',
      orcid: '',
      password: '',
    },
  })

  const onSubmit = async (data: FormData) => {
    setError(null)
    setLoading(true)
    try {
      await api.post('/faculty', data)
      // Redirect to dashboard with a success message state
      navigate('/dashboard', { state: { message: 'Faculty account created successfully.' } })
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to create faculty account.'
      setError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">Create Faculty Account</h1>
      
      {error && (
        <div 
          className="card card-body mb-6" 
          style={{ 
            backgroundColor: '#fee2e2', 
            borderColor: '#f87171', 
            color: '#991b1b', 
            marginBottom: '1rem', 
            padding: '1rem', 
            borderRadius: '0.375rem',
            borderWidth: '1px'
          }}
        >
          <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
        </div>
      )}

      <div className="card card-body">
        <form onSubmit={handleSubmit(onSubmit)} className="login-form">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input {...register('name')} className="input" placeholder="e.g. Dr. John Doe" />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Email ID</label>
            <input type="email" {...register('email')} className="input" placeholder="e.g. john.doe@demo.com" />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Department</label>
            <input {...register('department')} className="input" placeholder="e.g. CSE" />
            {errors.department && <p className="form-error">{errors.department.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Employee ID</label>
            <input {...register('employee_id')} className="input" placeholder="e.g. EMP12345" />
            {errors.employee_id && <p className="form-error">{errors.employee_id.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input {...register('phone')} className="input" placeholder="e.g. +91 9876543210" />
            {errors.phone && <p className="form-error">{errors.phone.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">ORCID ID (Optional)</label>
            <input {...register('orcid')} className="input" placeholder="e.g. 0000-0002-1825-0097" />
            {errors.orcid && <p className="form-error">{errors.orcid.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" {...register('password')} className="input" placeholder="Min 6 characters" />
            {errors.password && <p className="form-error">{errors.password.message}</p>}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline" disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
