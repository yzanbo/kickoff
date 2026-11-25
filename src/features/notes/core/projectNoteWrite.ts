// 共通のチャットが、利用者のプロジェクトのノートを書くツール（kickoff_chat の write_project_note）。共通のチャットの書ける場所（砂場・編集先の制限）には
// ほかのプロジェクトのノートのフォルダを入れないので、書くのはこのツールだけ。ほかのプロジェクトへの書き込みなので、設定に従って承認カードで聞く（approveAiWrite）。
// 書くのはノートのフォルダの中の .md・.html だけ（外・「.」で始まる名前は notePathIn と noteFiles が断る）。いまあるノートは overwrite のときだけ書き換える
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { noteExtensionOf } from "@shared/notes/kinds";
import { AI_WRITE_PROJECT_NOTE_TOOL } from "@shared/notes/tools";
import { approveAiWrite, isCommonChatProject, projectForTool, toolChat } from "@/features/chat/core/index";
import type { NoteService } from "./service";
import { notePathIn, type NoteToolDeps } from "./tools";

/** 承認カードに見せる中身の長さの上限（残りは文字数だけ） */
const CARD_CONTENT_MAX = 2000;

/** カードに見せる中身（長ければ先頭だけ） */
const cardContent = (content: string) => (content.length > CARD_CONTENT_MAX ? `${content.slice(0, CARD_CONTENT_MAX)}\n…（ほか ${content.length - CARD_CONTENT_MAX} 文字）` : content);

/** 共通のチャットが利用者のプロジェクトのノートを書くツールの組（move_note の次 = order 62。共通のチャットにだけ出す） */
export function writeProjectNoteToolGroup(d: Pick<NoteToolDeps, "store" | "dirOf"> & { notes: Pick<NoteService, "create" | "write"> }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 62,
    instructions: [
      "write_project_note は、利用者のプロジェクト（アーカイブしていないもの）のノート（ノートのフォルダの .md・.html）を書く（共通のチャットだけ。共通のノートは Write / Edit で直接書く）。path はそのプロジェクトのノートのフォルダからの相対パス。いまあるノートを書き換えるときは、先に Read で読み、全体を content にして overwrite: true を渡す（一部だけの書き換えはできない）。ほかのプロジェクトへの書き込みなので、利用者の設定によっては承認を聞く。利用者に頼まれたときだけ使う。",
    ],
    open: ({ chatId, projectId }) =>
      isCommonChatProject(d.store.projects, projectId)
        ? [
            defineAiTool({
              server: "kickoff_chat",
              name: "write_project_note",
              description: "利用者のプロジェクトのノート（.md・.html）を作る・書き換える（共通のチャットだけ。利用者の設定によっては承認を聞く）",
              input: {
                project: z.union([z.number().int(), z.string().min(1)]).describe("書くノートのプロジェクトの名前か ID"),
                path: z.string().min(1).describe("そのプロジェクトのノートのフォルダからの相対パス（「仕様/メモ.md」。途中のフォルダはなければ作る）"),
                content: z.string().describe("ノートの中身の全体"),
                overwrite: z.boolean().optional().describe("いまあるノートを書き換える（省くと、いまあれば断る）"),
              },
              async run(input, turn) {
                const self = toolChat(d.store.chats, chatId).self();
                const project = projectForTool(d.store.projects, self, input.project);
                if (project.id === self.project_id) throw new Error("共通のノートは write_project_note ではなく、Write / Edit で直接書いてください（このツールは利用者のプロジェクトのノートを書くもの）");
                const dir = d.dirOf(project);
                const rel = notePathIn(dir, input.path);
                if (!noteExtensionOf(rel)) throw new Error(`${rel} はノート（.md・.markdown・.html・.htm）ではありません`);
                const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
                if (stat && !stat.isFile()) throw new Error(`${rel} はフォルダです。ノートのファイルを指してください`);
                if (stat && !input.overwrite) throw new Error(`ノート「${rel}」はもうあります。書き換えるなら、先に Read で読み、全体を content にして overwrite: true を渡してください`);
                const verb = stat ? "書き換え" : "作ろう";
                await approveAiWrite(d.store.settings, "other_project_write", (card) => turn.ask(card), {
                  toolName: AI_WRITE_PROJECT_NOTE_TOOL,
                  input: { project: project.name, path: rel, overwrite: Boolean(stat), content: cardContent(input.content) },
                  title: `プロジェクト「${project.name}」のノート「${rel}」を${verb}ようとしています`,
                  description: `共通のチャットの AI が、プロジェクト「${project.name}」のノートのフォルダ（${dir}）に、下の中身（${input.content.length} 文字）でノートを${stat ? "書き換え" : "作り"}ます。`,
                });
                // 聞いている間に、まだなかったノートができていたら上書きしない（作るのは同じ名前があれば断る create）
                if (stat) await d.notes.write(project, rel, input.content, null);
                else await d.notes.create(project, rel, { dir: false, content: input.content });
                return `プロジェクト「${project.name}」のノート「${rel}」を${stat ? "書き換えました" : "作りました"}（ノートのフォルダ: ${dir}）。`;
              },
            }),
          ]
        : null,
  };
}
