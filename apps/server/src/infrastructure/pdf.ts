import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

// Templates live next to the module that owns them (`proposals/proposal-quote.pdf.tsx`) and must
// return a <Document>.
export function renderPdf(document: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(document)
}
