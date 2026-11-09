import { Alert, Button } from 'antd'

interface LoadErrorProps {
  message?: string
  description?: string
  onRetry?: () => void
}

export default function LoadError({ message, description, onRetry }: LoadErrorProps) {
  return (
    <Alert
      type="error"
      showIcon
      message={message ?? '加载失败'}
      description={description}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
    />
  )
}
