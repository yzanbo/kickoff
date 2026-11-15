import { Check, Cloud, Tag } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { GitRefs } from "@shared/types";
import { cx } from "@/lib/cx";
import { GitHubMark } from "@/ui/GitHubMark";
import { refBadgesOf, type BadgeRemote } from "./refBadges";
import type { RefTarget } from "./refTarget";

type OnMenu = (e: MouseEvent, target: RefTarget) => void;

/** remote のマーク（GitHub なら GitHub のマーク、ほかは雲） */
function RemoteMark({ remote }: { remote: BadgeRemote }) {
  return remote.github ? <GitHubMark size={11} /> : <Cloud size={11} aria-hidden />;
}

/** 札の右クリックで、そのブランチ・タグのメニューを開く */
function menuHandler(onMenu: OnMenu | undefined, target: RefTarget) {
  return (
    onMenu &&
    ((e: MouseEvent) => {
      e.stopPropagation();
      onMenu(e, target);
    })
  );
}

/**
 * ブランチ・タグの札（その行の線の色で塗る。いまのブランチは ✓ と濃い色、タグはタグのマーク）。
 * リモートのブランチには remote のマーク（GitHub なら GitHub のマーク、ほかは雲）を付ける。
 * 手元のブランチと同じコミットにあるリモートのブランチは、名前を省いたマークだけの札にして手元の札の前にくっつける
 * （手元とリモートを別々の札で見せ、それぞれ右クリックでそのブランチのメニュー）
 */
export function RefBadges({ refs, known, color, onMenu }: { refs: string[]; known: GitRefs | undefined; color: string; onMenu?: OnMenu }) {
  const style = { "--ref-color": color } as CSSProperties;
  return (
    <>
      {refBadgesOf(refs, known).map(({ target, ref, head, remotes }) => {
        const remoteOnly = target.kind === "remote";
        const badge = (
          <span
            key={ref}
            className={cx("ref-badge", head && "head", target.kind === "tag" && "tag", remoteOnly && "remote")}
            style={style}
            title={`${ref}（右クリックでメニュー）`}
            onContextMenu={menuHandler(onMenu, target)}
          >
            {head && <Check size={11} strokeWidth={3} aria-hidden />}
            {target.kind === "tag" && <Tag size={11} aria-hidden />}
            {remoteOnly && remotes.map((r) => <RemoteMark key={r.branch} remote={r} />)}
            <span className="ref-badge-name">{target.name}</span>
          </span>
        );
        if (remoteOnly || remotes.length === 0) return badge;
        return (
          <span key={ref} className="ref-badge-group">
            {remotes.map((r) => (
              <span
                key={r.branch}
                className="ref-badge remote"
                style={style}
                title={`${r.branch}（右クリックでメニュー）`}
                aria-label={r.branch}
                onContextMenu={menuHandler(onMenu, { kind: "remote", name: r.branch })}
              >
                <RemoteMark remote={r} />
              </span>
            ))}
            {badge}
          </span>
        );
      })}
    </>
  );
}
