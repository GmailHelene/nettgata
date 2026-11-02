import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { downloadFileName, exportStream, readJob, verifyDownloadToken } from "@/lib/eksport";
import { checkSiteAccess } from "@/lib/session";
import { getMediaStore } from "@/lib/storage";

/**
 * Nedlasting av ZIP-filen fra «Last ned alt». Krever både den signerte lenken og at du er logget inn som eier,
 * så en videresendt e-post alene ikke gir tilgang til personopplysningene. Lenken gjelder bare den siste filen.
 */
export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access || access.role !== "owner") return new Response("Ikke tilgang. Logg inn som eier av nettstedet og prøv lenken på nytt.", { status: 403 });

  const token = await verifyDownloadToken(new URL(request.url).searchParams.get("t") ?? "");
  const store = await getMediaStore();
  const job = await readJob(store, access.site.id);
  if (!token || token.siteId !== access.site.id || !job || job.id !== token.jobId || job.status !== "ferdig" || !job.expiresAt || new Date(job.expiresAt) <= new Date()) {
    return new Response("Lenken er utløpt eller gjelder en eldre fil. Lag en ny under Innstillinger, Last ned alt.", { status: 410 });
  }

  await (await getDb()).insert(auditLog).values({ siteId: access.site.id, userId: access.user.id, action: "export.downloaded", detail: { jobId: job.id } });
  return new Response(exportStream(store, job), {
    headers: {
      "content-type": "application/zip",
      ...(job.totalBytes && { "content-length": String(job.totalBytes) }),
      "content-disposition": `attachment; filename="${downloadFileName(job).replace(/[^a-z0-9._-]/gi, "-")}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
