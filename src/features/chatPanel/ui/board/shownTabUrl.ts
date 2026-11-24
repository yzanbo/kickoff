import { routeProjectId, type Route } from "@/foundation/ui/navigation/router";

/** チャットのパネルの、ピントのあるペインで表示中のタブの変わり目（prev は前に見たタブ。まだ見ていなければ undefined） */
export interface ShownTabChange {
  prev: string | null | undefined;
  shown: string | null;
  /** パネルのプロジェクト */
  projectId: number;
  /** いまの URL の画面（navigate の hashchange は後から届くので、描いた画面でなく location.hash を読んだもの） */
  current: Route;
}

/**
 * 表示中のタブの変わり目を URL にするか。はじめて描いたとき（URL で開いたチャットより先に、前に表示していたタブで上書きしない）・
 * 変わっていない・パネルを閉じたときは変えない。URL がもうほかのプロジェクトの画面なら、この画面から離れる途中
 * （下書きを別のプロジェクトへ移して元のタブを閉じたなど）なので、移る先の URL を上書きしない
 */
export function shouldFollowShownTab({ prev, shown, projectId, current }: ShownTabChange): boolean {
  if (prev === undefined || prev === shown || shown === null) return false;
  return routeProjectId(current) === projectId;
}
