// チャットの AI がプロジェクトに足す・変えるツール（kickoff_chat の add_snippet・move_memo の中身。プロバイダーに依らない）。
// 定型文は足すだけ（直す・消すはしない。範囲はこのプロジェクトだけ）、メモはこのプロジェクトのメモのフォルダの中で名前を変える・移すだけ
// （上書きしない。メモのチャット・DB の接続の手順メモのつながりは MemoService.move が付け替える）。
// どれも利用者がいつでも戻せるので、聞かずに行う（権限モード・Auto mode によらず承認カードを出さない）
import path from "node:path";
import type { AddSnippetInput, MoveMemoInput } from "@shared/chat/aiProject";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX, type Chat } from "@shared/types";
import type { Store } from "../db/store.js";
import type { MemoService } from "../memos/memos.js";
import { memoPathIn } from "./aiOpen.js";

/** プロジェクトに足す・変えるツールの中身（AI に返す文。できなければ理由の文で throw） */
export interface AiProjectTools {
  addSnippet(input: AddSnippetInput): string;
  moveMemo(input: MoveMemoInput): Promise<string>;
}

export interface AiProjectDeps {
  store: Store;
  /** メモ（なければ move_memo は使えないと返す） */
  memos?: Pick<MemoService, "dirOf" | "move">;
}

/** chatId のチャットの AI に渡す、プロジェクトに足す・変えるツールの中身 */
export function createAiProjectTools({ store, memos }: AiProjectDeps, chatId: number): AiProjectTools {
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
    async moveMemo(input) {
      const self = requireSelf();
      const project = store.projects.get(self.project_id);
      if (!project || !memos) throw new Error("このプロジェクトのメモのフォルダが分からないため、メモを動かせません");
      const dir = memos.dirOf(project);
      const from = memoPathIn(dir, input.from);
      const to = memoPathIn(dir, input.to);
      // ファイルの種類（Markdown / HTML）が変わらないよう、拡張子は変えさせない（フォルダは拡張子なし同士）
      if (path.extname(from).toLowerCase() !== path.extname(to).toLowerCase()) {
        throw new Error(`拡張子は変えられません（${path.extname(from) || "なし"} → ${path.extname(to) || "なし"}）。名前と場所だけを変えてください`);
      }
      if (from === to) return `メモ「${from}」は、もともとその名前です。`;
      await memos.move(project, from, to);
      return `メモ「${from}」を「${to}」に動かしました（メモのチャットなどのつながりも付け替えました）。`;
    },
  };
}
