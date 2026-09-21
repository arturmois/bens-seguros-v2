import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { usePreviewExampleCommission } from '@/api/endpoints'

// Disposable (Phase 2): proves schema → route → OpenAPI → Orval → hook. Remove with modules/examples.
const searchSchema = z.object({
  premiumCents: z.coerce.number().int().min(0).catch(100_000),
  rateBp: z.coerce.number().int().min(0).max(10_000).catch(1_500),
  splitBp: z.coerce.number().int().min(0).max(10_000).catch(3_000),
})

export const Route = createFileRoute('/(public)/example')({
  validateSearch: searchSchema,
  component: Example,
})

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const formatCents = (cents: number) => brl.format(cents / 100)
const formatBp = (bp: number) => `${(bp / 100).toLocaleString('pt-BR')}%`

function Example() {
  const search = Route.useSearch()
  const preview = usePreviewExampleCommission(search, { query: { retry: false } })

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-primary tracking-tight">Prévia de comissão</h1>
        <p className="text-muted-foreground text-sm">
          Prêmio de {formatCents(search.premiumCents)}, comissão de {formatBp(search.rateBp)} e
          repasse de {formatBp(search.splitBp)} ao vendedor.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-4 text-sm shadow-xs">
        {preview.isPending ? (
          <p className="animate-pulse text-muted-foreground">Calculando…</p>
        ) : preview.isError ? (
          <p className="text-destructive">{preview.error.message}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Corretora</dt>
            <dd className="text-right font-medium">
              {formatCents(preview.data.brokerageAmountCents)}
            </dd>
            <dt className="text-muted-foreground">Vendedor</dt>
            <dd className="text-right font-medium">
              {formatCents(preview.data.salespersonAmountCents)}
            </dd>
          </dl>
        )}
      </section>

      <Link
        to="/example"
        search={{ ...search, rateBp: search.rateBp === 1_500 ? 2_000 : 1_500 }}
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        Alternar comissão entre 15% e 20%
      </Link>
    </main>
  )
}
