/**
 * localStorage（一部は sessionStorage）のキー名の一覧。
 * 保存されている形式は変えない: キー名も値（"1" / "0"、"open" / "closed" など）もそのまま使う（CLAUDE.md）。
 * プロジェクト・チャットなどの ID を含むキーは関数で組み立てる。値の読み書きは hooks/useStoredState から
 */

// テーマ・現在のプロジェクト
/** テーマ（"dark" / "light" / "system"） */
export const THEME_KEY = "kickoff:theme";
/** サイドバーで最後に選んでいたプロジェクトの ID */
export const CURRENT_PROJECT_KEY = "kickoff:current-project";

// サイドバー本体
/** サイドバーの開閉（"open" / "closed"） */
export const SIDEBAR_OPEN_KEY = "kickoff:sidebar";
export const SIDEBAR_WIDTH_KEY = "kickoff:sidebar-width";
/** プロジェクトの並べ方（"slide" / "stack"） */
export const SIDEBAR_LAYOUT_KEY = "kickoff:sidebar-layout";
/** プロジェクトのボードの列（"state" = 状態ごと / "groups" = 自分で作ったグループごと。ボードのタブを押したときに、最後に見た方を開く） */
export const BOARD_COLUMNS_KEY = "kickoff:board-columns";
/** プロジェクトの並び順（"manual" / "recent"） */
export const SIDEBAR_PROJECT_ORDER_KEY = "kickoff:sidebar-project-order";
/** しまった（アーカイブした）プロジェクトもサイドバーの下に出すか（"1" なら出す） */
export const SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY = "kickoff:sidebar-show-archived-projects";
/** プロジェクトのタグでの絞り込み（選んだタグの JSON の文字列配列。"" はタグのないプロジェクト。空・未保存なら絞り込まない）。
 * サイドバー・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替えで共通（useProjectTagFilter） */
export const PROJECT_TAG_FILTER_KEY = "kickoff:project-tag-filter";
/** プロジェクトごとの、チャット一覧を閉じているか（"1" なら閉じている。後ろにプロジェクトの ID） */
export const SIDEBAR_PROJECT_COLLAPSED_PREFIX = "kickoff:collapsed:";
/** プロジェクトごとに最後に見ていた画面（URL）。sessionStorage に JSON で */
export const SIDEBAR_LAST_HASH_KEY = "kickoff:last-hash-by-project";

// サイドバーのチャットの並べ方（どのプロジェクトでも同じ）
/** チャットのまとめ方（CHAT_GROUPINGS） */
export const SIDEBAR_GROUPING_KEY = "kickoff:sidebar-grouping";
/** 自分待ち（回答待ち・未読）のチャットだけを出すか（"1" なら出す） */
export const SIDEBAR_WAITING_ONLY_KEY = "kickoff:sidebar-waiting-only";
/** チャットを 1 行で出すか（"1" なら 2 行目のブランチを隠す） */
export const SIDEBAR_COMPACT_KEY = "kickoff:sidebar-compact";
/** プロジェクトのカードを 1 行で出すか（"1" なら名前だけにして、チャット数の行を隠す） */
export const SIDEBAR_PROJECT_COMPACT_KEY = "kickoff:sidebar-project-compact";
/** アーカイブ済みのチャットを一覧の下に出すか（"1" なら出す。ボードの絞り込みとは別） */
export const SIDEBAR_SHOW_ARCHIVED_KEY = "kickoff:sidebar-show-archived";
/** 並べ方でまとめたまとまり（状態・作業場所）ごとの、閉じているか（後ろに <プロジェクト>:<並べ方>:<まとまり>） */
export const SIDEBAR_SECTION_CLOSED_PREFIX = "kickoff:sidebar-group-closed:";
/** 自分で作ったグループごとの、閉じているか（後ろにグループの ID） */
export const SIDEBAR_GROUP_CLOSED_PREFIX = "kickoff:group-closed:";
/** プロジェクトごとの「アーカイブ済み」のまとまりを開いているか */
export const sidebarArchivedOpenKey = (projectId: number) => `kickoff:archived-open:${projectId}`;
/** プロジェクトごとの「固定」のまとまりを閉じているか */
export const sidebarPinnedClosedKey = (projectId: number) => `kickoff:pinned-closed:${projectId}`;
/** プロジェクトごとの「グループなし」を閉じているか */
export const sidebarUngroupedClosedKey = (projectId: number) => `kickoff:ungrouped-closed:${projectId}`;

// ボード（カンバン・グループ）
/** ボードの表示（"board" / "list" / "lanes"）。カンバン・グループのボードで共通（以前グループのボードだけで覚えていた kickoff:group-view は使わない） */
export const BOARD_VIEW_KEY = "kickoff:board-view";
/** プロジェクトのボードのスイムレーンの段の分け方 */
export const BOARD_LANES_KEY = "kickoff:board-lanes";
/** 全プロジェクトのボードの段の分け方（プロジェクトのボードとは別に覚える） */
export const BOARD_LANES_ALL_KEY = "kickoff:board-lanes-all";
/** カンバンのアーカイブでの絞り込み（"1" / "0" / "archived"。decodeArchiveFilter） */
export const BOARD_SHOW_ARCHIVED_KEY = "kickoff:show-archived";
/** グループのボードのアーカイブでの絞り込み（カンバンとは別に覚える。形式は同じ） */
export const GROUP_SHOW_ARCHIVED_KEY = "kickoff:group-show-archived";
/** スイムレーンの段ごとの、閉じているか（後ろに <ボード>:<分け方>:<段>） */
export const BOARD_LANE_CLOSED_PREFIX = "kickoff:board-lane-closed:";
/** ボードの列・まとまりごとの「アーカイブ済み」を開いているか */
export const boardArchivedOpenKey = (foldKey: string) => `kickoff:board-archived-open:${foldKey}`;

