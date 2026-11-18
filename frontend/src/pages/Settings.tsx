import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { FaUser, FaLock, FaIdCard, FaEye, FaEyeSlash } from 'react-icons/fa'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const changeNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'New passwords do not match.',
    path: ['confirm_password'],
  })

type ChangeNameData = z.infer<typeof changeNameSchema>
type ChangePasswordData = z.infer<typeof changePasswordSchema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  id: string
  email: string
  name: string
  role: string
  department?: string | null
  employee_id?: string | null
}

// ---------------------------------------------------------------------------
// Reusable alert component
// ---------------------------------------------------------------------------

function Alert({
  type,
  message,
  onDismiss,
}: {
  type: 'success' | 'error'
  message: string
  onDismiss: () => void
}) {
  const isSuccess = type === 'success'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 14,
        padding: '11px 14px',
        borderLeft: `3px solid ${isSuccess ? 'var(--success)' : 'var(--danger)'}`,
        background: isSuccess ? '#edf5f0' : '#fbf4f1',
        color: isSuccess ? '#2e5c42' : '#8d4038',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          color: 'inherit',
          opacity: 0.6,
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 24px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-alt)',
        }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 14 }}>{icon}</span>
        <h2
          style={{
            margin: 0,
            font: '600 16px var(--serif)',
            color: 'var(--ink)',
            letterSpacing: '-0.1px',
          }}
        >
          {title}
        </h2>
      </div>
      <div className="card-body">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Profile info row
