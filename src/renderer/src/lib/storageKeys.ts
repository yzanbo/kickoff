/**
 * 画面が localStorage（一部は sessionStorage）に保存するもの（表示の設定・開閉・幅・書きかけの文など）の一覧。読み書きは lib/storage.ts
 * （React からは hooks/useSetting.ts の useSetting。ID ごとのものは useSetting(family(id))）。
 * - ここが唯一の一覧: ここに宣言していない kickoff: のキーは、起動したときに消す（なくした機能の古いキーを残さない）
 * - キー名と値の形は、宣言を変えない限り変わらない。変えるとその設定は初めの値に戻るので、変えるのは形をそろえるときだけにする
 * - プロジェクト・チャット・グループなどの ID を、キーか値に含むものは ids を付ける（DB を作り直したら、起動したときに捨てる。
 *   ID が 1 から振り直され、別のものを指すため）。ID ごとのものは defineSettingFamily（キーは頭 ＋ ID）
 */
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS } from "@shared/ipc";
import { HANDOFF_VIAS, type HandoffFrom } from "@shared/types";
import { HANDOFF_AFTERS } from "@shared/chat/handoff";
import { choice, defineSetting, defineSettingFamily, flag, json, list, number, optionalFlag, record, text } from "./storage";

/** 保存した子チャットからの依頼の出どころを読む（形が合わなければ null） */
function parseHandoffFrom(value: unknown): HandoffFrom | null {
  if (typeof value !== "object" || value === null) return null;
  const { chat_id, title } = value as Record<string, unknown>;
  return typeof chat_id === "number" && typeof title === "string" ? { chat_id, title } : null;
}

const isString = (value: unknown): value is string => typeof value === "string";

// 起動
/** いまの DB の ID（GET /api/status の database_id。変わったら、ID を含むものを捨ててから覚え直す） */
export const DATABASE_ID = defineSetting("kickoff:database-id", text());

// テーマ・現在のプロジェクト
/** テーマ（dark / light / system = システムに合わせる） */
export const THEME = defineSetting("kickoff:theme", choice(["dark", "light", "system"], "dark"));
/** サイドバーで最後に選んでいたプロジェクトの ID（0 = まだない。⌘N の新しいチャットの作成先にも使う） */
export const CURRENT_PROJECT = defineSetting("kickoff:current-project", number(0), { ids: true });

// サイドバー本体
/** サイドバーを開いているか（"open" / "closed"） */
export const SIDEBAR_OPEN = defineSetting("kickoff:sidebar", flag(true, ["open", "closed"]));
export const SIDEBAR_WIDTH = defineSetting("kickoff:sidebar-width", number(294));
/** プロジェクトの並べ方（stack = 縦並び / slide = 横スライド / rail = 縦スライド。初めは縦スライド） */
export const SIDEBAR_LAYOUT = defineSetting("kickoff:sidebar-layout", choice(["slide", "stack", "rail"], "rail"));
/** プロジェクトの並び順（manual = 手動 / recent = 最近動いた順。初めは最近動いた順） */
export const SIDEBAR_PROJECT_ORDER = defineSetting("kickoff:sidebar-project-order", choice(["manual", "recent"], "recent"));
/** しまった（アーカイブした）プロジェクトもサイドバーの下に出すか */
export const SIDEBAR_SHOW_ARCHIVED_PROJECTS = defineSetting("kickoff:sidebar-show-archived-projects", flag());
/** プロジェクトのカードを 1 行で出すか（名前だけにして、チャット数の行を隠す） */
export const SIDEBAR_PROJECT_COMPACT = defineSetting("kickoff:sidebar-project-compact", flag());
/** プロジェクトごとに最後に見ていた画面（URL のハッシュ。横スライドで戻ってきたときに開く。アプリを閉じるまで） */
export const SIDEBAR_LAST_HASHES = defineSetting("kickoff:last-hash-by-project", record(isString), { ids: true, session: true });
/** プロジェクトのタグでの絞り込み（選んだタグ。"" はタグのないプロジェクト。空なら絞り込まない。サイドバー・全プロジェクトの画面・⌘⇧A で共通） */
export const PROJECT_TAG_FILTER = defineSetting("kickoff:project-tag-filter", list());

