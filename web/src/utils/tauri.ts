type TauriBridge = {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
}

function bridge(): TauriBridge | null {
  const tauri = (window as unknown as { __TAURI__?: TauriBridge }).__TAURI__
  return tauri ?? null
}

/** 当前是否运行在 Tauri 桌面壳内 */
export function isTauri(): boolean {
  return bridge() !== null
}

/** 调用 Tauri 命令；非桌面环境时静默失败 */
export async function tauriInvoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  const t = bridge()
  if (!t) return null
  const invoke = t.core?.invoke ?? t.invoke
  if (!invoke) return null
  try {
    return (await invoke(cmd, args)) as T
  } catch {
    return null
  }
}
