import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function FormAlert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'info'
}) {
  return (
    <Alert variant={tone === 'error' ? 'destructive' : 'default'}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
