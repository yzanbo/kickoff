// ノートの行へ移る頼み（⌘K の「ノート内の文言」から）。ノートのタブがノートを開く前に頼み、そのノートを開いている NoteView が編集の部品の準備ができたら移る。
// もう開いているノートは知らせで、これから開くノートは編集の部品ができたときに受け取る（受け取られないまま古くなった頼みは捨てる）

/** 頼みを覚えておく時間（開くのに失敗したノートを、あとで開いたときに急に移らないように） */
const TTL_MS = 10_000;

type Listener = () => void;

const pending = new Map<string, { line: number; at: number }>();
const listeners = new Map<string, Set<Listener>>();
const keyOf = (projectId: number, path: string) => `${projectId}:${path}`;

/** そのノートのその行へ移るよう頼む（開いているそのノートに知らせる） */
export function requestNoteReveal(projectId: number, path: string, line: number) {
  const key = keyOf(projectId, path);
  pending.set(key, { line, at: Date.now() });
  for (const listener of listeners.get(key) ?? []) listener();
}

/** そのノートへの頼みを受け取る（受け取ったら消す。なければ・古ければ null） */
export function takeNoteReveal(projectId: number, path: string): number | null {
  const key = keyOf(projectId, path);
  const request = pending.get(key);
  if (!request) return null;
  pending.delete(key);
  return Date.now() - request.at <= TTL_MS ? request.line : null;
}

/** そのノートへの頼みを聞く（開いている NoteView。戻り値で聞くのをやめる） */
export function subscribeNoteReveal(projectId: number, path: string, listener: Listener): () => void {
  const key = keyOf(projectId, path);
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}
