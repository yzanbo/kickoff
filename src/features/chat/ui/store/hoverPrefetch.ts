// チャットを開く所（サイドバーの行・ボードのカード・パネルのタブ）に乗せて少し待ったら、そのチャットを先読みする
// 画面全体で 1 つの pointerover の見張り（useChatStore.ts が付ける）。
// 乗せただけで通り過ぎたもの（HOVER_PREFETCH_MS より短い）は読まない

/** 乗せてから先読みするまでの時間 */
export const HOVER_PREFETCH_MS = 120;

/** 先読みする要素（サイドバーのチャットの行・ボードのカード・パネルのチャットと子チャットのタブ。行の側が data-prefetch-chat="<ID>" を付ける） */
const TARGETS = "[data-prefetch-chat]";

/** 乗せた要素から、先読みするチャットの ID（なければ null） */
export function prefetchTargetOf(el: Element | null): number | null {
  const hit = el?.closest<HTMLElement>(TARGETS);
  if (!hit) return null;
  const id = Number(hit.dataset.prefetchChat);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createHoverPrefetch(deps: { timer: (fn: () => void, ms: number) => () => void; prefetch: (chatId: number) => void }) {
  let current: number | null = null;
  let cancel: (() => void) | null = null;
  return {
    /** 乗せている要素が変わった（pointerover の target） */
    over(el: Element | null) {
      const id = prefetchTargetOf(el);
      if (id === current) return;
      cancel?.();
      cancel = null;
      current = id;
      if (id === null) return;
      cancel = deps.timer(() => {
        cancel = null;
        deps.prefetch(id);
      }, HOVER_PREFETCH_MS);
    },
  };
}
