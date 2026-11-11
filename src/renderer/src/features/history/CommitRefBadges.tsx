import { Check, Cloud, Tag } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import type { GitRefs } from "@shared/types";
import { cx } from "@/lib/cx";
import { GitHubMark } from "@/ui/GitHubMark";
import { refBadgesOf } from "./refBadges";
import type { RefTarget } from "./refTarget";

/**
 * ブランチ・タグの札（その行の線の色で塗る。いまのブランチは ✓ と濃い色、タグはタグのマーク）。
 * リモートのブランチには remote のマーク（GitHub なら GitHub のマーク、ほかは雲）を付け、同じコミットにある手元のブランチの札にはまとめてマークだけを添える。
 * 右クリックでそのブランチ・タグのメニュー
 */
export function RefBadges({ refs, known, color, onMenu }: { refs: string[]; known: GitRefs | undefined; color: string; onMenu?: (e: MouseEvent, target: RefTarget) => void }) {
  return (
    <>
      {refBadgesOf(refs, known).map(({ target, ref, head, remotes }) => {
        const remoteOnly = target.kind === "remote";
        const marks = remotes.map((r) => (r.github ? <GitHubMark key={r.name} size={11} /> : <Cloud key={r.name} size={11} aria-hidden />));
        const pushed = !remoteOnly && remotes.length > 0 ? `（${remotes.map((r) => r.name).join("・")} にもある）` : "";
        return (
          <span
            key={ref}
            className={cx("ref-badge", head && "head", target.kind === "tag" && "tag", remoteOnly && "remote")}
            style={{ "--ref-color": color } as CSSProperties}
            title={`${ref}${pushed}（右クリックでメニュー）`}
            onContextMenu={
              onMenu &&
              ((e) => {
                e.stopPropagation();
                onMenu(e, target);
              })
            }
          >
            {head && <Check size={11} strokeWidth={3} aria-hidden />}
            {target.kind === "tag" && <Tag size={11} aria-hidden />}
            {remoteOnly && marks}
            <span className="ref-badge-name">{target.name}</span>
            {!remoteOnly && marks}
          </span>
        );
      })}
    </>
  );
}
