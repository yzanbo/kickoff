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
/** プロジェクトの並び順（"manual" / "recent"） */
export const SIDEBAR_PROJECT_ORDER_KEY = "kickoff:sidebar-project-order";
/** しまった（アーカイブした）プロジェクトもサイドバーの下に出すか（"1" なら出す） */
export const SIDEBAR_SHOW_ARCHIVED_PROJECTS_KEY = "kickoff:sidebar-show-archived-projects";
/** プロジェクトごとの、チャット一覧を閉じているか（"1" なら閉じている。後ろにプロジェクトの ID） */
export const SIDEBAR_PROJECT_COLLAPSED_PREFIX = "kickoff:collapsed:";
/** プロジェクトごとに最後に見ていた画面（URL）。sessionStorage に JSON で */
export const SIDEBAR_LAST_HASH_KEY = "kickoff:last-hash-by-project";

// サイドバーのチャットの並べ方（どのプロジェクトでも同じ）
/** チャットのまとめ方（CHAT_GROUPINGS） */
export const SIDEBAR_GROUPING_KEY = "kickoff:sidebar-grouping";
/** 自分待ち（回答待ち・確認待ち）のチャットだけを出すか（"1" なら出す） */
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
/** カンバンの表示（"board" / "list" / "lanes"） */
export const BOARD_VIEW_KEY = "kickoff:board-view";
/** グループのボードの表示（カンバンとは別に覚える） */
export const GROUP_VIEW_KEY = "kickoff:group-view";
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
/** サブエージェントの引き出しの幅 */
export const SUBAGENT_WIDTH_KEY = "kickoff:subagent-width";
/** チャットごとの、アーカイブしたサブエージェント（呼び出し ID の JSON の配列） */
export const subagentsArchivedKey = (runId: number) => `kickoff:subagents-archived:${runId}`;

// エディタタブ（変更・履歴・ファイル）
/** エディタタブの左端の表示（"files" / "search" / "changes" / "history"） */
export const CHANGES_VIEW_KEY = "kickoff:changes-view";
/** 変更の一覧を木で出すか（"1" なら木） */
export const CHANGES_TREE_KEY = "kickoff:changes-tree";
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

// 埋め込みブラウザ
/** 開発者ツールを出す場所（"right" / "bottom" / "window"） */
export const BROWSER_DEVTOOLS_DOCK_KEY = "kickoff:browser-devtools-dock";
export const BROWSER_DEVTOOLS_WIDTH_KEY = "kickoff:browser-devtools-width";
export const BROWSER_DEVTOOLS_HEIGHT_KEY = "kickoff:browser-devtools-height";
