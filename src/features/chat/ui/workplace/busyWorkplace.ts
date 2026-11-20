import { readSetting, writeSetting, type SettingValue } from "@/foundation/ui/storage";
import { storage } from "@/features/chat/ui/storage";
import { choiceDialogWithRemember } from "@/foundation/ui/kit/dialogs";

/** ほかのチャットが作業中の作業場所へ新しいチャットを送るときの扱い（ask = 毎回聞く / here = このまま送る / worktree = 新しいワークツリーで始める） */
export const BUSY_WORKPLACE_ACTIONS = storage.settings.busyWorkplaceAction.choices;
export type BusyWorkplaceAction = SettingValue<typeof storage.settings.busyWorkplaceAction>;

export const BUSY_WORKPLACE_ACTION_LABELS: Record<BusyWorkplaceAction, string> = {
  ask: "毎回聞く",
  here: "このまま送る",
  worktree: "新しいワークツリーで始める",
};

/**
 * ほかのチャットが作業中の作業場所へ送るとき、このまま送るか・新しいワークツリーで始めるかを決める（やめたら null）。
 * 既定（設定の「チャット」）を決めていれば聞かずにそれを返し、毎回聞くなら確かめのダイアログを出す（「次からはこれにする」を付ければ既定にする）
 */
export async function chooseBusyWorkplaceAction(): Promise<Exclude<BusyWorkplaceAction, "ask"> | null> {
  const action = readSetting(storage.settings.busyWorkplaceAction);
  if (action !== "ask") return action;
  const picked = await choiceDialogWithRemember({
    title: "この作業場所では、ほかのチャットが作業中です",
    message: "同じファイルを書き換えると、作業がぶつかることがあります。新しいワークツリーで始めると、別のフォルダで並行して進められます。質問だけなど、ファイルを書き換えないチャットなら、このまま送っても大丈夫です。",
    choices: [
      { value: "here", label: "このまま送る" },
      { value: "worktree", label: "新しいワークツリーで始める", primary: true },
    ],
    remember: "次からはこれにする（設定の「チャット」で変えられます）",
  });
  if (!picked) return null;
  if (picked.remember) writeSetting(storage.settings.busyWorkplaceAction, picked.value);
  return picked.value;
}
