"use client";

import { useState } from "react";
import type { ProductImage } from "@/db/schema";
import { focusStyle, mediaSrcSet } from "@/lib/media-types";

/** Bildebredden i varesiden: hele bredden på mobil, halve på større skjermer (to kolonner, maks 460 px). */
const sizes = {
  mobile: "calc(100vw - 40px)",
  main: "(min-width: 1024px) 460px, calc(50vw - 40px)",
  thumb: "(min-width: 1024px) 82px, calc(10vw - 10px)",
};

/** Stort bilde med miniatyrer under. På mobil kan bildene sveipes sideveis. */
export function Gallery({ images }: { images: ProductImage[] }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return <div className="aspect-square w-full rounded-[var(--radius)] bg-[var(--c-surface)]" />;
  const current = images[Math.min(active, images.length - 1)];

  return (
    <div className="space-y-3">
      {/* Mobil: sveip mellom bildene. */}
      <ul className="-mx-5 flex snap-x snap-mandatory overflow-x-auto md:hidden">
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
