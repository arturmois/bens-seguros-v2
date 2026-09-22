import { createFileRoute } from '@tanstack/react-router'
import { privacyPolicy } from '@/features/legal/documents'
import { LegalDocumentView } from '@/features/legal/legal-document'

export const Route = createFileRoute('/(public)/privacy')({
  component: () => <LegalDocumentView document={privacyPolicy} />,
})
