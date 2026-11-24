// 欄の間で動かしたノート（このウィンドウで動かし始め、元の場所で開いていた文書がまだ残っているもの）。
// コアはファイルを動かした時点で元の欄の notes を知らせ（見張りも続けて知らせる）、そのあとノートのチャットを移してから応答する。
// 開いているタブは応答のあと付け替える（followMovedNote）が、描き直して元の場所の文書が外れるのはさらにそのあとなので、その間に届く知らせで
// 元の場所を読み直して 404 にならないよう、useNoteDocument がここを見て読み直しを省く。印は元の場所の文書がすべて外れたら外す（時間で待たない）
import { isUnder } from "@shared/foundation/path";

interface MovingNote {
  projectId: number;
  /** 動かしているノート・フォルダ（フォルダなら中のノートも含む） */
  path: string;
  /** 動かし終えた（あとは元の場所で開いていた文書が外れるのを待つ） */
  done: boolean;
}

const moving = new Set<MovingNote>();
/** このウィンドウで開いている文書（"<projectId>:<path>" ごとの数。同じノートを 2 つのペインで開くことがある） */
const open = new Map<string, number>();
const openKey = (projectId: number, path: string) => `${projectId}:${path}`;

/** 印の中で開いている文書があるか */
function stillOpen(m: MovingNote): boolean {
  for (const key of open.keys()) {
    const at = key.indexOf(":");
    if (Number(key.slice(0, at)) === m.projectId && isUnder(key.slice(at + 1), m.path)) return true;
  }
  return false;
}

/** 動かし終えて、元の場所の文書がもうない印を外す */
function sweep(): void {
  for (const m of moving) if (m.done && !stillOpen(m)) moving.delete(m);
}

/** そのノート（projectId の欄の path）を動かしている途中か（フォルダごと動かしているときの中のノートも） */
export function isNoteMoving(projectId: number, path: string): boolean {
  for (const m of moving) if (m.projectId === projectId && isUnder(path, m.path)) return true;
  return false;
}

/** 文書を開いた（閉じる・別のノートに替わるときに返り値を呼ぶ。useNoteDocument） */
export function trackOpenNote(projectId: number, path: string): () => void {
  const key = openKey(projectId, path);
  open.set(key, (open.get(key) ?? 0) + 1);
  return () => {
    const left = (open.get(key) ?? 1) - 1;
    if (left > 0) open.set(key, left);
    else open.delete(key);
    sweep();
  };
}

/**
 * run（動かす API と、開いているタブの付け替え）の間と、そのあと元の場所の文書が外れるまで、そのノート・フォルダを動かしている途中にする。
 * run が失敗したら（断られた・動かせなかった）すぐ印を外す（元の場所にあるので、読み直してよい）
 */
export async function whileNoteMoves<T>(projectId: number, path: string, run: () => Promise<T>): Promise<T> {
  const entry: MovingNote = { projectId, path, done: false };
  moving.add(entry);
  try {
    const result = await run();
    entry.done = true;
    return result;
  } catch (e) {
    moving.delete(entry);
    throw e;
  } finally {
    sweep();
  }
}
