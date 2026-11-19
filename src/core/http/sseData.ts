import type { BusEvent } from "@shared/types";

/** 知らせごとの SSE の data（JSON の文）。同じ知らせを、窓・スマホ・診断の数だけ文字にし直さない */
const dataByEvent = new WeakMap<BusEvent, string>();

/** 知らせを SSE で送る文にする（1 つの知らせは 1 回だけ JSON にする） */
export function sseDataOf(event: BusEvent): string {
  let data = dataByEvent.get(event);
  if (data === undefined) {
    data = JSON.stringify(event);
    dataByEvent.set(event, data);
  }
  return data;
}
