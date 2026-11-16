// パネルのまだ描いていないチャットのタブを、表のタブに近い順に先読みする（メモの仕様書「0023_表示を軽くする」の案 4・分冊 3 の 1-4-7）。
// チャットのタブはサイドバーと連動して増え、中身は初めて表示したときに作るので、切り替えた最初の 1 回が「初めて開く」になる。
// 隣のタブを手すきのときに読んでおけば、切り替えたときに読み込みを待たない（頼むのは useTabPrefetch.ts）

/** 先読みするタブの数（パネル全体で） */
export const TAB_PREFETCH_LIMIT = 5;

/** ペインのタブの並びと表のタブ */
export interface PaneTabs {
  tabs: readonly string[];
  shown: string | null;
}

/**
 * 先読みするチャット（表のタブに近い順。ペインをまたいで近いものから limit 件）。chatOf はタブのチャットの ID（チャットのタブでない・
 * もう描いたタブは null）
 */
export function neighborChats(panes: readonly PaneTabs[], chatOf: (key: string) => number | null, limit = TAB_PREFETCH_LIMIT): number[] {
  const near: { distance: number; chatId: number }[] = [];
  for (const pane of panes) {
    const at = pane.shown === null ? 0 : Math.max(0, pane.tabs.indexOf(pane.shown));
    pane.tabs.forEach((key, i) => {
      const chatId = key === pane.shown ? null : chatOf(key);
      if (chatId !== null) near.push({ distance: Math.abs(i - at), chatId });
    });
  }
  near.sort((a, b) => a.distance - b.distance);
  return [...new Set(near.map((n) => n.chatId))].slice(0, limit);
}