// サイドバーのチャットの並べ方（どのプロジェクトでも同じ）
/** チャットのまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別。初めはまとめない） */
export const SIDEBAR_CHAT_SECTIONS = defineSetting("kickoff:sidebar-chat-sections", choice(["none", "group", "worktree"], "none"));
/** チャットの並び順（recent = 最近動いた順 / status = 状態順） */
export const SIDEBAR_CHAT_ORDER = defineSetting("kickoff:sidebar-chat-order", choice(["recent", "status"], "recent"));
/** 自分待ち（回答待ち・未読）のチャットに目を向けるか（初めはオン = 一覧の上に × プロジェクト別） */
export const SIDEBAR_WAITING_ONLY = defineSetting("kickoff:sidebar-waiting-only", flag(true));
/** 自分待ちがオンのときの表示（出し方 × 並べ方。filter = 自分待ちだけ × プロジェクト別 / list = 自分待ちだけ × 状態順 / inbox = 一覧の上に × 状態順 / inbox-project = 一覧の上に × プロジェクト別 / in-project = プロジェクト内の上に。sidebar/waitingAxes.ts。初めは inbox-project） */
export const SIDEBAR_WAITING_VIEW = defineSetting("kickoff:sidebar-waiting-view", choice(["filter", "inbox", "list", "inbox-project", "in-project"], "inbox-project"));
/** チャットを 1 行で出すか（2 行目のブランチを隠す） */
export const SIDEBAR_COMPACT = defineSetting("kickoff:sidebar-compact", flag(true));
/** アーカイブ済みのチャットを出すか（サイドバー・右のパネルのタブ・ボードの絞り込みで共通。初めは隠す） */
export const SIDEBAR_SHOW_ARCHIVED = defineSetting("kickoff:sidebar-show-archived", flag(false));
/** グループ別・作業場所別のまとまりの見出しに色を付けるか（パネルのタブのまとまりと同じ色。初めは付ける。features/chatList/bucketHues.ts） */
export const SIDEBAR_BUCKET_COLORS = defineSetting("kickoff:sidebar-bucket-colors", flag(true));

// まとまりの開閉（ここだけで覚える）
/**
 * まとまりを開いているか（hooks/useFold。サイドバーのプロジェクト・固定・グループ・グループなし・並べ方のまとまり・アーカイブ済み、
 * ボードの段・列のアーカイブ済み、パネルのタブのまとまり）。ID は <場所>:<まとまりのキー>（chatList の bucketChats のキー。
 * 例 "sidebar:p3"・"sidebar:p3/g5/status:read"・"board:kanban:3:p3/w:main"・"panel:p3/archived"）。
 * "1" = 開いている / "0" = 閉じている。覚えていなければ、まとまりごとの初めの値（アーカイブ済みは閉じる・ほかは開く）
 */
export const FOLDS = defineSettingFamily("kickoff:fold:", optionalFlag(), { ids: true });

// パレット
/** ⌘K で探す対象（project / chat / memo / message。空ならプロジェクト・チャット・メモ） */
export const COMMAND_PALETTE_TARGETS = defineSetting("kickoff:command-palette-targets", list());
/** ⌘⇧A（作業中・待ちのチャットの一覧）に、アーカイブ済みのプロジェクトのチャットも出すか */
export const ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS = defineSetting("kickoff:active-chats-show-archived-projects", flag());

