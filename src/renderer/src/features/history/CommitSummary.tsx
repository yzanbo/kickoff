import type { CSSProperties, MouseEvent } from "react";
import type { GitCommit, GitCommitDetail, GitFileChange, GitRefs } from "@shared/types";
import { baseName } from "@/lib/format";
import { CopyButton } from "@/ui/CopyButton";
import { GitHubMark } from "@/ui/GitHubMark";
import { CHANGE_LABELS } from "@/features/editor/DiffView";
import { FileIcon } from "@/features/editor/FileIcon";
import { RefBadges } from "./CommitRefBadges";
import type { RefTarget } from "./refTarget";

/** 作者の丸い印の色（メールアドレスから決める。同じ人はいつも同じ色） */
function avatarHue(email: string) {
  let h = 0;
  for (const ch of email.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** 作者の丸い印（名前の頭文字。外の画像は取りに行かない） */
function AuthorAvatar({ name, email }: { name: string; email: string }) {
  return (
    <span className="commit-avatar" style={{ "--avatar-hue": avatarHue(email) } as CSSProperties} aria-hidden>
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** 日時を「2026年11月3日(火) 8:00:24」の形で */
const longDate = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });

/**
 * 履歴の「コミット」タブ: 左の細い列に作者の丸い印と項目の名前（参照・SHA・親）、右に中身を並べ、線で区切ってメッセージ・変わったファイルを続ける。
 * 親を押すとそのコミットを表で選び、ファイルを押すと「変更」タブでその差分を開く
 */
export function CommitSummary({
  commit,
  detail,
  known,
  refColor,
  githubUrl,
  canPick,
  onPick,
  onOpenFile,
  onRefMenu,
}: {
  commit: GitCommit;
  detail: GitCommitDetail | undefined;
  known: GitRefs | undefined;
  refColor: string;
  /** GitHub のこのコミットのページ（連携先が GitHub でなければ null） */
  githubUrl: string | null;
  /** 親のコミットが表に読み込んであるか（なければ押せない） */
  canPick: (hash: string) => boolean;
  onPick: (hash: string) => void;
  onOpenFile: (file: GitFileChange) => void;
  onRefMenu?: (e: MouseEvent, target: RefTarget) => void;
}) {
  const body = detail?.body.split("\n").slice(1).join("\n").trim() ?? "";
  const files = detail?.files ?? [];
  const otherCommitter = detail && (detail.committer !== commit.author || detail.committed_at !== commit.date);
  return (
    <section className="commit-summary">
      <div className="commit-summary-side">
        <AuthorAvatar name={commit.author} email={commit.email} />
      </div>
      <div className="commit-author-block">
        <span className="commit-summary-label">作者</span>
        <span>
          <b className="commit-author-name">{commit.author}</b> <span className="muted">{commit.email}</span>
        </span>
        <span className="muted">{longDate(commit.date)}</span>
        {otherCommitter && (
          <span className="muted small">
            コミットした人: {detail.committer}（{longDate(detail.committed_at)}）
          </span>
        )}
      </div>

      {commit.refs.length > 0 && (
        <>
          <span className="commit-summary-label commit-summary-side">参照</span>
          <span className="commit-summary-refs">
            <RefBadges refs={commit.refs} known={known} color={refColor} onMenu={onRefMenu} />
          </span>
        </>
      )}
      <span className="commit-summary-label commit-summary-side">SHA</span>
      <span className="commit-summary-sha">
        <span className="mono">{commit.hash}</span>
        <CopyButton label="SHA をコピー" text={commit.hash} size={12} />
        {githubUrl && (
          <button type="button" className="icon-button commit-github" title="GitHub でこのコミットを開く" aria-label="GitHub でこのコミットを開く" onClick={() => window.open(githubUrl)}>
            <GitHubMark size={13} />
          </button>
        )}
      </span>
      {commit.parents.length > 0 && (
        <>
          <span className="commit-summary-label commit-summary-side">{commit.parents.length > 1 ? "親（マージ）" : "親"}</span>
          <span className="commit-summary-parents">
            {commit.parents.map((p) => (
              <button
                key={p}
                type="button"
                className="link-button mono"
                disabled={!canPick(p)}
                title={canPick(p) ? `${p}（押すと、このコミットを選びます）` : `${p}（表にまだ読み込んでいません。「さらに読み込む」で出せます）`}
                onClick={() => onPick(p)}
              >
                {p.slice(0, 7)}
              </button>
            ))}
          </span>
        </>
      )}

      <hr className="commit-summary-rule" />
      <div className="commit-message">
        <h3 className="commit-subject">{commit.subject}</h3>
        {body && <pre className="commit-body">{body}</pre>}
      </div>

      <hr className="commit-summary-rule" />
      <span className="muted small commit-summary-count">
        {detail ? `${files.length} 個のファイル${commit.parents.length > 1 ? "（1 つ目の親との差）" : ""}` : "読み込み中…"}
      </span>
      <ul className="commit-summary-files">
        {files.map((f) => (
          <li key={f.path}>
            <button type="button" className="commit-summary-file" title={`${f.path}（${CHANGE_LABELS[f.kind]}。押すと「変更」で差分を開きます）`} onClick={() => onOpenFile(f)}>
              <span className="commit-summary-file-marks">
                <span className="change-badge" data-kind={f.kind}>
                  {f.kind}
                </span>
                <FileIcon name={baseName(f.path)} />
              </span>
              <span className={f.kind === "D" ? "deleted" : undefined}>{f.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
