import type { ActionState } from "@/app/studio/actions";

export function FormStatus({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`whitespace-pre-line rounded-md p-3 text-sm ${state.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
    >
      {state.message}
    </p>
  );
}
