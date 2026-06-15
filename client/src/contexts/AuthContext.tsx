import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../lib/api'

interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'employee'
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string, remember: boolean) => Promise<void>
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
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (!token) return
    let timeout: ReturnType<typeof setTimeout>
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        logout()
      }, 15 * 60 * 1000)
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

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
