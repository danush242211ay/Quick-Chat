import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // true until we know whether a session exists

  // On first load: "does my cookie still identify a user?"
  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // If any request comes back 401 while logged in (session expired), drop back to the login screen.
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        const url = err.config?.url || ''
        if (err.response?.status === 401 && !url.startsWith('/auth/')) setUser(null)
        return Promise.reject(err)
      }
    )
    return () => api.interceptors.response.eject(id)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    setUser(res.data.user)
  }, [])

  const register = useCallback(async (fullName, email, password) => {
    const res = await api.post('/auth/register', { fullName, email, password })
    setUser(res.data.user) // the server also logs the new user in
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const expireSession = useCallback(() => setUser(null), [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, expireSession }),
    [user, loading, login, register, logout, expireSession]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
