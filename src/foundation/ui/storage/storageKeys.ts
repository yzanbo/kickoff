/**
 * まだ機能ごとの ui/storage.ts に配っていない保存の宣言（0018 の P4-2b で 135 を配った残りの 20。P6-3a でチャットの書きかけ 2 つを composer へ移して 18）。どれも、表の持ち主の機能より下の機能・設定の画面が
 * 読んでいて、持ち主へ移すと逆向きの import が増えるもの（読み手を直す段で持ち主へ移す: 設定の画面は 07・パネルの surfaces・PaneTabBar は 07・
 * チャットの書きかけと開き方は 06・AI に見せる画面の様子は 09）。キーは前の名前のまま。宣言は群 legacyKeys.ts に包んで起動の片付けに渡す。
 * プロジェクト・チャット・グループなどの ID を、キーか値に含むものは ids を付ける（DB を作り直したら、起動したときに捨てる）
 */
import { choice, defineSetting, defineSettingFamily, flag, json, record, text } from "./settings";
import { NO_DB_TABS, parseDbClientTabs } from "@/features/database/ui/client/dbClientTabs";

/**
 * プロジェクトのチャットを開く場所（separate = ボードと分けた「チャット」タブで横幅いっぱいに / together = ボードの右のパネル。設定の「表示」）。
 * どちらもボードの右のパネルと同じパネル（kanban:<プロジェクト>）なので、切り替えても開いているタブ・分割はそのまま
 */
export const CHAT_PLACEMENT = defineSetting("kickoff:chat-placement", choice(["separate", "together"], "separate"));
/** タブをまとめたときのまとまりに色を付けるか（札・タブの線。サイドバーのまとまりと同じ色。すべての欄で共通。初めは付ける） */
export const PANEL_TAB_GROUP_COLORS = defineSetting("kickoff:panel-tab-group-colors", flag(true));
/** タブの列の左の道具の「表示」ボタンを隠すか（すべてのパネルで共通。初めは出す。隠してもタブの列の何もないところの右クリックで同じメニューを開ける） */
export const PANEL_VIEW_BUTTON_HIDDEN = defineSetting("kickoff:panel-view-button-hidden", flag());
/** プロジェクトごとの、右のチャット欄を開いているか */
export const projectChatOpen = defineSettingFamily("kickoff:project-chat-open:", flag(), { ids: true });
/** 送る前の新しいチャット（下書きのタブ）。パネルごとのタブ（{ [パネル]: タブ[] }。中身は panel/state/draftPersistence.ts が確かめる）。送った・閉じたら消える */
export const NEW_CHAT_DRAFTS = defineSetting("kickoff:new-chat-drafts", record(), { ids: true });
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
 * チャットからノートを開く場所（side = チャットの画面の右の欄のタブ / window = 別ウィンドウ。設定の「表示」）。
 * 「ノートに追加」のあとの「開く」・入力欄の上のノートの札で共通（ノートのタブから開くのは、ノートのタブの中）
 */
export const NOTE_OPEN_IN = defineSetting("kickoff:note-open-in", choice(["side", "window"], "side"));
/** 上に貼り付ける自分の指示の帯を出さないか（設定の「表示」。どのチャットでも同じ。初めは出す） */
export const STICKY_PROMPT_HIDDEN = defineSetting("kickoff:sticky-prompt-hidden", flag(false));
/** チャットのパネルのタブの列を隠すか（タブの列の「表示」・見出しと会話の何もないところの右クリック・設定の「表示」。どのプロジェクトでも同じ） */
export const CHAT_TAB_ROW_HIDDEN = defineSetting("kickoff:chat-tab-row-hidden", flag());
/** チャットの見出しの行を隠すか（見出しと会話の右クリックの「チャット画面表示」・設定の「表示」・⌥⌘T。どのチャットでも同じ） */
export const CHAT_HEADER_ROW_HIDDEN = defineSetting("kickoff:chat-header-row-hidden", flag());
/** チャットの見出しのグループ・作業場所のバッジを色付きで表示するか（見出し・会話の何もないところの右クリック・設定の「表示」。どのチャットでも同じ。初めは色付き） */
export const CHAT_HEADER_BADGE_COLORS = defineSetting("kickoff:chat-header-badge-colors", flag(true));
/** チャット欄をコンパクトに表示するか（設定の「表示」。どのチャット欄にも効く。初めはコンパクトにしない） */
export const COMPOSER_COMPACT = defineSetting("kickoff:composer-compact", flag(false));
/** 会話の横幅を広げるか（どのチャットでも同じ。初めは広げる） */
export const CHAT_WIDE = defineSetting("kickoff:chat-wide", flag(true));
/**
 * DB クライアントの右のタブ（テーブル・SQL）と表示中のタブ。置き場所ごと（プロジェクトの DB タブ = project-<ID>・チャットの右の欄 = chat-<ID>・別ウィンドウ = popout-<ID>）。
 * 接続・プロジェクトの ID を含むので DB を作り直したら捨てる
 */
export const dbClientTabs = defineSettingFamily("kickoff:db-tabs:", json(parseDbClientTabs, NO_DB_TABS, (v) => v.tabs.length === 0), { ids: true });
/** GitHub タブで開いている issue・PR（プロジェクトごと。「issue:12」「pr:5」の形） */
export const githubSelected = defineSettingFamily("kickoff:github-selected:", text(), { ids: true });
