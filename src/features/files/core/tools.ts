// チャットの AI が作業場所のファイルを画面に開くツール（kickoff_chat の open_file）。開くだけなので聞かずに頼む（権限モード・Auto mode によらず承認カードを出さない）。
// 確かめてから SSE の open_view で頼み、画面のいまの開き方で開く（開けたかは待たない）
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { isInside, realPathOrSelf, relativeApiPath } from "@/foundation/core/system/paths";
import type { BusEvent } from "@shared/foundation/contract";
import { OPEN_PLACE_LABELS } from "@shared/chat/openView";
import { lineageOf, openPlaceInput, toolChat, workdirOf, type ChatStoreDeps } from "@/features/chat/core/index";

/**
 * AI が渡したパスを、作業場所からの相対パス（「/」区切り）にする。絶対パスは作業場所の中だけ（リンクを解いた形でも比べる）。外・作業場所そのものは throw
 */
export function workPathIn(dir: string, given: string): string {
  const raw = given.trim();
  if (!raw) throw new Error("path が空です。作業場所からの相対パスか、作業場所の中の絶対パスを渡してください");
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  const base = [dir, realPathOrSelf(dir)].find((d) => isInside(d, abs) || isInside(d, realPathOrSelf(abs)));
  if (!base) throw new Error(`${raw} はこのチャットの作業場所（${dir}）の外です。開けるのは作業場所の中のファイルだけです`);
  const rel = relativeApiPath(base, isInside(base, abs) ? abs : realPathOrSelf(abs));
  if (!rel) throw new Error("作業場所そのものは開けません。ファイルを指してください");
  return rel;
}

/** 呼んだチャットとプロジェクトと作業場所のフォルダ（git の open_diff も使う） */
export function chatWorkplace(store: Pick<ChatStoreDeps, "chats" | "settings" | "projects" | "snippets">, chatId: number) {
  const self = toolChat(store.chats, chatId).self();
  const project = store.projects.get(self.project_id);
  if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
  return { self, project, dir: workdirOf(self, project) };
}

/** ファイルを開くツールの組（kickoff_chat の開く組。ノート 40・チャット 41 の次 = 42） */
export function openFileToolGroup(d: { store: Pick<ChatStoreDeps, "chats" | "settings" | "projects" | "snippets">; publish: (event: BusEvent) => void }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 42,
    instructions: ["open_file は、このチャットの作業場所のファイルを開く（line でその行を目立たせる）。open_diff は、作業場所のまだコミットしていない変更を開く（path でそのファイルの位置へ）。利用者に「ここを見てください」と見せるときに使う。"],
    open: ({ chatId }) => [
      defineAiTool({
        server: "kickoff_chat",
        name: "open_file",
        description: "このチャットの作業場所のファイルを Kickoff の画面に開く（行を目立たせられる。開くだけ）",
        input: {
          path: z.string().min(1).describe("作業場所からの相対パス（「src/app.ts」）か、作業場所の中の絶対パス"),
          line: z.number().int().min(1).optional().describe("目立たせる行（1 から）"),
          place: openPlaceInput(),
        },
        async run(input) {
          const { self, project, dir } = chatWorkplace(d.store, chatId);
          const rel = workPathIn(dir, input.path);
          const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
          if (!stat?.isFile()) throw new Error(`ファイル ${rel} が見つかりません（作業場所: ${dir}）`);
          const line = input.line !== undefined && input.line >= 1 ? Math.trunc(input.line) : null;
          d.publish({ type: "open_view", request: { kind: "file", project_id: project.id, worktree: self.worktree_path, path: rel, line, place: input.place ?? null, lineage: lineageOf(d.store.chats, self) } });
          return `ファイル「${rel}」${line ? `の ${line} 行目` : ""}を${input.place ? OPEN_PLACE_LABELS[input.place] : "右の欄"}で開くよう、画面に頼みました（開けたかは返りません）。`;
        },
      }),
    ],
  };
}
