/**
 * Nettgata sin identitet, delt av salgssiden og studioet: det emaljerte gateskiltet, fontene og fargene.
 * Gateblått (emalje) er hovedfargen, asfalt er teksten, kalk er bakgrunnen. Fargene på hvitt holder WCAG AA.
 */

export const heading = "font-[family-name:var(--font-bricolage)] font-extrabold tracking-[-0.025em]";
export const signType = "font-[family-name:var(--font-barlow)] font-bold uppercase tracking-[0.14em]";

/** Logoen er et emaljert gateskilt: hvit skrift og hvit kant på gateblått. */
export function StreetSign({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex rounded-[6px] bg-[#173b6c] p-[3px] shadow-[0_1px_0_rgb(0_0_0/0.3)]">
      <span
        className={`${signType} rounded-[4px] border-2 border-white leading-none text-white ${size === "lg" ? "px-3.5 pb-1 pt-1.5 text-xl" : "px-2.5 pb-[3px] pt-[5px] text-[1.05rem]"}`}
      >
        Nettgata
      </span>
    </span>
  );
}
