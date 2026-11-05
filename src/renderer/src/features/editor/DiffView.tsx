import { Pencil } from "lucide-react";
import { useMemo } from "react";
import type { GitFileChange } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import type { CodeToken } from "@/lib/highlight";
import { languageOf } from "@/lib/languages";
import { useHighlight } from "@/hooks/useHighlight";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { useNarrowerThan } from "@/hooks/useNarrowerThan";
import { useSetting } from "@/hooks/useSetting";
import { DIFF_LAYOUT } from "@/lib/storageKeys";
import { CodeLine } from "@/ui/CodeLine";
import { ErrorText } from "@/ui/ErrorText";
import { Segmented } from "@/ui/Segmented";
import { parseDiff, toSplitRows, type DiffLine } from "./parseDiff";
import { useGitTarget } from "@/features/worktree/worktreeContext";


/** ファイルの状態の名前（差分の見出しに出す） */
export const CHANGE_LABELS: Record<GitFileChange["kind"], string> = {
  M: "変更",
  A: "追加",
  D: "削除",
  R: "名前の変更",
  C: "コピー",
  T: "種類の変更",
  U: "未追跡",
  "!": "競合",
};

/** これより狭いときは、左右に並べる設定でも 1 列で出す */
const SPLIT_MIN_WIDTH = 560;

/**
 * 選んだファイルの差分。VS Code と同じく左右に並べて出し、git diff と同じ 1 列にもできる（選んだ方を覚えておく）。
 * version が変わったら（変更の一覧を取り直したら）、差分も取り直す
 */
export function DiffView({
  projectId,
  file,
  staged,
  version,
  onEdit,
  commit,
  bare = false,
}: {
  projectId: number;
  file: GitFileChange;
  staged: boolean;
  version: number;
  /** いまのファイルを編集する（消したファイルでは渡さない） */
  onEdit?: () => void;
  /** コミットでの差分を出すとき（履歴から開いたとき）。staged は使わない */
  commit?: string;
  /** 見出し（パス・状態・編集・表示のしかた）を出さない（右の欄の「変更」のように、見出しを外で並べるとき） */
  bare?: boolean;
}) {
  const [layout, setLayout] = useSetting(DIFF_LAYOUT);
  // 左右に並べる設定でも、2 つ並べると読めない狭い欄（チャットの画面の右の欄など）では 1 列で出す（設定は変えない）
  const { ref, narrow } = useNarrowerThan<HTMLDivElement>(SPLIT_MIN_WIDTH);
  const shown = layout === "split" && narrow ? "unified" : layout;
  const { target, key: at } = useGitTarget(projectId);
  const key = `${at}:${commit ?? (staged ? "staged" : "unstaged")}:${file.path}:${file.old_path ?? ""}`;
  // 取り直している間は、前の差分を出しておく（同じファイルのとき。ちらつかないように）
  const loaded = useKeyedAsync(key, () => (commit ? api.gitCommitDiff(target, commit, file) : api.gitDiff(target, file, staged)), { deps: [version] });
  const current = loaded.loaded ? { diff: loaded.data, error: loaded.error } : undefined;
  const lines = useMemo(() => (current?.diff ? parseDiff(current.diff.diff) : []), [current?.diff]);
  const tokensOf = useDiffHighlight(lines, file);

  return (
    <div ref={ref} className="diff-view">
      {!bare && (
      <header className="diff-head">
        <span className="diff-path" title={file.path}>
          {file.old_path && <span className="muted">{file.old_path} → </span>}
          {file.path}
        </span>
        <span className="diff-state">
          {CHANGE_LABELS[file.kind]}・{commit ? commit.slice(0, 7) : staged ? "ステージ済み" : "未ステージ"}
        </span>
        <span className="spacer" />
        {onEdit && (
          <button className="btn btn-sm" title="いまのファイルを編集する" onClick={onEdit}>
            <Pencil size={13} aria-hidden /> 編集
          </button>
        )}
        <Segmented
          className="view-toggle"
          label="差分の表示のしかた"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "split", label: "並べて表示" },
            { value: "unified", label: "まとめて表示" },
          ]}
        />
      </header>
      )}
      <div className="diff-body">
        {!current ? (
          <p className="muted small diff-message">読み込み中…</p>
        ) : current.error ? (
          <ErrorText message={current.error} className="diff-message" />
        ) : current.diff?.binary ? (
          <p className="muted small diff-message">バイナリのファイルなので、差分は表示できません。</p>
        ) : lines.length === 0 ? (
          <p className="muted small diff-message">中身の変更はありません（名前や権限だけの変更です）。</p>
        ) : shown === "split" ? (
          <SplitDiff lines={lines} tokensOf={tokensOf} />
        ) : (
          <UnifiedDiff lines={lines} tokensOf={tokensOf} />
        )}
        {current?.diff?.truncated && <p className="muted small diff-message">大きいため、途中までを表示しています。</p>}
      </div>
    </div>
  );
}

