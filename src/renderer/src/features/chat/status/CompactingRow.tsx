import { Shrink } from "lucide-react";
import type { CompactingState, CompactTrigger } from "@shared/types";
import { formatFullStamp, formatStamp } from "@/lib/time";
import { Elapsed } from "./Elapsed";
import { compactingLabel } from "./workingLabel";

/** なぜ作業が止まって見えるか（自動の圧縮は利用者が始めたものではないので、きっかけと、終われば作業が続くことを添える） */
const COMPACTING_NOTES: Record<CompactTrigger, string> = {
  auto: "コンテキストが上限に近づいたため、これまでの会話を要約して空きを作っています。終わると、そのまま作業を続けます。",
  manual: "これまでの会話を要約して、コンテキストを空けています。",
};

/**
 * 会話を圧縮している間の作業中の行。ふだんの「考えています」と見分けがつくよう、アクセントの色の枠に、何をしているか・きっかけ・
 * 始めた時刻と経過を出す（圧縮は数十秒〜数分かかり、その間は返答もツールも動かないので、止まったと思わせないため）。
 * 終わると記録の「ここまでの会話を要約しました」が残り、作業が続く
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
