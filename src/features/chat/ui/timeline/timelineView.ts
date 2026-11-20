import { useSyncExternalStore } from "react";
import { createLruMap, type LruMap } from "@/foundation/ui/lib/lruMap";
import { createCell, type Cell } from "@/foundation/ui/store";

/**
 * 流れの見え方（記録ではなく、チャットの画面の見え方。チャットの店 chatStore には入れない）。
 * 部品の外にチャットごとに持つので、行が窓から外れて戻っても・チャットの画面を作り直しても（タブを閉じて開き直した）残る。保存しない（メモリだけ。アプリを終えたら消える）
 */
export interface TimelineView {
  /**
   * 開いているもの（"tg:<最初の呼び出しの記録 ID>" ツールのまとまり・"tc:<呼び出しの記録 ID>" ツール 1 件・"th:<記録 ID>" 思考・
   * "sp:<サブエージェントのキー>" 依頼・"ch:<作業の終わりの記録 ID>" 変更カード・"qa:<記録 ID>:<問いの番号>" 選んだ図・
   * "um:<記録 ID>" 長い発言のもっと見る・"hr:<記録 ID>" 親への依頼文の全文・"rp:<キー>" 報告の全文・
   * "sa:<キー>" サブエージェントのカード・"sf:<キー>" カードの高さの制限を外した）。変えたときだけ新しい Set にする
   */
  readonly open: Cell<ReadonlySet<string>>;
  /** 測った高さ（行のキー → px。行の包み .timeline-row の、重ねた余白を除いた高さ。描くのを省いている間の大きさは入れない） */
  readonly sizes: LruMap<string, number>;
  /** 見積もりの種類ごとの補正（測った高さ ÷ 見積もりの移動平均。初めは 1） */
  readonly correction: Map<string, number>;
  /**
   * 読んでいた位置（チャットの画面を閉じたときに書く。開き直したとき、そのあと新しい項目が届いていなければここへ戻す）。
   * key は基準の行（見えている上端をまたぐ行）、offset はその行の上端から見えている上端までの距離、last はそのときの最後の項目のキー
   */
  position: { key: string; offset: number; last: string } | null;
}

/** 1 チャットで覚える測った高さの数（超えたら古い項目から捨てる。見積もりに戻るだけで壊れない） */
const SIZES_PER_CHAT = 20_000;

/** 見え方の店を作る（テストはこれで作って片付ける。画面はモジュールの 1 つ = 最近の 50 チャット分を使う） */
export function createTimelineViews(limit: number) {
  let views = createLruMap<number, TimelineView>(limit);
  return {
    /** チャットの見え方（なければ作る。使ったものは新しい側へ） */
    view(chatId: number): TimelineView {
      let v = views.get(chatId);
      if (!v) {
        v = { open: createCell<ReadonlySet<string>>(new Set()), sizes: createLruMap(SIZES_PER_CHAT), correction: new Map(), position: null };
        views.set(chatId, v);
      }
      return v;
    },
    /** すべて捨てる（テストの後片付け） */
    clear() {
      views = createLruMap(limit);
    },
  };
}

/** 開閉を変える（同じなら何もしない。変えたら新しい Set） */
export function setOpen(view: TimelineView, key: string, open: boolean) {
  const current = view.open.get();
  if (current.has(key) === open) return;
  const next = new Set(current);
  if (open) next.add(key);
  else next.delete(key);
  view.open.set(next);
}

/** まとめて開く（入れ子のカードを外側から開く。もう全部開いていれば何もしない） */
export function openAll(view: TimelineView, keys: readonly string[]) {
  const current = view.open.get();
  if (keys.every((k) => current.has(k))) return;
  view.open.set(new Set([...current, ...keys]));
}

/** 最近使った 50 チャット分の見え方（見本と同じ数。1 チャットの測った高さは数十 KB） */
const views = createTimelineViews(50);

/** チャットの見え方 */
export const timelineView = (chatId: number): TimelineView => views.view(chatId);

/**
 * 開いているか（自分のキーだけを購読する。1 つ開いても、ほかの行は描き直さない）と、開閉を変える関数。
 * チャットの ID は記録の chat_id から取れるので、チャットの画面の外（右の欄のサブエージェントの画面など）でも同じに使える
 */
export function useTimelineOpen(chatId: number, key: string): [boolean, (open: boolean) => void] {
  const view = timelineView(chatId);
  const open = useSyncExternalStore(view.open.subscribe, () => view.open.get().has(key));
  return [open, (next: boolean) => setOpen(view, key, next)];
}
