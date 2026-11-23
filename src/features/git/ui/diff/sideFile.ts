import type { GitDiff } from "@shared/git/types";

/** 差分の指紋（確認したあとで差分が変わったかを見分ける。FNV-1a の 32 ビット） */
export function diffFingerprint(diff: GitDiff): string {
  const text = `${diff.binary ? "b" : ""}${diff.truncated ? "t" : ""}:${diff.diff}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * ファイルを確認済みにしているか: viewed = 確認済み（いまの差分は確認したときのまま。差分を読み込む前もそうみなす）/
 * changed = 確認したあとで差分が変わった / none = 確認していない
 */
export function viewedStateOf(viewed: Readonly<Record<string, string>>, path: string, fingerprint: string | undefined): "viewed" | "changed" | "none" {
  const saved = viewed[path];
  if (saved === undefined) return "none";
  return fingerprint === undefined || fingerprint === saved ? "viewed" : "changed";
}

/** もう変更のないファイル（コミットした・元に戻した）の確認済みの印を外す（外すものがなければ同じものを返す） */
export function pruneViewed(viewed: Readonly<Record<string, string>>, paths: readonly string[]): Readonly<Record<string, string>> {
  const keep = new Set(paths);
  const stale = Object.keys(viewed).filter((p) => !keep.has(p));
  if (stale.length === 0) return viewed;
  return Object.fromEntries(Object.entries(viewed).filter(([p]) => keep.has(p)));
}
