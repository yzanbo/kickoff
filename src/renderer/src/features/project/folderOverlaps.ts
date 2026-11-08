// プロジェクトフォルダの被り（ほかのプロジェクトと同じ・その中・中にある）。新しいプロジェクトのダイアログ・フォルダの変更の確かめ・基本情報で同じ判定と文を使う。
// パスはどちらもリンクを解いた実体（コアが登録するパス・点検の path）で比べる

interface FolderOwner {
  id: number;
  name: string;
  repo_path: string;
}

export interface FolderOverlaps<P extends FolderOwner> {
  /** 同じフォルダのプロジェクト */
  same: P[];
  /** target を中に持つプロジェクト（target はそのプロジェクトフォルダの中） */
  inside: P[];
  /** target の中にあるプロジェクト */
  contains: P[];
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/** target とほかのプロジェクト（except を除く）のフォルダの被り */
export function folderOverlaps<P extends FolderOwner>(target: string, projects: readonly P[], except?: number): FolderOverlaps<P> {
  const t = trimSlash(target);
  const result: FolderOverlaps<P> = { same: [], inside: [], contains: [] };
  if (!t) return result;
  for (const p of projects) {
    if (p.id === except) continue;
    const r = trimSlash(p.repo_path);
    if (r === t) result.same.push(p);
    else if (t.startsWith(`${r}/`)) result.inside.push(p);
    else if (r.startsWith(`${t}/`)) result.contains.push(p);
  }
  return result;
}

/** 知らせの 1 行（ng = 使えない / warn = 使えるが知らせる） */
export interface OverlapLine {
  kind: "ng" | "warn";
  text: string;
}

const names = (list: readonly FolderOwner[]) => list.map((p) => `「${p.name}」`).join("");

/**
 * 被りの知らせの文。same は、新しく作る・取り込むでは使えない（ng）、フォルダの変更・基本情報では使えるが知らせる（warn。利用者の依頼）
 */
export function folderOverlapLines(overlaps: FolderOverlaps<FolderOwner>, same: "ng" | "warn"): OverlapLine[] {
  const lines: OverlapLine[] = [];
  if (overlaps.same.length > 0) {
    lines.push(
      same === "ng"
        ? { kind: "ng", text: `${names(overlaps.same)}のプロジェクトフォルダです（同じフォルダには作れません）` }
        : { kind: "warn", text: `${names(overlaps.same)}のプロジェクトフォルダと同じです（同じフォルダを複数のプロジェクトで使います。チャット・設定・メモはプロジェクトごとに別）` },
    );
  }
  if (overlaps.inside.length > 0) lines.push({ kind: "warn", text: `${names(overlaps.inside)}のプロジェクトフォルダの中です` });
  if (overlaps.contains.length > 0) lines.push({ kind: "warn", text: `中に${names(overlaps.contains)}のプロジェクトフォルダがあります` });
  return lines;
}

/** メモフォルダの被りの文（被っていても使える） */
export function memoOverlapLines(users: readonly FolderOwner[]): OverlapLine[] {
  return users.length > 0 ? [{ kind: "warn", text: `${names(users)}のメモフォルダと同じです（同じメモを共有します）` }] : [];
}
