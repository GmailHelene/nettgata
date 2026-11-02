import { createDownloadToken, downloadPath, exportView, readJob, type ExportView } from "@/lib/eksport";
import { getMediaStore } from "@/lib/storage";
import { ExportSection } from "./export-section";

/** Henter statusen for «Last ned alt» og lager lenken når filen er klar. Vises bare for eieren. */
export async function ExportPanel({ siteId }: { siteId: string }) {
  let view: ExportView = { status: "ingen" };
  let href: string | null = null;
  try {
    const job = await readJob(await getMediaStore(), siteId);
    view = exportView(job);
    if (job && view.status === "ferdig") href = downloadPath(siteId, await createDownloadToken(job));
  } catch (err) {
    // Uten bildelager (R2) kan ingen fil lages. Knappen vises likevel, og handlingen gir feilmeldingen.
    console.error("Kunne ikke lese eksporten", err);
  }
  return <ExportSection siteId={siteId} view={view} downloadHref={href} />;
}
