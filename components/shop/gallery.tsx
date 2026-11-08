"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductImage } from "@/db/schema";
import { focusStyle, mediaSrcSet } from "@/lib/media-types";

/** Bildebredden i varesiden: hele bredden på mobil, halve på større skjermer (to kolonner, maks 460 px). */
const sizes = {
  mobile: "calc(100vw - 40px)",
  main: "(min-width: 1024px) 460px, calc(50vw - 40px)",
  thumb: "(min-width: 1024px) 82px, calc(10vw - 10px)",
};

/** Sendes av kjøpsknappen når kunden velger en farge med eget bilde. Detail er adressen til bildet. */
export const VARIANT_IMAGE_EVENT = "nettgata:variantbilde";

/** Stort bilde med miniatyrer under. På mobil kan bildene sveipes sideveis. */
export function Gallery({ images }: { images: ProductImage[] }) {
  const [active, setActive] = useState(0);
  const mobileList = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const show = (e: Event) => {
      const index = images.findIndex((img) => img.src === (e as CustomEvent<string>).detail);
      if (index < 0) return;
      setActive(index);
      const list = mobileList.current;
      if (list) list.scrollTo({ left: index * list.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    window.addEventListener(VARIANT_IMAGE_EVENT, show);
    return () => window.removeEventListener(VARIANT_IMAGE_EVENT, show);
  }, [images]);

  // Uten bilder: ingen stor grå boks på mobil, der den skjøv pris og kjøpsknapp ut av syne. På PC holder den plassen i oppsettet.
  if (images.length === 0) return <div role="img" aria-label="Bilde kommer" className="ng-art hidden aspect-square w-full rounded-[var(--radius)] md:block" />;
  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      {/* Mobil: sveip mellom bildene. */}
      <ul ref={mobileList} className="-mx-5 flex snap-x snap-mandatory overflow-x-auto md:hidden">
        {images.map((img, i) => (
          <li key={i} className="w-full shrink-0 snap-center px-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              srcSet={mediaSrcSet(img.src)}
              sizes={sizes.mobile}
              alt={img.decorative ? "" : img.alt}
              loading={i === 0 ? "eager" : "lazy"}
              // Det første varebildet er det største på skjermen (LCP) og hentes før alt annet.
              fetchPriority={i === 0 ? "high" : undefined}
              style={focusStyle(img.focus)}
              className="aspect-square w-full rounded-[var(--radius)] object-cover"
            />
          </li>
        ))}
      </ul>
      {images.length > 1 && <p className="text-center text-xs text-[var(--c-muted)] md:hidden">Sveip for flere bilder ({images.length})</p>}

      {/* Desktop: stort bilde og miniatyrer. */}
      <div className="hidden md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          srcSet={mediaSrcSet(current.src)}
          sizes={sizes.main}
          alt={current.decorative ? "" : current.alt}
          fetchPriority="high"
          style={focusStyle(current.focus)}
          className="aspect-square w-full rounded-[var(--radius)] object-cover"
        />
        {images.length > 1 && (
          <ul className="mt-3 grid grid-cols-5 gap-3">
            {images.map((img, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Vis bilde ${i + 1}`}
                  aria-current={i === active}
                  className="block w-full overflow-hidden rounded-[var(--radius)] ring-offset-2 aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--c-primary)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    srcSet={mediaSrcSet(img.src)}
                    sizes={sizes.thumb}
                    alt=""
                    loading="lazy"
                    style={focusStyle(img.focus)}
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
