import { api } from "@/api";
import { forgetIdSettings, pruneUndeclared, readSetting, writeSetting } from "@/lib/storage";
import { DATABASE_ID } from "@/lib/storageKeys";

/** /api/status の答えを待つ時間（つながらないときに、画面を出すのを待たせすぎない） */
const STATUS_TIMEOUT_MS = 3000;

/**
 * DB の ID（GET /api/status の database_id）が覚えているものと違えば（覚えていない初めての起動も）、ID を含む表示の設定を捨ててから、
 * 新しい ID を覚える。DB を作り直すとプロジェクト・チャット・グループの ID が 1 から振り直され、覚えているグループの開閉・下書きなどが
 * 別のものを指してしまうため。捨てたら true
 */
export function adoptDatabase(databaseId: string): boolean {
  if (readSetting(DATABASE_ID) === databaseId) return false;
  forgetIdSettings();
  writeSetting(DATABASE_ID, databaseId);
  return true;
}

/**
 * 起動したとき、画面の部品を読み込む前に 1 回: 宣言していない kickoff: のキー（なくした機能の古いキー）を消し、DB を作り直していれば
 * ID を含む表示の設定を捨てる（部品の中には、読み込んだときに保存した値を読むものがあるため、先に済ませる）。
 * サーバーの答えが遅ければ待たずに進め、あとで届いた答えで捨てることになったら読み込み直す（描いた部品は古い値を読んでいる）。
 * 答えがなければ（つながらない・認証の前など）何も捨てない
 */
export async function prepareStorage(timeoutMs = STATUS_TIMEOUT_MS): Promise<void> {
  pruneUndeclared();
  const databaseId = api.status().then((status) => status.database_id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => (timer = setTimeout(resolve, timeoutMs, undefined)));
  const id = await Promise.race([databaseId, timeout]).catch(() => undefined);
  clearTimeout(timer);
  if (id !== undefined) {
    adoptDatabase(id);
    return;
  }
  databaseId.then(
    (late) => {
      if (adoptDatabase(late)) location.reload();
    },
    () => {},
  );
}
