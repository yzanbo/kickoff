// ⌘⇧F で検索タブの検索欄にピントを置く頼み（app/shortcuts.ts → App が検索タブへ移ってから頼む）。
// もう開いている検索欄には知らせで、これから開く検索欄（タブを移った直後）は描いたときに受け取る

type Listener = () => void;

/** 頼みを覚えておく時間（検索タブが開かなかったとき、あとで開いた検索欄で急に文を選ばないように） */
const TTL_MS = 3000;

let pendingAt = 0;
const listeners = new Set<Listener>();

/** 検索欄にピントを置いて、書いてある文を選ぶよう頼む（開いている検索欄に知らせる） */
export function requestCodeSearchFocus() {
  pendingAt = Date.now();
  for (const listener of listeners) listener();
}

/** 頼みを受け取る（受け取ったら消す） */
export function takeCodeSearchFocus(): boolean {
  const had = pendingAt > 0 && Date.now() - pendingAt <= TTL_MS;
  pendingAt = 0;
  return had;
}

/** 頼みを聞く（開いている SearchView。戻り値で聞くのをやめる） */
export function subscribeCodeSearchFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
