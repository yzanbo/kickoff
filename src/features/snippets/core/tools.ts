// チャットの AI がこのプロジェクトの定型文に足すツール（kickoff_chat の add_snippet）。足すだけで直す・消すはしない（範囲はこのプロジェクトだけ）。
// 利用者がいつでも戻せるので、聞かずに行う（権限モード・Auto mode によらず承認カードを出さない）
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX } from "@shared/snippets/types";
import type { Chat } from "@shared/chat/types";
import type { SnippetStore } from "./db/snippets";

/** 定型文に足すツールの組（kickoff_chat のプロジェクトの組 = order 60。ノートを動かす組（61）の前） */
export function snippetToolGroup(d: { snippets: Pick<SnippetStore, "create">; chatOf: (chatId: number) => Chat | undefined }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 60,
    instructions: ["add_snippet は、このプロジェクトの定型文（チャット欄の上の帯から入力欄に入れる、よく使う文）に足す。足すだけで、直す・消すはできない。すべてのプロジェクトで使うかは利用者が画面で決める。利用者が「定型文にして」「定型文に登録して」と頼んだときに使う。"],
    open: ({ chatId }) => [
      defineAiTool({
        server: "kickoff_chat",
        name: "add_snippet",
        description: "このプロジェクトの定型文に足す（足すだけ）",
        input: {
          text: z.string().min(1).max(SNIPPET_TEXT_MAX).describe("定型文の本文（入力欄に入る文）"),
          label: z.string().max(SNIPPET_LABEL_MAX).optional().describe("帯のボタンに出す短い名前（省くと本文の 1 行目）"),
        },
        run(input) {
          const self = d.chatOf(chatId);
          if (!self) throw new Error("このチャットが見つかりません（消された可能性があります）");
          const text = input.text.trim();
          const label = input.label?.trim() || null;
          if (!text) throw new Error("本文（text）が空です");
          if (text.length > SNIPPET_TEXT_MAX) throw new Error(`本文（text）は ${SNIPPET_TEXT_MAX} 文字までです`);
          if (label && label.length > SNIPPET_LABEL_MAX) throw new Error(`名前（label）は ${SNIPPET_LABEL_MAX} 文字までです`);
          const snippet = d.snippets.create({ project_id: self.project_id, label, text });
          return `定型文「${label ?? text.split("\n")[0]}」（ID ${snippet.id}）を、このプロジェクトの定型文に登録しました（チャット欄の上の定型文の帯に出ます。すべてのプロジェクトで使うには、利用者が画面で範囲を変えます）。`;
        },
      }),
    ],
  };
}
