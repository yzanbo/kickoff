import type { GitRefs } from "@shared/types";
import { refTargetOf, type RefTarget } from "./refTarget";

/** 札に添えるリモート（github = GitHub を指す remote。GitHub のマークを出す。そうでなければ雲のマーク） */
export interface BadgeRemote {
  name: string;
  github: boolean;
}

/**
 * コミットの行の札 1 つ。手元のブランチは、同じコミットにある追いかけ先（なければ同じ名前）のリモートのブランチをまとめて
 * remotes に持つ（プッシュ済みと分かるよう、リモートのマークを添える）。まとめなかったリモートのブランチは、それだけで 1 つの札
 */
export interface RefBadge {
  target: RefTarget;
  /** git log の札の文（例: "HEAD -> main"） */
  ref: string;
  /** いまのブランチ */
  head: boolean;
  remotes: BadgeRemote[];
}

/** リモートのブランチ "origin/main" の remote（一覧になければ「/」の前） */
function remoteOf(name: string, known: GitRefs | undefined): BadgeRemote {
  const group = known?.remotes.find((r) => r.branches.some((b) => b.name === name));
  return { name: group?.name ?? name.slice(0, name.indexOf("/")), github: group?.github ?? false };
}

/** 1 つのコミットの札の文を、表に出す札にする（並びは git log のまま。まとめたリモートの札は消す。純粋な関数） */
export function refBadgesOf(refs: string[], known: GitRefs | undefined): RefBadge[] {
  const badges = refs.flatMap((ref) => {
    const target = refTargetOf(ref, known);
    return target ? [{ target, ref, head: ref.startsWith("HEAD -> "), remotes: [] as BadgeRemote[] }] : [];
  });
  const merged = new Set<string>();
  for (const badge of badges) {
    if (badge.target.kind !== "branch") continue;
    const name = badge.target.name;
    const upstream = known?.branches.find((b) => b.name === name)?.upstream ?? null;
    for (const other of badges) {
      if (other.target.kind !== "remote" || merged.has(other.target.name)) continue;
      const remote = other.target.name;
      if (upstream ? remote === upstream : remote.slice(remote.indexOf("/") + 1) === name) {
        merged.add(remote);
        badge.remotes.push(remoteOf(remote, known));
      }
    }
  }
  return badges
    .filter((b) => !(b.target.kind === "remote" && merged.has(b.target.name)))
    .map((b) => (b.target.kind === "remote" ? { ...b, remotes: [remoteOf(b.target.name, known)] } : b));
}
