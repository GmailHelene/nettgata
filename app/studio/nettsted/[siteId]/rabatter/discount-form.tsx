"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DiscountInput, DiscountKind } from "@/lib/shop/discounts";
import { parseNok } from "@/lib/shop/money";
import { saveDiscountAction } from "../../../shop-actions";

const inputClass = "w-full rounded-md border border-neutral-400 px-3 py-2";
const kr = (ore: number | null | undefined) => (ore ? (ore / 100).toFixed(2).replace(".", ",").replace(/,00$/, "") : "");

const kinds: { key: DiscountKind; label: string; hint: string }[] = [
  { key: "percent", label: "Prosent", hint: "For eksempel 20 % på alle varene" },
  { key: "amount", label: "Beløp", hint: "For eksempel 100 kr av varene" },
  { key: "free_shipping", label: "Fri frakt", hint: "Frakten blir gratis, varene koster det samme" },
];

/** Lag en kode som «VINTER20» som kunden skriver i kassen. */
function suggestCode(): string {
  const words = ["VELKOMMEN", "HOST", "VINTER", "VAAR", "SOMMER", "TAKK", "VIP"];
  return `${words[Math.floor(Math.random() * words.length)]}${10 + Math.floor(Math.random() * 30)}`;
}

export function DiscountForm({ siteId, discountId, initial }: { siteId: string; discountId: string | null; initial?: DiscountInput }) {
  const router = useRouter();
  const [code, setCode] = useState(initial?.code ?? "");
  const [kind, setKind] = useState<DiscountKind>(initial?.kind ?? "percent");
  const [value, setValue] = useState(initial ? (initial.kind === "amount" ? kr(initial.value) : String(initial.value || "")) : "");
  const [minimum, setMinimum] = useState(kr(initial?.minSubtotalOre));
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [limit, setLimit] = useState(initial?.usageLimit ? String(initial.usageLimit) : "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const fail = (text: string) => setMessage({ ok: false, text });
    let amount = 0;
    if (kind === "percent") {
      amount = Number(value);
      if (!/^\d+$/.test(value.trim())) return fail("Skriv prosenten som et helt tall, for eksempel 20");
    } else if (kind === "amount") {
      const ore = parseNok(value);
      if (ore === null) return fail("Skriv beløpet i kroner, for eksempel 100");
      amount = ore;
    }
    const minOre = minimum.trim() ? parseNok(minimum) : null;
    if (minimum.trim() && minOre === null) return fail("Ugyldig minstebeløp");
    if (limit.trim() && !/^\d+$/.test(limit.trim())) return fail("Bruksgrensen må være et helt tall");

    startTransition(async () => {
      const result = await saveDiscountAction(siteId, discountId, {
        code,
        kind,
        value: amount,
        minSubtotalOre: minOre,
        startDate,
        endDate,
        usageLimit: limit.trim() ? Number(limit) : null,
        active,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (!result.ok) return;
      if (discountId) router.refresh();
      else {
        setCode("");
        setValue("");
        setMinimum("");
        setStartDate("");
        setEndDate("");
        setLimit("");
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Koden kunden skriver i kassen</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={30} autoComplete="off" className={`${inputClass} uppercase`} />
        </label>
        <button type="button" onClick={() => setCode(suggestCode())} className="mb-0.5 text-sm underline">
          Foreslå en kode
        </button>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Type rabatt</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {kinds.map((k) => (
            <label key={k.key} className="flex cursor-pointer gap-2 rounded-md border p-3 has-[:checked]:border-[#173b6c] has-[:checked]:bg-neutral-50">
              <input type="radio" name="kind" checked={kind === k.key} onChange={() => setKind(k.key)} className="mt-1" />
              <span>
                <span className="block font-medium">{k.label}</span>
                <span className="text-xs text-neutral-600">{k.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind !== "free_shipping" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{kind === "percent" ? "Prosent" : "Beløp (kr)"}</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" required className={inputClass} />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Gjelder ved kjøp over (kr, valgfritt)</span>
          <input value={minimum} onChange={(e) => setMinimum(e.target.value)} inputMode="decimal" placeholder="Ingen grense" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fra og med (valgfritt)</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Til og med (valgfritt)</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Kan brukes antall ganger totalt (valgfritt)</span>
          <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" placeholder="Ubegrenset" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Koden er på
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? "Lagrer..." : discountId ? "Lagre endringer" : "Opprett rabattkode"}
        </button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-green-800" : "font-medium text-red-800"}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
