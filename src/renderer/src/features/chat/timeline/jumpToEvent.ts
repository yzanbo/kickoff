/**
 * チャットの発言（id が `ev-<イベント ID>` の要素）か、そのツールの呼び出しを含むまとまり（`data-tool-ids`）までスクロールして、一瞬強調する。
 * 検索結果から開いたとき・指示の履歴・⌘⌥↑ / ↓・上に貼り付けた自分の発言・動きの行から移るときに使う（サブエージェントのカードの窓の中にも届く）。見つからなければ false
 */
export function jumpToEvent(root: ParentNode, eventId: number): boolean {
  const target = root.querySelector<HTMLElement>(`#ev-${eventId}`) ?? root.querySelector<HTMLElement>(`[data-tool-ids~="${eventId}"]`);
  if (!target) return false;
  target.scrollIntoView({ block: "center" });
  target.classList.remove("flash");
  void target.offsetWidth; // アニメーションをやり直すため
  target.classList.add("flash");
  return true;
}
