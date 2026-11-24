import { useEffect, useState } from "react";
import type { GitDiff } from "@shared/git/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/git/ui/storage";

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

/**
 * 確認済みのファイル（key ごとに覚える。値はパス → 確認したときの差分の指紋）と、読んだ差分の指紋。
 * paths は変更のあるファイル（null なら一覧がまだ届いていない）。もう変更のないファイルの印は外す
 */
export function useViewedFiles(key: string, paths: readonly string[] | null) {
  const [viewed, setViewed] = useSetting(storage.settings.sideViewed(key));
  // 読んだ差分の指紋（パス → 指紋。差分を読むたびに入れ、あとで変わったかと「確認済み n/m」の数に使う）
  const [fingerprints, setFingerprints] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (paths === null) return;
    const next = pruneViewed(viewed, paths);
    if (next !== viewed) setViewed({ ...next });
  }, [paths, viewed, setViewed]);
  const fingerprintOf = (path: string) => fingerprints.get(path);
  const stateOf = (path: string) => viewedStateOf(viewed, path, fingerprintOf(path));
  return {
    fingerprintOf,
    stateOf,
    /** 確認済みの数（確認したあとで差分が変わったものは数えない） */
    count: (paths ?? []).filter((p) => stateOf(p) === "viewed").length,
    /** 読んだ差分を覚える（読めなかったら undefined） */
    noteDiff: (path: string, diff: GitDiff | undefined) =>
      setFingerprints((prev) => {
        const fingerprint = diff ? diffFingerprint(diff) : undefined;
        if (prev.get(path) === fingerprint) return prev;
        const next = new Map(prev);
        if (fingerprint === undefined) next.delete(path);
        else next.set(path, fingerprint);
        return next;
      }),
    /** いまの差分で確認済みにする（差分を読んでいなければ何もしない） */
    mark: (path: string) => {
      const fingerprint = fingerprintOf(path);
      if (fingerprint !== undefined) setViewed({ ...viewed, [path]: fingerprint });
    },
    unmark: (path: string) => {
      const rest = { ...viewed };
      delete rest[path];
      setViewed(rest);
    },
  };
}

export type ViewedFiles = ReturnType<typeof useViewedFiles>;
