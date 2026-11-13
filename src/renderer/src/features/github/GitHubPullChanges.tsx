import { memo, useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import { Copy, MessageSquare, MessageSquarePlus, PanelLeft } from "lucide-react";
import type { GitHubPullFile, GitHubReviewDraftComment, GitHubReviewThread } from "@shared/types";
import { api } from "@/api";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { useNarrowerThan } from "@/hooks/useNarrowerThan";
import { useSetting } from "@/hooks/useSetting";
import { GITHUB_FILES_TREE_HIDDEN } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { Chevron } from "@/ui/Chevron";
import { ErrorText } from "@/ui/ErrorText";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { FileIcon } from "@/features/editor/FileIcon";
import { UnifiedDiff, useDiffHighlight } from "@/features/editor/DiffView";
import { parseDiff } from "@/features/editor/parseDiff";
import { GitHubThread } from "./GitHubTimeline";
import { GitHubPullFileTree } from "./GitHubPullFileTree";
import { GitHubReviewBar, ReviewCommentEditor, ReviewDraftComment, useReviewDraft } from "./GitHubReview";
import { placeThreads, threadsAt } from "./pullThreads";
import { isTargetLine, reviewTargetAt, targetLabel, type ReviewTarget } from "./reviewLines";

/** これより多いファイルの PR は、初めはすべて畳んでおく（開いた分だけ差分を描く） */
const OPEN_ALL_MAX = 20;
/** これより狭い欄では、左のファイルの木を出さない（差分の幅を残す） */
const TREE_MIN_WIDTH = 560;

/** ファイルの変わり方の名前（GitHub の status） */
const FILE_STATUS_LABELS: Record<string, string> = {
  added: "追加",
  removed: "削除",
  modified: "変更",
  renamed: "名前の変更",
  copied: "コピー",
  changed: "変更",
  unchanged: "変更なし",
};

/** レビューの行のコメント（ためたもの・書いている欄）の操作 */
interface ReviewHandlers {
  save: (target: ReviewTarget, body: string) => void;
  remove: (comment: GitHubReviewDraftComment) => void;
  cancel: () => void;
}

/**
 * 1 つのファイルの見出しと差分（差分の行の下にその行のスレッドと、ためたレビューの行のコメント・書いている欄、行の見つからないスレッドはファイルの下）。
 * drafts・composing はこのファイルの分だけ
 */
const PullFile = memo(function PullFile({
  file,
  threads,
  open,
  onToggle,
  drafts,
  composing,
  review,
}: {
  file: GitHubPullFile;
  threads: GitHubReviewThread[];
  open: boolean;
  onToggle: (path: string) => void;
  drafts: GitHubReviewDraftComment[];
  composing: ReviewTarget | null;
  review: ReviewHandlers;
}) {
  const lines = useMemo(() => (open && file.patch ? parseDiff(file.patch) : []), [open, file.patch]);
  const placed = useMemo(() => placeThreads(threads, file.path, lines), [threads, file.path, lines]);
  const tokensOf = useDiffHighlight(lines, file.path, file.previous_path);
  const count = threads.filter((t) => t.path === file.path).length;
  const name = file.path.split("/").pop() ?? file.path;

  return (
    <section className="github-file" data-path={file.path}>
      <button type="button" className="github-file-head" aria-expanded={open} onClick={() => onToggle(file.path)}>
        <Chevron open={open} />
        <FileIcon name={name} />
        <span className="github-file-path" data-tip={file.path}>
          {file.previous_path && <span className="muted">{file.previous_path} → </span>}
          {file.path}
        </span>
        <span className="github-file-status muted small">{FILE_STATUS_LABELS[file.status] ?? file.status}</span>
        {count > 0 && (
          <span className="github-file-threads muted small" aria-label={`行のスレッド ${count} 件`}>
            <MessageSquare size={12} aria-hidden />
            {count}
          </span>
        )}
        <span className="github-diffstat small">
          <span className="github-add">+{file.additions}</span> <span className="github-del">−{file.deletions}</span>
        </span>
      </button>
      {open && (
        <div className="diff-view github-file-diff">
          <div className="diff-body">
            {file.patch === null ? (
              <p className="muted small diff-message">大きすぎるか、バイナリのファイルなので、差分は GitHub で見てください。</p>
            ) : lines.length === 0 ? (
              <p className="muted small diff-message">中身の変更はありません（名前や権限だけの変更です）。</p>
            ) : (
              <UnifiedDiff
                lines={lines}
                tokensOf={tokensOf}
                after={(line) => {
                  const own = threadsAt(placed, line);
                  const mine = drafts.filter((d) => isTargetLine(line, d));
                  const editing = composing && isTargetLine(line, composing) ? composing : null;
                  return own.length === 0 && mine.length === 0 && !editing ? null : (
                    <tr className="github-diff-threads">
                      <td colSpan={3}>
                        {own.map((t) => (
                          <GitHubThread key={t.id} thread={t} inline />
                        ))}
                        {mine.map((d, i) => (
                          <ReviewDraftComment key={`${d.side}:${d.line}:${i}`} comment={d} onRemove={() => review.remove(d)} />
                        ))}
                        {editing && <ReviewCommentEditor target={editing} onSave={(body) => review.save(editing, body)} onCancel={review.cancel} />}
                      </td>
                    </tr>
                  );
                }}
              />
            )}
          </div>
          {placed.rest.length > 0 && (
            <div className="github-file-rest">
              <p className="muted small">いまの差分にない行へのスレッド</p>
              {placed.rest.map((t) => (
                <GitHubThread key={t.id} thread={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
});

/**
 * PR の「変更」（左に変えたファイルの木、右にファイルごとの差分と行のスレッド）。差分は 1 列で、スレッドはその行の下に出す（GitHub と同じ）。
 * 木は変更タブと同じ形で、押すとそのファイルの差分へ移る（畳んでいれば開く）。帯の頭のボタンで閉じられ、狭い欄では出さない。
 * 差分の行（選べば行の範囲）を右クリックするとレビューの行のコメントを書け、ためておいて上の帯（GitHubReviewBar）からまとめて送る（段階 3）。
 * version（PR の最新のコミット）が変わったら取り直す。ファイルが多ければ初めは畳んでおく
 */
export function GitHubPullChanges({
  projectId,
  number,
  threads,
  version,
  headSha,
  onChanged,
}: {
  projectId: number;
  number: number;
  threads: GitHubReviewThread[];
  version: string;
  headSha: string | null;
  onChanged: () => void;
}) {
  const loaded = useKeyedAsync(`${projectId}:${number}`, () => api.githubPullFiles(projectId, number), { deps: [version] });
  // 開閉は「既定から変えたファイル」だけ覚える（既定はファイルの数で決まる）
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (path: string) =>
      setToggled((prev) => {
        const next = new Set(prev);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    [],
  );
  // レビュー: ためた行のコメント（画面の保存）と、いま書いている行
  const [draft, setDraft] = useReviewDraft(projectId, number);
  const [composing, setComposing] = useState<ReviewTarget | null>(null);
  const menu = useContextMenu<{ target: ReviewTarget; copy: string }>();
  // 左のファイルの木（閉じたかは覚える。狭い欄では出さない）と、木で押したファイル
  const [treeHidden, setTreeHidden] = useSetting(GITHUB_FILES_TREE_HIDDEN);
  const layout = useNarrowerThan<HTMLDivElement>(TREE_MIN_WIDTH);
  const main = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const review = useMemo<ReviewHandlers>(
    () => ({
      save: (target, body) => {
        setDraft({ ...draft, comments: [...draft.comments, { ...target, body }] });
        setComposing(null);
      },
      remove: (comment) => setDraft({ ...draft, comments: draft.comments.filter((c) => c !== comment) }),
      cancel: () => setComposing(null),
    }),
    [draft, setDraft],
  );
  // 差分の行（選んでいれば選んだ行の範囲）を右クリック: その行にレビューのコメントを書く
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    const target = reviewTargetAt(e.target, selection);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    menu.open(e, { target, copy: selection && !selection.isCollapsed ? selection.toString() : "" });
  };

  if (loaded.error) return <ErrorText message={loaded.error} />;
  const data = loaded.data;
  if (!data) return <p className="muted small github-detail-loading">読み込み中…</p>;
  if (data.files.length === 0) return <p className="muted small">この PR には変更したファイルがありません。</p>;
  const openByDefault = data.files.length <= OPEN_ALL_MAX;
  const showTree = !treeHidden && !layout.narrow;
  // 木で押したファイルの差分へ移る（畳んでいれば開いてから）
  const goTo = (path: string) => {
    setPicked(path);
    if (openByDefault === toggled.has(path)) toggle(path);
    requestAnimationFrame(() => main.current?.querySelector(`.github-file[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "start" }));
  };

  return (
    <div className="github-files" onContextMenu={onContextMenu}>
      <GitHubReviewBar
        projectId={projectId}
        number={number}
        headSha={headSha}
        onSent={onChanged}
        lead={
          !layout.narrow && (
            <IconButton icon={PanelLeft} size={14} label={treeHidden ? "ファイルの木を出す" : "ファイルの木を閉じる"} aria-pressed={!treeHidden} onClick={() => setTreeHidden(!treeHidden)} />
          )
        }
      />
      <div ref={layout.ref} className="github-files-layout">
      {showTree && <GitHubPullFileTree files={data.files} selected={picked} onSelect={goTo} />}
      <div ref={main} className="github-files-main">
      {!openByDefault && <p className="muted small">ファイルが多いので畳んでいます。見出し・左の木を押すと差分を開きます。</p>}
      {data.files.map((f) => (
        <PullFile
          key={f.path}
          file={f}
          threads={threads}
          open={openByDefault !== toggled.has(f.path)}
          onToggle={toggle}
          drafts={draft.comments.filter((c) => c.path === f.path)}
          composing={composing?.path === f.path ? composing : null}
          review={review}
        />
      ))}
      {data.truncated && <p className="muted small">ファイルが多いので、初めの {data.files.length.toLocaleString()} 件までを出しています。続きは GitHub で見てください。</p>}
      </div>
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="差分の行" onClose={menu.close}>
          <MenuItem onSelect={() => setComposing(menu.menu?.value.target ?? null)}>
            <MessageSquarePlus size={14} /> {targetLabel(menu.menu.value.target)}にレビューのコメントを書く
          </MenuItem>
          {menu.menu.value.copy && (
            <MenuItem onSelect={() => void navigator.clipboard.writeText(menu.menu?.value.copy ?? "")}>
              <Copy size={14} /> コピー
            </MenuItem>
          )}
        </PopupMenu>
      )}
    </div>
  );
}
