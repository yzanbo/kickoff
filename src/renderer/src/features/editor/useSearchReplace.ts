import { useState } from "react";
import type { ProjectReplaceResult } from "@shared/types";
import { api, ApiError } from "@/api";
import { baseName } from "@/lib/format";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import { replaceTargets, resultCounts, type SearchFileResult } from "./searchHits";
import type { ChangesSelection } from "./useChangesSelection";
import type { GitStatusController } from "./useGitStatus";
import type { ProjectSearchController } from "./useProjectSearch";

/** 置換したあとの知らせと、元に戻すのに使うもの（置換する前の中身と、置換したあとの指紋） */
interface LastReplace {
  message: string;
  undo: { path: string; before: string; hash: string }[] | null;
}

/** 置換した結果の知らせの文（置換しなかったファイルがあれば添える） */
function replaceMessage(r: ProjectReplaceResult): string {
  const done = r.replaced === 0 ? "置換するものはありませんでした" : `${r.files.length} 個のファイルで ${r.replaced} か所を置換しました`;
  return r.skipped.length === 0 ? `${done}。` : `${done}（${r.skipped.length} 件は置換していません: ${r.skipped.map((s) => `${baseName(s.path)} — ${s.reason}`).join("・")}）。`;
}

/**
 * 検索の結果の置換（VS Code と同じ: すべて・ファイルごと・行ごと）。置換は結果を出したときの探し方で、結果の行だけをコアが置き換える
 * （探したあとで変わった行は置換しない）。すべて置換は確かめてから。開いているファイルに保存していない変更があれば先に保存してもらう。
 * 置換したら探し直し・Git の状態を取り直し、置換する前の中身を覚えて「元に戻す」で戻せる（そのあとほかで変わったファイルは戻さない）
 */
export function useSearchReplace(projectId: number, { search, selection, git }: { search: ProjectSearchController; selection: ChangesSelection; git: GitStatusController }) {
  const { target } = useGitTarget(projectId);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastReplace | null>(null);

  const replace = async (files: readonly SearchFileResult[], scope: "all" | "file" | "line") => {
    const result = search.result;
    if (!result || files.length === 0 || busy) return;
    const open = selection.selected?.path;
    if (open && selection.isDirty() && files.some((f) => f.path === open)) {
      void alertDialog("保存していない変更があります", `「${baseName(open)}」を保存してから置換してください。`);
      return;
    }
    if (scope === "all") {
      const counts = resultCounts(files);
      const ok = await confirmDialog({
        title: "すべて置換しますか？",
        message: `${counts.files} 個のファイルの ${counts.lines} 行で、見つかった部分を「${search.replace}」に置換します。${result.value.truncated ? "（結果が多いため、表示している分だけを置換します）" : ""}`,
        confirmLabel: "すべて置換",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api.replaceInProject(target, { query: result.query, replace: search.replace, preserve_case: search.preserveCase, files: replaceTargets(files) });
      const undo = r.files.length > 0 && r.files.every((f) => f.before !== null) ? r.files.map((f) => ({ path: f.path, before: f.before ?? "", hash: f.hash })) : null;
      setLast({ message: replaceMessage(r), undo });
      search.rerun();
      void git.refresh();
    } catch (e) {
      reportFailure("置換できませんでした")(e);
    } finally {
      setBusy(false);
    }
  };

  // 置換する前の中身に戻す（置換したあとの指紋と違う = ほかで変わったファイルは戻さず、知らせる）
  const undo = async () => {
    if (!last?.undo || busy) return;
    setBusy(true);
    const kept: string[] = [];
    try {
      for (const f of last.undo) {
        try {
          await api.saveProjectFile(target, f.path, f.before, f.hash);
        } catch (e) {
          if (e instanceof ApiError && (e.status === 409 || e.status === 404)) kept.push(f.path);
          else throw e;
        }
      }
      setLast(null);
      search.rerun();
      void git.refresh();
      if (kept.length > 0) void alertDialog("戻せなかったファイルがあります", `置換したあとで変わったため、次のファイルは戻していません: ${kept.join("、")}`);
    } catch (e) {
      reportFailure("元に戻せませんでした")(e);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    /** 置換したあとの知らせ（元に戻せるか） */
    last,
    replaceAll: () => void replace(search.files, "all"),
    replaceFile: (file: SearchFileResult) => void replace([file], "file"),
    replaceLine: (file: SearchFileResult, line: number) => void replace([{ ...file, matches: file.matches.filter((m) => m.line === line) }], "line"),
    undo: () => void undo(),
    /** 知らせを閉じる */
    dismissMessage: () => setLast(null),
  };
}

export type SearchReplaceController = ReturnType<typeof useSearchReplace>;
