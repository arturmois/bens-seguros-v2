import type { LegalDocument } from './documents'

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="font-semibold text-primary text-sm tracking-tight">Bens Seguros</p>
        <h1 className="font-semibold text-3xl tracking-tight">{document.title}</h1>
        <p className="text-muted-foreground text-sm">Versão {document.version}</p>
      </header>
      <div className="flex flex-col gap-6">
        {document.sections.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="font-semibold text-lg">{section.title}</h2>
            <p className="whitespace-pre-line text-muted-foreground text-sm leading-6">
              {section.content}
            </p>
          </section>
        ))}
      </div>
    </main>
  )
}
