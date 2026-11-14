// 型と定数のみ。Node 依存なし（コア・画面で共有する）
// 利用者が見ているもの（AI の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）: この Mac の画面のウィンドウごとに、
// 見ているプロジェクト・見えているペインごとの前のタブ・右の欄に開いているものを、画面がコアに知らせる（コアは覚えておくだけで保存しない）

/** エディタで選んでいる範囲（行と文字は 1 から） */
export interface UserViewSelection {
  from_line: number;
  from_column: number;
  to_line: number;
  to_column: number;
}

/** 画面のタブ 1 つの中身（種類ごと。project_id はそのタブのプロジェクト（全プロジェクトの画面で、ほかのプロジェクトのものを見分ける。分からなければ省く）） */
export type UserViewTab = (
  | { kind: "chat"; chat_id: number; title: string }
  | { kind: "child_chat"; chat_id: number; title: string }
  | { kind: "new_chat" }
  | { kind: "subagent"; title: string }
  | { kind: "editor"; path: string; worktree: string | null; line: number | null; selection: UserViewSelection | null }
  | { kind: "changes"; worktree: string | null; focus: string | null }
  | { kind: "memo"; path: string; selected_text: string | null }
  | { kind: "browser"; url: string; title: string }
  | { kind: "github"; item: { kind: "issue" | "pr"; number: number } | null }
  | { kind: "database"; connection: string | null; table: string | null }
  | { kind: "terminal"; label: string }
  /** ほかの画面（ボード・CI・Docker・ゴミ箱・検索・履歴など。label は画面の名前） */
  | { kind: "page"; label: string }
) & { project_id?: number };

/** 見えているペイン 1 つ（area は置き場所の名前「チャットのパネル」「右の欄」「下のパネル」など。前のタブがなければ null） */
export interface UserViewPane {
  area: string;
  tab: UserViewTab | null;
}

/** 1 つのウィンドウで利用者が見ているもの */
export interface UserView {
  /** 見ているプロジェクト（全プロジェクトの画面なら null） */
  project_id: number | null;
  panes: UserViewPane[];
  /** チャットの画面の右の欄に開いているもの（前に出ていないタブも） */
  side: UserViewTab[];
}

/** 見ているものの知らせ（PUT /api/user-view。この Mac の画面だけ。window_id はウィンドウごとの ID。閉じるときは view を null） */
export interface UserViewBody {
  window_id: string;
  view: UserView | null;
  /** このウィンドウで開いているチャット（AI がどのウィンドウを読むかを決める） */
  chat_ids: number[];
  /** このウィンドウが前に出ているか（チャットを開いているウィンドウがなければ、最後に前に出したウィンドウを読む） */
  focused: boolean;
}

/** 選んだ文を知らせるときの長さの上限（文字。長ければ切る） */
export const USER_VIEW_TEXT_MAX = 2000;

/** 画面は見ている間、この間隔で知らせ直す（コアはこれの 3 倍より古い知らせを「画面が開いていない」とみなす） */
export const USER_VIEW_REPORT_MS = 60_000;
