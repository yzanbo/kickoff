import { Shrink } from "lucide-react";
import type { ChatEventOf, CompactingState, CompactTrigger } from "@shared/types";
import { formatTokens } from "@/lib/format";
import { formatFullStamp, formatStamp, formatStampRangeWithRunTime } from "@/lib/time";
import { Elapsed } from "./Elapsed";
import { compactingLabel } from "./workingLabel";

/** なぜ作業が止まって見えるか（自動の圧縮は利用者が始めたものではないので、きっかけと、終われば作業が続くことを添える） */
const COMPACTING_NOTES: Record<CompactTrigger, string> = {
  auto: "コンテキストが上限に近づいたため、これまでの会話を要約して空きを作っています。終わると、そのまま作業を続けます。",
  manual: "これまでの会話を要約して、コンテキストを空けています。",
};

/** 終わった圧縮の見出しと説明（圧縮中の文を、終わった形にしたもの） */
const COMPACTED_TITLES: Record<CompactTrigger, string> = {
  auto: "会話を自動で圧縮しました",
  manual: "会話を圧縮しました",
};
const COMPACTED_NOTES: Record<CompactTrigger, string> = {
  auto: "コンテキストが上限に近づいたため、これまでの会話を要約して空きを作りました。",
  manual: "これまでの会話を要約して、コンテキストを空けました。",
};

/**
 * 会話を圧縮している間の作業中の行。ふだんの「考えています」と見分けがつくよう、アクセントの色の枠に、何をしているか・きっかけ・
 * 始めた時刻と経過を出す（圧縮は数十秒〜数分かかり、その間は返答もツールも動かないので、止まったと思わせないため）。
 * 終わると、同じ見た目の記録の行（CompactedRow）が残り、作業が続く
 */
export function CompactingRow({ compacting }: { compacting: CompactingState }) {
  const { since, trigger } = compacting;
  return (
    <div className="working compacting" role="status">
      <Shrink className="compacting-icon" size={16} aria-hidden />
      <div className="compacting-title">
        {compactingLabel(trigger)}
        <span className="dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="compacting-time" title={`${formatFullStamp(since)} に開始`}>
          {formatStamp(since)} から <Elapsed since={since} />
        </span>
      </div>
      <div className="compacting-note">{COMPACTING_NOTES[trigger]}</div>
    </div>
  );
}

/**
 * 終わった圧縮の記録（compact）。圧縮中の行と同じ枠のまま、見出しを「圧縮しました」にし、動いている印の代わりに
 * 始めた時刻 – 終わった時刻 · かかった時間と、要約の前後のトークン数を出す。
 * 記録の時刻は終わった時刻で、始めた時刻はかかった時間（Claude Code が知らせたときだけ）を引いて出す。なければ終わった時刻だけ
 */
export function CompactedRow({ event }: { event: ChatEventOf<"compact"> }) {
  const { trigger, pre_tokens, post_tokens, duration_ms } = event.data;
  const end = event.created_at;
  const start = duration_ms !== undefined ? new Date(Date.parse(end) - duration_ms).toISOString() : null;
  const tokens = post_tokens !== undefined ? `${formatTokens(pre_tokens)} → ${formatTokens(post_tokens)} トークン` : `要約前 ${formatTokens(pre_tokens)} トークン`;
  return (
    <div className="compacting compacted" id={`ev-${event.id}`}>
      <Shrink className="compacting-icon" size={16} aria-hidden />
      <div className="compacting-title">
        {COMPACTED_TITLES[trigger]}
        <span className="compacting-time" title={start ? `${formatFullStamp(start)} – ${formatFullStamp(end)}` : `${formatFullStamp(end)} に終了`}>
          {start ? formatStampRangeWithRunTime(start, end) : formatStamp(end)}
        </span>
      </div>
      <div className="compacting-note">
        {COMPACTED_NOTES[trigger]}（{tokens}）
      </div>
    </div>
  );
}
