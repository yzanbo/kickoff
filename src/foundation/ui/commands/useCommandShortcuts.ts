import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { commandContext, runCommandKey } from "./commands";

/** 殻が 1 回: window の keydown でコマンドの表を引いて走らせる（capture の項目はほかより先に受ける） */
export function useCommandShortcuts(window: "main" | "popout"): void {
  const onKey = (phase: "capture" | "bubble") => (e: KeyboardEvent) => {
    if (runCommandKey(e, commandContext(window, e), phase)) e.preventDefault();
  };
  useWindowEvent("keydown", onKey("bubble"));
  useWindowEvent("keydown", onKey("capture"), true, true);
}
