import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AuthCardProps = {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

// Shell of every (auth) screen: brand, a card with the form and the links below it.
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <p className="font-semibold text-primary text-xl tracking-tight">Bens Seguros</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
      {footer && <div className="flex flex-col items-center gap-1 text-sm">{footer}</div>}
    </main>
  )
}
