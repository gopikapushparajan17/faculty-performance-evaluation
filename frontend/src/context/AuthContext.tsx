import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'

export type Role = 'hod' | 'faculty' | 'principal'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  department?: string
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, collegeId?: string) => Promise<void>
  register: (name: string, email: string, password: string, department?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'faculty_eval_token'
const USER_KEY = 'faculty_eval_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true })

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setState({ user: null, token: null, loading: false })
  }, [])

  const register = useCallback(async (name: string, email: string, password: string, department?: string) => {
    const { data } = await api.post<{ access_token: string; token_type: string; user: User }>('/auth/register', {
      name, email, password, department,
    })
    const token = data.access_token
    const user = data.user
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    api.defaults.headers.common.Authorization = `Bearer ${token}`
    setState({ user, token, loading: false })
  }, [])

  const login = useCallback(async (email: string, password: string, collegeId?: string) => {
    const { data } = await api.post<{ access_token: string; token_type: string; user: User }>('/auth/login', {
      username: email,
      password,
      college_id: collegeId,
    })
    const token = data.access_token
    const user = data.user
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    setState({ user, token, loading: false })
  }, [])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const saved = localStorage.getItem(USER_KEY)
    if (token && saved) {
      try {
        const user = JSON.parse(saved) as User
        api.defaults.headers.common.Authorization = `Bearer ${token}`
        setState({ user, token, loading: false })
      } catch {
        logout()
      }
    } else {
      setState((s) => ({ ...s, loading: false }))
    }
  }, [logout])

  useEffect(() => {
    if (state.token) api.defaults.headers.common.Authorization = `Bearer ${state.token}`
    else delete api.defaults.headers.common.Authorization
  }, [state.token])

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
