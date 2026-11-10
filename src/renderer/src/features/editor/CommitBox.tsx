import { ArrowDown, ArrowUp, Check, ChevronDown, UploadCloud } from "lucide-react";
import type { GitStatus } from "@shared/types";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { isKey } from "@/lib/keys";
import type { CommitActions } from "./useCommitActions";

/**
 * 「変更」の上のコミットの欄（VS Code と同じ）。メッセージ（書いた分だけ伸びる 1 行の欄）を書いて「コミット」（⌘Enter）。右の ▾ で
 * コミット / コミット (修正) / コミットしてプッシュ / コミットして同期 を選ぶ。ステージしたものがなければ、すべてステージしてコミットするか確かめる。
 * リモートより進んでいれば「プッシュ」、追いかけるブランチがまだなければ「ブランチを公開」、遅れていれば「プル」を下に出す（利用者の依頼で残す）
 */
export function CommitBox({ status, actions }: { status: Extract<GitStatus, { repo: true }>; actions: CommitActions }) {
  const { message, setMessage, busy, canCommit, canPush, publish, commit, push, pull } = actions;
  const menu = useContextMenu({ align: "end" });
  return (
    <div className="commit-box">
      <textarea
        className="commit-message"
        rows={1}
        placeholder={`メッセージ (⌘Enter で "${status.branch ?? "いまのブランチ"}" にコミット)`}
        aria-label="コミットのメッセージ"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (isKey(e, "Enter", { meta: true })) {
            e.preventDefault();
            void commit();
          }
        }}
      />
      <div className="commit-split">
        <button className="btn btn-primary commit-button" disabled={Boolean(busy) || !canCommit} onClick={() => void commit()}>
          <Check size={16} aria-hidden /> {busy === "commit" ? "コミット中…" : "コミット"}
        </button>
        <button
          className="btn btn-primary commit-more"
          aria-label="コミットの仕方を選ぶ"
          aria-haspopup="menu"
          aria-expanded={menu.isOpen}
          disabled={Boolean(busy)}
          onClick={(e) => menu.toggle(e)}
        >
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="コミットの仕方" ignore=".commit-more" onClose={menu.close}>
          <MenuItem disabled={!canCommit} onSelect={() => void commit("commit")}>
            コミット
          </MenuItem>
          <MenuItem title="ステージした変更（なければメッセージだけ）を直前のコミットに足して書き直します。メッセージが空なら前のメッセージのままです" onSelect={() => void commit("amend")}>
            コミット (修正)
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={!canCommit || !canPush} onSelect={() => void commit("push")}>
            コミットしてプッシュ
          </MenuItem>
          <MenuItem disabled={!canCommit || !canPush} title="リモートより遅れていれば先に早送りで取り込み、コミットしてからプッシュします" onSelect={() => void commit("sync")}>
            コミットして同期
          </MenuItem>
        </PopupMenu>
      )}
      {status.behind > 0 && (
        <button className="btn commit-button" disabled={Boolean(busy)} onClick={() => void pull()}>
          <ArrowDown size={16} aria-hidden /> {busy === "pull" ? "プル中…" : `プル（${status.behind} 件）`}
        </button>
      )}
      {(status.ahead > 0 || publish) && (
        <button className="btn commit-button" disabled={Boolean(busy)} onClick={() => void push()}>
          {publish ? <UploadCloud size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}
          {busy === "push" ? "プッシュ中…" : publish ? "ブランチを公開" : `プッシュ（${status.ahead} 件）`}
        </button>
      )}
    </div>
  );
}
