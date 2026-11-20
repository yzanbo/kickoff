import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";

/** チャットの作業場所のフォルダ（ワークツリー。worktree_path が null なら本体のフォルダ）。エージェントはこの中で動く */
export const workdirOf = (chat: Pick<Chat, "worktree_path">, project: Pick<Project, "repo_path">): string => chat.worktree_path ?? project.repo_path;
