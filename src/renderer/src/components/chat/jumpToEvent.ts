/**
 * チャットの発言（id が `ev-<イベント ID>` の要素）までスクロールして、一瞬強調する。
 * 検索結果から開いたとき・発言の目次・上に貼り付けた自分の発言から移るときに使う。見つからなければ false
 */
export function jumpToEvent(root: ParentNode, eventId: number): boolean {
  const target = root.querySelector<HTMLElement>(`#ev-${eventId}`);
  if (!target) return false;
  target.scrollIntoView({ block: "center" });
  target.classList.remove("flash");
  void target.offsetWidth; // アニメーションをやり直すため
  target.classList.add("flash");
  return true;
}
