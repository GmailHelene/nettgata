"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MediaPicker } from "@/components/studio/media-picker";
import { ui } from "@/components/studio/ui";
import { blockTypes, emptyBlock, MAX_BLOCKS, MAX_PREHEADER, MAX_SUBJECT, sendProblems, type BlockType, type NewsletterBlock } from "@/lib/nyhetsbrev/blocks";
import { newsletterEmail, type NewsletterSite } from "@/lib/nyhetsbrev/email";
import { mediaThumb } from "@/lib/media-types";
import { saveNewsletterDraftAction, sendNewsletterAction, sendNewsletterTestAction, type ComposerState } from "./actions";

type Draft = { id: string | null; subject: string; preheader: string; blocks: NewsletterBlock[] };

const input = "w-full rounded-lg border border-[#8a96a1] bg-white px-3 py-2";

/**
 * Skriv nyhetsbrevet: emne, forhåndsvisningstekst og noen enkle blokker. Forhåndsvisningen ved siden av er
 * nøyaktig den e-posten abonnentene får, bygget av samme kode (lib/nyhetsbrev/email.ts).
 */
export function NewsletterComposer({
  siteId,
  site,
  draft,
  recipients,
  canSend,
  emailOn,
}: {
  siteId: string;
  site: NewsletterSite;
  draft: Draft | null;
  recipients: number;
  canSend: boolean;
  emailOn: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(draft?.id ?? null);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [preheader, setPreheader] = useState(draft?.preheader ?? "");
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(draft?.blocks.length ? draft.blocks : [emptyBlock("overskrift"), emptyBlock("tekst")]);
  const [state, setState] = useState<ComposerState>(null);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  const content = { subject, preheader, blocks };
  const problems = sendProblems({ subject: subject.trim(), preheader, blocks });
  const preview = useMemo(
    () => newsletterEmail({ subject, preheader, blocks }, site, `${site.baseUrl}/nyhetsbrev/avmeld`).html,
    [subject, preheader, blocks, site],
  );

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (state) statusRef.current?.focus();
  }, [state]);

  const update = (i: number, change: Partial<NewsletterBlock>) =>
    setBlocks((list) => list.map((b, j) => (j === i ? ({ ...b, ...change } as NewsletterBlock) : b)));
  const move = (i: number, by: -1 | 1) =>
    setBlocks((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  const run = (action: typeof saveNewsletterDraftAction, after?: (result: ComposerState) => void) =>
    start(async () => {
      const result = await action(siteId, id, content);
      if (result?.id) setId(result.id);
      setState(result);
      after?.(result);
    });

  const send = () =>
    run(sendNewsletterAction, (result) => {
      setConfirming(false);
      if (!result?.ok) return;
      setId(null);
      setSubject("");
      setPreheader("");
      setBlocks([emptyBlock("overskrift"), emptyBlock("tekst")]);
      router.refresh();
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {!emailOn && <p className={ui.error}>E-post er ikke slått på ennå. Det som sendes, lagres bare i loggen og kommer ikke fram.</p>}
        <label className="block">
          <span className={ui.label}>Emne</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MAX_SUBJECT} className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Forhåndsvisningstekst</span>
          <span id="preheader-hjelp" className={`mb-1.5 block text-sm ${ui.muted}`}>
            Vises etter emnet i innboksen. Valgfri.
          </span>
          <input
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            maxLength={MAX_PREHEADER}
            aria-describedby="preheader-hjelp"
            className={input}
          />
        </label>

        <ol className="space-y-4">
          {blocks.map((block, i) => (
            <li key={i}>
              <fieldset className={`${ui.card} p-4`}>
                <legend className="px-1 font-semibold">
                  {i + 1}. {blockTypes[block.type]}
                </legend>
                {block.type === "overskrift" && (
                  <label className="block">
                    <span className={ui.label}>Overskrift</span>
                    <input value={block.tekst} onChange={(e) => update(i, { tekst: e.target.value })} maxLength={150} className={input} />
                  </label>
                )}
                {block.type === "tekst" && (
                  <label className="block">
                    <span className={ui.label}>Tekst</span>
                    <span id={`tekst-hjelp-${i}`} className={`mb-1.5 block text-sm ${ui.muted}`}>
                      En tom linje gir nytt avsnitt.
                    </span>
                    <textarea
                      value={block.tekst}
                      onChange={(e) => update(i, { tekst: e.target.value })}
                      maxLength={5000}
                      rows={6}
                      aria-describedby={`tekst-hjelp-${i}`}
                      className={input}
                    />
                  </label>
                )}
                {block.type === "bilde" && (
                  <div className="space-y-3">
                    {block.src && (
                      // eslint-disable-next-line @next/next/no-img-element -- bilde fra eget lager, bare som miniatyr
                      <img src={mediaThumb(block.src)} alt="" className="max-h-40 rounded-md border border-[#d5dbe0]" />
                    )}
                    <button type="button" onClick={() => setPicking(i)} className={ui.buttonGhost}>
                      {block.src ? "Bytt bilde" : "Velg bilde"}
                    </button>
                    <label className="block">
                      <span className={ui.label}>Hva viser bildet?</span>
                      <input value={block.alt} onChange={(e) => update(i, { alt: e.target.value })} maxLength={200} className={input} />
                    </label>
                  </div>
                )}
                {block.type === "knapp" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={ui.label}>Knappetekst</span>
                      <input value={block.tekst} onChange={(e) => update(i, { tekst: e.target.value })} maxLength={60} className={input} />
                    </label>
                    <label className="block">
                      <span className={ui.label}>Lenke</span>
                      <input
                        value={block.lenke}
                        onChange={(e) => update(i, { lenke: e.target.value })}
                        maxLength={500}
                        placeholder="/kontakt eller https://"
                        className={input}
                      />
                    </label>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={`${ui.link} disabled:opacity-40`} aria-label={`Flytt blokk ${i + 1} opp`}>
                    Flytt opp
                  </button>
                  <button
                    type="button"
                    disabled={i === blocks.length - 1}
                    onClick={() => move(i, 1)}
                    className={`${ui.link} disabled:opacity-40`}
                    aria-label={`Flytt blokk ${i + 1} ned`}
                  >
                    Flytt ned
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlocks((list) => list.filter((_, j) => j !== i))}
                    className="font-medium text-[#a13a2c] underline underline-offset-4"
                    aria-label={`Fjern blokk ${i + 1}`}
                  >
                    Fjern
                  </button>
                </div>
              </fieldset>
            </li>
          ))}
        </ol>

        {blocks.length < MAX_BLOCKS && (
          <div>
            <p className={ui.label} id="legg-til">
              Legg til
            </p>
            <div role="group" aria-labelledby="legg-til" className="flex flex-wrap gap-2">
              {(Object.keys(blockTypes) as BlockType[]).map((type) => (
                <button key={type} type="button" onClick={() => setBlocks((list) => [...list, emptyBlock(type)])} className={ui.buttonGhost}>
                  {blockTypes[type]}
                </button>
              ))}
            </div>
          </div>
        )}

        {state && (
          <p ref={statusRef} tabIndex={-1} role={state.ok ? "status" : "alert"} className={`whitespace-pre-line outline-none ${state.ok ? ui.success : ui.error}`}>
            {state.message}
          </p>
        )}

        {canSend ? (
          <div className="flex flex-wrap gap-3 border-t border-[#d5dbe0] pt-5">
            <button type="button" disabled={pending} onClick={() => run(saveNewsletterDraftAction)} className={ui.buttonGhost}>
              Lagre kladd
            </button>
            <button type="button" disabled={pending} onClick={() => run(sendNewsletterTestAction)} className={ui.buttonGhost}>
              Send testutgave til meg
            </button>
            <button
              type="button"
              disabled={pending || recipients === 0}
              onClick={() => (problems.length ? setState({ ok: false, message: problems.join("\n") }) : setConfirming(true))}
              className={ui.button}
            >
              Send til {recipients} {recipients === 1 ? "abonnent" : "abonnenter"}
            </button>
          </div>
        ) : (
          <p className={ui.muted}>Bare eier og redaktør kan skrive og sende nyhetsbrev.</p>
        )}
        {recipients === 0 && canSend && (
          <p className={`text-sm ${ui.muted}`}>Ingen har bekreftet påmeldingen ennå. Legg seksjonen «Nyhetsbrev» på en side, så folk kan melde seg på.</p>
        )}

        {confirming && (
          <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-labelledby="bekreft-sending" className={`${ui.card} space-y-3 border-2 border-[#173b6c] p-5 outline-none`}>
            <p id="bekreft-sending" className="font-semibold">
              Sende «{subject.trim()}» til {recipients} {recipients === 1 ? "abonnent" : "abonnenter"} nå? Det kan ikke angres.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={pending} onClick={send} className={ui.button}>
                {pending ? "Sender..." : "Ja, send nå"}
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={ui.buttonGhost}>
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <h2 className="mb-2 font-semibold">Slik ser e-posten ut</h2>
        <iframe title="Forhåndsvisning av nyhetsbrevet" srcDoc={preview} sandbox="" className="h-[720px] w-full rounded-xl border border-[#d5dbe0] bg-white" />
      </div>

      {picking !== null && (
        <MediaPicker
          siteId={siteId}
          onPick={(item) => {
            const current = blocks[picking];
            update(picking, { src: item.src, alt: current?.type === "bilde" && current.alt ? current.alt : item.alt });
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
