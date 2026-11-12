import type { RevealRequest } from "../../browser/control.js";

/**
 * 1 回の作業（Turn）の間に、AI が使うブラウザのタブを表に出すかを決める（browserTools.ts の MCP サーバーは作業ごとに作るので、作業ごとに 1 つ）。
 * 作業の初めにタブを使うとき 1 回だけ、そのタブのある欄を開いて表に出す（利用者が AI の操作に気づけるように。Auto mode では承認カードが出ないため）。
 * そのあと別のタブに移ったときは、利用者がまだ前のタブを見ているときだけ切り替える（画面の側が after で確かめる）。
 * 表に出せなかった（利用者がほかのタブに切り替えた・欄を閉じた）・background を頼まれたら、その作業の間はもう表に出さない
 */
export function turnReveal(reveal: (tabId: number, request: RevealRequest) => Promise<boolean>) {
  /** この作業で表に出したタブ（まだなら null） */
  let shown: number | null = null;
  /** この作業の間はもう表に出さない */
  let stopped = false;

  /** 表に出す頼み（出さないなら null）。background なら、この作業の間は出さない */
  const request = (background?: boolean): RevealRequest | null => {
    if (background) stopped = true;
    return stopped ? null : { after: shown };
  };

  /** 表に出したかを覚える（出せなかったら、この作業の間はもう出さない） */
  const settle = (tabId: number, revealed: boolean) => {
    if (revealed) shown = tabId;
    else stopped = true;
  };

  return {
    request,
    settle,
    /** 既存のタブを使う前に呼ぶ（表に出すなら、画面が出し終えるまで待つ。失敗してもツールは止めない） */
    async use(tabId: number, background?: boolean): Promise<void> {
      const ask = request(background);
      if (!ask || shown === tabId) return;
      settle(tabId, await reveal(tabId, ask).catch(() => false));
    },
  };
}
