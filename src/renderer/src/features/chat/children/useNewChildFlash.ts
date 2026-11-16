// 子チャットが新しく作られたことを、入力欄の上の「子チャット n 件」の札を少しの間光らせて知らせる
import { useEffect, useRef, useState } from "react";
import type { Chat } from "@shared/types";

/** 画面を描いたときに、この間に作られた子だけ光らせる（画面を開き直したときに、前からある子で光らせない） */
const FRESH_MS = 10_000;
/** 光らせる長さ（CSS の child-chats-new のアニメーションと合わせる） */
const FLASH_MS = 2_400;
/** 光らせ済みの子（画面を開き直しても、同じ子で二度光らせない） */
const flashed = new Set<number>();

/** 光らせる子: since（ms）より後に作られ、まだ光らせていないもの */
export function freshChildren(children: readonly Pick<Chat, "id" | "created_at">[], since: number, done: ReadonlySet<number>): number[] {
  return children.filter((c) => !done.has(c.id) && new Date(c.created_at).getTime() > since).map((c) => c.id);
}

/**
 * 渡した子チャットに、新しく作られてまだ光らせていないものが現れたら、少しの間 true。
 * 会話の欄を裏のタブで止めている間（Activity の hidden）は光らせず、表に戻したら、隠していた間に作られた子で光らせる
 * （隠すときに光っていれば消す。消さないと、片付けでタイマーが止まって光ったまま残る。メモの仕様書「0023_表示を軽くする」の U6）
 */
export function useNewChildFlash(children: readonly Chat[] | undefined): boolean {
  const [flashing, setFlashing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // ここより後に作られた子を光らせる（初めは少し前から。隠したらその時刻）
  const seenAt = useRef(Date.now() - FRESH_MS);
  useEffect(() => {
    const fresh = freshChildren(children ?? [], seenAt.current, flashed);
    if (fresh.length === 0) return;
    fresh.forEach((id) => flashed.add(id));
    // 光っている間に次の子ができたら、初めから光らせ直す（class を一度外してアニメーションをやり直す）
    setFlashing(false);
    requestAnimationFrame(() => setFlashing(true));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlashing(false), FLASH_MS);
  }, [children]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      seenAt.current = Date.now();
      setFlashing(false);
    },
    [],
  );
  return flashing;
}
