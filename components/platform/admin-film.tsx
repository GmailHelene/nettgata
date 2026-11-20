"use client";

import { useEffect, useRef } from "react";

/**
 * Opptak av studioet med en oppdiktet demobutikk. Spilles av uten lyd når den kommer i bildet, men bare når den besøkende
 * ikke har bedt om mindre bevegelse. Kontrollene står alltid der, så filmen kan pauses (WCAG 2.2.2).
 */
export function AdminFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <figure>
      <video
        ref={ref}
        className="aspect-video w-full rounded-2xl bg-[#f2f4f5] shadow-xl ring-1 ring-[#1b232b]/15"
        src="/nettgata/film/nettbutikk-admin.mp4"
        poster="/nettgata/film/nettbutikk-admin-poster.jpg"
        width={1280}
        height={720}
        muted
        loop
        playsInline
        controls
        preload="none"
        aria-describedby="admin-film-tekst"
      />
      <figcaption id="admin-film-tekst" className="mt-3 text-sm text-[#5e6a75]">
        Filmen er uten lyd. Den viser en ordre som merkes som sendt med sporingsnummer, en ny vare med bilde og alt-tekst, og oversikten over salg
        og MVA. Butikken og kundene er oppdiktet.
      </figcaption>
    </figure>
  );
}
