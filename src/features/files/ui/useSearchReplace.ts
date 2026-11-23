import { useState } from "react";
import type { ProjectReplaceResult } from "@shared/files/types";
import type { ProjectSearchQuery } from "@shared/foundation/search/searchMatch";
import { ApiError } from "@/foundation/ui/api";
import { baseName } from "@/foundation/ui/lib/format";
import { alert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { replaceTargets, resultCounts, type SearchFileResult } from "./searchHits";
import type { ChangesSelection } from "./useFileTabs";
import type { GitStatusController } from "@/features/git/ui/useGitStatus";
import type { ProjectSearchController } from "./useProjectSearch";
import { filesApi } from "./api";
import { workdirInput } from "@/foundation/ui/api/workdir";

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
  const target = useWorkplace(projectId);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastReplace | null>(null);

  const replace = async (files: readonly SearchFileResult[], scope: "all" | "file" | "line") => {
    const result = search.result;
    if (!result || files.length === 0 || busy) return;
    const open = selection.dirtyPaths().find((p) => files.some((f) => f.path === p));
    if (open) {
      void alert("保存していない変更があります", `「${baseName(open)}」を保存してから置換してください。`);
      return;
    }
    if (scope === "all") {
      const counts = resultCounts(files);
      const ok = await confirm({
        title: "すべて置換しますか？",
        message: `${counts.files} 個のファイルの ${counts.lines} 行で、見つかった部分を「${search.replace}」に置換します。${result.value.truncated ? "（結果が多いため、表示している分だけを置換します）" : ""}`,
        confirmLabel: "すべて置換",
      });
      if (!ok) return;
    }
    setBusy(true);
    await replaceFiles(result.query, files).catch((e: unknown) => void reportFailure("置換できませんでした")(e));
    setBusy(false);
  };
  /** 置換して、探し直し・Git の状態を取り直す（失敗は投げる） */
  const replaceFiles = async (query: ProjectSearchQuery, files: readonly SearchFileResult[]) => {
    const r = await filesApi("POST /api/projects/:projectId/search/replace", { ...workdirInput(target), body: { query, replace: search.replace, preserve_case: search.preserveCase, files: replaceTargets(files) } });
    const undo = r.files.length > 0 && r.files.every((f) => f.before !== null) ? r.files.map((f) => ({ path: f.path, before: f.before ?? "", hash: f.hash })) : null;
    setLast({ message: replaceMessage(r), undo });
    search.rerun();
    void git.refresh();
  };

  // 置換する前の中身に戻す（置換したあとの指紋と違う = ほかで変わったファイルは戻さず、知らせる）
  const undo = async () => {
    if (!last?.undo || busy) return;
    setBusy(true);
    await restoreFiles(last.undo).catch((e: unknown) => void reportFailure("元に戻せませんでした")(e));
    setBusy(false);
  };
  /** 置換する前の中身を書き戻す（ほかで変わった・なくなったファイルは飛ばして知らせる。ほかの失敗は投げる） */
  const restoreFiles = async (list: NonNullable<LastReplace["undo"]>) => {
    const kept: string[] = [];
    for (const f of list) {
      await filesApi("PUT /api/projects/:projectId/file", { ...workdirInput(target), body: { path: f.path, content: f.before, base_hash: f.hash } }).catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 409 || e.status === 404)) kept.push(f.path);
        else throw e;
      });
    }
    setLast(null);
    search.rerun();
    void git.refresh();
    if (kept.length > 0) void alert("戻せなかったファイルがあります", `置換したあとで変わったため、次のファイルは戻していません: ${kept.join("、")}`);
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