// ボード（カンバン・グループ）
/** プロジェクトのボードの列（state = 状態ごと / groups = 自分で作ったグループごと。ボードのタブを押したときに、最後に見た方を開く） */
export const PROJECT_BOARD_COLUMNS = defineSetting("kickoff:board-columns", choice(["state", "groups"], "state"));
/** ボードの表示（board = 列を横に並べる / list = まとまりを縦に並べる。カンバン・グループのボードで共通） */
export const BOARD_VIEW = defineSetting("kickoff:board-view", choice(["board", "list"], "board"));
/** ボードを段（スイムレーン）に分けるか（ボード・リストで共通。分け方は PROJECT_BOARD_LANES・ALL_PROJECTS_BOARD_LANES） */
export const BOARD_SPLIT = defineSetting("kickoff:board-split", flag());
/** ボードのリスト表示の行を 1 行にまとめるか（すべてのボードで共通。初めは 2 行） */
export const BOARD_LIST_COMPACT = defineSetting("kickoff:board-list-compact", flag());
/** プロジェクトのボードの段の分け方（group = グループ / worktree = 作業場所 / project = プロジェクト） */
export const PROJECT_BOARD_LANES = defineSetting("kickoff:board-lanes", choice(["group", "worktree", "project"], "worktree"));
/** 全プロジェクトのボードの段の分け方（プロジェクトのボードとは別に覚える。初めはプロジェクト別） */
export const ALL_PROJECTS_BOARD_LANES = defineSetting("kickoff:board-lanes-all", choice(PROJECT_BOARD_LANES.choices, "project"));
/** カンバンのアーカイブでの絞り込み（all = すべて / active = 未アーカイブ / archived = アーカイブ済みだけ） */
export const BOARD_ARCHIVE_FILTER = defineSetting("kickoff:show-archived", choice(["all", "active", "archived"], "all"));
/** グループのボードのアーカイブでの絞り込み（カンバンとは別に覚える） */
export const GROUP_BOARD_ARCHIVE_FILTER = defineSetting("kickoff:group-show-archived", choice(BOARD_ARCHIVE_FILTER.choices, "all"));
/**
 * プロジェクトごとの、グループのボードの「No Group」の位置（グループの並びの中で、前にあるグループの数。ボードとリストで共通）。
 * -1（覚えていない）なら、ボードは先頭・リストはいちばん下
 */
export const groupBoardUngroupedAt = defineSettingFamily(
  "kickoff:group-board-ungrouped-at:",
  json((v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined), -1, (v) => v < 0),
  { ids: true },
);
/** 下の帯（フッター）の出し方（show = 表示 / hover = 下端に寄せたときだけ表示 / hide = 非表示。features/footer/footerMode.ts） */
export const FOOTER_MODE = defineSetting("kickoff:footer-mode", choice(["show", "hover", "hide"], "show"));
/** プロジェクトの画面のタブの置き方（top = 見出しの下に横並び / side = 左に縦並び・アイコンだけ。設定の「表示」） */
export const PROJECT_TABS_LAYOUT = defineSetting("kickoff:project-tabs-layout", choice(["top", "side"], "side"));
/** プロジェクトのタブの並び（ドラッグで並べ替えたタブの名前の列。空なら初めの並び。features/project/page/tabOrder.ts） */
export const PROJECT_TAB_ORDER = defineSetting("kickoff:project-tab-order", list());
/**
 * プロジェクトのチャットを開く場所（separate = ボードと分けた「チャット」タブで横幅いっぱいに / together = ボードの右のパネル。設定の「表示」）。
 * どちらもボードの右のパネルと同じパネル（kanban:<プロジェクト>）なので、切り替えても開いているタブ・分割はそのまま
 */
export const CHAT_PLACEMENT = defineSetting("kickoff:chat-placement", choice(["separate", "together"], "separate"));

