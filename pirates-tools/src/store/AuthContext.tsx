import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface User {
  name: string
  email: string
}

interface AuthContextType {
  user: User | null
  login: (name: string, email: string) => void
  logout: () => void
  isLoggedIn: boolean
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoggedIn: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pirates-user')
      if (saved) setUser(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  const login = useCallback((name: string, email: string) => {
    const u = { name, email }
    setUser(u)
    localStorage.setItem('pirates-user', JSON.stringify(u))
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('pirates-user')
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}
