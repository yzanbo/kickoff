import { useEffect, useState } from "react";
import type { QueuedMessage } from "@shared/types";

/** サーバーの応答が来なくても、先回りの並びをやめるまでの時間（失敗の知らせが届かないときの保険） */
const PREDICTION_MS = 3000;

/** 先回りの並び: base は落とした時点のサーバーの並び（ID と印の位置）、ids と stops は落としたあとの並び */
interface Prediction {
  base: string;
  ids: string[];
  stops: number[];
}

const keyOf = (messages: QueuedMessage[], stops: number[]) => `${messages.map((m) => m.id).join()}|${stops.join()}`;

/**
 * 送信待ちの並べ替えを、サーバーの応答を待たずに出す（落とした瞬間に、落とした形の並びにする）。
 * サーバーの並びが落とした時点から変わったら（応答が届いた・ほかの理由で変わった）、先回りをやめてサーバーの並びに戻す。
 * 印の線を下げて 1 件目が線の上に出たときは、そのまま送られる（送った指示は useSendingQueued が「送信中」で残す）
 */
export function useQueuePrediction(messages: QueuedMessage[], stops: number[]) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const base = keyOf(messages, stops);
  // 落とした時点の並びのままのときだけ先回りを出す（中身は今の指示を使う。書き直した文などはそのまま映す）
  const active = prediction !== null && prediction.base === base;
  useEffect(() => {
    if (!prediction) return;
    if (prediction.base !== base) {
      setPrediction(null);
      return;
    }
    const timer = window.setTimeout(() => setPrediction(null), PREDICTION_MS);
    return () => window.clearTimeout(timer);
  }, [prediction, base]);
  const byId = new Map(messages.map((m) => [m.id, m]));
  const shown = active ? prediction.ids.flatMap((id) => byId.get(id) ?? []) : messages;
  return {
    /** 出す並び（先回りがあればそれ。ない指示は除く） */
    messages: active && shown.length === messages.length ? shown : messages,
    stops: active && shown.length === messages.length ? prediction.stops : stops,
    /** 落としたあとの並びを先回りで出す（null でやめる。送れなかったとき） */
    predict: (next: { list: QueuedMessage[]; stops: number[] } | null) =>
      setPrediction(next && { base, ids: next.list.map((m) => m.id), stops: next.stops }),
  };
}
