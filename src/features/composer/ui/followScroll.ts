/** 一番下からのずれがこれ以下なら寄せない（書くたびにスクロールの知らせが起きるため） */
export const SNAP_PX = 2;

/** 一番下に寄せる先の scrollTop（寄せなくてよければ null）。中身が枠より短ければ 0 */
export function snapTarget(m: { scrollTop: number; scrollHeight: number; clientHeight: number }): number | null {
  const bottom = Math.max(0, m.scrollHeight - m.clientHeight);
  return Math.abs(bottom - m.scrollTop) <= SNAP_PX ? null : bottom;
}

/** スクロールする枠の中で押したキーが、上へ戻すキーか（↑・PageUp・Home・Shift+Space。修飾キー付きはほかの操作なので外す） */
export function scrollsUpKey(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === " ") return e.shiftKey;
  return !e.shiftKey && (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home");
}