// 右のパネル・チャット欄・下のパネル
export const PANEL_WIDTH = defineSetting("kickoff:panel-width", number(1127));
/** 右のパネルを横幅いっぱいにしているか */
export const PANEL_MAXIMIZED = defineSetting("kickoff:panel-maximized", flag());
/** 欄（board = ボードの右のパネル / side = 右端のチャット欄 / bottom = フッター）ごとの、タブの列のまとめ方（選べる値はサイドバーのまとめ方と同じ） */
export const panelTabGrouping = defineSettingFamily("kickoff:panel-tab-grouping:", choice(SIDEBAR_CHAT_SECTIONS.choices, "none"));
/** タブをまとめたときのまとまりに色を付けるか（札・タブの線。サイドバーのまとまりと同じ色。すべての欄で共通。初めは付ける） */
export const PANEL_TAB_GROUP_COLORS = defineSetting("kickoff:panel-tab-group-colors", flag(true));
/** タブの列（グループ別）で隠す、自分で作ったグループの ID（すべてのパネル・ペインで共通。グループなし・固定・アーカイブ済みは隠せない） */
export const PANEL_HIDDEN_GROUPS = defineSetting("kickoff:panel-hidden-groups", list(), { ids: true });
/** タブの列（グループ別）で、チャットが 1 つもないグループの札を隠すか（すべてのパネルで共通。初めは出す） */
export const PANEL_HIDE_EMPTY_GROUPS = defineSetting("kickoff:panel-hide-empty-groups", flag(false));
/** 欄ごとの、表示するタブの種類（chat / browser / terminal。空なら欄ごとの既定） */
export const panelTabKinds = defineSettingFamily("kickoff:panel-tab-kinds:", list());
/** プロジェクトごとの、右のチャット欄を開いているか */
export const projectChatOpen = defineSettingFamily("kickoff:project-chat-open:", flag(), { ids: true });
export const PROJECT_CHAT_WIDTH = defineSetting("kickoff:project-chat-width", number(367));
export const BOTTOM_PANEL_HEIGHT = defineSetting("kickoff:bottom-panel-height", number(198));
/** チャットの画面の右の欄（サブエージェントの欄）の幅（px。左端のつまみのドラッグで変える。どのチャットでも同じ） */
export const SUBAGENT_PANEL_WIDTH = defineSetting("kickoff:subagent-panel-width", number(520));
/** 送る前の新しいチャット（下書きのタブ）。パネルごとのタブ（{ [パネル]: タブ[] }。中身は panel/state/draftPersistence.ts が確かめる）。送った・閉じたら消える */
export const NEW_CHAT_DRAFTS = defineSetting("kickoff:new-chat-drafts", record(), { ids: true });

// チャット
/** チャットごとの、入力欄の書きかけの文（空にした・送った・チャットを削除したら消す） */
export const chatDraft = defineSettingFamily("kickoff:chat-draft:", text(), { ids: true });
/**
 * チャットごとの、入力欄に入れた子チャットからの依頼の出どころ（「親チャットに追加」の入力欄。入力欄の上の札「子チャット『…』から」。
 * 送ると発言の handoff_from にして消す。× でも消す。null = なし）
 */
export const composerHandoff = defineSettingFamily("kickoff:composer-handoff:", json(parseHandoffFrom, null, (v) => v === null), { ids: true });
/** サブエージェントに伝える入力欄の書きかけの文（キーは「チャット:サブエージェントの行のキー」。カードの「伝える」と右の欄の画面で共通。送った・空にしたら消す） */
export const subagentTellDraft = defineSettingFamily("kickoff:subagent-tell-draft:", text(), { ids: true });
/**
 * サブエージェントへの入力欄の送り先（relay = メインエージェント経由で SendMessage で伝える / child = 会話の記録を添えた子チャットで聞く。
 * カードの「伝える」と右の欄の画面で共通。最後に選んだ方を覚える）
 */
export const SUBAGENT_ASK_MODE = defineSetting("kickoff:subagent-ask-mode", choice(["relay", "child"], "relay"));
/**
 * サブエージェントを押したときに開く場所（inline = メインの流れの中のカードを開く / side = チャットの画面の右の欄にサブエージェントの画面を開く /
 * window = 別ウィンドウ。初めは右の欄。カードの見出し・動きの行・ピルの一覧・裏の作業の一覧で共通。ほかはピルの一覧の行のボタン・カードのボタンで選べる。
 * 設定の「表示」と、ピルの一覧の上でも変えられる）
 */
export const SUBAGENT_OPEN_IN = defineSetting("kickoff:subagent-open-in", choice(["inline", "side", "window"], "side"));
/**
 * 子チャットを開く場所（side = いちばん上の親のチャットの画面の右の欄のタブ / window = 別ウィンドウ。設定の「表示」。
 * 別ウィンドウを開けない（スマホのブラウザ）なら右の欄）。会話の中・入力欄の上の札・サイドバーの行・通知で共通
 */
export const CHILD_CHAT_OPEN_IN = defineSetting("kickoff:child-chat-open-in", choice(["side", "window"], "side"));
/**
 * 子チャットを作ったときの開き方（side = 右の欄で開く / window = 別ウィンドウで開く / none = 開かない。初めは右の欄。設定の「表示」）。
 * チャット欄の「新規の子チャットに送る」・「新しい子チャットで聞く」の画面・送信待ちの「子チャットで開く / 移す」で共通（別ウィンドウを開けないブラウザでは右の欄）
 */
