import { errorMessage } from "@shared/errors";
import { removeTagFrom, renameTagIn } from "@shared/project/tags";
import type { Project } from "@shared/types";
import { api } from "@/api";
import { readSetting, writeSetting } from "@/lib/storage";
import { PROJECT_TAG_FILTER, PROJECT_TAG_ORDER } from "@/lib/storageKeys";
import { alertDialog, confirmDialog } from "@/ui/dialogs";

/** そのタグが付いているプロジェクト（しまったものも） */
const projectsWith = (projects: readonly Project[], tag: string) => projects.filter((p) => p.tags.includes(tag));

/** 付いているプロジェクトのタグを書き換える（1 つずつ。失敗したらお知らせして止める。変わったプロジェクトは SSE で店に届く） */
async function retag(projects: readonly Project[], change: (tags: readonly string[]) => string[], failure: string): Promise<boolean> {
  for (const project of projects) {
    try {
      await api.updateProject(project.id, { tags: change(project.tags) });
    } catch (e) {
      await alertDialog(failure, `「${project.name}」: ${errorMessage(e)}`);
      return false;
    }
  }
  return true;
}

/** 覚えている絞り込み・並びのタグの名前を置き換える（to が null なら外す。重なれば 1 つにまとめる） */
function replaceStored(from: string, to: string | null) {
  for (const setting of [PROJECT_TAG_FILTER, PROJECT_TAG_ORDER]) {
    const list = readSetting(setting);
    if (!list.includes(from)) continue;
    const next = list.flatMap((t) => (t === from ? (to === null ? [] : [to]) : [t]));
    writeSetting(setting, [...new Set(next)]);
  }
}

/**
 * タグの名前を変える（付いているすべてのプロジェクトで。サイドバーのタグの行の右クリック・Enter）。同じ名前のタグがもうあれば、確かめてから 1 つにまとめる。
 * 絞り込みで選んでいるか・並べた順も、新しい名前に付け替える
 */
export async function renameTag(projects: readonly Project[], from: string, to: string): Promise<void> {
  const name = to.trim();
  if (!name || name === from) return;
  if (
    projects.some((p) => p.tags.includes(name)) &&
    !(await confirmDialog({ title: `タグ「${name}」はもうあります`, message: `「${from}」を「${name}」に 1 つにまとめますか？`, confirmLabel: "まとめる" }))
  )
    return;
  if (await retag(projectsWith(projects, from), (tags) => renameTagIn(tags, from, name), "タグの名前を変えられませんでした")) replaceStored(from, name);
}

/** タグを消す（確かめてから、付いているすべてのプロジェクトから外す。プロジェクトは消えない） */
export async function deleteTag(projects: readonly Project[], tag: string): Promise<void> {
  const owners = projectsWith(projects, tag);
  const ok = await confirmDialog({
    title: `タグ「${tag}」を削除しますか？`,
    message: `付いている ${owners.length} 件のプロジェクトから外します。プロジェクトは消えません。`,
    confirmLabel: "削除",
    danger: true,
  });
  if (ok && (await retag(owners, (tags) => removeTagFrom(tags, tag), "タグを削除できませんでした"))) replaceStored(tag, null);
}
