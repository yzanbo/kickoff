import { Bot, ChevronDown, MessageSquarePlus, MessagesSquare, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Chat } from "@shared/chat/types";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { openChat } from "@/features/chat/ui";
import { chatSubagents } from "@/features/subagents/ui";
import { useOptionalSubagentNav } from "@/features/chat/ui";
import { flattenTree } from "@/features/subagents/ui/model/subagentTree";
import { openTab, parsePanelKey } from "@/features/panel/ui";
import { canShowProjectView, projectViews, projectViewTab, type ProjectViewDef } from "@/features/projects/ui";
import type { PaneLeaf, PanelController } from "@/features/panel/ui";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { subagentsSettings } from "@/features/subagents/ui";
import { useChildChats, useKnownChat } from "@/features/chat/ui/store/knownChats";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuSub } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useNewChild } from "./useNewChild";
import { chatSideAdds, type ChatSideAdd } from "@/features/chatPanel/ui/chatSideAdds";

/**
 * 右の欄のタブの列の新しいタブのボタン: 「新しい子チャット」と、横の ▾ で、ほかに右の欄に開けるもののメニュー（2 つを 1 つのボタンに見せる .panel-split-button）。
 * メニューは 新しい子チャット ｜ 子チャット ▸（このチャットの子）・サブエージェント ▸（アーカイブしたものは除く）｜ プロジェクトの画面（画面の表 projectViews の初めの並び。
 * ファイル・検索・変更・履歴 ｜ ノート ▸・DB ▸・Docker・GitHub・CI・ゴミ箱。作業場所はこのチャットの作業場所から。DB・Docker・GitHub・CI はこの Mac のアプリの中だけ。
 * ノート・DB・変更は持ち主の機能が chatSideAdds で出すもの = 最近変えた 12 件・DB クライアントと接続ごとの新しい SQL のタブ・右の欄向けの変更のタブ）。
 * どれも設定の開き方によらず、この右の欄に開く（▸ の一覧が空なら押せない）。欄のチャットが子チャットを作れないとき（useNewChild）は出さない
 */
export function AgentPanelAdds({ panel, pane }: { panel: PanelController; pane: PaneLeaf }) {
  const menu = useContextMenu({ align: "end" });
  const newChild = useNewChild(panel);
  if (!newChild) return null;
  const onNewChild = () => {
    panel.focusPane(pane.id);
    newChild();
  };
  return (
    <span className="panel-bar-buttons panel-tab-adds">
      <span className="panel-split-button">
        <IconButton icon={MessageSquarePlus} label="新しい子チャット" iconSize={14} onClick={onNewChild} />
        <IconButton
          icon={ChevronDown}
          label="右の欄に開く"
          title="新しい子チャット・子チャット・サブエージェント・ファイル・検索・変更・履歴・ノート・DB から選んで、右の欄に開く"
          iconSize={12}
          className="panel-open-with agent-panel-adds-more"
          aria-haspopup="menu"
          aria-expanded={menu.isOpen}
          onClick={(e) => menu.toggle(e)}
        />
      </span>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="右の欄に開く" ignore=".agent-panel-adds-more" onClose={menu.close}>
          <AgentPanelAddItems panel={panel} onNewChild={onNewChild} />
        </PopupMenu>
      )}
    </span>
  );
}

/** 右の欄にタブがないときの案内（新しい子チャットを開けるときだけ、その文とボタンを足す） */
export function AgentPanelEmpty({ panel, pane, hint }: { panel: PanelController; pane: PaneLeaf; hint: string | undefined }) {
  const newChild = useNewChild(panel);
  return (
    <>
      {hint && <p className="muted small">{newChild ? `${hint}「＋」で新しい子チャットを始められます。` : hint}</p>}
      {newChild && (
        <button
          className="btn"
          onClick={() => {
            panel.focusPane(pane.id);
            newChild();
          }}
        >
          <MessageSquarePlus size={14} /> 新しい子チャット
        </button>
      )}
    </>
  );
}

