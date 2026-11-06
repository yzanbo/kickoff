import { ListRestart, Shrink, type LucideIcon } from "lucide-react";
import { COMPACT_PROMPT_FIELDS, type CompactPromptKind } from "@shared/chat/prompts";
import type { AppSettings, ChatEventDataOf, Project } from "@shared/types";
import type { SegmentOption } from "@/ui/Segmented";

/** 種類ごとの見た目と言葉（設定の欄・チャット欄のメーターの詳細・会話の札・指示の帯・指示の履歴で同じものを使う） */
export const COMPACT_PROMPT_KINDS: Record<
  CompactPromptKind,
  {
    label: string;
    icon: LucideIcon;
    /** 会話の札・帯の札・吹き出しに付けるクラス（`pre-compact` / `post-compact`。色は messages.css） */
    className: string;
    /** 会話の札に乗せたときの説明 */
    sentTitle: string;
    placeholder: string;
    /** いつ送るか（チャット欄のメーターの詳細の 1 行） */
    when: string;
  }
> = {
  pre: {
    label: "圧縮前指示",
    icon: Shrink,
    className: "pre-compact",
    sentTitle: "会話を圧縮する前に、設定の「圧縮前指示」を送りました",
    placeholder: "例: いまの作業の進捗・決めたこと・次にやることを memo.md に書き残してください",
    when: "圧縮の前（手で・自動）に送ります。空・オフなら送りません。",
  },
  post: {
    label: "圧縮後指示",
    icon: ListRestart,
    className: "post-compact",
    sentTitle: "会話を圧縮したあとに、設定の「圧縮後指示」を送りました（圧縮の間に送った指示は、このあとに伝えます）",
    placeholder: "例: memo.md を読み直して、作業の続きを確かめてから進めてください",
    when: "圧縮のあと（手で・自動）、圧縮の間に送った指示より先に送ります。空・オフなら送りません。",
  },
};

/** オン / オフの選択肢（設定の欄・チャット欄のメーターの詳細で同じ。オフでも文は残し、送らないだけ） */
export const COMPACT_PROMPT_SWITCH: SegmentOption<"on" | "off">[] = [
  { value: "on", label: "オン", tip: "オン（圧縮のたびに送ります）" },
  { value: "off", label: "オフ", tip: "オフ（書いた文は残したまま、送りません）" },
];

/** 自分の発言の記録が、圧縮前指示・圧縮後指示のどちらか（どちらでもなければ null） */
export function compactKindOf(data: Pick<ChatEventDataOf<"user">, "pre_compact" | "post_compact">): CompactPromptKind | null {
  if (data.pre_compact) return "pre";
  if (data.post_compact) return "post";
  return null;
}

/** 保存してある指示の文と、送るか（projectId なしなら設定の共通の指示、番号ならそのプロジェクトの指示。読めていなければ文なし・オン） */
export function savedCompactPrompt(
  kind: CompactPromptKind,
  settings: AppSettings | undefined,
  project: Project | undefined,
  projectId: number | null,
): { text: string | null; enabled: boolean } {
  const { text, enabled } = COMPACT_PROMPT_FIELDS[kind];
  const source = projectId === null ? settings : project;
  return { text: source?.[text] ?? null, enabled: source?.[enabled] ?? true };
}