export const CHILD_CHAT_OPEN_ON_CREATE = defineSetting("kickoff:child-chat-open-on-create", choice(["side", "window", "none"], "side"));
/**
 * 子チャットの「親チャットに追加」を押したときの渡し方（composer = 親の入力欄に入れる / send = 今すぐ送る / queue = 親の送信待ちに入れる。初めは入力欄。設定の「表示」）。
 * ▾ のメニューで、今回だけ別の渡し方を選べる
 */
export const HANDOFF_VIA = defineSetting("kickoff:handoff-via", choice(HANDOFF_VIAS, "composer"));
/**
 * 「親チャットに追加」で渡したあとの子チャット（keep = そのまま / archive = アーカイブ / delete = 削除。初めはそのまま。設定の「表示」）。
 * 渡せて、子が作業中でないときだけ。削除は今すぐ送る・送信待ちのときだけで、入力欄に入れたときはアーカイブにする（handoffAfterFor）。▾ で今回だけ選べる
 */
export const HANDOFF_AFTER = defineSetting("kickoff:handoff-after", choice(HANDOFF_AFTERS, "keep"));
/**
 * チャットからメモを開く場所（side = チャットの画面の右の欄のタブ / window = 別ウィンドウ。設定の「表示」）。
 * 「メモに追加」のあとの「開く」・入力欄の上のメモの札で共通（メモのタブから開くのは、メモのタブの中）
 */
export const MEMO_OPEN_IN = defineSetting("kickoff:memo-open-in", choice(["side", "window"], "side"));
/** チャットごとの、手で隠した ToDo の一覧（その一覧の印 todoSignature。一覧が書き換わったらまた出す） */
export const todoHidden = defineSettingFamily("kickoff:todo-hidden:", text(), { ids: true });
/** チャットごとの、アーカイブしたサブエージェント（呼び出し ID） */
export const subagentsArchived = defineSettingFamily("kickoff:subagents-archived:", list(), { ids: true });
/** 作業中・送信待ちがあるときに送った指示の扱い（queue = あとで（送信待ちに足す）/ tell = いま（止めずに伝える）） */
export const QUEUE_MODE = defineSetting("kickoff:queue-mode", choice(["queue", "tell"], "tell"));
/** 送信待ちの一覧をたたんで 1 行にするか（どのチャットでも同じ） */
export const QUEUE_COLLAPSED = defineSetting("kickoff:queue-collapsed", flag(true));
/** 送信待ちの一覧を、中でスクロールさせずにすべて出すか（どのチャットでも同じ） */
export const QUEUE_EXPANDED = defineSetting("kickoff:queue-expanded", flag());
/** 送信待ちの一覧の高さの上限（px。上端のつまみのドラッグで変える。どのチャットでも同じ） */
export const QUEUE_HEIGHT = defineSetting("kickoff:queue-height", number(150));
/** 上に貼り付ける自分の指示を、1 行にたたまず全文で出すか（どのチャットでも同じ） */
export const STICKY_PROMPT_EXPANDED = defineSetting("kickoff:sticky-prompt-expanded", flag());
/** 上に貼り付ける自分の指示の帯を出さないか（設定の「表示」。どのチャットでも同じ。初めは出す） */
export const STICKY_PROMPT_HIDDEN = defineSetting("kickoff:sticky-prompt-hidden", flag(false));
/** 入力欄の上の定型文の帯を出さないか（設定の「表示」・タブの列の「表示」・帯の右クリック。どのチャットでも同じ。初めは出す） */
export const SNIPPET_BAR_HIDDEN = defineSetting("kickoff:snippet-bar-hidden", flag(false));
/** チャットのパネルのタブの列を隠すか（タブの列の「表示」・見出しと会話の何もないところの右クリック・設定の「表示」。どのプロジェクトでも同じ） */
export const CHAT_TAB_ROW_HIDDEN = defineSetting("kickoff:chat-tab-row-hidden", flag());
/** チャットの見出しの行を隠すか（タブの列の「表示」・設定の「表示」・⌥⌘T。どのチャットでも同じ） */
export const CHAT_HEADER_ROW_HIDDEN = defineSetting("kickoff:chat-header-row-hidden", flag());
/** チャットの見出しのグループ・作業場所のバッジを色付きで表示するか（見出し・会話の何もないところの右クリック・タブの列の「表示」・設定の「表示」。どのチャットでも同じ。初めは色付き） */
export const CHAT_HEADER_BADGE_COLORS = defineSetting("kickoff:chat-header-badge-colors", flag(true));
/** チャットの見出しの行で隠している項目（chatHeaderItems.ts の CHAT_HEADER_ITEMS。タブの列の「表示」→「見出しに出す項目」。初めはプロジェクト・会話 / 動きの切り替え・文字の大きさ・ターン数・API 換算を隠す（メニューの「既定に戻す」でこの値に戻す）。どのチャットでも同じ） */
export const CHAT_HEADER_HIDDEN = defineSetting("kickoff:chat-header-hidden", list(["project", "showing", "fontSize", "turns", "cost"]));
/** 見出しの行の項目の並び（タブの列の「表示」→「見出しに出す項目」で、まとまりの中をドラッグで並べ替える。chat/pane/chatHeaderItems.ts。空なら初めの並び） */
export const CHAT_HEADER_ORDER = defineSetting("kickoff:chat-header-order", list());
/** チャット欄をコンパクトに表示するか（設定の「表示」。どのチャット欄にも効く。初めはコンパクトにしない） */
export const COMPOSER_COMPACT = defineSetting("kickoff:composer-compact", flag(false));
/** 会話の文字の大きさ（5 段階。chat/pane/chatFontSize.ts。見出しの行のボタン・タブの列の「表示」・設定の「表示」。どのチャットでも同じ。初めは標準） */
export const CHAT_FONT_SIZE = defineSetting("kickoff:chat-font-size", choice(["xs", "sm", "md", "lg", "xl"], "md"));
/** 会話の横幅を広げるか（どのチャットでも同じ。初めは広げる） */
export const CHAT_WIDE = defineSetting("kickoff:chat-wide", flag(true));
/** チャットの中の検索で、大文字・小文字を区別するか（どのチャットでも同じ） */
export const CHAT_FIND_CASE = defineSetting("kickoff:chat-find-case-sensitive", flag());
/** AI からの質問が複数あるときの出し方（steps = 1 問ずつ / all = すべて並べる） */
export const QUESTION_LAYOUT = defineSetting("kickoff:question-layout", choice(["steps", "all"], "steps"));
/** チャットの ✕ を押したときの扱い（ask = 毎回聞く / close = 表示だけ消す / archive = アーカイブ / delete = 削除） */
export const CHAT_CLOSE_ACTION = defineSetting("kickoff:chat-close-action", choice(["ask", "close", "archive", "delete"], "ask"));
/** ほかのチャットが作業中の作業場所へ新しいチャットを送るとき（ask = 毎回聞く / here = このまま送る / worktree = 新しいワークツリーで始める。features/worktree/busyWorkplace.ts） */
export const BUSY_WORKPLACE_ACTION = defineSetting("kickoff:busy-workplace-action", choice(["ask", "here", "worktree"], "ask"));

