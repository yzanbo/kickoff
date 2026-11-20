// チャットの AI がプロジェクトに足す・変えるツール（kickoff_chat の add_snippet・move_note の中身。プロバイダーに依らない）。
// 定型文は足すだけ（直す・消すはしない。範囲はこのプロジェクトだけ）、ノートはこのプロジェクトのノートのフォルダの中で名前を変える・移すだけ
// （上書きしない。ノートのチャット・DB の接続の手順ノートのつながりは NoteService.move が付け替える）。
// どれも利用者がいつでも戻せるので、聞かずに行う（権限モード・Auto mode によらず承認カードを出さない）
import path from "node:path";
import type { AddSnippetInput, MoveNoteInput } from "@shared/chat/aiProject";
import type { Chat } from "@shared/chat/types";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX } from "@shared/snippets/types";
import type { Store } from "@/foundation/core/db/store";
import type { NoteService } from "@/features/notes/core/notes";
import { notePathIn } from "./aiOpen";

/** プロジェクトに足す・変えるツールの中身（AI に返す文。できなければ理由の文で throw） */
export interface AiProjectTools {
  addSnippet(input: AddSnippetInput): string;
  moveNote(input: MoveNoteInput): Promise<string>;
}

export interface AiProjectDeps {
  store: Store;
  /** ノート（なければ move_note は使えないと返す） */
  notes?: Pick<NoteService, "dirOf" | "move">;
}

/** chatId のチャットの AI に渡す、プロジェクトに足す・変えるツールの中身 */
export function createAiProjectTools({ store, notes }: AiProjectDeps, chatId: number): AiProjectTools {
  const requireSelf = (): Chat => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  return {
    addSnippet(input) {
      const self = requireSelf();
      const text = input.text.trim();
      const label = input.label?.trim() || null;
      if (!text) throw new Error("本文（text）が空です");
      if (text.length > SNIPPET_TEXT_MAX) throw new Error(`本文（text）は ${SNIPPET_TEXT_MAX} 文字までです`);
      if (label && label.length > SNIPPET_LABEL_MAX) throw new Error(`名前（label）は ${SNIPPET_LABEL_MAX} 文字までです`);
      const snippet = store.snippets.create({ project_id: self.project_id, label, text });
      return `定型文「${label ?? text.split("\n")[0]}」（ID ${snippet.id}）を、このプロジェクトの定型文に登録しました（チャット欄の上の定型文の帯に出ます。すべてのプロジェクトで使うには、利用者が画面で範囲を変えます）。`;
    },
    async moveNote(input) {
      const self = requireSelf();
      const project = store.projects.get(self.project_id);
      if (!project || !notes) throw new Error("このプロジェクトのノートのフォルダが分からないため、ノートを動かせません");
      const dir = notes.dirOf(project);
      const from = notePathIn(dir, input.from);
      const to = notePathIn(dir, input.to);
      // ファイルの種類（Markdown / HTML）が変わらないよう、拡張子は変えさせない（フォルダは拡張子なし同士）
      if (path.extname(from).toLowerCase() !== path.extname(to).toLowerCase()) {
        throw new Error(`拡張子は変えられません（${path.extname(from) || "なし"} → ${path.extname(to) || "なし"}）。名前と場所だけを変えてください`);
      }
      if (from === to) return `ノート「${from}」は、もともとその名前です。`;
      await notes.move(project, from, to);
      return `ノート「${from}」を「${to}」に動かしました（ノートのチャットなどのつながりも付け替えました）。`;
    },
  };
}
