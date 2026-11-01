import Link from "next/link";
import type { ReactNode } from "react";
import { heading, StreetSign } from "@/components/brand";
import { Skyline } from "./skyline";
import { ui } from "./ui";

/**
 * Rammen rundt innloggingen: skjemaet til venstre og gata i skumring til høyre. På mobil står gata som en
 * smal stripe nederst, så skjemaet kommer først og siden ikke ser tom ut under det.
 */
export function AuthShell({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-screen flex-col lg:min-h-0">
        <header className="px-5 pt-6 sm:px-10">
          <Link href="/" className="inline-flex rounded-md">
            <StreetSign />
            <span className="sr-only">, til forsiden</span>
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
          <p className={ui.eyebrow}>Studio</p>
          <h1 className={`${heading} text-[2.15rem] leading-[1.05] sm:text-[2.5rem]`}>{title}</h1>
          {intro && <div className={`mt-3 ${ui.muted}`}>{intro}</div>}
          <div className="mt-8">{children}</div>
          {footer}
        </main>
        <div className="lg:hidden">
          <Skyline compact />
        </div>
      </div>
      <div className="relative hidden flex-col justify-end overflow-hidden bg-[linear-gradient(to_bottom,#0f2c55,#173b6c_55%,#24508a)] lg:flex">
        <Skyline />
      </div>
    </div>
  );
}
