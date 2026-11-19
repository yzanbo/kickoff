// チャットの作業場所を移す（見出しの札・右クリックの「作業場所を変更」から）:
// 移す先で作業中のチャットがあれば新しいチャットと同じ設定に従い、移す前の確かめ（残る変更 / 持っていく・動いているもの）を出して移す
import type { Chat, WorkplaceMoveCheck } from "@shared/types";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { currentChats } from "@/features/chat/ui/store/knownChats";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { alertDialog, confirmDialog, confirmWithCheck } from "@/foundation/ui/kit/dialogs";
import { showToast } from "@/foundation/ui/kit/toast";
import { chooseBusyWorkplaceAction } from "@/features/chat/ui/workplace/busyWorkplace";
import { countBusyAt } from "@/foundation/ui/workplace/workplace";
import { askNewWorktreeBranch, type Workplace } from "@/foundation/ui/workplace/WorkplacePicker";

/** 確かめに並べるファイルの数（多ければ「ほか n 件」） */
const LISTED_FILES = 12;

/** 作業場所を移せない理由（作業中・実行環境を整えるチャット。押せなくして説明に出す。移せれば null） */
export function workplaceMoveBlock(chat: Pick<Chat, "status" | "untracked_only">): string | null {
  if (chat.untracked_only) return "実行環境を整えるチャットは、そのワークツリーのためのものなので作業場所を移せません";
  if (chat.status === "running") return "作業中は作業場所を変えられません（作業が終わってから変えられます）";
  return null;
}

/** ファイルの一覧の文（多ければ頭だけ） */
function fileList(files: string[]): string {
  const shown = files.slice(0, LISTED_FILES).map((f) => `・${f}`);
  if (files.length > LISTED_FILES) shown.push(`・ほか ${files.length - LISTED_FILES} 件`);
  return shown.join("\n");
}

/** 移す先の呼び名（確かめの見出し） */
const placeName = (place: Workplace, label: string | undefined) =>
  place.kind === "main" ? "本体" : place.kind === "new" ? `新しいワークツリー（${place.branch}）` : `ワークツリー（${label ?? place.path}）`;

/** 確かめの本文（元の場所で動いているもの・フォルダがないとき。変更の文は持っていけるかで別に作る） */
function checkLines(check: WorkplaceMoveCheck): string[] {
  const lines: string[] = [];
  if (check.missing) lines.push("元の作業場所のフォルダが見つからないので、変更の確かめは飛ばします。");
  if (check.terminals.length > 0) {
    const sample = check.terminals.find((t) => t.command)?.command;
    lines.push(`元の作業場所で動いているもの: ターミナル ${check.terminals.length}${sample ? `（${sample} など）` : ""}。止めずに残します（止めるならターミナルのタブから）。`);
  }
  lines.push("会話はそのまま続きます。移す前の発言へは巻き戻せなくなります（分岐も）。子チャットは移りません。");
  return lines;
}

/**
 * 作業場所を移す（やめた・移せなかったら何もしない。移せなかった理由はダイアログで出す）。label はいまあるワークツリーの呼び名（確かめの見出し）
 */
export async function moveChatWorkplace(chat: Chat, target: Workplace, label?: string): Promise<void> {
  let place = target;
  // 移す先で、ほかのチャットが作業中。新しいチャットと同じ設定に従う
  if (place.kind !== "new") {
    const busy = countBusyAt(currentChats({ projectId: chat.project_id }), place.kind === "main" ? null : place.path, chat.id);
    if (busy > 0) {
      const action = await chooseBusyWorkplaceAction();
      if (!action) return;
      if (action === "worktree") {
        const branch = await askNewWorktreeBranch(chat.project_id);
        if (!branch) return;
        place = { kind: "new", branch };
      }
    }
  }
  let check: WorkplaceMoveCheck;
  try {
    check = await api.workplaceCheck(chat.id);
  } catch (e) {
    return alertDialog("作業場所を変えられませんでした", errorMessage(e));
  }
  if (check.blocked) return alertDialog("作業場所を変えられません", check.blocked);
  if (place.kind === "existing" && check.reserved.includes(place.path)) {
    return alertDialog("このワークツリーには移せません", "片付けを予約しているワークツリーです。片付けが済むと、そこのチャットは本体に戻ります。");
  }
  const title = `作業場所を ${placeName(place, label)} に移しますか`;
  const lines = checkLines(check);
  let carry = false;
  if (place.kind === "new" && check.changes.length > 0) {
    // 新しいワークツリーはいまのコミットから作るので、変更を持っていっても衝突しない
    const picked = await confirmWithCheck({
      title,
      message: [
        `元の作業場所にコミットしていない変更が ${check.changes.length} ファイルあります。`,
        "持っていくと元の場所からは消えます。ほかのチャットの変更が混ざっていないか、一覧で確かめてください。",
        fileList(check.changes),
        ...lines,
      ].join("\n\n"),
      confirmLabel: "移す",
      check: { label: "コミットしていない変更も持っていく", initial: false },
    });
    if (!picked) return;
    carry = picked.checked;
  } else {
    const changes = check.changes.length > 0 ? [`元の作業場所に、コミットしていない変更が ${check.changes.length} ファイル残ります（持っていけるのは新しいワークツリーへ移すときだけ）。`] : [];
    if (!(await confirmDialog({ title, message: [...changes, ...lines].join("\n\n"), confirmLabel: "移す" }))) return;
  }
  try {
    await api.moveWorkplace(chat.id, {
      worktree_path: place.kind === "existing" ? place.path : null,
      ...(place.kind === "new" ? { new_worktree_branch: place.branch } : {}),
      ...(carry ? { carry: true } : {}),
    });
    // チャットはコアの知らせで画面に届く。新しいワークツリーを作ったら、一覧を取り直す（札・タブの作業場所の色）
    if (place.kind === "new") worktreesStore.invalidate(chat.project_id);
    showToast(`作業場所を ${placeName(place, label)} に移しました`);
  } catch (e) {
    await alertDialog("作業場所を変えられませんでした", errorMessage(e));
  }
}
