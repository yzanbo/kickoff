// チャットの AI が作業場所のまだコミットしていない変更を画面に開くツール（kickoff_chat の open_diff）。開くだけなので聞かずに頼む。
// 消したファイルの差分もあるので、ファイルがあるかは確かめない（開けたかは待たない）
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { BusEvent } from "@shared/foundation/contract";
import { OPEN_PLACE_LABELS } from "@shared/chat/openView";
import { lineageOf, openPlaceInput, type Store } from "@/features/chat/core/index";
import { chatWorkplace, workPathIn } from "@/features/files/core/index";

/** 差分を開くツールの組（kickoff_chat の開く組。ファイル 42 の次 = 43。使い方の文はファイルの組が open_file と一緒に書く） */
export function openDiffToolGroup(d: { store: Store; publish: (event: BusEvent) => void }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 43,
    instructions: [],
    open: ({ chatId }) => [
      defineAiTool({
        server: "kickoff_chat",
        name: "open_diff",
        description: "このチャットの作業場所のまだコミットしていない変更を Kickoff の画面に開く（開くだけ）",
        input: { path: z.string().optional().describe("そのファイルの差分の位置へ移る（作業場所からの相対パスか、中の絶対パス）。省くと変更の全体"), place: openPlaceInput() },
        run(input) {
          const { self, project, dir } = chatWorkplace(d.store, chatId);
          const rel = input.path?.trim() ? workPathIn(dir, input.path) : null;
          d.publish({ type: "open_view", request: { kind: "diff", project_id: project.id, worktree: self.worktree_path, path: rel, place: input.place ?? null, lineage: lineageOf(d.store.chats, self) } });
          return `コミットしていない変更${rel ? `（${rel} の位置）` : ""}を${input.place ? OPEN_PLACE_LABELS[input.place] : "右の欄"}で開くよう、画面に頼みました（開けたかは返りません）。`;
        },
      }),
    ],
  };
}
