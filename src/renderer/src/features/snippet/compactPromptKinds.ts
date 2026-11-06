import { ListRestart, Shrink, type LucideIcon } from "lucide-react";
import type { AppSettings, ChatEventDataOf, Project } from "@shared/types";

/** 圧縮の前・後に AI に送る指示の種類（圧縮前指示 / 圧縮後指示） */
export type CompactPromptKind = "pre" | "post";

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
    /** 保存する項目（設定・プロジェクトで同じ名前） */
    field: "pre_compact_prompt" | "post_compact_prompt";
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
    field: "pre_compact_prompt",
    placeholder: "例: いまの作業の進捗・決めたこと・次にやることを memo.md に書き残してください",
    when: "圧縮の前（手で・自動）に送ります。空なら送りません。",
  },
  post: {
    label: "圧縮後指示",
    icon: ListRestart,
    className: "post-compact",
    sentTitle: "会話を圧縮したあとに、設定の「圧縮後指示」を送りました（圧縮の間に送った指示は、このあとに伝えます）",
    field: "post_compact_prompt",
    placeholder: "例: memo.md を読み直して、作業の続きを確かめてから進めてください",
    when: "圧縮のあと（手で・自動）、圧縮の間に送った指示より先に送ります。空なら送りません。",
  },
};

/** 自分の発言の記録が、圧縮前指示・圧縮後指示のどちらか（どちらでもなければ null） */
export function compactKindOf(data: Pick<ChatEventDataOf<"user">, "pre_compact" | "post_compact">): CompactPromptKind | null {
  if (data.pre_compact) return "pre";
  if (data.post_compact) return "post";
  return null;
}

/** 保存してある指示（projectId なしなら設定の共通の指示、番号ならそのプロジェクトの指示） */
export function savedCompactPrompt(kind: CompactPromptKind, settings: AppSettings | undefined, project: Project | undefined, projectId: number | null): string | null {
  const field = COMPACT_PROMPT_KINDS[kind].field;
  return (projectId === null ? settings?.[field] : project?.[field]) ?? null;
}
