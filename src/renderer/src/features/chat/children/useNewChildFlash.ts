// 子チャットが新しく作られたことを、入力欄の上の「子チャット n 件」の札を少しの間光らせて知らせる
import { useEffect, useRef, useState } from "react";
import type { Chat } from "@shared/types";

/** 作られてからこの間に一覧に現れた子だけ光らせる（画面を開き直したときに、前からある子で光らせない） */
const FRESH_MS = 10_000;
/** 光らせる長さ（CSS の child-chats-new のアニメーションと合わせる） */
const FLASH_MS = 2_400;
/** 光らせ済みの子（画面を開き直しても、同じ子で二度光らせない） */
const flashed = new Set<number>();

/** 渡した子チャットに、作られたばかりでまだ光らせていないものが現れたら、少しの間 true */
export function useNewChildFlash(children: readonly Chat[] | undefined): boolean {
  const [flashing, setFlashing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const fresh = (children ?? []).filter((c) => !flashed.has(c.id) && Date.now() - new Date(c.created_at).getTime() < FRESH_MS);
    if (fresh.length === 0) return;
    fresh.forEach((c) => flashed.add(c.id));
    // 光っている間に次の子ができたら、初めから光らせ直す（class を一度外してアニメーションをやり直す）
    setFlashing(false);
    requestAnimationFrame(() => setFlashing(true));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlashing(false), FLASH_MS);
  }, [children]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return flashing;
}
