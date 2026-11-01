import { PDFDocument } from "pdf-lib";

/**
 * Slår flere etikett-PDF-er sammen til én, i den rekkefølgen de kommer. Rent JS (pdf-lib), uten Node-API-er,
 * så det virker i Cloudflare Workers. Kaster hvis en av PDF-ene ikke kan leses, og da lager kalleren lenker i stedet.
 */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of pdfs) {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = await out.copyPages(source, source.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}
