// github がアプリの根に置く物と、作業場所の飾り
import { createElement } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import type { WorkplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { PrNoticeHost } from "./prNotice/PrNoticeHost";
import { WorktreePrMark } from "./prNotice/PrNoticeMark";
import { prNoticeMarkLabel } from "./prNotice/prNoticePlan";
import { worktreePrsStore } from "@/features/worktrees/ui";

export const githubHosts: AppHost[] = [
  // ワークツリーの PR がマージされた・閉じられた知らせ（片付けとチャットの扱いを 1 つの確認で聞く）
  { id: "prNotice", windows: "main", order: 170, Host: PrNoticeHost },
];

/** ワークツリーの PR の知らせ: 札の後ろの印（押すと片付けの確認）と、作業場所を選ぶ欄の名前に添える（マージ済み）など */
export const prNoticeDecor: WorkplaceDecor = {
  id: "github-pr",
  Mark: ({ path, iconOnly }) => createElement(WorktreePrMark, { worktree: path, iconOnly }),
  note: {
    text: (path) => {
      const notice = worktreePrsStore.get().data?.findLast((n) => n.worktree === path);
      return notice ? prNoticeMarkLabel(notice) : null;
    },
    watch: (listener) => {
      const release = worktreePrsStore.retain();
      const off = worktreePrsStore.subscribe(listener);
      return () => {
        off();
        release();
      };
    },
  },
};
