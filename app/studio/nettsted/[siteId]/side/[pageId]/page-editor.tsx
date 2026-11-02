"use client";

import { useEffect, useEffectEvent, useMemo, useReducer, useState, useTransition } from "react";
import type { RenderContext } from "@/components/sections";
import { SiteIdContext } from "@/components/studio/image-input";
import { hasExampleText, newSection } from "@/lib/content/examples";
import { sectionProblems, sectionRegistry, validatePageContent } from "@/lib/content/registry";
import type { PageContent, Section, SectionType } from "@/lib/content/types";
import { previewLinkAction, publishAction, restoreAction, type ActionState } from "@/app/studio/actions";
import type { FrameCommand } from "@/app/studio/ramme/protocol";
import { historyReducer, initHistory, type Doc } from "./editor-history";
import { inputClass } from "./fields";
import { PreviewFrame, type Device } from "@/components/studio/preview-frame";
import { SeoPanel } from "./seo-panel";
import { primaryPlace } from "@/lib/seo/auto";
import { SectionLibrary } from "./section-library";
import { SectionList } from "./section-list";
import { useAutosave } from "./use-autosave";
import type { Theme } from "@/lib/theme";
import { PublishLockNotice } from "@/components/studio/publish-lock";
import { HowTo } from "@/components/studio/help";

type Props = {
  siteId: string;
  preview: { ctx: RenderContext; theme: Theme };
  pageId: string;
  path: string;
  initialTitle: string;
  initialContent: PageContent;
  publishedNumber: number | null;
  versions: { id: string; number: number; createdAt: string }[];
  /** Abonnementet er ikke betalt ennå. Serveren stopper publiseringen uansett (assertCanPublish). */
  publishLocked?: boolean;
};

/** `undoFor` er siden rett etter slettingen. «Angre» vises bare så lenge ingenting annet er endret. */
type Notice = { ok: boolean; message: string; undoFor?: Doc } | null;

const secondaryButton = "rounded-md border border-[#173b6c] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const timeFormat = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });

/** Teller for rulle- og fokusbeskjeder, så samme seksjon kan vises flere ganger på rad. */
let seq = 0;
const nextSeq = () => ++seq;

