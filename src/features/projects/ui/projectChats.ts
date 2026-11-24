// projects ⇄ chat・groups の口: プロジェクトの並び（最近動いた順）・プロジェクトの画面・右サイドバー・フォルダの変更が読むチャットと、
// プロジェクトの画面が届くのを待つグループ（チャットは chat、グループは groups が contributes.ts で 1 つずつ登録する。登録がなければチャットなし・読み込み済み）
import { definePoint } from "@/foundation/ui/points";

/** projects が見るチャットの項目（chat の Chat の一部） */
export interface ProjectChat {
  id: number;
  project_id: number;
  worktree_path: string | null;
  active_at: string;
  archived_at: string | null;
}

/** 一覧を読み終えたか（loading は取り直している最中） */
export interface ProjectLoad {
  loaded: boolean;
  loading: boolean;
  error: string | undefined;
}

export interface ProjectChats {
  /** ID の知っているチャット（部品から。変わったときだけ描き直す） */
  useKnownChat(id: number): ProjectChat | undefined;
  /** そのプロジェクトのいまのチャット（部品の外・操作の途中で読むとき） */
  currentChats(projectId: number): readonly ProjectChat[];
  /** アーカイブしていないチャットの一覧から選んだ値（結果が変わったときだけ描き直す。enabled でなければ読まず undefined） */
  useChatsValue<T extends string | number>(select: (chats: readonly ProjectChat[]) => T, enabled: boolean): T | undefined;
  /** そのプロジェクトのチャットの一覧を読み終えたか（プロジェクトの画面は届くまで前のプロジェクトを出す） */
  useLoad(projectId: number): ProjectLoad;
}

/** プロジェクトのグループの一覧を読み終えたか（groups が登録する） */
export interface ProjectGroups {
  useLoad(projectId: number): ProjectLoad;
}

export const projectChats = definePoint<ProjectChats>("projectChats", { key: () => "chat" });
export const projectGroups = definePoint<ProjectGroups>("projectGroups", { key: () => "groups" });

const LOADED: ProjectLoad = { loaded: true, loading: false, error: undefined };
const NO_CHATS: ProjectChats = { useKnownChat: () => undefined, currentChats: () => [], useChatsValue: () => undefined, useLoad: () => LOADED };
const NO_GROUPS: ProjectGroups = { useLoad: () => LOADED };

/** 登録された口（hook の名前にしない。理由は files の filesGit.ts の filesGitImpl） */
const chatsImpl = (): ProjectChats => projectChats.items()[0] ?? NO_CHATS;
const groupsImpl = (): ProjectGroups => projectGroups.items()[0] ?? NO_GROUPS;

export const currentProjectChats = (projectId: number) => chatsImpl().currentChats(projectId);
export function useKnownProjectChat(id: number): ProjectChat | undefined {
  return chatsImpl().useKnownChat(id);
}

export function useProjectChatsValue<T extends string | number>(select: (chats: readonly ProjectChat[]) => T, enabled: boolean): T | undefined {
  return chatsImpl().useChatsValue(select, enabled);
}

export function useProjectChatsLoad(projectId: number): ProjectLoad {
  return chatsImpl().useLoad(projectId);
}

export function useProjectGroupsLoad(projectId: number): ProjectLoad {
  return groupsImpl().useLoad(projectId);
}