// ファイル・検索・変更・履歴のタブ
/** 変更の一覧を木で出すか */
export const CHANGES_TREE = defineSetting("kickoff:changes-tree", flag(true));
/** ファイルタブ・履歴タブの左の一覧の幅 */
export const CHANGES_LIST_WIDTH = defineSetting("kickoff:changes-list-width", number(246));
/** 差分の並べ方（split = 左右に並べる / unified = 1 列） */
export const DIFF_LAYOUT = defineSetting("kickoff:diff-layout", choice(["split", "unified"], "unified"));
/** コミットの詳細の変わったファイルを一覧で出すか（初めは木） */
export const COMMIT_FILES_LIST = defineSetting("kickoff:commit-files-tree", flag());
export const COMMIT_FILES_WIDTH = defineSetting("kickoff:commit-files-width", number(260));
/** 履歴の上のコミットの表の高さ（割合 %） */
export const HISTORY_SPLIT = defineSetting("kickoff:history-split", number(43));
/** プロジェクトごとの、ファイルタブで見ている作業場所（ワークツリーのフォルダ。空なら本体） */
export const editorWorktree = defineSettingFamily("kickoff:editor-worktree:", text(), { ids: true });
/** プロジェクトごとの、メモのタブで開いているメモ（メモのフォルダからの相対パス。空なら選んでいない） */
export const memoSelected = defineSettingFamily("kickoff:memo-selected:", text(), { ids: true });
/** プロジェクトごとの、メモのタブの木で開いているフォルダ */
export const memoOpenFolders = defineSettingFamily("kickoff:memo-open-folders:", list(), { ids: true });
/** メモの表示（preview = Markdown 表示（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ edit = そのまま表示（記号もそのまま）。どちらも書ける） */
export const MEMO_VIEW = defineSetting("kickoff:memo-view", choice(["edit", "preview"], "preview"));
/** まだ保存していないメモ（キーは「プロジェクト:メモのパス」。値は書いたものと、書き始めたときのメモの指紋。保存する・捨てると消す。アプリを閉じても残す） */
export const memoDraft = defineSettingFamily("kickoff:memo-draft:", json(parseMemoDraft, null, (v) => v === null), { ids: true });
/** メモのタブの左の一覧（メモのフォルダの木）を隠しているか（どのプロジェクトでも同じ） */
export const MEMO_LIST_HIDDEN = defineSetting("kickoff:memo-list-hidden", flag(false));
/** メモのチャットの欄（本文の右）を開いているか（どのメモでも同じ。チャットそのものは DB の chats.memo_path） */
export const MEMO_CHAT_OPEN = defineSetting("kickoff:memo-chat-open", flag(false));
/** メモのチャットの欄を閉じている間、メモの下の入力欄（MemoQuickChat）も隠すか（どのメモでも同じ。見出しの吹き出しの ▾・入力欄の「隠す」で切り替える） */
export const MEMO_QUICK_CHAT_HIDDEN = defineSetting("kickoff:memo-quick-chat-hidden", flag(false));
/** メモのチャットの欄の幅（本文の右に並べたとき。境目のつまみで変える） */
export const MEMO_CHAT_WIDTH = defineSetting("kickoff:memo-chat-width", number(380));
/** メモのチャットの欄の置き場所（right = 本文の右 / bottom = 本文の下。欄の見出しで切り替える。right でも狭ければ下に並べる） */
export const MEMO_CHAT_PLACE = defineSetting("kickoff:memo-chat-place", choice(["right", "bottom"], "right"));
/** メモのチャットの欄の高さ（本文の下に置いたとき。本文と欄を合わせた高さに対する %。境目のつまみで変える） */
export const MEMO_CHAT_HEIGHT = defineSetting("kickoff:memo-chat-height", number(45));
/** チャットの画面の右の欄の「変更」で確認済みにしたファイル（キーは「プロジェクト:ワークツリーのフォルダ（本体は空）」。値はパス → 確認したときの差分の指紋） */
export const sideViewedFiles = defineSettingFamily("kickoff:side-viewed:", record(isString), { ids: true });