// 右のパネル・チャット欄・下のパネル
export const PANEL_WIDTH_KEY = "kickoff:panel-width";
/** 右のパネルを横幅いっぱいにしているか（"1" / "0"） */
export const PANEL_MAXIMIZED_KEY = "kickoff:panel-maximized";
/** プロジェクトごとの、右のチャット欄を開いているか（後ろにプロジェクトの ID） */
export const PROJECT_CHAT_OPEN_PREFIX = "kickoff:project-chat-open:";
export const PROJECT_CHAT_WIDTH_KEY = "kickoff:project-chat-width";
export const BOTTOM_PANEL_HEIGHT_KEY = "kickoff:bottom-panel-height";

// チャットの中身
/** チャットごとの、アーカイブしたサブエージェント（呼び出し ID の JSON の配列） */
export const subagentsArchivedKey = (runId: number) => `kickoff:subagents-archived:${runId}`;
/** チャットごとの、入力欄の書きかけの文（空にした・送った・チャットを削除したら消す） */
export const chatDraftKey = (runId: number) => `kickoff:chat-draft:${runId}`;

// エディタタブ（変更・履歴・ファイル）
/** エディタタブの左端の表示（"files" / "search" / "changes"。以前の "history" は履歴のタブに移したので既定に戻る） */
export const CHANGES_VIEW_KEY = "kickoff:changes-view";
/** 変更の一覧を木で出すか（"1" なら木） */
export const CHANGES_TREE_KEY = "kickoff:changes-tree";
/** エディタタブ・履歴タブの左の一覧の幅 */
export const CHANGES_LIST_WIDTH_KEY = "kickoff:changes-list-width";
/** 差分の並べ方（"split" / "unified"） */
export const DIFF_LAYOUT_KEY = "kickoff:diff-layout";
/** コミットの詳細の変わったファイルを一覧で出すか（"1" なら一覧。初めは木） */
export const COMMIT_FILES_LIST_KEY = "kickoff:commit-files-tree";
export const COMMIT_FILES_WIDTH_KEY = "kickoff:commit-files-width";
/** 履歴の上のコミットの表の高さ（割合） */
export const HISTORY_SPLIT_KEY = "kickoff:history-split";
/** プロジェクトごとの、エディタタブで見ている作業場所（ワークツリーのフォルダ。空なら本体） */
export const editorWorktreeKey = (projectId: number) => `kickoff:editor-worktree:${projectId}`;

// チャット
/** 作業中に送った指示の扱い（"queue" = いまの作業が終わったら送る / "interrupt" = いまの作業を止めてすぐ送る） */
export const QUEUE_MODE_KEY = "kickoff:queue-mode";
/** 送信待ちの一覧をたたんで「n 件の追加があります」だけにするか（"1" / "0"。どのチャットでも同じ） */
export const QUEUE_COLLAPSED_KEY = "kickoff:queue-collapsed";
/** 送信待ちの一覧を、中でスクロールさせずにすべて出すか（"1" / "0"。どのチャットでも同じ） */
export const QUEUE_EXPANDED_KEY = "kickoff:queue-expanded";
/** 送信待ちの一覧の高さの上限（px。上端のつまみのドラッグで変える。どのチャットでも同じ） */
export const QUEUE_HEIGHT_KEY = "kickoff:queue-height";
/** チャットの上に貼り付ける自分の指示を、1 行にたたまず全文で出すか（"1" なら全文。どのチャットでも同じ） */
export const STICKY_PROMPT_EXPANDED_KEY = "kickoff:sticky-prompt-expanded";
/** チャット欄をコンパクトに表示するか（"1" / "0"。設定の「表示」。どのチャット欄にも効く） */
export const COMPOSER_COMPACT_KEY = "kickoff:composer-compact";
/** プロジェクトの画面のタブ（ボード・エディタ）の置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。設定の「表示」） */
export const PROJECT_TABS_LAYOUT_KEY = "kickoff:project-tabs-layout";
/** ボードの見出しの置き方（top = いつも上に出す / beside = 右のパネルを開いたら、パネルを上端まで伸ばして見出しの右側を覆う。設定の「表示」） */
export const BOARD_HEADER_LAYOUT_KEY = "kickoff:board-header-layout";
/** チャット（発言の流れとチャット欄）を、欄の横幅いっぱいに広げるか（"1" なら広く。どのチャットでも同じ） */
export const CHAT_WIDE_KEY = "kickoff:chat-wide";
/** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除。未保存なら ask） */
export const CHAT_CLOSE_ACTION_KEY = "kickoff:chat-close-action";

/** 外部のターミナルとして開くアプリ（EXTERNAL_TERMINALS の id。既定は "terminal"） */
export const EXTERNAL_TERMINAL_KEY = "kickoff:external-terminal";
/** 外部のブラウザとして開くアプリ（EXTERNAL_BROWSERS の id。既定は "chrome"） */
export const EXTERNAL_BROWSER_KEY = "kickoff:external-browser";

// 埋め込みブラウザ
/** 開発者ツールを出す場所（"right" / "bottom" / "window"） */
export const BROWSER_DEVTOOLS_DOCK_KEY = "kickoff:browser-devtools-dock";
export const BROWSER_DEVTOOLS_WIDTH_KEY = "kickoff:browser-devtools-width";
export const BROWSER_DEVTOOLS_HEIGHT_KEY = "kickoff:browser-devtools-height";
