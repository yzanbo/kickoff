/**
 * ピントのある要素を、いちばん内側で含んでいる欄の覚える名前（パネルの根の data-panel-key）。どの欄にもなければ undefined。
 * 入れ子の欄（チャットの中の右の欄）でキーを押したとき、外側の欄（ボードの右のパネル）が同じキーで動かないようにするため
 */
export function focusedPanelKey(): string | undefined {
  const el = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-panel-key]") : null;
  return el?.dataset.panelKey;
}

/** ピントが、この欄の中にある入れ子の別の欄にあるか（そのときは、この欄はキーを受け取らない） */
export function focusInNestedPanel(key: string): boolean {
  const inner = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-panel-key]") : null;
  if (!inner || inner.dataset.panelKey === key) return false;
  return inner.parentElement?.closest(`[data-panel-key="${CSS.escape(key)}"]`) != null;
}
