import { useQueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { getGetMeQueryOptions } from '@/api/endpoints'
import { Button } from '@/components/ui/button'
import { useMe } from '@/hooks/use-me'
import { authClient } from '@/lib/auth-client'
import { ApiError } from '@/lib/http'

// Every authenticated screen lives under this layout. The server authorizes; this only keeps a
// signed-out visitor from seeing the page (ADR-003: the user comes from GET /api/v1/me).
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(getGetMeQueryOptions())
      if (me.terms.pending) {
        throw redirect({ to: '/terms-acceptance', search: { redirect: location.href } })
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw redirect({ to: '/login', search: { redirect: location.href } })
      }
      throw error
    }
  },
  pendingMs: 200,
  pendingComponent: AccountLoading,
  errorComponent: AccountError,
  component: AppLayout,
})

function AccountLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <p className="animate-pulse text-muted-foreground text-sm">Carregando sua conta…</p>
    </main>
  )
}

function AccountError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-medium">Não foi possível carregar sua conta.</p>
      <Button
        variant="outline"
        onClick={async () => {
          reset()
          await router.invalidate()
        }}
      >
        Tentar de novo
      </Button>
    </main>
  )
}

function AppLayout() {
  const me = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function signOut() {
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <Link to="/dashboard" className="font-semibold text-primary tracking-tight">
          Bens Seguros
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/settings/security" className="text-muted-foreground hover:text-foreground">
            Segurança
          </Link>
          <span className="hidden text-muted-foreground sm:inline">{me.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sair
          </Button>
        </nav>
      </header>
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  )
}
