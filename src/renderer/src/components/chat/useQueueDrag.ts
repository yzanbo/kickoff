import { useState, type DragEvent } from "react";
import type { QueuedMessage } from "../../../../core/types";
import { api } from "../../api";

/**
 * 送信待ちのドラッグ: 指示の並べ替え（id と元の位置 from。選んだ行をつかんだら ids でまとめて）と、
 * 「ここまで送ったら止めます」の印の移動（stop: 動かしている印の位置）。at は落とす位置（0〜件数。その位置の行の前）
 */
interface QueueDrag {
  id?: string;
  from?: number;
  ids?: string[];
  stop?: number;
  at?: number;
}

/** 送信待ちの行・印の線のドラッグ（並べ替え・印の移動）と、落とす位置の線を出すか */
export function useQueueDrag(runId: number, queue: QueuedMessage[], stops: number[], failed: (e: unknown) => void) {
  const [drag, setDrag] = useState<QueueDrag>();
  /** 落とす位置を at にする（行の上・印の線の上） */
  const overAt = (e: DragEvent<HTMLElement>, at: number) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (at !== drag.at) setDrag({ ...drag, at });
  };
  /** 動かすと変わる位置か（指示 1 件は元の位置とすぐ後ろでは変わらない。印は元の位置では変わらない） */
  const changes = (at: number) =>
    !drag ? false : drag.stop !== undefined ? at !== drag.stop : Boolean(drag.ids) || (drag.from !== at && drag.from !== at - 1);
  const drop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const d = drag;
    setDrag(undefined);
    if (!d || d.at === undefined || !changes(d.at)) return;
    if (d.stop !== undefined) {
      // 印を動かす（1 件目の上にも置ける）
      void api.setQueueStops(runId, [...stops.filter((k) => k !== d.stop), d.at]).catch(failed);
    } else if (d.ids) {
      // まとめて動かす: 落とした位置から下で、動かさない最初の指示の前へ入れる（なければいちばん下）
      const ids = d.ids;
      const before = queue.slice(d.at).find((m) => !ids.includes(m.id))?.id ?? null;
      void api.moveQueuedMany(runId, ids, { before }).catch(failed);
    } else if (d.id && d.from !== undefined) {
      // 移したあとの位置（元の位置より後ろへ入れるときは、自分が抜けた分だけ 1 つ前になる）
      void api.moveQueued(runId, d.id, d.at > d.from ? d.at - 1 : d.at).catch(failed);
    }
  };
  return {
    drag,
    startMessage: (id: string, from: number, ids?: string[]) => setDrag({ id, from, ids }),
    startStop: (stop: number) => setDrag({ stop }),
    end: () => setDrag(undefined),
    /** 行の上: 上半分なら前、下半分なら後ろに入れる位置にする */
    overRow: (e: DragEvent<HTMLElement>, i: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      overAt(e, e.clientY < rect.top + rect.height / 2 ? i : i + 1);
    },
    overAt,
    drop,
    /** 行 i の前に、落とす位置の線を出すか */
    dropBefore: (i: number) => drag?.at === i && changes(i),
    /** 最後の行の後ろに、落とす位置の線を出すか */
    dropAfterLast: (i: number) => i === queue.length - 1 && drag?.at === queue.length && changes(queue.length),
  };
}
