// 差分の行の色付け（変更前と変更後をそれぞれ 1 つのコードとして色を付ける）
import type { CodeToken } from "@/foundation/ui/code/highlight";
import { languageOf } from "@/foundation/ui/code/languages";
import { useHighlight } from "@/foundation/ui/code/useHighlight";
import type { DiffLine } from "./diffModel";

/**
 * 差分の行の色（VS Code と同じ配色）。前後の行のつながり（複数行のコメントなど）を保つため、
 * 変更前（残した行・消した行）と変更後（残した行・足した行）をそれぞれ 1 つのコードとして色を付ける
 */
export function useDiffHighlight(lines: DiffLine[], path: string, oldPath?: string | null) {
  const before = lines.filter((l) => l.oldNo !== undefined);
  const after = lines.filter((l) => l.newNo !== undefined);
  const beforeTokens = useHighlight(
    before.map((l) => l.text),
    languageOf(oldPath ?? path),
  );
  const afterTokens = useHighlight(
    after.map((l) => l.text),
    languageOf(path),
  );
  const map = new Map<DiffLine, CodeToken[]>();
  before.forEach((line, i) => beforeTokens?.[i] && map.set(line, beforeTokens[i]));
  after.forEach((line, i) => afterTokens?.[i] && map.set(line, afterTokens[i]));
  return map;
}
