import { createFileRoute } from '@tanstack/react-router'
import { termsOfUse } from '@/features/legal/documents'
import { LegalDocumentView } from '@/features/legal/legal-document'

export const Route = createFileRoute('/(public)/terms')({
  component: () => <LegalDocumentView document={termsOfUse} />,
})
