import { useCallback, useState } from "react";
import { heldMetaOf, type HeldMeta, type KeyInput } from "@/lib/keys";
import { useWindowEvent } from "./useWindowEvent";

/**
 * ⌘ を押している間（⌘Enter・⌘⇧Enter で使われるボタンを光らせる。チャット欄・送信待ちの書き直しで共通）。
 * 欄の keydown / keyup に track を渡す。⌘ を離した（欄の外でも）・Kickoff が後ろに回った・欄からピントが出た（clear）ら消える
 */
export function useHeldMeta(): { held: HeldMeta; track: (e: KeyInput) => void; clear: () => void } {
  const [held, setHeld] = useState<HeldMeta>(null);
  const track = useCallback((e: KeyInput) => setHeld(heldMetaOf(e)), []);
  const clear = useCallback(() => setHeld(null), []);
  useWindowEvent("keyup", (e) => {
    if (!e.metaKey) setHeld(null);
  });
  useWindowEvent("blur", clear);
  return { held, track, clear };
}
