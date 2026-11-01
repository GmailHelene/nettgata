import type { ActionState } from "@/app/studio/actions";
import { ui } from "./ui";

export function FormStatus({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`whitespace-pre-line ${state.ok ? ui.success : ui.error}`}>
      {state.message}
    </p>
  );
}
