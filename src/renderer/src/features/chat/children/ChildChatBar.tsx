import { ArrowUpLeft, ChevronRight, Inbox } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { childDepthLabel } from "@shared/chat/childDepth";
import type { Chat, ChatEvent } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { useChatStates } from "@/app/chatStatesContext";
import { knownChat, useChatsValue, useKnownChat } from "@/stores/chats";
import { ancestorsOf, handBackText } from "./childChats";
import { handBackToParent, revealInParent } from "./openChild";

/** 系譜を出す数（これより深ければ、根と親の間を「…」にまとめる） */
const MAX_CRUMBS = 2;

/** 親の会話で聞いた位置（押したときに見せる子。送る前の新しい子チャットは ID がないので、親の画面を見せるだけ） */
type Below = Pick<Chat, "id" | "parent_chat_id" | "parent_event_id">;

/**
 * 子チャットの上の帯（別ウィンドウ・右の欄で共通）: 左に親チャットまでの系譜（根 › … › 親 › この子チャット。親は状態の印と名前の札で、
 * 押すとその親の、聞いた発言へ）と、深さの呼び名（子・孫・ひ孫チャット）・右にメインチャットに渡す（いちばん新しい答えを引用にして親の入力欄へ。送るのは自分で）。
 * 閉じるのは、右の欄はタブの ×、別ウィンドウは ✕・最小化（子チャットは残り、親の会話の札から開き直せる）
 */
export function ChildChatBar({
  chat,
  events,
  extra,
}: {
  chat: Chat;
  events: readonly ChatEvent[];
  /** 右の端に足すボタン（別ウィンドウの「右の欄に戻す」） */
  extra?: ReactNode;
}) {
  // いちばん新しいメインの AI の返答（サブエージェントの文は除く）
  const answer = [...events].reverse().find((e) => e.type === "text" && !e.data.parent);
  const answerText = answer?.type === "text" ? answer.data.text : "";
  if (chat.parent_chat_id === null) return <ChildBarFrame parentId={null} self={chat} title={chatTitle(chat.title)} extra={extra} />;
  return (
    <ChildBarFrame
      parentId={chat.parent_chat_id}
      self={chat}
      title={chatTitle(chat.title)}
      handBack={{ disabled: !answerText, run: () => handBackToParent(chat, handBackText(chat, answerText)) }}
      extra={extra}
    />
  );
}

/**
 * 送る前の新しい子チャット（右の欄の「新しい子チャット」のタブ）の上の帯。作ったあとの子チャットと同じ形で、親までの系譜・深さの呼び名を出す
 * （親とのつながりは作る前から決まっているので、送る前から見せる）。メインチャットに渡すは、答えがまだないので押せない
 */
export function NewChildBar({ parentId }: { parentId: number }) {
  return <ChildBarFrame parentId={parentId} self={null} title="新しい子チャット" handBack={{ disabled: true, run: () => {} }} />;
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
  /** この子チャット（送る前は null） */
  self: Below | null;
  title: string;
  handBack?: { disabled: boolean; run: () => void };
  extra?: ReactNode;
}) {
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
  const shown = crumbs.length > MAX_CRUMBS ? [crumbs[0], null, ...crumbs.slice(-(MAX_CRUMBS - 1))] : crumbs;
  // 親の札を押したとき: その親の画面を見せ、すぐ下の子を聞いた発言へ（送る前の子チャットは、聞いた位置がないので親を見せるだけ）
  const reveal = (belowId: number | null, ownerId: number) => {
    const below: Below | undefined = belowId !== null ? knownChat(belowId) : (self ?? { id: -1, parent_chat_id: ownerId, parent_event_id: null });
    if (below) revealInParent(below);
  };
  return (
    <div className="child-chat-bar">
      {parentId !== null && (
        <nav className="child-chat-lineage" aria-label="親チャット">
          <span className="child-chat-lineage-lead" aria-hidden>
            <ArrowUpLeft size={13} />
            <span className="child-chat-lineage-lead-text">親</span>
          </span>
          {shown.length === 0 ? (
            // 親が読み込んだ一覧にない（アーカイブ済みなど）: 名前は出さずに開くだけ
            <button type="button" className="child-chat-crumb" data-tip="親のチャットの、聞いた位置を見る" onClick={() => reveal(null, parentId)}>
              親のチャット
            </button>
          ) : (
            shown.map((crumb, i) => {
              const item = crumb ? <ParentCrumb id={crumb.id} onReveal={() => reveal(crumb.below, crumb.id)} /> : <span className="muted">…</span>;
              const sep = <ChevronRight size={12} className="child-chat-lineage-sep" aria-hidden />;
              // 親より上（根の側）は、狭い帯では隠して親だけを残す（.child-chat-lineage-up）
              return i < shown.length - 1 ? (
                <span key={crumb?.id ?? "more"} className="child-chat-lineage-up">
                  {item}
                  {sep}
                </span>
              ) : (
                <Fragment key={crumb?.id ?? "more"}>
                  {item}
                  {sep}
                </Fragment>
              );
            })
          )}
          {shown.length === 0 && <ChevronRight size={12} className="child-chat-lineage-sep" aria-hidden />}
        </nav>
      )}
      {/* 深さで呼び名と色を変える（子・孫・ひ孫） */}
      <span className={`child-chat-bar-label child-depth-${Math.min(depth, 3)}`}>{childDepthLabel(depth)}</span>
      <span className="child-chat-bar-title">{title}</span>
      <span className="spacer" />
      {handBack && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={handBack.disabled}
          title="いちばん新しい答えを、引用として親のチャットの入力欄に入れる（送るのは自分で）"
          onClick={handBack.run}
        >
          <Inbox size={13} aria-hidden />
          <span className="child-chat-hand-back-text">メインチャットに渡す</span>
        </button>
      )}
      {extra}
      {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
      <PopOutTabButton />
    </div>
  );
}

/** 系譜の親の札（状態の印と名前）。押すと、その親の会話の、すぐ下の子を聞いた位置へ */
function ParentCrumb({ id, onReveal }: { id: number; onReveal: () => void }) {
  const parent = useKnownChat(id);
  const { stateOf } = useChatStates();
  if (!parent) return null;
  const name = chatTitle(parent.title);
  return (
    <button type="button" className="child-chat-crumb" data-tip={`親のチャット「${name}」の、聞いた位置を見る`} onClick={onReveal}>
      <StatusSlot state={stateOf(parent)} />
      <span className="child-chat-crumb-name">{name}</span>
    </button>
  );
}
