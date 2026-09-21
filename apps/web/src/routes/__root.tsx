import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-semibold text-primary text-sm">404</p>
      <h1 className="font-semibold text-2xl tracking-tight">Página não encontrada</h1>
      <Link to="/" className="text-muted-foreground text-sm underline underline-offset-4">
        Voltar para o início
      </Link>
    </main>
  )
}
