/**
 * まだ機能ごとの ui/storage.ts に配っていない保存の宣言（0018 の P4-2b で 135 を配った残りの 20。P6-3a でチャットの書きかけ 2 つを composer へ、P6-4h で子チャットを作ったときの開き方を chat へ、P7-4c で設定の画面の 10 を持ち主へ移して 5）。どれも、表の持ち主の機能より下の機能・設定の画面が
 * 読んでいて、持ち主へ移すと逆向きの import が増えるもの（読み手を直す段で持ち主へ移す: パネルの surfaces・PaneTabBar は 07・
 * AI に見せる画面の様子は 09）。キーは前の名前のまま。宣言は群 legacyKeys.ts に包んで起動の片付けに渡す。
 * プロジェクト・チャット・グループなどの ID を、キーか値に含むものは ids を付ける（DB を作り直したら、起動したときに捨てる）
 */
import { choice, defineSetting, defineSettingFamily, flag, json, text } from "./settings";
import { NO_DB_TABS, parseDbClientTabs } from "@/features/database/ui/state/dbClientTabs";

/**
 * プロジェクトのチャットを開く場所（separate = ボードと分けた「チャット」タブで横幅いっぱいに / together = ボードの右のパネル。設定の「表示」）。
 * どちらもボードの右のパネルと同じパネル（kanban:<プロジェクト>）なので、切り替えても開いているタブ・分割はそのまま
 */
export const CHAT_PLACEMENT = defineSetting("kickoff:chat-placement", choice(["separate", "together"], "separate"));
/** タブをまとめたときのまとまりに色を付けるか（札・タブの線。サイドバーのまとまりと同じ色。すべての欄で共通。初めは付ける） */
export const PANEL_TAB_GROUP_COLORS = defineSetting("kickoff:panel-tab-group-colors", flag(true));
/** プロジェクトごとの、右のチャット欄を開いているか */
export const projectChatOpen = defineSettingFamily("kickoff:project-chat-open:", flag(), { ids: true });
/**
 * DB クライアントの右のタブ（テーブル・SQL）と表示中のタブ。置き場所ごと（プロジェクトの DB タブ = project-<ID>・チャットの右の欄 = chat-<ID>・別ウィンドウ = popout-<ID>）。
 * 接続・プロジェクトの ID を含むので DB を作り直したら捨てる
 */
export const dbClientTabs = defineSettingFamily("kickoff:db-tabs:", json(parseDbClientTabs, NO_DB_TABS, (v) => v.tabs.length === 0), { ids: true });
/** GitHub タブで開いている issue・PR（プロジェクトごと。「issue:12」「pr:5」の形） */
export const githubSelected = defineSettingFamily("kickoff:github-selected:", text(), { ids: true });
