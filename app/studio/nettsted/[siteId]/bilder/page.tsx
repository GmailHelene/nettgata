import { getDb } from "@/db";
import { listFiles, listMedia, mediaUsage } from "@/lib/media";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../site-nav";
import { MediaLibrary } from "./media-library";
import { FileList } from "./file-list";

export default async function MediaPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [items, files, usage] = await Promise.all([listMedia(db, site.id), listFiles(db, site.id), mediaUsage(db, site.id)]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="bilder" />
      <MediaLibrary
        siteId={site.id}
        items={items.map((item) => ({ ...item, usedIn: usage.get(item.src.slice("/media/".length)) ?? [] }))}
      />
      <FileList siteId={site.id} items={files.map((file) => ({ ...file, usedIn: usage.get(file.src.slice("/media/".length)) ?? [] }))} />
    </main>
  );
}
