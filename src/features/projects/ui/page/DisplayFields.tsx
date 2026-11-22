// プロジェクトの画面が設定の「表示」に出す欄: 見出し・タブ・チャットを開く場所
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { PROJECT_TABS_LAYOUT_LABELS, useProjectTabsLayout, type ProjectTabsLayout } from "./ProjectTabs";
import { PROJECT_HEADER_MODE_LABELS, PROJECT_HEADER_MODES, useProjectHeaderMode, type ProjectHeaderMode } from "./headerMode";
import { CHAT_PLACEMENT_LABELS, useChatPlacement, type ChatPlacement } from "./chatPlacement";

/** プロジェクトの見出しの出し方 */
export function ProjectHeaderField() {
  const [projectHeaderMode, setProjectHeaderMode] = useProjectHeaderMode();
  return (
    <Field
      label="プロジェクトの見出し"
      help="プロジェクトの画面のいちばん上の、名前・設定・状態ごとの数・作業中と待ちのチャットの一覧のボタンが並ぶ行です。「寄せたときだけ表示」は、マウスを画面の上端に寄せると画面の上に重ねて出し、ふだんは縦の幅を取りません。表示のとき以外は、右上のサイドバー・ターミナル・右サイドバーの開閉のボタンも一緒に隠します（⌘B・⌘J・⌥⌘B はそのまま使えます）。見出しの右クリックでも切り替えられます。"
    >
      <Segmented<ProjectHeaderMode>
        label="プロジェクトの見出しの出し方"
        value={projectHeaderMode}
        onChange={setProjectHeaderMode}
        options={PROJECT_HEADER_MODES.map((m) => ({ value: m, label: PROJECT_HEADER_MODE_LABELS[m] }))}
      />
    </Field>
  );
}

/** プロジェクトのタブの置き方 */
export function ProjectTabsField() {
  const [tabsLayout, setTabsLayout] = useProjectTabsLayout();
  return (
    <Field label="プロジェクトのタブ" help="左に縦並びにすると、ボード・ファイルなどのタブをアイコンだけにして本体の左に並べます。見出しの下の行がなくなるので、ボードやチャット欄の縦の幅が少し広がります。">
      <Segmented<ProjectTabsLayout>
        label="プロジェクトのタブの置き方"
        value={tabsLayout}
        onChange={setTabsLayout}
        options={[
          { value: "top", label: PROJECT_TABS_LAYOUT_LABELS.top },
          { value: "side", label: PROJECT_TABS_LAYOUT_LABELS.side },
        ]}
      />
    </Field>
  );
}

/** チャットを開く場所（チャットタブ / ボードの右） */
export function ChatPlacementField() {
  const [chatPlacement, setChatPlacement] = useChatPlacement();
  return (
    <Field
      label="チャットを開く場所"
      help="チャットタブで開くと、ボードと分けた「チャット」タブにチャットを横幅いっぱいに出し、ボードのカードを押すとそのタブへ移ります。ボードの右で開くと、ボードを見ながら右のパネルでチャットを開きます。どちらも同じタブなので、切り替えても開いているチャットはそのままです。"
    >
      <Segmented<ChatPlacement>
        label="チャットを開く場所"
        value={chatPlacement}
        onChange={setChatPlacement}
        options={[
          { value: "separate", label: CHAT_PLACEMENT_LABELS.separate },
          { value: "together", label: CHAT_PLACEMENT_LABELS.together },
        ]}
      />
    </Field>
  );
}
