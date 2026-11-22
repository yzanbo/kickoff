// 変更のタブの種類（チャットの画面の右の欄に開く、作業場所のコミットしていない変更）。ui/contributes.ts が panelTabs に入れる
import { FileDiff } from "lucide-react";
import { baseName } from "@/foundation/ui/lib/format";
import { changesTab, defineTabKind, repointedAt } from "@/features/panel/ui";
import { ChangesPage, type ChangesTab } from "./changesTabPage";

/** 作業場所の名前（本体・ワークツリー） */
const placeOf = (t: ChangesTab) => (t.worktree ? `ワークツリー ${baseName(t.worktree)}` : "本体");

export const changesTabKind = defineTabKind<ChangesTab>({
  id: "changes",
  icon: FileDiff,
  label: () => "変更",
  hint: (t) => `コミットしていない変更（${placeOf(t)}）`,
  projectOf: (t) => t.projectId,
  // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
  ownerChatId: (t) => t.chatId,
  popout: (t) => ({
    route: { kind: "changes", chatId: t.chatId, projectId: t.projectId, ...(t.worktree ? { worktree: t.worktree } : {}) },
    title: `変更 — ${placeOf(t)}`,
  }),
  // 作業場所を移したら新しい作業場所の変更にする（移るファイルは引き継ぐ）
  repoint: (t, move) => {
    const at = repointedAt(t, move);
    return at && changesTab({ ...at, ...(t.focus ? { focus: t.focus } : {}) });
  },
  Page: ChangesPage,
});
