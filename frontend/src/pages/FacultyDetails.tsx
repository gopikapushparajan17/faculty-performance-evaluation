import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { api } from '../lib/api'
import type { FacultyProfile } from '../types/evaluation'

const schema = z.object({
  department_name: z.string().min(1, 'Required'),
  employee_id: z.string().min(1, 'Required'),
  employee_name: z.string().min(1, 'Required'),
  orcid_id: z.string(),
  official_email: z.string().email('Invalid email'),
  phone_number: z.string().min(1, 'Required'),
})

type FormData = z.infer<typeof schema>

export default function FacultyDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      department_name: '',
      employee_id: '',
      employee_name: '',
      orcid_id: '',
      official_email: '',
      phone_number: '',
    },
  })

  useEffect(() => {
    if (!isNew && id) {
      api.get<FacultyProfile>(`/faculty/${id}`).then(({ data }) => {
        reset({
          department_name: data.department_name,
          employee_id: data.employee_id,
          employee_name: data.employee_name,
          orcid_id: data.orcid_id ?? '',
          official_email: data.official_email,
          phone_number: data.phone_number,
        })
      }).catch(() => {})
    }
  }, [id, isNew, reset])

  const onSubmit = async (data: FormData) => {
    if (isNew) {
      const res = await api.post<FacultyProfile>('/faculty', data)
  
      const facultyId = res.data.id
  
      navigate(`/evaluation/new/${facultyId}`)
    } else if (id) {
      await api.put(`/faculty/${id}`, data)
      navigate(`/evaluation/new/${id}`)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">Faculty Details</h1>
      <div className="card card-body">
        <form onSubmit={handleSubmit(onSubmit)} className="login-form">
          <div className="form-group">
            <label className="form-label">Department Name</label>
            <input {...register('department_name')} className="input" />
            {errors.department_name && <p className="form-error">{errors.department_name.message}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Employee ID</label>
            <input {...register('employee_id')} className="input" />
            {errors.employee_id && <p className="form-error">{errors.employee_id.message}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Employee Name</label>
            <input {...register('employee_name')} className="input" />
            {errors.employee_name && <p className="form-error">{errors.employee_name.message}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">ORCID ID</label>
            <input {...register('orcid_id')} className="input" placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Official Email ID</label>
            <input type="email" {...register('official_email')} className="input" />
            {errors.official_email && <p className="form-error">{errors.official_email.message}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input {...register('phone_number')} className="input" />
            {errors.phone_number && <p className="form-error">{errors.phone_number.message}</p>}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{isNew ? 'Create' : 'Save'}</button>
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
