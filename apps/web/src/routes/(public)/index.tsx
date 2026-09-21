import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(public)/')({
  component: Home,
})

type Health = { status: 'ok' }

// Temporary hand-written fetch: Phase 2 replaces it with the Orval-generated hook.
async function fetchHealth(): Promise<Health> {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })

  const status = health.isPending
    ? { label: 'Verificando a API…', dot: 'bg-muted-foreground animate-pulse' }
    : health.isError
      ? { label: 'API indisponível', dot: 'bg-destructive' }
      : { label: 'API online', dot: 'bg-success' }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full bg-accent-100 px-3 py-1 font-medium text-accent-800 text-xs dark:bg-accent-900 dark:text-accent-200">
          Em construção
        </span>
        <h1 className="font-semibold text-4xl text-primary tracking-tight">Bens Seguros</h1>
        <p className="max-w-md text-balance text-muted-foreground">
          ERP para corretoras de seguros: propostas, apólices, comissões e atendimento em um só
          lugar.
        </p>
      </div>

      <output className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm shadow-xs">
        <span className={cn('size-2 rounded-full', status.dot)} aria-hidden="true" />
        {status.label}
      </output>
    </main>
  )
}