// 外のアプリ・埋め込みブラウザ
/** 外部のターミナルとして開くアプリ（EXTERNAL_TERMINALS の id） */
export const EXTERNAL_TERMINAL = defineSetting("kickoff:external-terminal", choice(EXTERNAL_TERMINALS.map((t) => t.id), "terminal"));
/** 外部のブラウザとして開くアプリ（EXTERNAL_BROWSERS の id） */
export const EXTERNAL_BROWSER = defineSetting("kickoff:external-browser", choice(EXTERNAL_BROWSERS.map((b) => b.id), "chrome"));
/** 開発者ツールを出す場所（right / bottom / window = 別のウィンドウ） */
export const BROWSER_DEVTOOLS_DOCK = defineSetting("kickoff:browser-devtools-dock", choice(["right", "bottom", "window"], "window"));
export const BROWSER_DEVTOOLS_WIDTH = defineSetting("kickoff:browser-devtools-width", number(420));
export const BROWSER_DEVTOOLS_HEIGHT = defineSetting("kickoff:browser-devtools-height", number(300));

/** まだ保存していないメモ（memoDraft の値） */
export interface MemoDraft {
  /** 書いたもの */
  text: string;
  /** 書き始めたときのメモの指紋（いまのメモと違えば、ほかで変わっている） */
  hash: string;
}

function parseMemoDraft(value: unknown): MemoDraft | null | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { text: body, hash } = value as Record<string, unknown>;
  return typeof body === "string" && typeof hash === "string" ? { text: body, hash } : undefined;
}
