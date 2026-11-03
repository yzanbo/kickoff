import { useState } from "react";
import { useWindowEvent } from "./useWindowEvent";

/** Kickoff のウィンドウがいちばん前にあって、操作を受けているか（ほかのアプリを使っている間は false） */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useWindowEvent("focus", () => setFocused(true));
  useWindowEvent("blur", () => setFocused(false));
  return focused;
}
