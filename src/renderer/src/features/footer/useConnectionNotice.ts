import { useEffect, useState } from "react";
import type { ConnectionState } from "@/api/useServerConnection";

/** つながらないまま、これだけ経ったら札を出す（起動の直後・一瞬の切断で毎回ちらつかないように） */
const NOTICE_DELAY_MS = 2000;

/**
 * 下の帯にサーバーとの接続の札を出すか。つながっている間は出さない。つなぎ直し中（connecting）は、
 * つながらないまま NOTICE_DELAY_MS 経ってから出し、切れた（closed）ときはすぐ出す。一度出したら、つながるまで出したまま
 * （closed と connecting を行き来しても消えたり出たりしない）
 */
export function useConnectionNotice(state: ConnectionState): boolean {
  const down = state !== "open";
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!down) return setLate(false);
    const timer = setTimeout(() => setLate(true), NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [down]);
  return down && (late || state === "closed");
}
