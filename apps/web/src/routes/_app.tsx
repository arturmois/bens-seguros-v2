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
import { useState } from 'react'
import { getGetMeQueryKey, getGetMeQueryOptions, useSetActiveOrganization } from '@/api/endpoints'
import type { GetMe200 } from '@/api/model'
import { Button } from '@/components/ui/button'
import { brokerageDestination, signedInAccount } from '@/features/organizations/account'
import { useMe } from '@/hooks/use-me'
import { authClient } from '@/lib/auth-client'
import { ApiError } from '@/lib/http'

// Every authenticated screen lives under this layout. The server authorizes; this only keeps a
// signed-out visitor from seeing the page (ADR-003: the user comes from GET /api/v1/me).
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await signedInAccount(context.queryClient, location.href)
    const next = brokerageDestination(me)
    if (next) throw redirect({ to: next })
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
          <BrokerageSwitch me={me} />
          <Link to="/settings/organization" className="text-muted-foreground hover:text-foreground">
            Corretora
          </Link>
          {me.permissions.includes('member:update') ? (
            <Link to="/settings/members" className="text-muted-foreground hover:text-foreground">
              Equipe
            </Link>
          ) : null}
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

function BrokerageSwitch({ me }: { me: GetMe200 }) {
  const active = me.organizations.find(
    (organization) => organization.id === me.activeOrganizationId,
  )
  const others = me.organizations.filter((organization) => organization.id !== active?.id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActive = useSetActiveOrganization()
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()

  if (!active) return null
  if (others.length === 0) return <span>{active.name}</span>

  async function choose(organizationId: string) {
    setFailure(undefined)
    try {
      await setActive.mutateAsync({ data: { organizationId } })
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
      await queryClient.fetchQuery(getGetMeQueryOptions())
      setOpen(false)
      await navigate({ to: '/dashboard' })
    } catch (error) {
      setFailure(
        error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente de novo.',
      )
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((current) => !current)}
      >
        {active.name}
      </Button>
      {open
        ? others.map((organization) => (
            <Button
              key={organization.id}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void choose(organization.id)}
            >
              {organization.name}
            </Button>
          ))
        : null}
      {failure ? <span>{failure}</span> : null}
    </div>
  )
}
