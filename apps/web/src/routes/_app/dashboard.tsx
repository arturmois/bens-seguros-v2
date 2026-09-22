import { createFileRoute } from '@tanstack/react-router'
import { useMe } from '@/hooks/use-me'

// Placeholder: the real dashboard comes in Phase 10.
export const Route = createFileRoute('/_app/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const me = useMe()
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-2">
      <h1 className="font-semibold text-2xl tracking-tight">Olá, {me.name}</h1>
      <p className="text-muted-foreground">Sua conta está pronta.</p>
    </section>
  )
}