// ---------------------------------------------------------------------------

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--line)',
        fontSize: 13,
      }}
    >
      <span
        style={{
          minWidth: 120,
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          paddingTop: 2,
        }}
      >
        {label}
      </span>
      <span style={{ color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change Name form
// ---------------------------------------------------------------------------

function ChangeNameForm({ currentName, onSuccess }: { currentName: string; onSuccess: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangeNameData>({
    resolver: zodResolver(changeNameSchema),
    defaultValues: { name: currentName },
  })

  const onSubmit = async (data: ChangeNameData) => {
    setAlert(null)
    try {
      const res = await api.patch<{ message: string; name: string }>('/users/me/name', {
        name: data.name.trim(),
      })
      onSuccess(res.data.name)
      setAlert({ type: 'success', text: res.data.message || 'Name updated successfully.' })
      setOpen(false)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAlert({ type: 'error', text: detail || 'Failed to update name. Please try again.' })
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      {!open && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            reset({ name: currentName })
            setAlert(null)
            setOpen(true)
          }}
        >
          Change Name
        </button>
      )}

      {open && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          style={{ maxWidth: 380 }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="settings-name">
              New Display Name
            </label>
            <input
              id="settings-name"
              className="input"
              type="text"
              autoComplete="name"
              placeholder="Enter your display name"
              {...register('name')}
            />
            {errors.name && (
              <p className="form-error">{errors.name.message}</p>
            )}
          </div>

          {alert && (
            <Alert
              type={alert.type}
              message={alert.text}
              onDismiss={() => setAlert(null)}
            />
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save Name'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setOpen(false); setAlert(null) }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!open && alert && (
        <Alert
          type={alert.type}
          message={alert.text}
          onDismiss={() => setAlert(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change Password form
// ---------------------------------------------------------------------------

function ChangePasswordForm() {
  const [open, setOpen] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
  })

  const onSubmit = async (data: ChangePasswordData) => {
    setAlert(null)
    try {
      const res = await api.post<{ message: string }>('/users/me/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      })
      setAlert({ type: 'success', text: res.data.message || 'Password changed successfully.' })
      reset()
      setOpen(false)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAlert({
        type: 'error',
        text: detail || 'Failed to change password. Please try again.',
      })
    }
  }

  const toggleStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    right: 10,
    transform: 'translateY(-50%)',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--muted)',
    fontSize: 13,
    display: 'grid',
    placeItems: 'center',
  }

  return (
    <div style={{ marginTop: 4 }}>
      {!open && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            reset()
            setAlert(null)
            setOpen(true)
          }}
        >
          Change Password
        </button>
      )}

      {open && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          style={{ maxWidth: 380 }}
        >
          {/* Current password */}
          <div className="form-group">
            <label className="form-label" htmlFor="current-pw">
              Current Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="current-pw"
                className="input"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your current password"
                style={{ paddingRight: 38 }}
                {...register('current_password')}
              />
              <button
                type="button"
                style={toggleStyle}
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
              >
                {showCurrent ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.current_password && (
              <p className="form-error">{errors.current_password.message}</p>
            )}
          </div>

          {/* New password */}
          <div className="form-group">
            <label className="form-label" htmlFor="new-pw">
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="new-pw"
                className="input"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                style={{ paddingRight: 38 }}
                {...register('new_password')}
              />
              <button
                type="button"
                style={toggleStyle}
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {showNew ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.new_password && (
              <p className="form-error">{errors.new_password.message}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="form-group">
            <label className="form-label" htmlFor="confirm-pw">
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirm-pw"
                className="input"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter new password"
                style={{ paddingRight: 38 }}
                {...register('confirm_password')}
              />
              <button
                type="button"
                style={toggleStyle}
                onClick={() => setShowConfirm((v) => !v)}
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.confirm_password && (
              <p className="form-error">{errors.confirm_password.message}</p>
            )}
          </div>

          {alert && (
            <Alert
              type={alert.type}
              message={alert.text}
              onDismiss={() => setAlert(null)}
            />
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Update Password'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setOpen(false); reset(); setAlert(null) }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!open && alert && (
        <Alert
          type={alert.type}
          message={alert.text}
          onDismiss={() => setAlert(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export default function Settings() {
  const { user, updateUser } = useAuth()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<ProfileData>('/users/me')
      .then((res) => {
        if (!cancelled) setProfile(res.data)
      })
      .catch(() => {
        // fall back to context data if the endpoint fails
        if (!cancelled && user) {
          setProfile({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.department,
            employee_id: null,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user])

  const handleNameSuccess = (newName: string) => {
    // Update the local profile state so the UI reflects the change immediately
    setProfile((prev) => prev ? { ...prev, name: newName } : prev)
    // Update auth context + sessionStorage so sidebar updates live
    updateUser({ name: newName })
  }

  const roleLabel = (role?: string) => {
    if (role === 'hod') return 'Head of Department'
    if (role === 'principal') return 'Principal'
    if (role === 'faculty') return 'Faculty'
    return role ?? '—'
  }

  if (loading) {
    return <div className="loading-text">Loading settings…</div>
  }

  const p = profile

  return (
    <div style={{ maxWidth: 740 }}>
      <h1 className="page-title">Settings</h1>

      {/* ---------------------------------------------------------------- */}
      {/* Profile section                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Section icon={<FaUser />} title="Profile">
        <div style={{ marginBottom: 18 }}>
          <ProfileRow label="Name" value={p?.name} />
          <ProfileRow label="Email" value={p?.email} />
          <ProfileRow label="Role" value={roleLabel(p?.role)} />
          {p?.employee_id && (
            <ProfileRow label="Employee ID" value={p.employee_id} />
          )}
        </div>

        <div
          style={{
            paddingTop: 18,
            borderTop: '1px solid var(--line)',
          }}
        >
          <p
            style={{
              margin: '0 0 4px',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Change Display Name
          </p>
          <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11 }}>
            Your name as it appears in evaluations and reports.
          </p>
          <ChangeNameForm
            currentName={p?.name ?? ''}
            onSuccess={handleNameSuccess}
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Security section                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Section icon={<FaLock />} title="Security">
        <p
          style={{
            margin: '0 0 4px',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Change Password
        </p>
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11 }}>
          Password must be at least 8 characters long.
        </p>
        <ChangePasswordForm />
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Account information section                                       */}
      {/* ---------------------------------------------------------------- */}
      {(p?.department || p?.employee_id) && (
        <Section icon={<FaIdCard />} title="Account Information">
          <ProfileRow label="Department" value={p?.department} />
          <ProfileRow label="Employee ID" value={p?.employee_id} />
        </Section>
      )}
    </div>
  )
}
