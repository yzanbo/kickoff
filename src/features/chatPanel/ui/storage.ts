// chatPanel の画面の保存（キーは kickoff:chatPanel:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, flag, list, number, record, single } from "@/foundation/ui/storage";

export const storage = defineSettings("chatPanel", {
  /** 欄（kanban = ボードの右のパネル / side = 右端のチャット欄 / bottom = フッター）ごとの、タブの列のまとめ方（選べる値はサイドバーのまとめ方と同じ） */
  tabGrouping: family(choice(["none", "group", "worktree"], "none")),
  /** タブのまとまりの札の名前を、頭の 1 文字だけにするか（すべての欄で共通。初めは省略しない） */
  clusterShort: flag(),
  /** タブの列（グループ別）で隠す、自分で作ったグループの ID（すべてのパネル・ペインで共通。グループなし・固定・アーカイブ済みは隠せない） */
  hiddenGroups: single(list(), { ids: true }),
  /** タブの列（グループ別）で、チャットが 1 つもないグループの札を隠すか（すべてのパネルで共通。初めは出す） */
  hideEmptyGroups: flag(false),
  /** パネルのチャットのタブにアーカイブ済みのチャットを出すか（すべてのパネルで共通。サイドバーの chatList:show-archived とは別。サイドバーで出していてもタブには出さない。初めは隠す） */
  showArchived: flag(false),
  /** プロジェクトごとの右サイドバーのブラウザ。開いていたタブと配置（panel/state/browserSession.ts で確かめる） */
  projectBrowserSession: family(record(), { ids: true }),
  /** チャットの画面の右の欄（サブエージェントの欄）の幅（px。左端のつまみのドラッグで変える。どのチャットでも同じ） */
  agentPanelWidth: number(520),
  /** チャットの画面の右の欄を横幅いっぱい（左の会話を覆う）にしているか（タブの列の左端のボタンで切り替える。どのチャットでも同じ） */
  agentPanelMaximized: flag(),
});