/** メニューの中身（開いている間だけ描くので、一覧はこのときだけ読む） */
function AgentPanelAddItems({ panel, onNewChild }: { panel: PanelController; onNewChild: () => void }) {
  const at = parsePanelKey(panel.key);
  const chatId = at && typeof at.scope === "number" ? at.scope : 0;
  const chat = useKnownChat(chatId);
  const subagentNav = useOptionalSubagentNav();
  // チャットの店の取り出し口を直接読む（会話の欄が配る context は、右の欄の外にある）
  const { tree } = chatSubagents.useFor(chatId);
  const [archivedKeys] = useSetting(subagentsSettings.archived(chatId));
  const children = (useChildChats().get(chatId) ?? []).filter((c) => c.archived_at === null);
  // サブエージェントは入れ子を親のすぐ下に（入力欄の上の一覧と同じ並び）。アーカイブしたものは出さない
  const subagents = flattenTree(tree).filter(({ entry }) => !archivedKeys.includes(entry.key));
  if (!chat) return null;
  // プロジェクトの画面（右の欄に置ける画面と、持ち主が代わりのものを出す画面）。コードのまとまりの前後に線を引く
  const adds = new Map(chatSideAdds.items().map((a) => [a.view, a]));
  const views = projectViews.items().filter((v) => (v.places.includes("chatSide") || adds.has(v.id)) && canShowProjectView(v));
  return (
    <>
      <MenuItem title="入力欄だけの新しい子チャットのタブを開く（最初の文を送ると子チャットができます）" onSelect={onNewChild}>
        <MessageSquarePlus size={14} /> 新しい子チャット
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <SubmenuItem icon={MessagesSquare} label="子チャット" empty={children.length === 0 ? "子チャットはありません" : null}>
        {children.map((c) => (
          <MenuItem key={c.id} title={chatTitle(c.title)} onSelect={() => openChat(c, "side")}>
            {chatTitle(c.title)}
          </MenuItem>
        ))}
      </SubmenuItem>
      {subagentNav && (
        <SubmenuItem icon={Bot} label="サブエージェント" empty={subagents.length === 0 ? "サブエージェントはいません" : null}>
          {subagents.map(({ entry, depth }) => (
            <MenuItem
              key={entry.key}
              title={entry.description}
              buttonProps={depth > 0 ? { style: { paddingLeft: `calc(10px + ${Math.min(depth, 4)} * 12px)` } } : undefined}
              onSelect={() => subagentNav.openSide(entry.key)}
            >
              {depth > 0 && <span aria-hidden>↳</span>}
              {entry.description}
            </MenuItem>
          ))}
        </SubmenuItem>
      )}
      <div className="menu-separator" role="separator" />
      {views.map((def, i) => {
        const prev = views[i - 1];
        const line = prev !== undefined && prev.group !== def.group && (prev.group === "code" || def.group === "code");
        return (
          <Fragment key={def.id}>
            {line && <div className="menu-separator" role="separator" />}
            <ProjectViewItem def={def} add={adds.get(def.id)} chat={chat} panelKey={panel.key} />
          </Fragment>
        );
      })}
    </>
  );
}

/** プロジェクトの画面を、この右の欄に開く項目（持ち主が代わりのものを出していれば、その動き・子のメニュー） */
function ProjectViewItem({ def, add, chat, panelKey }: { def: ProjectViewDef; add: ChatSideAdd | undefined; chat: Chat; panelKey: string }) {
  // 作業場所に付く画面は、このチャットの作業場所から
  const worktree = def.followsWorkplace ? (chat.worktree_path ?? undefined) : undefined;
  const props = { chat, panelKey, openView: () => openTab(panelKey, projectViewTab({ chatId: chat.id, projectId: chat.project_id, view: def.id, ...(worktree ? { worktree } : {}) })) };
  if (add?.Submenu) {
    return (
      <SubmenuItem icon={def.icon} label={def.label} empty={null}>
        <add.Submenu {...props} />
      </SubmenuItem>
    );
  }
  const about = def.chatSide?.about ? `（${def.chatSide.about}）` : "";
  const title = add?.title ?? `プロジェクトの「${def.label}」タブと同じ画面${about}を開く${def.followsWorkplace ? "（このチャットの作業場所から）" : ""}`;
  return (
    <MenuItem title={title} onSelect={() => (add?.open ? add.open(props) : props.openView())}>
      <def.icon size={14} /> {def.label}
    </MenuItem>
  );
}

/** 横に一覧を開く項目（一覧が空なら押せない項目にして、理由を説明に出す） */
function SubmenuItem({
  icon: Icon,
  label,
  empty,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** 一覧が空のときの説明（空でなければ null） */
  empty: string | null;
  children: ReactNode;
}) {
  if (empty !== null) {
    return (
      <MenuItem disabled title={empty} onSelect={() => {}}>
        <Icon size={14} /> {label}
      </MenuItem>
    );
  }
  return (
    <MenuSub icon={<Icon size={14} />} label={label} menuLabel={label}>
      {children}
    </MenuSub>
  );
}
