import "./ChildChatBar.css";
import { ArrowUpLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { childDepthLabel } from "@shared/childChats/childDepth";
import type { Chat } from "@shared/chat/types";
import { latestAnswer, chatTitle, ChatStateMark, ancestorsOf, LineageTrail, ChatTitleInput, useChatRename, type ChatTitleEditor, knownChat, useChatsValue, useKnownChat } from "@/features/chat/ui";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { alert } from "@/foundation/ui/kit/ask";
import { handBackText } from "./childChats";
import { handBackToParent, revealInParent } from "./askChild";
import { requestHandoff } from "./handBack";
import { DetachSubmenu } from "./DetachSubmenu";
import { HandBackMenu, type HandBack } from "./HandBackMenu";
import { useClickOrDouble } from "./clickOrDouble";
import { PopOutTabButton } from "@/features/panel/ui";

/** 系譜を出す数（これより深ければ、根と親の間を「…」にまとめる） */
const MAX_CRUMBS = 2;

/** 親の会話で聞いた位置（押したときに見せる子。送る前の新しい子チャットは ID がないので、親の画面を見せるだけ） */
type Below = Pick<Chat, "id" | "parent_chat_id" | "parent_event_id">;

/**
 * 子チャットの上の帯（別ウィンドウ・右の欄で共通）: 左に親チャットまでの系譜（根 › … › 親 › この子チャット。親は状態の印と名前の札で、
 * 押すとその親の、聞いた発言へ）と、深さの呼び名（子・孫・ひ孫チャット）・右に「親チャットに渡す ▾」（依頼文を作ってもらう = この子チャットの AI に親への依頼文を
 * 書いてもらう / 最新の答えを引用して渡す = いちばん新しい答えを引用にして親の入力欄へ。送るのは自分で）。
 * 親の札とこの子チャットの名前は、ダブルクリックでその場で名前を変える。帯を右クリックすると「親から外す ▸」（DetachSubmenu）。
 * 閉じるのは、右の欄はタブの ×、別ウィンドウは ✕・最小化（子チャットは残り、親の会話の札から開き直せる）
 */
export function ChildChatBar({
  chat,
  extra,
}: {
  chat: Chat;
  /** 右の端に足すボタン（別ウィンドウの「右の欄に戻す」） */
  extra?: ReactNode;
}) {
  // いちばん新しいメインの AI の返答（サブエージェントの文は除く。文が変わったときだけ描き直す = 会話の欄を隠していても、記録のたびには描き直さない）
  const answerText = latestAnswer.useFor(chat.id);
  if (chat.parent_chat_id === null) return <ChildBarFrame parentId={null} self={chat} title={chatTitle(chat.title)} extra={extra} />;
  return (
    <ChildBarFrame
      parentId={chat.parent_chat_id}
      self={chat}
      title={chatTitle(chat.title)}
      handBack={{
        request: chat.archived_at ? undefined : () => void requestHandoff(chat),
        quote: answerText ? () => handBackToParent(chat, handBackText(chat, answerText)) : undefined,
      }}
      extra={extra}
    />
  );
}

/**
 * 送る前の新しい子チャット（右の欄の「新しい子チャット」のタブ）の上の帯。作ったあとの子チャットと同じ形で、親までの系譜・深さの呼び名を出す
 * （親とのつながりは作る前から決まっているので、送る前から見せる）。親チャットに渡すは、会話がまだないので押せない
 */
export function NewChildBar({ parentId }: { parentId: number }) {
  return <ChildBarFrame parentId={parentId} self={null} title="新しい子チャット" handBack={{}} />;
}

function ChildBarFrame({
  parentId,
  self,
  title,
  handBack,
  extra,
}: {
  /** 親（親のないチャットは null。帯の系譜を出さない） */
  parentId: number | null;
  /** この子チャット（送る前は null。名前は変えられない） */
  self: Chat | null;
  title: string;
  /** 親チャットに渡す ▾ の項目（できないものは undefined。どちらもなければボタンを押せない） */
  handBack?: HandBack;
  extra?: ReactNode;
}) {
  // 親の札・この子チャットの名前は、ダブルクリックでその場で名前を変える（同時に変えるのは 1 つだけ）
  const rename = useChatRename();
  // 帯の右クリック: 子チャットなら「親から外す ▸」（名前の入力欄では文字の既定のメニューのまま）
  const detachMenu = useContextMenu();
  const selfEditor = self ? rename.editorFor(self) : undefined;
  // この子の祖先の ID（根 → 親。親の名前・状態は札ごとに引くので、ここでは ID の並びが変わったときだけ描き直す）
  const ancestorKey =
    useChatsValue(() => {
      const parent = parentId === null ? undefined : knownChat(parentId);
      return parent ? [...ancestorsOf(parent, knownChat), parent].map((c) => c.id).join(",") : "";
    }) ?? "";
  const ancestors = ancestorKey ? ancestorKey.split(",").map(Number) : [];
  // 根から何段目か（親が読み込んだ一覧になければ子として出す）
  const depth = Math.max(ancestors.length, 1);
  // 札ごとに、押したときに見せる「聞いた位置」は、その札のすぐ下の子のもの（いちばん下の親は、この子チャット）
  const crumbs = ancestors.map((id, i) => ({ id, below: ancestors[i + 1] ?? null }));
  // 親の札を押したとき: その親の画面を見せ、すぐ下の子を聞いた発言へ（送る前の子チャットは、聞いた位置がないので親を見せるだけ）
  const reveal = (belowId: number | null, ownerId: number) => {
    const below: Below | undefined = belowId !== null ? knownChat(belowId) : (self ?? { id: -1, parent_chat_id: ownerId, parent_event_id: null });
    if (below) revealInParent(below);
  };
  return (
    <div
      className="child-chat-bar"
      onContextMenu={
        self && self.parent_chat_id !== null
          ? (e) => {
              if (!(e.target instanceof HTMLInputElement)) detachMenu.open(e);
            }
          : undefined
      }
    >
      {parentId !== null && (
        <LineageTrail
          className="child-chat-lineage"
          label="親チャット"
          lead={
            <span className="child-chat-lineage-lead" aria-hidden>
              <ArrowUpLeft size={13} />
              <span className="child-chat-lineage-lead-text">親</span>
            </span>
          }
          items={
            crumbs.length === 0
              ? // 親が読み込んだ一覧にない（アーカイブ済みなど）: 名前は出さずに開くだけ
                [
                  {
                    key: "parent",
                    node: (
                      <button type="button" className="child-chat-crumb pill" data-tip="親のチャットの、聞いた位置を見る" onClick={() => reveal(null, parentId)}>
                        親のチャット
                      </button>
                    ),
                  },
                ]
              : crumbs.map((crumb) => ({ key: crumb.id, node: <ParentCrumb id={crumb.id} rename={rename} onReveal={() => reveal(crumb.below, crumb.id)} /> }))
          }
          sep={<ChevronRight size={12} className="child-chat-lineage-sep" aria-hidden />}
          trailing
          max={MAX_CRUMBS}
          // 親より上（根の側）は、狭い帯では隠して親だけを残す
          upClassName="child-chat-lineage-up"
        />
      )}
      {/* 深さで呼び名と色を変える（子・孫・ひ孫） */}
      <span className={`child-chat-bar-label tag child-depth-${Math.min(depth, 3)}`}>{childDepthLabel(depth)}</span>
      {self && selfEditor ? (
        <span className="child-chat-bar-title editing">
          <ChatTitleInput chat={self} editor={selfEditor} className="child-chat-title-input" />
        </span>
      ) : (
        <span
          className="child-chat-bar-title"
          data-tip={self ? `${title}（ダブルクリックで名前を変更）` : undefined}
          onDoubleClick={self ? () => rename.start(self) : undefined}
        >
          {title}
        </span>
      )}
      <span className="spacer" />
      {handBack && <HandBackMenu handBack={handBack} />}
      {extra}
      {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
      <PopOutTabButton />
      {detachMenu.menu && self && (
        <PopupMenu at={detachMenu.menu.at} label="子チャットの操作" onClose={detachMenu.close}>
          <DetachSubmenu chat={self} onClose={detachMenu.close} onError={(message) => void alert("親から外せませんでした", message)} />
        </PopupMenu>
      )}
    </div>
  );
}

type ChatRename = ReturnType<typeof useChatRename>;

/**
 * 系譜の親の札（状態の印と名前）。押すと、その親の会話の、すぐ下の子を聞いた位置へ。ダブルクリックでその場で名前を変える
 * （1 回押したときは少し待ってから移る。すぐ移ると、移った先の流れにピントが移り、開いた名前の入力欄が閉じるため。キーの Enter・Space はすぐ移る）
 */
function ParentCrumb({ id, rename, onReveal }: { id: number; rename: ChatRename; onReveal: () => void }) {
  const parent = useKnownChat(id);
  // 1 回押しは少し待ってから移る（その間にもう一度押せば名前の変更。キーで押したらすぐ。待っている間に帯が消えたら移らない）
  const press = useClickOrDouble(onReveal, () => parent && rename.start(parent));
  if (!parent) return null;
  const name = chatTitle(parent.title);
  const editor: ChatTitleEditor | undefined = rename.editorFor(parent);
  if (editor) {
    return (
      <span className="child-chat-crumb pill editing">
        <ChatStateMark chat={parent} />
        <ChatTitleInput chat={parent} editor={editor} className="child-chat-title-input" />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="child-chat-crumb pill"
      data-tip={`親のチャット「${name}」の、聞いた位置を見る（ダブルクリックで名前を変更）`}
      onClick={press}
    >
      <ChatStateMark chat={parent} />
      <span className="child-chat-crumb-name">{name}</span>
    </button>
  );
}
