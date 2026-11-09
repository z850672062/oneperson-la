import type { MessageInstance } from 'antd/es/message/interface'

let instance: MessageInstance | null = null

export function bindMessageApi(api: MessageInstance): void {
  instance = api
}

export function toastError(content: string): void {
  if (instance) instance.error(content)
  else console.error(content)
}

export function toastSuccess(content: string): void {
  if (instance) instance.success(content)
}

export function toastInfo(content: string): void {
  if (instance) instance.info(content)
}
