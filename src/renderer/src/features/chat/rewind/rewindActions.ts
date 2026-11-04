// 巻き戻しの確かめ（会話だけ・ファイルだけ・両方）。ファイルを戻すのは Claude Code のファイルのチェックポイント（コアの rewind-files）
import type { FileRewindResult } from "@shared/types";
import { api } from "@/api";
import { alertDialog, choiceDialog, confirmDialog, reportFailure } from "@/ui/dialogs";

/**
 * 戻すと変わるファイル（「2 個のファイル（README.md、a.ts。戻すと +3 −12 行）」。名前は多ければ頭の 8 個。
 * 足した行を戻すと消えるので、行の増減はターンの変更カードとは逆になる）
 */
function describe(r: FileRewindResult): string {
  const names = (r.files_changed ?? []).map((p) => p.slice(p.lastIndexOf("/") + 1));
  const list = names.length > 8 ? `${names.slice(0, 8).join("、")} ほか ${names.length - 8} 個` : names.join("、");
  return `${names.length} 個のファイル（${list}。戻すと +${r.insertions ?? 0} −${r.deletions ?? 0} 行）`;
}

/** 戻ったときに戻らないもの（確かめの文に添える） */
const NOT_RESTORED = "コマンドで変えたファイル・アプリの外で変えたファイルは戻りません。";

/** その発言を送る前の状態に戻すと変わるファイル（戻せない（記録がない）なら undefined） */
async function preview(chatId: number, eventId: number): Promise<FileRewindResult | undefined> {
  return api.rewindFiles(chatId, eventId, true).catch(() => undefined);
}

/**
 * 書き直して送り直す前の確かめ。その発言のあとに AI が変えたファイルがあれば「会話だけ」「ファイルも」から選んでもらう
 * （なければ、今までどおり会話だけの確かめ）。やめたら null、送るならファイルも戻すか
 */
export async function confirmRewindSend(chatId: number, eventId: number): Promise<{ restoreFiles: boolean } | null> {
  const files = await preview(chatId, eventId);
  const title = "この発言から書き直して送り直しますか？";
  if (files && (files.files_changed?.length ?? 0) > 0) {
    const choice = await choiceDialog({
      title,
      message: `この発言から後ろのやり取りは消えます。この発言のあとに AI が変えた ${describe(files)}も、この発言を送る前の状態に戻せます。${NOT_RESTORED}`,
      choices: [
        { value: "chat", label: "会話だけ戻して送り直す", primary: true },
        { value: "files", label: "ファイルも戻して送り直す" },
      ],
    });
    return choice === null ? null : { restoreFiles: choice === "files" };
  }
  const ok = await confirmDialog({
    title,
    message: files
      ? "この発言から後ろのやり取りは消えます（この発言のあとに AI が変えたファイルはありません）。"
      : "この発言から後ろのやり取りは消えます。AI が変えたファイルは元に戻りません（この発言のときのファイルの記録がないため）。",
    confirmLabel: "送り直す",
  });
  return ok ? { restoreFiles: false } : null;
}

/** ファイルだけを、その発言を送る前の状態に戻す（会話はそのまま）。先に変わる量を見せて確かめる */
export async function restoreFilesBefore(chatId: number, eventId: number): Promise<void> {
  const fail = reportFailure("ファイルを戻せませんでした");
  let files: FileRewindResult;
  try {
    files = await api.rewindFiles(chatId, eventId, true);
  } catch (e) {
    return fail(e);
  }
  if ((files.files_changed?.length ?? 0) === 0) {
    await alertDialog("戻すファイルはありません", "この発言を送ったあとに、AI が編集のツールで変えたファイルはありません。");
    return;
  }
  const ok = await confirmDialog({
    title: "ファイルを、この発言を送る前の状態に戻しますか？",
    message: `${describe(files)}を戻します。会話はそのままです。${NOT_RESTORED}戻したあとで元に戻すことはできません。`,
    confirmLabel: "ファイルを戻す",
    danger: true,
  });
  if (ok) await api.rewindFiles(chatId, eventId, false).then(() => undefined, fail);
}
