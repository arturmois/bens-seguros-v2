import { Document, Page, Text } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { renderPdf } from './pdf.ts'

describe('renderPdf', () => {
  it('renders a React PDF document to a PDF buffer', async () => {
    const pdf = await renderPdf(
      <Document title="Cotação">
        <Page size="A4">
          <Text>Cotação de seguro auto: R$ 1.234,56</Text>
        </Page>
      </Document>,
    )

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(500)
  })
})
