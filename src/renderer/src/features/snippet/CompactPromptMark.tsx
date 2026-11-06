import { cx } from "@/lib/cx";
import { COMPACT_PROMPT_KINDS } from "./compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";

/**
 * 「圧縮前指示」「圧縮後指示」の札（アイコンと名前）。自分で書いた指示と見分けるため、会話の吹き出しの上・指示の帯・指示の履歴の行・圧縮を待つ吹き出しで同じものを使う。
 * 色は `.compact-prompt-kind`（messages.css）。className で置き場所ごとの形（`.message-kind-label` など）を足す
 */
export function CompactPromptMark({ kind, className, size = 12, title }: { kind: CompactPromptKind; className?: string; size?: number; title?: string }) {
  const { icon: Icon, label } = COMPACT_PROMPT_KINDS[kind];
  return (
    <span className={cx(className, "compact-prompt-kind")} title={title}>
      <Icon size={size} aria-hidden />
      {label}
    </span>
  );
}