/** git diff と同じ 1 列（左に変更前・変更後の行番号） */
/**
 * 差分の行の色（VS Code と同じ配色）。前後の行のつながり（複数行のコメントなど）を保つため、
 * 変更前（残した行・消した行）と変更後（残した行・足した行）をそれぞれ 1 つのコードとして色を付ける
 */
function useDiffHighlight(lines: DiffLine[], file: GitFileChange) {
  const before = useMemo(() => lines.filter((l) => l.oldNo !== undefined), [lines]);
  const after = useMemo(() => lines.filter((l) => l.newNo !== undefined), [lines]);
  const beforeTokens = useHighlight(
    useMemo(() => before.map((l) => l.text), [before]),
    languageOf(file.old_path ?? file.path),
  );
  const afterTokens = useHighlight(
    useMemo(() => after.map((l) => l.text), [after]),
    languageOf(file.path),
  );
  return useMemo(() => {
    const map = new Map<DiffLine, CodeToken[]>();
    before.forEach((line, i) => beforeTokens?.[i] && map.set(line, beforeTokens[i]));
    after.forEach((line, i) => afterTokens?.[i] && map.set(line, afterTokens[i]));
    return map;
  }, [before, after, beforeTokens, afterTokens]);
}

type TokensOf = Map<DiffLine, CodeToken[]>;

function UnifiedDiff({ lines, tokensOf }: { lines: DiffLine[]; tokensOf: TokensOf }) {
  return (
    <table className="diff-table">
      <colgroup>
        <col className="diff-col-no" />
        <col className="diff-col-no" />
        <col />
      </colgroup>
      <tbody>
        {lines.map((line, i) =>
          line.type === "hunk" ? (
            <tr key={i} className="diff-hunk">
              <td colSpan={3}>{line.text}</td>
            </tr>
          ) : (
            <tr key={i} className={`line-${line.type}`}>
              <td className="diff-no">{line.oldNo}</td>
              <td className="diff-no">{line.newNo}</td>
              {/* 行の番号と変更前・変更後のどちらか（チャットの画面の右の欄で、選んだ行へのコメントに使う） */}
              <td className="diff-code" data-no={line.newNo ?? line.oldNo} data-side={line.newNo !== undefined ? "new" : "old"}>
                <span className="diff-sign">{line.type === "add" ? "+" : line.type === "del" ? "-" : " "}</span>
                <CodeLine tokens={tokensOf.get(line)} text={line.text} />
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/** 左に変更前、右に変更後を並べる（VS Code と同じ） */
function SplitDiff({ lines, tokensOf }: { lines: DiffLine[]; tokensOf: TokensOf }) {
  const rows = useMemo(() => toSplitRows(lines), [lines]);
  // 左右で key を分ける（同じ key だと、片側のセルが落ちる）
  const side = (line: DiffLine | undefined, no: "oldNo" | "newNo") => [
    <td key={`${no}-no`} className={cx("diff-no", line ? `line-${line.type}` : "line-empty")}>
      {line?.[no]}
    </td>,
    <td key={`${no}-code`} className={cx("diff-code", line ? `line-${line.type}` : "line-empty")} data-no={line?.[no]} data-side={no === "newNo" ? "new" : "old"}>
      {line && <CodeLine tokens={tokensOf.get(line)} text={line.text} />}
    </td>,
  ];
  return (
    <table className="diff-table">
      <colgroup>
        <col className="diff-col-no" />
        <col />
        <col className="diff-col-no" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((row, i) =>
          "hunk" in row ? (
            <tr key={i} className="diff-hunk">
              <td colSpan={4}>{row.hunk.text}</td>
            </tr>
          ) : (
            <tr key={i}>
              {side(row.left, "oldNo")}
              {side(row.right, "newNo")}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
