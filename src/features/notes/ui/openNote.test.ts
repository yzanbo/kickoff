import { test } from "vitest";
import assert from "node:assert/strict";
import { noteOpenWay, type NoteOpenWay } from "./openNote";

const base = { place: "side", canPopout: true, chatId: 5, hasDraftSide: false, inPopout: false, fromNoteChat: false } as const;

// チャットからノートを開く先の 6 つの分かれ道（上から順に当てはまるもの）
const cases: [string, Partial<Parameters<typeof noteOpenWay>[0]>, NoteOpenWay][] = [
  ["設定が別ウィンドウなら別ウィンドウ", { place: "window" }, "window"],
  ["別ウィンドウを開けなければ別ウィンドウにしない", { place: "window", canPopout: false }, "rootSide"],
  ["送る前の新しいチャットならその下書きのタブの右の欄", { chatId: null, hasDraftSide: true }, "draftSide"],
  ["別ウィンドウの中ならメインのウィンドウに頼む", { inPopout: true }, "mainWindow"],
  ["ノートのチャットからならノートのタブ", { fromNoteChat: true }, "noteTab"],
  ["ふつうのチャットからなら、いちばん上の親の右の欄", {}, "rootSide"],
  ["チャットが分からなければノートのタブ", { chatId: null }, "noteTab"],
];

for (const [name, at, want] of cases) {
  test(`noteOpenWay: ${name}`, () => {
    assert.equal(noteOpenWay({ ...base, ...at }), want);
  });
}
