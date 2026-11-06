// どのまとまりに入るか（まとまりのキーと見出し。決まりと形は buckets.ts の先頭）。チャット・下書き・作業場所から見出しを作る。
// bucketChats が使い、パネルのタブのまとまり（useTabClusters）もタブの中身からこれで決める
import { boardColumnOf } from "@shared/chat/state";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type BoardColumn, type Chat } from "@shared/types";
import { chatStateOf } from "@/features/chat/chatState";
import { workplaceOf } from "@/features/worktree/workplace";
import { workplaceHue } from "@/features/worktree/workplaceHue";
import type { BucketBy, BucketContext, BucketHead, BucketOptions, DraftTarget } from "./buckets";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/** プロジェクトのまとまりのキー（ほかのまとまりのキーの根） */
export const projectKey = (projectId: number) => `p${projectId}`;

/** まとまりのキー: 親があれば親につなぎ、なければ scope のプロジェクトの下（scope もなければそのまま） */
const keyAt = (local: string, scope: number | undefined, parent: string | undefined) =>
  parent !== undefined ? `${parent}/${local}` : scope === undefined ? local : `${projectKey(scope)}/${local}`;

/** グループ（null はグループなし）・固定・アーカイブ済みのまとまりのキー（まとまりがまだないとき（開閉をそろえる）にも使う） */
export const groupKey = (projectId: number, groupId: number | null) => keyAt(groupId === null ? "ungrouped" : `g${groupId}`, projectId, undefined);
export const pinnedKey = (projectId: number) => keyAt("pinned", projectId, undefined);
export const archivedKey = (projectId: number) => keyAt("archived", projectId, undefined);

/** 本体（新しいチャット・下書きの作業場所） */
const MAIN_PLACE = { worktree_path: null, branch: null };

/** プロジェクトのまとまり（並び projects を渡したときは、そこにないプロジェクトの段は作らない = undefined） */
function projectHead(projectId: number, ctx: BucketContext, parent?: string): BucketHead | undefined {
  const project = ctx.projects?.find((p) => p.id === projectId);
  if (ctx.projects && !project) return undefined;
  return { key: parent === undefined ? projectKey(projectId) : `${parent}/${projectKey(projectId)}`, kind: "project", label: project?.name ?? "", projectId, project };
}

/** グループのまとまり（グループがもうない・読み込み中・null ならグループなし） */
function groupHead(projectId: number, groupId: number | null | undefined, ctx: BucketContext, parent?: string): BucketHead {
  const group = groupId == null ? undefined : ctx.groupsOf?.(projectId).find((g) => g.id === groupId);
  if (!group) return { key: keyAt("ungrouped", projectId, parent), kind: "ungrouped", label: NO_GROUP_LABEL, title: "グループに入っていないチャット", projectId };
  return { key: keyAt(`g${group.id}`, projectId, parent), kind: "group", label: group.name, title: `グループ: ${group.name}`, projectId, group };
}

/** 作業場所のまとまり（見出しはサイドバー・ボードと同じ workplaceOf） */
export function workplaceHead(projectId: number, chat: Pick<Chat, "worktree_path" | "branch">, ctx: BucketContext, parent?: string): BucketHead {
  const list = ctx.worktreesOf?.(projectId);
  const place = workplaceOf(chat, list);
  return {
    key: keyAt(`w:${place.key || "main"}`, projectId, parent),
    kind: "worktree",
    label: place.name || "本体",
    title: place.title,
    projectId,
    place,
    hue: workplaceHue(projectId, place, list),
  };
}

const statusHead = (column: BoardColumn, scope: number | undefined, parent: string | undefined): BucketHead => ({
  key: keyAt(`status:${column}`, scope, parent),
  kind: "status",
  label: BOARD_COLUMN_LABELS[column],
  projectId: scope,
  column,
});

const pinnedHead = (scope: number | undefined): BucketHead => ({ key: keyAt("pinned", scope, undefined), kind: "pinned", label: "固定", title: "固定したチャット", projectId: scope });

