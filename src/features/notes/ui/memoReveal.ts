// メモの行へ移る頼み（⌘K の「メモ内の文言」から）。メモのタブがメモを開く前に頼み、そのメモを開いている MemoView が編集の部品の準備ができたら移る。
// もう開いているメモは知らせで、これから開くメモは編集の部品ができたときに受け取る（受け取られないまま古くなった頼みは捨てる）

/** 頼みを覚えておく時間（開くのに失敗したメモを、あとで開いたときに急に移らないように） */
const TTL_MS = 10_000;

type Listener = () => void;

const pending = new Map<string, { line: number; at: number }>();
const listeners = new Map<string, Set<Listener>>();
const keyOf = (projectId: number, path: string) => `${projectId}:${path}`;

/** そのメモのその行へ移るよう頼む（開いているそのメモに知らせる） */
export function requestMemoReveal(projectId: number, path: string, line: number) {
  const key = keyOf(projectId, path);
  pending.set(key, { line, at: Date.now() });
  for (const listener of listeners.get(key) ?? []) listener();
}

/** そのメモへの頼みを受け取る（受け取ったら消す。なければ・古ければ null） */
export function takeMemoReveal(projectId: number, path: string): number | null {
  const key = keyOf(projectId, path);
  const request = pending.get(key);
  if (!request) return null;
  pending.delete(key);
  return Date.now() - request.at <= TTL_MS ? request.line : null;
}

/** そのメモへの頼みを聞く（開いている MemoView。戻り値で聞くのをやめる） */
export function subscribeMemoReveal(projectId: number, path: string, listener: Listener): () => void {
  const key = keyOf(projectId, path);
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}
