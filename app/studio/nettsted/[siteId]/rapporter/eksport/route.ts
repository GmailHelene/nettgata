import { getDb } from "@/db";
import { csvResponse } from "@/lib/csv";
import { checkSiteAccess } from "@/lib/session";
import { parseReportQuery, periodReport, reportCsv } from "@/lib/shop/reports";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";

/** MVA per sats og betalingsmåter for perioden, som CSV for regnskapsføreren. */
export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  const period = parseReportQuery(Object.fromEntries(new URL(request.url).searchParams));
  const report = await periodReport(await getDb(), access.site.id, period.from, period.to);
  const csv = reportCsv(report, (m) => paymentLabels[m as PaymentMethod] ?? m);
  return csvResponse(csv, `mva-grunnlag-${access.site.slug}-${period.from}-${period.to}.csv`);
}
