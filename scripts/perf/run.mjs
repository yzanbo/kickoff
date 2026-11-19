// 3 節の合格の線にある値をまとめて測る（開発版を npm run dev:cdp で起動しておく）。
// node scripts/perf/run.mjs [--chat 224] [--long <10 倍のチャットの ID>] [--repeat 3] [--out <JSON の保存先>] [--fixture]（--fixture は決まったデータの開発版の ID・ポート）
//   入力の遅れ（待機中・書いている最中）・初めて開く・切り替えて戻る。--long があれば 10 倍のチャットを開く時間も
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { perfDefaults } from "../devtools/fixture.mjs";
import { measureOpen } from "./open.mjs";
import { summarize } from "./stats.mjs";
import { measureTyping } from "./typing.mjs";

const { values } = parseArgs({ options: { chat: { type: "string", default: perfDefaults().chat }, fixture: { type: "boolean" }, long: { type: "string" }, repeat: { type: "string", default: "3" }, out: { type: "string" } } });
const chatId = Number(values.chat);
const repeat = Number(values.repeat);
const result = { at: new Date().toISOString(), chatId };

const idle = await measureTyping({ chatId, keys: 30 });
result.typingIdle = idle.keys;
const streams = [];
for (let i = 0; i < repeat; i++) streams.push(await measureTyping({ chatId, keys: 40, streaming: true }));
result.typingStreaming = summarize(streams.flatMap((s) => s.times));
result.typingStreamingMetrics = streams.map((s) => s.metrics);
result.typingStreamingProfile = streams[streams.length - 1].profile;

const opens = [];
for (let i = 0; i < repeat; i++) opens.push(await measureOpen({ chatId }));
result.openFirst = summarize(opens.map((o) => o.first.shownMs));
result.openFirstDetail = opens.map((o) => ({ shownMs: o.first.shownMs, longTotal: o.first.longTotal, nodes: o.first.nodes, heapMB: o.first.heapMB, metrics: o.first.metrics }));
result.openFirstProfile = opens[opens.length - 1].first.profile;
result.switchBack = summarize(opens.filter((o) => o.back).map((o) => o.back.shownMs));
result.switchBackDetail = opens.filter((o) => o.back).map((o) => ({ shownMs: o.back.shownMs, longTotal: o.back.longTotal, metrics: o.back.metrics }));

if (values.long) {
  const longs = [];
  for (let i = 0; i < repeat; i++) longs.push(await measureOpen({ chatId: Number(values.long) }));
  result.openLong = summarize(longs.map((o) => o.first.shownMs));
  result.openLongDetail = longs.map((o) => ({ shownMs: o.first.shownMs, longTotal: o.first.longTotal, heapMB: o.first.heapMB, metrics: o.first.metrics }));
}

const line = (name, s) => console.log(`${name.padEnd(16)} 中央値 ${s.median}ms・95% ${s.p95}ms・最大 ${s.max}ms（${s.n} 件）`);
line("待機中の入力", result.typingIdle);
line("書いている間の入力", result.typingStreaming);
line("初めて開く", result.openFirst);
line("切り替えて戻る", result.switchBack);
if (result.openLong) line("10 倍を開く", result.openLong);
console.log("書いている間の分類:", result.typingStreamingProfile.categories);
console.log("初めて開くときの分類:", result.openFirstProfile.categories, "getMetrics:", result.openFirstDetail.at(-1).metrics);
if (values.out) writeFileSync(values.out, JSON.stringify(result, null, 1));
