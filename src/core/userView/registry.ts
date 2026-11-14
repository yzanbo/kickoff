// 利用者が見ているもの（メモの仕様書「0019_AI の操作ツールの追加」の D）: この Mac の画面のウィンドウごとの最後の知らせと、チャットごとの「最後の発言を送ったときの様子」を
// メモリに覚える（保存しない）。AI の get_user_view が、どのウィンドウを読むかを決めて取り出す
import { USER_VIEW_REPORT_MS, USER_VIEW_TEXT_MAX, type UserView, type UserViewBody } from "@shared/types";

/** 知らせの古さの上限（画面は見ている間 USER_VIEW_REPORT_MS ごとに知らせ直す。これより古ければ、そのウィンドウは閉じたとみなす） */
const STALE_MS = USER_VIEW_REPORT_MS * 3;

/** 覚えた様子と、知らされた時刻 */
export interface SeenView {
  view: UserView;
  at: number;
}

interface WindowView extends SeenView {
  chatIds: Set<number>;
  /** 最後に前に出ていた時刻（チャットを開いているウィンドウがないとき、これがいちばん新しいものを読む） */
  focusedAt: number;
}

/** 選んだ文が長ければ切る（画面でも切るが、コアでも守る） */
function clipView(view: UserView): UserView {
  const clip = (s: string | null) => (s !== null && s.length > USER_VIEW_TEXT_MAX ? `${s.slice(0, USER_VIEW_TEXT_MAX)}…（切りました）` : s);
  const tab = <T extends UserView["side"][number] | null>(t: T): T => (t && t.kind === "memo" ? { ...t, selected_text: clip(t.selected_text) } : t);
  return { ...view, panes: view.panes.map((p) => ({ ...p, tab: tab(p.tab) })), side: view.side.map(tab) };
}

export class UserViewRegistry {
  private readonly windows = new Map<string, WindowView>();
  private readonly sent = new Map<number, SeenView>();

  constructor(private readonly now: () => number = Date.now) {}

  /** ウィンドウの知らせを覚える（view が null ならそのウィンドウを忘れる = 閉じた） */
  report(body: UserViewBody): void {
    if (!body.view) {
      this.windows.delete(body.window_id);
      return;
    }
    const at = this.now();
    const before = this.windows.get(body.window_id);
    this.windows.set(body.window_id, { view: clipView(body.view), at, chatIds: new Set(body.chat_ids), focusedAt: body.focused ? at : (before?.focusedAt ?? 0) });
  }

  /** 発言を送ったときの様子を覚える（チャットごとに最後の 1 つ） */
  rememberSent(chatId: number, view: UserView): void {
    this.sent.set(chatId, { view: clipView(view), at: this.now() });
  }

  /** そのチャットの最後の発言を送ったときの様子（なければ null） */
  sentFor(chatId: number): SeenView | null {
    return this.sent.get(chatId) ?? null;
  }

  /** 読むウィンドウの様子: そのチャットを開いているウィンドウ（いくつもあれば最後に前に出したもの）、なければ最後に前に出したウィンドウ。画面が開いていなければ null */
  currentFor(chatId: number): SeenView | null {
    const fresh = [...this.windows.values()].filter((w) => this.now() - w.at <= STALE_MS);
    const pick = (list: WindowView[]) => list.sort((a, b) => b.focusedAt - a.focusedAt || b.at - a.at)[0] ?? null;
    const chosen = pick(fresh.filter((w) => w.chatIds.has(chatId))) ?? pick(fresh);
    return chosen ? { view: chosen.view, at: chosen.at } : null;
  }
}
