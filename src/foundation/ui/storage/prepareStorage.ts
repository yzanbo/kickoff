import { api } from "@/foundation/ui/api";
import { assertGroups, forgetIdSettings, pruneUndeclared, type StorageGroup } from "./groups";
import { readSetting, writeSetting } from "./settings";
import { storage as shellStorage } from "./storage";

/** /api/status の答えを待つ時間（つながらないときに、画面を出すのを待たせすぎない） */
const STATUS_TIMEOUT_MS = 3000;

/**
 * DB の ID（GET /api/status の database_id）が覚えているものと違えば（覚えていない初めての起動も）、ID を含む表示の設定を捨ててから、
 * 新しい ID を覚える。DB を作り直すとプロジェクト・チャット・グループの ID が 1 から振り直され、覚えているグループの開閉・下書きなどが
 * 別のものを指してしまうため。捨てたら true
 */
export function adoptDatabase(groups: readonly StorageGroup[], databaseId: string): boolean {
  if (readSetting(shellStorage.settings.databaseId) === databaseId) return false;
  forgetIdSettings(groups);
  writeSetting(shellStorage.settings.databaseId, databaseId);
  return true;
}

/**
 * 起動したとき、画面の部品を読み込む前に 1 回（groups は全部の機能の保存の群。群どうしが重なれば投げる）:
 * 群に宣言していない kickoff: のキー（なくした機能の古いキー）を消し、DB を作り直していれば
 * ID を含む表示の設定を捨てる（部品の中には、読み込んだときに保存した値を読むものがあるため、先に済ませる）。
 * サーバーの答えが遅ければ待たずに進め、あとで届いた答えで捨てることになったら読み込み直す（描いた部品は古い値を読んでいる）。
 * 答えがなければ（つながらない・認証の前など）何も捨てない
 */
export async function prepareStorage(groups: readonly StorageGroup[], { timeoutMs = STATUS_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<void> {
  assertGroups(groups);
  pruneUndeclared(groups);
  const databaseId = api.status().then((status) => status.database_id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => (timer = setTimeout(resolve, timeoutMs, undefined)));
  const id = await Promise.race([databaseId, timeout]).catch(() => undefined);
  clearTimeout(timer);
  if (id !== undefined) {
    adoptDatabase(groups, id);
    return;
  }
  databaseId.then(
    (late) => {
      if (adoptDatabase(groups, late)) location.reload();
    },
    () => {},
  );
}
