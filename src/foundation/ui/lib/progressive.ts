// 長い一覧を段階に分けて描く決まり（React に依らない。読むのは hooks/useProgressiveRows.ts）。
// 一覧のページ（サイドバーのプロジェクトのチャットの一覧・ボード）を開いたら、初めは画面に入る数の行だけを描き、最初の描画が出たあと
// （2 回の frame のあと）割り込める作業（transition）の中で残りを描く。行の DOM は描き終えたあといまと同じにそろうので、
// キーでの移動・範囲の選択・ドラッグの前は ensureAll ですぐにそろえる。

/** いちばん低い行（1 行で出すサイドバーの行は約 28px）より少し低い高さ。最初に描く行の数をこれで決める（低い行でも画面を埋めるように） */
const ROW_MIN_PX = 24;
/** 最初に描く行に足す余り（スクロールし始めてすぐに見える分） */
const ROW_BUFFER = 8;

/** 最初に描く行の数（ページ全体で 1 つの上限。窓の高さ 880px で 45 行） */
export function firstRowLimit(viewportHeight: number): number {
  return Math.ceil(Math.max(0, viewportHeight) / ROW_MIN_PX) + ROW_BUFFER;
}

/**
 * 縦に並ぶまとまり（counts はまとまりごとの行の数・閉じているまとまりは 0）に、上から順に上限を配る。
 * 行の少ないまとまりの余りは次のまとまりへ回り、合計は limit を超えない。
 * limit が Infinity（最初の描画のあと）なら、どのまとまりも上限なし（Infinity）。行の数で切ると、counts に入れていない一覧
 * （まとまりの中のアーカイブ済みなど、同じ上限を読む別の一覧）が、そのまとまりの行の数までしか描かれず、残りが空の箱のままになった
 */
export function allocateRows(counts: readonly number[], limit: number): number[] {
  if (limit === Number.POSITIVE_INFINITY) return counts.map(() => Number.POSITIVE_INFINITY);
  let rest = limit;
  return counts.map((count) => {
    const given = Math.min(Math.max(0, count), Math.max(0, rest));
    rest -= given;
    return given;
  });
}

/** 横に並ぶ列（ボードのカンバンの列）のいちばん細い幅と列の間（.board-column の min-width 170px ＋ .board-columns の gap 10px） */
export const COLUMN_MIN_PX = 180;

/** 窓の幅に入りうる列の数（いちばん細い列を並べた数。描く前は列の幅が分からないので、多めに見る） */
export function columnsInView(viewportWidth: number): number {
  return Math.max(1, Math.ceil(Math.max(0, viewportWidth) / COLUMN_MIN_PX));
}

/**
 * 横に並ぶ列（count 本）に上限を配る: 窓に入りうる左の inView 本にはどれにも同じ上限（どれも上から見える）、右の見えない列は 0
 * （最初の描画のあと上限なしで描く）。limit が Infinity ならすべて
 */
export function allocateColumns(count: number, limit: number, inView: number): number[] {
  return Array.from({ length: count }, (_, i) => (limit === Number.POSITIVE_INFINITY || i < inView ? limit : 0));
}

/**
 * 1 つの一覧で描く行（budget はこの一覧に配った上限）。上限に収まれば同じ配列のまま、超えれば頭から上限の数だけと、省いた行の数
 * （呼ぶ側が省いた行の見積もりの高さの空の箱を置き、残りを足したときにスクロールバーのつまみが動かないようにする）
 */
export function progressiveSlice<T>(rows: readonly T[], budget: number): { shown: readonly T[]; omitted: number } {
  if (budget >= rows.length) return { shown: rows, omitted: 0 };
  const count = Math.max(0, Math.floor(budget));
  return { shown: rows.slice(0, count), omitted: rows.length - count };
}

export interface ProgressiveDeps {
  /** 次の描画の前に呼ぶ（requestAnimationFrame）。返す関数で取り消す */
  frame: (callback: () => void) => () => void;
  /** 割り込める作業として当てる（React の startTransition） */
  transition: (update: () => void) => void;
  /** すぐに描き終える（React の flushSync） */
  flushSync: (update: () => void) => void;
}

/** 段階に分けて描く予約の入れ物（ページごとの予約を持ち、すべてを一度にそろえられる） */
export interface Progressive {
  /**
   * ページを開いた: 最初の描画が出たあと（2 回の frame のあと）、transition の中で reveal（残りの行を描く）を呼ぶ。
   * 返す関数で予約を外す（残りを描き終えたとき・見え方を変えて開き直したとき・ページを閉じたとき。外した予約はあとから reveal を呼ばない）。
   * transition の描き直しは割り込まれて終わっていないことがあるので、外すまでは ensureAll の対象に残す
   */
  open: (reveal: () => void) => () => void;
  /** 予約中（transition で描き始めて、まだ外していないものも）のページの reveal を flushSync の中ですべて呼ぶ（キーでの移動・範囲の選択・ドラッグの前。予約がなければ何もしない） */
  ensureAll: () => void;
  /** 予約中のページの数（確かめ用） */
  pending: () => number;
}

export function createProgressive({ frame, transition, flushSync }: ProgressiveDeps): Progressive {
  const waiting = new Map<number, { reveal: () => void; cancel: () => void }>();
  let nextId = 0;
  const take = (id: number) => {
    const entry = waiting.get(id);
    if (entry) waiting.delete(id);
    return entry;
  };
  return {
    open(reveal) {
      const id = ++nextId;
      let cancel = frame(() => {
        cancel = frame(() => {
          cancel = () => {};
          transition(() => waiting.get(id)?.reveal());
        });
      });
      waiting.set(id, { reveal, cancel: () => cancel() });
      return () => take(id)?.cancel();
    },
    ensureAll() {
      if (waiting.size === 0) return;
      const entries = [...waiting.values()];
      waiting.clear();
      for (const entry of entries) entry.cancel();
      flushSync(() => {
        for (const entry of entries) entry.reveal();
      });
    },
    pending: () => waiting.size,
  };
}
