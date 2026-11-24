import { claudeToolOf, editHunksOf, isEditTool, type EditChange, type EditHunk } from "@shared/ai/claudeTools";
import { toolText } from "@/features/chat/ui";
import type { ToolRowView } from "@/features/conversation/ui/tools/toolRowViews";

/** 消した・名前を変えたファイルの行に添える文 */
function editNote(edit: EditChange | null, rel: (s: string) => string): string {
  if (edit?.deleted) return "（削除）";
  return edit?.movedTo ? ` → ${rel(edit.movedTo)}` : "";
}

/**
 * ファイルを変える（Edit・MultiEdit・Write。ノートブックは除く）: 行はファイル名の札（押して開ける）、開くと変えた所の差分
 * （ほかの AI の写しの edits・消した・名前を変えたも editHunksOf で同じ形に）
 */
export const editView: ToolRowView = {
  match: (name, input) => isEditTool(name) && claudeToolOf(name)?.pathKey === "file_path" && typeof input.file_path === "string",
  Arg: ({ call, input, rel, fileArg }) => {
    const { name } = call.use.data;
    return fileArg(String(input.file_path), rel(toolText().describeToolInput(name, input)) + editNote(editHunksOf(name, input), rel));
  },
  hasDetail: ({ call, input }) => (editHunksOf(call.use.data.name, input)?.hunks.length ?? 0) > 0,
  Detail: ({ call, input }) => {
    const edit = editHunksOf(call.use.data.name, input);
    return edit && <Diff hunks={edit.hunks} maxLines={edit.whole ? 40 : 200} />;
  },
};

/** 編集内容の表示（変えた所ごとに、削除した行を赤、追加した行を緑で） */
function Diff({ hunks, maxLines }: { hunks: readonly EditHunk[]; maxLines: number }) {
  const lines = hunks.flatMap(({ old_string: before, new_string: after }) => [
    ...(before ? before.split("\n").map((l) => ["-", l] as const) : []),
    ...after.split("\n").map((l) => ["+", l] as const),
  ]);
  const shown = lines.slice(0, maxLines);
  return (
    <pre className="diff">
      {shown.map(([sign, line], i) => (
        <span key={i} className={sign === "+" ? "diff-add" : "diff-del"}>
          {sign} {line}
          {"\n"}
        </span>
      ))}
      {lines.length > shown.length && <span className="muted">… ほか {lines.length - shown.length} 行</span>}
    </pre>
  );
}
