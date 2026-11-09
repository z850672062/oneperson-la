import { api } from './client'
import type { User } from '../types'

export interface LoginResult {
  user: User
  accessToken: string
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>('/auth/login', { username, password }, { __silent: true })
  return data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout', undefined, { __silent: true })
}

export async function refresh(): Promise<LoginResult> {
  const { data } = await api.post<LoginResult>('/auth/refresh', undefined, { __silent: true })
  return data
}

export async function me(): Promise<User> {
  const { data } = await api.get<{ user?: User } & User>('/auth/me', { __silent: true })
  return data.user ?? data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/password', { currentPassword, newPassword })
}

export async function updateProfile(name: string): Promise<User> {
  const { data } = await api.patch<{ user?: User } & User>('/auth/me', { name })
  return data.user ?? data
}
