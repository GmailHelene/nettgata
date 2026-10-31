export const orderStatusLabel: Record<string, { text: string; className: string }> = {
  pending_payment: { text: "Venter på betaling", className: "bg-amber-100 text-amber-900" },
  paid: { text: "Betalt, klar til sending", className: "bg-blue-100 text-blue-900" },
  fulfilled: { text: "Sendt eller hentet", className: "bg-green-100 text-green-900" },
  cancelled: { text: "Kansellert", className: "bg-neutral-200 text-neutral-800" },
  refunded: { text: "Refundert", className: "bg-neutral-200 text-neutral-800" },
};