const archivedHead = (scope: number | undefined): BucketHead => ({
  key: keyAt("archived", scope, undefined),
  kind: "archived",
  label: "アーカイブ済み",
  title: "アーカイブ済みのチャット",
  projectId: scope,
});

/** その段で、チャットが入るまとまり（状態で分けるとき、columns にない列なら undefined） */
export function levelHead(chat: Chat, by: BucketBy | undefined, ctx: BucketContext, columns: readonly BoardColumn[], scope: number | undefined, parent?: string): BucketHead | undefined {
  switch (by) {
    case undefined:
      return { key: keyAt("all", scope, parent), kind: "all", label: "", projectId: scope };
    case "project":
      return projectHead(chat.project_id, ctx, parent);
    case "group":
      return groupHead(chat.project_id, chat.group_id, ctx, parent);
    case "worktree":
      return workplaceHead(chat.project_id, chat, ctx, parent);
    case "status": {
      const column = boardColumnOf(chatStateOf(chat, ctx.pending));
      return columns.includes(column) ? statusHead(column, scope, parent) : undefined;
    }
  }
}

/**
 * チャットが入るまとまり（いちばん外の段。パネルのタブのまとまりにも使う）: アーカイブ済みを抜き出すならアーカイブ済み → 固定を抜き出すなら固定 →
 * 分け方のまとまり。固定・アーカイブ済みはプロジェクトごと（状態だけで分けるときは、プロジェクトにまたがって 1 つ）
 */
export function chatHead(
  chat: Chat,
  by: BucketBy | undefined,
  ctx: BucketContext,
  { pinned = false, archived = "keep", columns = BOARD_COLUMNS, project }: Pick<BucketOptions, "pinned" | "archived" | "columns" | "project"> = {},
): BucketHead | undefined {
  const scope = by === "status" || by === undefined ? project : chat.project_id;
  if (chat.archived_at) {
    if (archived === "drop") return undefined;
    if (archived === "bucket") return archivedHead(scope);
  } else if (pinned && chat.pinned) {
    return pinnedHead(scope);
  }
  return levelHead(chat, by, ctx, columns, project);
}

/** 下書きが入るまとまり（状態で分けるときは入れない = undefined） */
export function draftHead(target: DraftTarget, by: BucketBy | undefined, ctx: BucketContext, project?: number): BucketHead | undefined {
  switch (by) {
    case undefined:
      return { key: keyAt("all", project, undefined), kind: "all", label: "", projectId: project };
    case "project":
      return projectHead(target.projectId, ctx);
    case "group":
      return groupHead(target.projectId, target.group, ctx);
    case "worktree":
      return workplaceHead(target.projectId, target.worktree ? { worktree_path: target.worktree, branch: null } : MAIN_PLACE, ctx);
    case "status":
      return undefined;
  }
}

/** そのプロジェクトのグループのまとまり（サイドバーと同じ並び）とグループなし（チャットがなくても出すときの見出し） */
export function groupHeads(projectId: number, ctx: BucketContext): BucketHead[] {
  return [...(ctx.groupsOf?.(projectId) ?? []).map((g) => groupHead(projectId, g.id, ctx)), groupHead(projectId, null, ctx)];
}

/** チャットがなくても出せる見出し（keepEmpty で残すかを決める） */
export function seedHeads(by: BucketBy | undefined, options: BucketOptions, columns: readonly BoardColumn[], top: boolean, scope: number | undefined, parent?: string): BucketHead[] {
  if (by === "status") return columns.map((c) => statusHead(c, scope, parent));
  if (!top) return [];
  if (by === "group") return (options.project !== undefined ? [options.project] : (options.projects ?? []).map((p) => p.id)).flatMap((id) => groupHeads(id, options));
  if (by === "project") return (options.projects ?? []).flatMap((p) => projectHead(p.id, options) ?? []);
  return [];
}
