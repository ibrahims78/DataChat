import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../lib/api'

interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'employee'
  onboarding_done?: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string, remember: boolean) => Promise<void>
  setSession: (token: string, user: User) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    if (!savedToken) {
      setIsLoading(false)
      return
    }
    // Verify token and get fresh user data from server
    api.get('/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
      .then(res => {
        setToken(savedToken)
        setUser(res.data)
        localStorage.setItem('user', JSON.stringify(res.data))
      })
      .catch(() => {
        // Token invalid or user disabled — clear session
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!token) return
    let timeout: ReturnType<typeof setTimeout>
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        logout()
      }, 8 * 60 * 60 * 1000)
    }
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart']
    events.forEach(e => document.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      clearTimeout(timeout)
      events.forEach(e => document.removeEventListener(e, resetTimer))
    }
  }, [token])

  const login = async (email: string, password: string, remember: boolean) => {
    const res = await api.post('/auth/login', { email, password, remember })
    const { token: t, user: u } = res.data
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const setSession = (t: string, u: User) => {
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, setSession, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
