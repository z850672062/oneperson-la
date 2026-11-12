import { create } from 'zustand'
import { login as loginApi, logout as logoutApi, me, updateProfile as updateProfileApi } from '../api/auth'
import { refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '../api/client'
import type { User } from '../types'

export type AuthStatus = 'idle' | 'checking' | 'authed' | 'guest'

interface AuthState {
  user: User | null
  status: AuthStatus
  bootstrap: () => Promise<void>
  /** 静默尝试恢复会话（不改动 loading 状态，供便签窗轮询登录态） */
  refreshQuiet: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  updateProfile: (name: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async bootstrap() {
    if (get().status === 'authed' || get().status === 'checking') return
    set({ status: 'checking' })
    // 刷新页面后优先使用 HttpOnly refresh cookie 恢复会话
    const token = await refreshAccessToken()
    if (!token) {
      set({ user: null, status: 'guest' })
      return
    }
    try {
      const user = await me()
      set({ user, status: 'authed' })
    } catch {
      setAccessToken(null)
      set({ user: null, status: 'guest' })
    }
  },

  async refreshQuiet() {
    if (get().status === 'authed') return
    const token = await refreshAccessToken()
    if (!token) return
    try {
      const user = await me()
      set({ user, status: 'authed' })
    } catch {
      setAccessToken(null)
    }
  },

  async login(username, password) {
    const result = await loginApi(username, password)
    setAccessToken(result.accessToken)
    set({ user: result.user, status: 'authed' })
  },

  async updateProfile(name) {
    const user = await updateProfileApi(name)
    set({ user })
  },

  async logout() {
    try {
      await logoutApi()
    } finally {
      setAccessToken(null)
      set({ user: null, status: 'guest' })
    }
  },
}))

setSessionExpiredHandler(() => {
  setAccessToken(null)
  useAuthStore.setState({ user: null, status: 'guest' })
})
