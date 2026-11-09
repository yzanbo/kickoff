import { useEffect, useRef, useState } from "react";
import type { GitFileChange, GitStatus } from "@shared/types";
import { api, type GitTarget } from "@/api";

/**
 * 編集の部品の行の横に出す Git との違いの帯の、元の中身（VS Code と同じく、ステージした中身。なければコミットの中身）。
 * ステージしていない変更があれば、その元の中身をコアから読む（`GET /git/original`。Git の状態を取り直すたびに読み直す）。
 * なければ、ステージした中身はいまのファイルと同じなので、読み込んだ中身 content をそのまま使う。
 * Git の外・未追跡のファイル・元がバイナリか大きすぎるときは null（帯を出さない）。読み直している間は前の値を返す（帯がちらつかないように）
 */
export function useQuickDiffBase({
  target,
  key,
  gitStatus,
  change,
  version,
  content,
}: {
  target: GitTarget;
  /** 作業場所とファイル（変わったら前の値を使わない） */
  key: string;
  gitStatus: GitStatus | undefined;
  /** そのファイルのコミットしていない変更（changeOf） */
  change: { file: GitFileChange; staged: boolean } | undefined;
  version: number;
  /** 読み込んだファイルの中身（まだなら null） */
  content: string | null;
}): string | null {
  const unstaged = change && !change.staged && change.file.kind !== "U" ? change.file : null;
  const [fetched, setFetched] = useState<{ key: string; text: string | null }>();
  useEffect(() => {
    if (!unstaged) return;
    let alive = true;
    api.gitOriginal(target, unstaged, false).then(
      (o) => alive && setFetched({ key, text: o.binary || o.truncated ? null : o.content }),
      () => alive && setFetched({ key, text: null }),
    );
    return () => {
      alive = false;
    };
    // 変更のあるファイル・作業場所・取り直した回で読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unstaged?.path, unstaged?.old_path, version]);

  const last = useRef<{ key: string; text: string | null } | null>(null);
  let value: string | null | undefined;
  if (!gitStatus?.repo || change?.file.kind === "U") value = null;
  else if (unstaged) value = fetched?.key === key ? fetched.text : undefined;
  else value = content;
  // まだ読めていなければ、同じファイルの前の値のまま
  if (value === undefined) return last.current?.key === key ? last.current.text : null;
  last.current = { key, text: value };
  return value;
}