/** Skrivefelt der nettleserens egen angring skal gjelde, i stedet for angring av hele siden. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(target.type);
}

function newId(taken: Section[]): string {
  let id = crypto.randomUUID().slice(0, 8);
  while (taken.some((s) => s.id === id)) id = crypto.randomUUID().slice(0, 8);
  return id;
}

export function PageEditor({ siteId, preview, pageId, path, initialTitle, initialContent, publishedNumber, versions, publishLocked = false }: Props) {
  const [history, dispatch] = useReducer(historyReducer, { title: initialTitle, content: initialContent }, initHistory);
  const doc = history.present;
  const { title, content } = doc;
  const sections = content.sections;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<number | null>(null);
  const [device, setDevice] = useState<Device>("datamaskin");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [scrollTo, setScrollTo] = useState<{ id: string; seq: number } | null>(null);
  const [reveal, setReveal] = useState<{ id: string; focus: boolean; seq: number } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  const problems = useMemo(() => new Map(sections.map((s) => [s.id, sectionProblems(s)])), [sections]);
  const withExampleText = useMemo(() => new Set(sections.filter((s) => !s.hidden && hasExampleText(s)).map((s) => s.id)), [sections]);
  const draftCheck = useMemo(() => validatePageContent(content, "draft"), [content]);
  const trimmedTitle = title.trim();
  const blocked = !trimmedTitle
    ? "Sidetittel mangler."
    : trimmedTitle.length > 120
      ? "Sidetittelen kan ha maks 120 tegn."
      : draftCheck.ok
        ? null
        : draftCheck.errors[0].message;
  const autosave = useAutosave(pageId, doc, blocked);

  const commit = (next: Doc, key: string | null) => {
    dispatch({ type: "edit", doc: next, key, at: Date.now() });
    return next;
  };
  const setSections = (next: Section[], key: string | null = null) => commit({ title, content: { ...content, sections: next } }, key);

  /** Åpner seksjonen i lista og viser den i forhåndsvisningen. `focus` flytter tastaturfokus til kortet. */
  const show = (id: string, focus: boolean) => {
    setSelectedId(id);
    setScrollTo({ id, seq: nextSeq() });
    setReveal({ id, focus, seq: nextSeq() });
  };

  const toggle = (id: string) => {
    if (selectedId === id) setSelectedId(null);
    else show(id, false);
  };

  const selectFromFrame = (id: string) => {
    setSelectedId(id);
    setPreviewOpen(false);
    setReveal({ id, focus: false, seq: nextSeq() });
  };

  // Ruller kortet fram i lista når det velges fra forhåndsvisningen eller nettopp er lagt til.
  useEffect(() => {
    if (!reveal) return;
    const card = document.getElementById(`seksjon-${reveal.id}`);
    if (!card) return;
    const top = card.getBoundingClientRect().top;
    if (top < 90 || top > window.innerHeight - 120) card.scrollIntoView({ behavior: "smooth", block: "start" });
    if (reveal.focus) card.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
  }, [reveal]);

  const changeSection = (index: number, next: Section, typing: boolean) => {
    const prev = sections[index];
    // Første bilde i en toppseksjon uten bildevariant: bytt til en variant som faktisk viser bildet.
    const addedHeroImage = next.type === "hero" && !prev.props.bilde && next.props.bilde;
    const section =
      addedHeroImage && (next.variant === "standard" || next.variant === "sentrert") ? { ...next, variant: "bilde" } : next;
    setSections(
      sections.map((s, i) => (i === index ? section : s)),
      typing ? `seksjon:${section.id}` : null,
    );
  };

  const moveSection = (from: number, to: number) => {
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSections(next);
  };

  const duplicate = (index: number) => {
    const copy: Section = { ...structuredClone(sections[index]), id: newId(sections) };
    setSections([...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)]);
    show(copy.id, true);
  };

  const remove = (index: number) => {
    const removed = sections[index];
    const after = setSections(sections.filter((_, i) => i !== index));
    if (selectedId === removed.id) setSelectedId(null);
    setNotice({ ok: true, message: `«${sectionRegistry[removed.type].label}» er slettet.`, undoFor: after });
  };

  const insert = (type: SectionType, variant: string) => {
    const index = library ?? sections.length;
    const section = newSection(
      type,
      variant,
      newId(sections),
      preview.ctx.nav.map((n) => n.path),
    );
    setSections([...sections.slice(0, index), section, ...sections.slice(index)]);
    setLibrary(null);
    show(section.id, true);
  };

  const run = (task: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await task();
      if (result) setNotice(result);
    });

  const runCommand = (command: FrameCommand) => {
    if (library !== null) return;
    if (command === "save") run(autosave.saveNow);
    else dispatch({ type: command });
  };

  const onShortcut = useEffectEvent(runCommand);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        onShortcut("save");
        return;
      }
      // I tekstfelt gjelder nettleserens egen angring, for det ene feltet.
      if (isTextEntry(event.target)) return;
      if (key === "z") {
        event.preventDefault();
        onShortcut(event.shiftKey ? "redo" : "undo");
      } else if (key === "y") {
        event.preventDefault();
        onShortcut("redo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const publish = () =>
    run(async () => {
      const missing = sections.flatMap((s) => (problems.get(s.id) ?? []).map((m) => `${sectionRegistry[s.type].label}: ${m}`));
      if (missing.length) {
        const first = sections.find((s) => problems.get(s.id)?.length);
        if (first) show(first.id, false);
        return { ok: false, message: `Dette må fikses før siden kan publiseres:\n${missing.join("\n")}` };
      }
      const leftovers = sections.filter((s) => withExampleText.has(s.id)).map((s) => sectionRegistry[s.type].label);
      if (
        leftovers.length &&
        !window.confirm(`Disse seksjonene har fortsatt eksempeltekst: ${leftovers.join(", ")}.\n\nVil du publisere likevel?`)
      ) {
        return null;
      }
      const saved = await autosave.saveNow();
      if (saved && !saved.ok) return saved;
      return publishAction(pageId);
    });

  const openPreview = () =>
    run(async () => {
      const saved = await autosave.saveNow();
      if (saved && !saved.ok) return saved;
      const res = await previewLinkAction(pageId);
      if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
      return res.ok
        ? { ok: true, message: "Forhåndsvisningen er åpnet i en ny fane. Lenken kan deles i 7 dager." }
        : { ok: false, message: res.message ?? "Noe gikk galt" };
    });

  const saveState = blocked
    ? { text: `Ikke lagret. ${blocked}`, error: true }
    : autosave.saving
      ? { text: "Lagrer...", error: false }
      : autosave.error && autosave.dirty
        ? { text: `Ikke lagret. ${autosave.error}`, error: true }
        : autosave.dirty
          ? { text: "Ikke lagret ennå", error: false }
          : { text: autosave.savedAt ? `Lagret kl. ${timeFormat.format(autosave.savedAt)}` : "Alt er lagret", error: false };

  const libraryPosition =
    library === null || library >= sections.length
      ? "Seksjonen legges nederst på siden."
      : library === 0
        ? "Seksjonen legges øverst på siden."
        : `Seksjonen legges under «${sectionRegistry[sections[library - 1].type].label}».`;

  return (
    <SiteIdContext.Provider value={siteId}>
      <div className="mt-4">
        <div className="sticky top-0 z-20 -mx-5 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-neutral-50/95 px-5 py-3 backdrop-blur">
          <p className="mr-auto min-w-0 text-sm text-neutral-700">
            <span className="font-medium text-neutral-900">{path}</span> · {publishedNumber ? `Live: versjon ${publishedNumber}` : "Ikke publisert"}
            {" · "}
            <span className={saveState.error ? "font-medium text-red-800" : undefined}>{saveState.text}</span>
            {autosave.error && autosave.dirty && !blocked && !autosave.saving && (
              <button type="button" className="ml-2 underline" onClick={() => runCommand("save")}>
                Prøv igjen
              </button>
            )}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={history.past.length === 0}
              onClick={() => dispatch({ type: "undo" })}
              aria-keyshortcuts="Control+Z"
              title="Angre (Ctrl+Z)"
              className={secondaryButton}
            >
              Angre
            </button>
            <button
              type="button"
              disabled={history.future.length === 0}
              onClick={() => dispatch({ type: "redo" })}
              aria-keyshortcuts="Control+Y"
              title="Gjør om (Ctrl+Y)"
              className={secondaryButton}
            >
              Gjør om
            </button>
          </div>
          <button type="button" onClick={() => setPreviewOpen(true)} className={`${secondaryButton} lg:hidden`}>
            Vis siden
          </button>
          <button type="button" disabled={pending} onClick={openPreview} className={secondaryButton}>
            Forhåndsvis
          </button>
          {publishLocked ? (
            <PublishLockNotice siteId={siteId} compact />
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={publish}
              className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Publiser
            </button>
          )}
        </div>
        {publishLocked && <PublishLockNotice siteId={siteId} />}

        {notice && (
          <div
            role="status"
            className={`mb-6 flex items-start gap-4 rounded-md p-3 text-sm ${notice.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
          >
            <p className="mr-auto whitespace-pre-line">{notice.message}</p>
            {notice.undoFor === doc && (
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  dispatch({ type: "undo" });
                  setNotice(null);
                }}
              >
                Angre
              </button>
            )}
            <button type="button" aria-label="Lukk meldingen" className="px-1 font-semibold" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <label className="mb-6 block">
              <span className="mb-1 block text-sm font-medium">Sidetittel</span>
              <input className={inputClass} value={title} onChange={(e) => commit({ title: e.target.value, content }, "tittel")} />
            </label>

            <SeoPanel
              open={seoOpen}
              onToggle={() => setSeoOpen((v) => !v)}
              siteName={preview.ctx.site.name}
              path={path}
              pageTitle={trimmedTitle || "Sidetittel"}
              content={content}
              onChange={(seo) => commit({ title, content: { ...content, seo } }, "seo")}
              keyword={preview.ctx.site.keyword}
              place={primaryPlace(preview.ctx.site.info)}
              shop={preview.ctx.shop}
            />

            <h2 className="mb-3 text-lg font-semibold">Seksjoner</h2>
            {sections.length === 0 ? (
              <p className="mb-2 text-sm text-neutral-700">Siden er tom. Legg til den første seksjonen.</p>
            ) : (
              <SectionList
                sections={sections}
                selectedId={selectedId}
                problems={problems}
                withExampleText={withExampleText}
                onToggle={toggle}
                onChange={changeSection}
                onMove={moveSection}
                onDuplicate={duplicate}
                onRemove={remove}
                onAdd={setLibrary}
                ownBooking={Boolean(preview.ctx.booking)}
              />
            )}
            <button
              type="button"
              onClick={() => setLibrary(sections.length)}
              className="mt-4 w-full rounded-lg border-2 border-dashed border-neutral-400 px-4 py-3 font-semibold text-neutral-800 hover:border-[#173b6c]"
            >
              + Legg til seksjon
            </button>

            <section className="mt-12">
              <h2 className="mb-3 text-lg font-semibold">Versjoner</h2>
              <HowTo
                title="Slik virker kladd, publisering og versjoner"
                className="mb-3"
                article="publisere"
                steps={[
                  "Alt du skriver lagres i kladden. Besøkende ser den ikke.",
                  "«Forhåndsvis» viser kladden slik besøkende vil se den.",
                  "«Publiser» legger kladden ut og lagrer den som en ny versjon.",
                  "«Gå tilbake hit» publiserer en eldre versjon på nytt.",
                ]}
              />
              {versions.length === 0 ? (
                <p className="text-sm text-neutral-600">Siden er ikke publisert ennå.</p>
              ) : (
                <ul className="divide-y rounded-lg border bg-white">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between p-3 text-sm">
                      <span>
                        Versjon {v.number} · {new Date(v.createdAt).toLocaleString("nb-NO")}
                        {v.number === publishedNumber ? " · live nå" : ""}
                      </span>
                      {v.number !== publishedNumber && (
                        <button
                          type="button"
                          disabled={pending}
                          className="underline"
                          onClick={() => {
                            if (!confirm(`Publisere versjon ${v.number} på nytt? Kladden blir erstattet med denne versjonen.`)) return;
                            startTransition(async () => {
                              const result = await restoreAction(pageId, v.id);
                              setNotice(result);
                              // Kladden er byttet ut på serveren. Last inn på nytt, så skjemaet viser den.
                              if (result?.ok) {
                                autosave.allowLeave();
                                window.location.reload();
                              }
                            });
                          }}
                        >
                          Gå tilbake hit
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* På små skjermer åpnes forhåndsvisningen over hele skjermen med «Vis siden». */}
          <aside
            aria-label="Forhåndsvisning"
            className={previewOpen ? "fixed inset-0 z-50 bg-neutral-100 p-3" : "hidden lg:block"}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPreviewOpen(false);
            }}
          >
            <div className={`flex flex-col ${previewOpen ? "h-full" : "sticky top-20 h-[calc(100vh-6rem)]"}`}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <div role="group" aria-label="Vis siden som" className="inline-flex rounded-md border border-neutral-400 bg-white p-0.5 text-sm">
                  {(["datamaskin", "mobil"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={device === d}
                      onClick={() => setDevice(d)}
                      className={`rounded px-3 py-1 font-medium ${device === d ? "bg-[#173b6c] text-white" : "text-neutral-800"}`}
                    >
                      {d === "datamaskin" ? "Datamaskin" : "Mobil"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-600">Klikk på en del av siden for å endre den.</p>
                {previewOpen && (
                  <button type="button" onClick={() => setPreviewOpen(false)} className={`${secondaryButton} ml-auto`}>
                    Lukk
                  </button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-neutral-300 bg-neutral-200/70">
                <PreviewFrame
                  ctx={preview.ctx}
                  theme={preview.theme}
                  content={content}
                  selectedId={selectedId}
                  device={device}
                  scrollTo={scrollTo}
                  onSelect={selectFromFrame}
                  onCommand={runCommand}
                />
              </div>
            </div>
          </aside>
        </div>

        {library !== null && (
          <SectionLibrary ctx={preview.ctx} theme={preview.theme} position={libraryPosition} onPick={insert} onClose={() => setLibrary(null)} />
        )}
      </div>
    </SiteIdContext.Provider>
  );
}
