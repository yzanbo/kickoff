// プロジェクトの画面が設定の「表示」に出す欄: 見出し・タブ・チャットを開く場所
import { useCommandKeyList, useCommandKeys } from "@/foundation/ui/commands";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { PROJECT_TABS_LAYOUT_LABELS, useProjectTabsLayout, type ProjectTabsLayout } from "./ProjectTabs";
import { PROJECT_HEADER_MODE_LABELS, PROJECT_HEADER_MODES, useProjectHeaderMode, type ProjectHeaderMode } from "./headerMode";
import { CHAT_PLACEMENT_LABELS, useChatPlacement, type ChatPlacement } from "./chatPlacement";

/** プロジェクトの見出しの出し方 */
export function ProjectHeaderField() {
  const [projectHeaderMode, setProjectHeaderMode] = useProjectHeaderMode();
  const sidebarKey = useCommandKeys("sidebar.toggle");
  // 下のパネルのキーは 2 つ（⌃` と ⌘J）のうち、⌘ のほう（いちばん後ろ）を書く
  const bottomKey = useCommandKeyList("terminal.toggleBottom").at(-1);
  const rightKey = useCommandKeys("projects.toggleRightSidebar");
  return (
    <ChoiceField<ProjectHeaderMode>
      label="プロジェクトの見出し"
      groupLabel="プロジェクトの見出しの出し方"
      help={`プロジェクトの画面のいちばん上の、名前・設定・状態ごとの数・作業中と待ちのチャットの一覧のボタンが並ぶ行です。「寄せたときだけ表示」は、マウスを画面の上端に寄せると画面の上に重ねて出し、ふだんは縦の幅を取りません。表示のとき以外は、右上のサイドバー・ターミナル・右サイドバーの開閉のボタンも一緒に隠します（${sidebarKey}・${bottomKey}・${rightKey} はそのまま使えます）。見出しの右クリックでも切り替えられます。`}
      value={projectHeaderMode}
      onChange={setProjectHeaderMode}
      options={PROJECT_HEADER_MODES.map((m) => ({ value: m, label: PROJECT_HEADER_MODE_LABELS[m] }))}
    />
  );
}

/** プロジェクトのタブの置き方 */
export function ProjectTabsField() {
  const [tabsLayout, setTabsLayout] = useProjectTabsLayout();
  return (
    <ChoiceField<ProjectTabsLayout>
      label="プロジェクトのタブ"
      groupLabel="プロジェクトのタブの置き方"
      help="左に縦並びにすると、ボード・ファイルなどのタブをアイコンだけにして本体の左に並べます。見出しの下の行がなくなるので、ボードやチャット欄の縦の幅が少し広がります。"
      value={tabsLayout}
      onChange={setTabsLayout}
      options={[
        { value: "top", label: PROJECT_TABS_LAYOUT_LABELS.top },
        { value: "side", label: PROJECT_TABS_LAYOUT_LABELS.side },
      ]}
    />
  );
}

/** チャットを開く場所（チャットタブ / ボードの右） */
export function ChatPlacementField() {
  const [chatPlacement, setChatPlacement] = useChatPlacement();
  return (
    <ChoiceField<ChatPlacement>
      label="チャットを開く場所"
      help="チャットタブで開くと、ボードと分けた「チャット」タブにチャットを横幅いっぱいに出し、ボードのカードを押すとそのタブへ移ります。ボードの右で開くと、ボードを見ながら右のパネルでチャットを開きます。どちらも同じタブなので、切り替えても開いているチャットはそのままです。"
      value={chatPlacement}
      onChange={setChatPlacement}
      options={[
        { value: "separate", label: CHAT_PLACEMENT_LABELS.separate },
        { value: "together", label: CHAT_PLACEMENT_LABELS.together },
      ]}
    />
  );
}
