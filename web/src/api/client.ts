import axios, { AxiosError } from 'axios'
import type { User } from '../types'
import { toastError } from './notify'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 跳过统一错误提示，由调用方自行处理 */
    __silent?: boolean
    /** 401 后是否已重试过 */
    __retry?: boolean
  }
}

const TOKEN_KEY = 'oneperson_la_access_token'

let accessToken: string | null = null
try {
  accessToken = localStorage.getItem(TOKEN_KEY)
} catch {
  accessToken = null
}

export function getAccessToken(): string | null {
  return accessToken
}

/** 重新从 localStorage 同步令牌（多窗口场景下其它窗口可能刚写入） */
export function syncTokenFromStorage(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) accessToken = stored
    return stored
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 隐私模式下 localStorage 可能不可用，仅保留内存态 */
  }
}

type SessionExpiredHandler = () => void
let sessionExpiredHandler: SessionExpiredHandler | null = null

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler
}

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return messageOf(error as AxiosError<ApiErrorBody>)
  return error instanceof Error ? error.message : '请求失败'
}

function messageOf(error: AxiosError<ApiErrorBody>): string {
  const serverMessage = error.response?.data?.error?.message
  if (serverMessage) return serverMessage
  if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (!error.response) return '无法连接服务，请确认后端已启动'
  if (error.response.status === 403) return '没有权限执行该操作'
  if (error.response.status === 404) return '请求的资源不存在'
  if (error.response.status >= 500) return '服务暂时不可用，请稍后重试'
  return error.message || '请求失败'
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

/** 使用 HttpOnly refresh cookie 换取新的 accessToken（单飞） */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ user: User; accessToken: string }>(
        '/api/auth/refresh',
        {},
        { withCredentials: true, timeout: 20000 },
      )
      .then((res) => {
        const token = res.data?.accessToken ?? null
        setAccessToken(token)
        return token
      })
      .catch(() => {
        setAccessToken(null)
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config
    const status = error.response?.status
    const url = config?.url ?? ''

    if (
      status === 401 &&
      config &&
      !config.__retry &&
      !url.includes('/auth/refresh') &&
      !url.includes('/auth/login')
    ) {
      config.__retry = true
      const token = await refreshAccessToken()
      if (token) {
        return api.request(config)
      }
      setAccessToken(null)
      sessionExpiredHandler?.()
      if (!config.__silent) toastError('登录已失效，请重新登录')
      return Promise.reject(error)
    }

    if (!config?.__silent && !axios.isCancel(error)) {
      toastError(messageOf(error))
    }
    return Promise.reject(error)
  },
)
