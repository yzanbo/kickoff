import { useState, type DragEvent } from "react";
import type { QueuedMessage } from "../../../../core/types";
import { moveToSlot } from "../../../../core/queueStops";
import { api } from "../../api";

/**
 * 送信待ちのドラッグ: 指示の並べ替え（id。選んだ行をつかんだら ids でまとめて）と、
 * 「ここまで送ったら止めます」の印の移動（stop: 動かしている印の位置）。
 * at は落とす位置（0〜件数。その位置の行の前）、below はその位置に印の線があるとき線の下か（指示を落とすとき）
 */
interface QueueDrag {
  id?: string;
  ids?: string[];
  stop?: number;
  at?: number;
  below?: boolean;
}

/** 落とす位置の線を出す場所（行か印の線の、上か下） */
type DropMark = { kind: "row" | "stop"; index: number; side: "before" | "after" };

/** 送信待ちの行・印の線のドラッグ（並べ替え・印の移動）と、落とす位置の線を出すか */
export function useQueueDrag(runId: number, queue: QueuedMessage[], stops: number[], failed: (e: unknown) => void) {
  const [drag, setDrag] = useState<QueueDrag>();
  /** 落とす位置を at（印の線があればその上か下）にする */
  const overAt = (e: DragEvent<HTMLElement>, at: number, below: boolean) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (at !== drag.at || below !== drag.below) setDrag({ ...drag, at, below });
  };
  /** 動かす指示（まとめて動かすときは選んだものすべて） */
  const moving = (d: QueueDrag) => d.ids ?? (d.id ? [d.id] : []);
  /** 動かすと変わる位置か（指示は、動かしたあとの並びと印の線が変わるか。印は元の位置では変わらない） */
  const changes = (d: QueueDrag | undefined): boolean => {
    if (!d || d.at === undefined) return false;
    if (d.stop !== undefined) return d.at !== d.stop;
    const next = moveToSlot(queue, stops, moving(d), { at: d.at, belowStop: d.below ?? true });
    return next.list.some((m, i) => m.id !== queue[i].id) || next.stops.join() !== stops.join();
  };
  /**
   * 落とす位置の線を出す場所。指示を落とすときは、印の線の上か下かが分かるように出す
   * （線の上なら線の 1 つ上の行の下、線の下ならその位置の行の上。印の線を動かすときは行の上）
   */
  const mark = ((): DropMark | null => {
    const d = drag;
    if (!d || d.at === undefined || !changes(d)) return null;
    const last = queue.length - 1;
    const aboveStop = d.stop === undefined && stops.includes(d.at) && d.below === false;
    if (aboveStop) return d.at > 0 ? { kind: "row", index: d.at - 1, side: "after" } : { kind: "stop", index: 0, side: "before" };
    if (d.at <= last) return { kind: "row", index: d.at, side: "before" };
    // いちばん下: 最後の印の線の下（指示を落とすとき）か、最後の行の下
    return d.stop === undefined && stops.includes(queue.length) ? { kind: "stop", index: queue.length, side: "after" } : { kind: "row", index: last, side: "after" };
  })();
  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const d = drag;
    setDrag(undefined);
    if (!d || d.at === undefined || !changes(d)) return;
    if (d.stop !== undefined) {
      // 印を動かす（1 件目の上にも置ける）
      void api.setQueueStops(runId, [...stops.filter((k) => k !== d.stop), d.at]).catch(failed);
      return;
    }
    // 指示を動かす（1 件でも、選んだものをまとめてでも）: 落とした位置の行の前へ。印の線があれば、その上か下か
    void api.moveQueuedMany(runId, moving(d), { before: queue[d.at]?.id ?? null, belowStop: d.below ?? true }).catch(failed);
  };
  return {
    drag,
    startMessage: (id: string, ids?: string[]) => setDrag({ id, ids }),
    startStop: (stop: number) => setDrag({ stop }),
    end: () => setDrag(undefined),
    /** 行の上: 上半分ならその行の前（上に印の線があれば線の下）、下半分なら後ろ（下に印の線があれば線の上） */
    overRow: (e: DragEvent<HTMLElement>, i: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) overAt(e, i, true);
      else overAt(e, i + 1, false);
    },
    /** 印の線の上: 上半分なら線の上、下半分なら線の下 */
    overStop: (e: DragEvent<HTMLElement>, k: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      overAt(e, k, e.clientY >= rect.top + rect.height / 2);
    },
    drop,
    /** 行 i の上・下に、落とす位置の線を出すか */
    rowMark: (i: number): "before" | "after" | undefined => (mark?.kind === "row" && mark.index === i ? mark.side : undefined),
    /** 位置 k の印の線の上・下に、落とす位置の線を出すか */
    stopMark: (k: number): "before" | "after" | undefined => (mark?.kind === "stop" && mark.index === k ? mark.side : undefined),
  };
}
