// チャットの AI が、同じ家系のチャット（いちばん上の親チャットから下にぶら下がるチャットの全部）の名前・固定・グループを変え、子チャットを親から外す
// （kickoff_chat の list_family_chats・update_chat の中身。プロバイダーに依らない）。
// 名前・固定・グループは利用者がいつでも戻せるので、聞かずに変える（権限モード・Auto mode によらず承認カードを出さない）。親から外すのも聞かないが、
// 戻せないので、ツールの説明で利用者に頼まれたときだけ使うよう伝える。
// 家系の外のチャットは、同じプロジェクトなら名前だけ変えられる（別のチャットから【済】を付けるなど）。
// 固定・グループ・親から外すは家系の中だけ。読み書きは店（store.chats・store.groups）を通し、変えたら店の知らせで画面に届く。
// 共通のチャットからは、ほかのプロジェクトのチャットの名前・固定・グループも変えられる（ほかのプロジェクトへの書き込みなので、設定に従って承認カードで聞く。aiWriteApproval.ts）。
// ツールの定義（入力の形・説明・使い方）もここ（組は familyToolGroup。order 30）
import { z } from "zod";
import { defineAiTool, type AiApprovalCard, type AiApprovalDecision, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { errorMessage } from "@shared/foundation/errors";
import { CHAT_TITLE_MAX, chatName, type Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import { familyOf } from "@/features/chat/core/family";
import type { ChatDetachPort } from "@/features/chat/core/ports";
import { applyChatUpdate, planChatUpdate, refusedAs } from "@/features/chat/core/update";
import { toolChat } from "./context";
import { approveAiWrite } from "./aiWriteApproval";
import { isCommonChatProject, isCommonChatTurn, projectForTool, projectRefInput, readableProjects } from "./projectScope";

/** 名前・固定・グループを変えるツールの使い方（MCP の instructions として AI に渡す） */
const FAMILY_INSTRUCTIONS = [
  "list_family_chats は、このチャットと同じ家系のチャット（いちばん上の親チャットから下にぶら下がるチャット: 自分・親・祖父母・兄弟・子・孫など）の一覧（ID・名前・関係・固定・グループ）と、同じプロジェクトのグループの一覧を返す。",
  "update_chat は、同じ家系のチャットの名前（title）・固定（pinned）・グループ（group_id）を、利用者に聞かずに変える（利用者はいつでも戻せる）。名前（title）だけは、家系の外でも同じプロジェクトのチャットなら変えられる。chat_id は必ず書く（自分のチャットでも。自分の ID は指示に添えた文脈にある）。兄弟などの ID が分からなければ、先に list_family_chats（家系の外は list_project_chats）で確かめる。",
  "省いた項目は変わらない。頼まれた項目だけを渡す。group_id: null はグループから外す。グループは作れず、選べるのは list_family_chats の groups だけ。子チャットはグループに入らない。家系の外のチャットは名前しか変えられない（固定・グループ・親から外すは断る）。",
  "parent_id は子チャットを親から外す: null で親のないチャット（サイドバーの一覧・グループに並ぶチャット。group_id を一緒に渡せばそのグループへ）、自分の先祖（親の親より上）の ID でその子に上げる。ほかのチャットの下へは付け替えられない。外したら親の下へは戻せないので、利用者に「親から外して」「親のないチャットにして」などと頼まれたときだけ使う。作業中のチャットは外せない。",
  "利用者が「タイトルに【済】を付けて」「このチャットを固定して」のように頼んだときに使う。頼まれていないのに名前などを変えない。",
];

/** 共通のチャットにだけ足す使い方（ほかのプロジェクトのチャットを変える） */
const COMMON_FAMILY_INSTRUCTIONS = [
  "このチャットは共通のチャットなので、update_chat で、アーカイブしていない利用者のプロジェクトのチャットの名前（title）・固定（pinned）・グループ（group_id）も変えられる（chat_id は list_project_chats に project を渡して確かめる。グループはその一覧の groups から）。ほかのプロジェクトへの書き込みなので、利用者の設定によっては承認を聞く。親から外す（parent_id）は、ほかのプロジェクトのチャットにはできない。",
];

/** update_chat の入力（省いた項目は変えない。group_id は null のときだけグループから外す） */
const UPDATE_CHAT_INPUT = {
  // 省いたら自分、にしない（書き忘れで黙って自分の名前が変わる）
  chat_id: z.number().int().describe("変えるチャットの ID（必須。自分のチャットでも書く。分からなければ list_family_chats・list_project_chats で確かめる）"),
  project: projectRefInput("変えるチャットの"),
  title: z.string().min(1).max(CHAT_TITLE_MAX).optional().describe("新しい名前（省くと変えない）"),
  pinned: z.boolean().optional().describe("固定する（true）・外す（false）。省くと変えない"),
  group_id: z.number().int().nullable().optional().describe("入れるグループの ID（list_family_chats の groups から）。null でグループから外す。省くと変えない"),
  parent_id: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("子チャットを親から外す: null で親のないチャットにする、自分の先祖の ID でその子に上げる。外したら戻せないので、利用者に頼まれたときだけ。省くと変えない"),
};
type UpdateChatInput = z.infer<z.ZodObject<typeof UPDATE_CHAT_INPUT>>;

/** 共通のチャットから変える、ほかのプロジェクトのチャットとそのプロジェクト */
interface OtherTarget {
  target: Chat;
  project: Project;
}

/** 家系のツールに使うもの（親から外すのは childChats の口。作業中のチャットは childChats が断る） */
interface AiChatEditDeps {
  store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects" | "groups">;
  detach?: ChatDetachPort;
}

/** 名前・固定・グループを変えるツールの中身（AI に返す文。変えられなければ理由の文で throw） */
export interface AiChatEditTools {
  listFamily(): string;
  /** 同じプロジェクトのチャットは聞かずに変え、共通のチャットからほかのプロジェクトのチャットを指したら設定に従って ask で聞いてから変える */
  update(input: UpdateChatInput, ask: (card: AiApprovalCard) => Promise<AiApprovalDecision>): Promise<string>;
}

/** 決まりが断ったら、AI に返す理由の文で投げ直す */
function refusedForAi<T>(fn: () => T, input: Pick<UpdateChatInput, "group_id">): T {
  const groupGone = () => new Error(`グループ ID ${input.group_id} はこのプロジェクトにありません（ほかのプロジェクトのグループ・ないグループは選べず、グループは作りません）。list_family_chats の groups から選んでください`);
  return refusedAs(fn, {
    title_empty: () => new Error("名前（title）が空です"),
    title_long: () => new Error(`名前（title）は ${CHAT_TITLE_MAX} 文字までです`),
    child_group: () => new Error("子チャットはグループに入りません（グループを変えられるのは親のないチャットだけです。parent_id: null で親から外すなら、一緒にグループへ入れられます）"),
    group_missing: groupGone,
    group_other_project: groupGone,
  });
}

/** 家系の外のチャットの名前を変える（同じプロジェクトのチャットの名前だけ。ほかの項目・ほかのプロジェクトは断る） */
function renameOutsideFamily(store: Pick<ChatStoreDeps, "chats" | "events" | "settings" | "projects" | "groups">, self: Chat, input: UpdateChatInput): string {
  const target = toolChat(store.chats, self.id).chatInProject(self, input.chat_id, "list_family_chats・list_project_chats で ID を確かめてください");
  if (input.pinned !== undefined || input.group_id !== undefined || input.parent_id !== undefined) {
    throw new Error(
      `チャット ID ${input.chat_id} は、このチャットの家系（いちばん上の親チャットから下にぶら下がるチャット）にありません。家系の外のチャットは名前（title）だけ変えられます（固定・グループ・親から外すは同じ家系のチャットだけ）`,
    );
  }
  const plan = refusedForAi(() => planChatUpdate({ store, requireIdle: () => {} }, target, { title: input.title ?? "" }), input);
  const title = plan.title ?? target.title;
  const label = `チャット「${chatName(title, "ai")}」（ID ${target.id}・ほかの家系）`;
  if (plan.title === undefined) return `${label}は、もともと頼まれた名前だったので変えていません。`;
  applyChatUpdate(store.chats, plan);
  return `${label}を変えました: 名前を「${chatName(target.title, "ai")}」から「${title}」に変えた。`;
}

/**
 * chatId のチャットの AI に渡す、家系のチャットの名前・固定・グループを変えるツールの中身。家系は呼ぶたびに引き直す
 * （作業の途中で子チャットが増えた・消えたら次の呼び出しから効く）
 */
export function createAiChatEditTools({ store, detach }: AiChatEditDeps, chatId: number): AiChatEditTools {
  const requireSelf = toolChat(store.chats, chatId).self;
  const groupOf = (chat: Chat) => {
    const group = chat.group_id === null ? undefined : store.groups.get(chat.group_id);
    return group ? { id: group.id, name: group.name } : null;
  };
  const notInProject = (input: UpdateChatInput, project: Project | undefined) =>
    new Error(`チャット ID ${input.chat_id} は${project ? `プロジェクト「${project.name}」` : "指せるプロジェクト"}にありません。list_project_chats に project を渡して ID を確かめてください`);
  /**
   * input が指す、ほかのプロジェクトのチャットとそのプロジェクト（共通のチャットからだけ。同じプロジェクトのチャットを指すなら null）。
   * given は input.project が指すプロジェクト（update が 1 回だけ引いたもの。プロジェクトのチャットでは projectForTool が自分のプロジェクトしか返さない）。
   * 指せないものは理由の文で throw
   */
  const otherTarget = (self: Chat, input: UpdateChatInput, given: Project | undefined): OtherTarget | null => {
    const target = store.chats.get(input.chat_id);
    if (given) {
      if (given.id === self.project_id) return null;
      if (!target || target.project_id !== given.id) throw notInProject(input, given);
      return { target, project: given };
    }
    if (!target || target.project_id === self.project_id || !isCommonChatProject(store.projects, self.project_id)) return null;
    const project = store.projects.get(target.project_id);
    if (!project || !readableProjects(store.projects, self).some((p) => p.id === project.id)) throw notInProject(input, project);
    return { target, project };
  };
  /** 共通のチャットから、ほかのプロジェクトのチャットの名前・固定・グループを変える（設定に従って ask で聞く） */
  const updateInOtherProject = async (input: UpdateChatInput, { target, project }: OtherTarget, ask: (card: AiApprovalCard) => Promise<AiApprovalDecision>): Promise<string> => {
    if (input.parent_id !== undefined) throw new Error("ほかのプロジェクトのチャットは親から外せません（parent_id は同じ家系のチャットだけ）");
    if (input.title === undefined && input.pinned === undefined && input.group_id === undefined) throw new Error("変える項目がありません。title・pinned・group_id のどれかを渡してください（省いた項目は変えません）");
    // 先にすべて確かめてから聞く（決まりは PATCH /api/chats/:id と同じ update.ts。グループはそのチャットのプロジェクトのものだけ）
    const planOn = (chat: Chat) => refusedForAi(() => planChatUpdate({ store, requireIdle: () => {} }, chat, { title: input.title, pinned: input.pinned, groupId: input.group_id }, { strictChildGroup: true }), input);
    const plan = planOn(target);
    const label = `プロジェクト「${project.name}」のチャット「${chatName(target.title, "ai")}」（ID ${target.id}）`;
    // 変えること（カードの「〜する」と、返事の「〜した」）
    const steps: [string, string][] = [];
    if (plan.title !== undefined) steps.push([`名前を「${plan.title}」に変える`, `名前を「${plan.title}」に変えた`]);
    if (plan.pinned !== undefined) steps.push(plan.pinned ? ["固定する", "固定した"] : ["固定を外す", "固定を外した"]);
    if (plan.group) steps.push(plan.group.group ? [`グループ「${plan.group.group.name}」に入れる`, `グループ「${plan.group.group.name}」に入れた`] : ["グループから外す", "グループから外した"]);
    const planned = steps.map(([will]) => will);
    if (planned.length === 0) return `${label}は、もともと頼まれた値だったので変えていません。`;
    await approveAiWrite(store.settings, "other_project_write", ask, {
      toolName: AI_UPDATE_CHAT_TOOL,
      input: { ...input, project: project.name },
      title: `ほかのプロジェクトのチャットを変えようとしています: ${label}`,
      description: `共通のチャットの AI が、次のように変えようとしています: ${planned.join("・")}。`,
    });
    // 聞いている間に消えていないか確かめ直し、もう一度決まりに当ててから変える
    const fresh = store.chats.get(target.id);
    if (!fresh || fresh.project_id !== project.id) throw new Error("変えるチャットが見つかりません（消されたか、ほかのプロジェクトへ移った可能性があります）");
    applyChatUpdate(store.chats, planOn(fresh));
    return `${label}を変えました: ${steps.map(([, done]) => done).join("・")}。`;
  };
  /** 同じプロジェクトのチャットを変える（聞かない。家系の外は名前だけ） */
  const updateInProject = (self: Chat, input: UpdateChatInput): string => {
    const { members, relationOf } = familyOf(store.chats, self);
    if (input.title === undefined && input.pinned === undefined && input.group_id === undefined && input.parent_id === undefined) {
      throw new Error("変える項目がありません。title・pinned・group_id・parent_id のどれかを渡してください（省いた項目は変えません）");
    }
    const target = members.find((c) => c.id === input.chat_id);
    if (!target) return renameOutsideFamily(store, self, input);
    // 親から外す（parent_id）。グループは親のないチャットにするときだけ一緒に渡せる
    const detaching = input.parent_id !== undefined;
    if (detaching && target.parent_chat_id === null) throw new Error("親のないチャットです（parent_id で外せるのは子チャットだけです）");
    if (detaching && input.parent_id !== null && input.group_id !== undefined && input.group_id !== null) {
      throw new Error("グループに入れられるのは親のないチャットだけです（先祖の子に上げるときは group_id を渡さないでください）");
    }
    // 先にすべて確かめてから変える（途中で断って一部だけ変わらないように。決まりは PATCH /api/chats/:id と同じ update.ts。親から外して親のないチャットにするときはグループも渡せる）
    const plan = refusedForAi(
      () => planChatUpdate({ store, requireIdle: () => {} }, target, { title: input.title, pinned: input.pinned, groupId: input.group_id }, { becomesRoot: detaching && input.parent_id === null, strictChildGroup: true }),
      input,
    );
    const group = plan.group?.group ?? (input.group_id === undefined || input.group_id === null ? null : (store.groups.get(input.group_id) ?? null));

    const changes: string[] = [];
    // 親から外すのを先にする（先祖でない ID・作業中などで断るときは、ほかの項目も変えないように）
    if (detaching) {
      const parentId = input.parent_id ?? null;
      const before = target.parent_chat_id === null ? null : store.chats.get(target.parent_chat_id);
      try {
        if (!detach) throw new Error("子チャットの機能がありません");
        detach.detach(target, { parentId, groupId: parentId === null ? (input.group_id ?? null) : null });
      } catch (e) {
        throw new Error(`親から外せませんでした: ${errorMessage(e)}`, { cause: e });
      }
      const to = parentId === null ? null : store.chats.get(parentId);
      changes.push(to ? `「${chatName(before?.title ?? "", "ai")}」から「${chatName(to.title, "ai")}」の子に上げた` : `「${chatName(before?.title ?? "", "ai")}」から外して親のないチャットにした${group ? `（グループ「${group.name}」）` : ""}`);
    }
    // グループは親から外すときに一緒に入れたので、ここでは変えない
    const { changes: made } = applyChatUpdate(store.chats, detaching ? { ...plan, group: undefined } : plan);
    for (const kind of ["title", "pinned", "group"] as const) {
      const change = made.find((c) => c.kind === kind);
      if (change?.kind === "title") changes.push(`名前を「${chatName(change.from, "ai")}」から「${change.to}」に変えた`);
      if (change?.kind === "pinned") changes.push(change.to ? "固定した" : "固定を外した");
      if (change?.kind === "group") changes.push(change.group ? `グループ「${change.group.name}」に入れた` : "グループから外した");
    }
    const label = `チャット「${chatName(plan.title ?? target.title, "ai")}」（ID ${target.id}・${relationOf(target)}）`;
    return changes.length > 0 ? `${label}を変えました: ${changes.join("・")}。` : `${label}は、もともと頼まれた値だったので変えていません。`;
  };
  return {
    listFamily() {
      const self = requireSelf();
      const { members, relationOf } = familyOf(store.chats, self);
      return JSON.stringify(
        {
          self_id: self.id,
          chats: members.map((c) => ({
            id: c.id,
            title: c.title,
            relation: relationOf(c),
            is_self: c.id === self.id,
            parent_id: c.parent_chat_id,
            pinned: c.pinned,
            group: groupOf(c),
            archived: c.archived_at !== null,
          })),
          groups: store.groups.list(self.project_id).map((g) => ({ id: g.id, name: g.name })),
          note: "update_chat で固定・グループ・親から外すを変えられるのは、この一覧のチャットだけ（名前だけなら、list_project_chats にある同じプロジェクトのほかの家系のチャットも変えられる）。グループに入れられるのは親のないチャット（parent_id が null）だけで、groups から選ぶ（グループは作れない）。子チャットは parent_id で親から外せる（null = 親のないチャット、自分の先祖の ID = その子に上げる。利用者に頼まれたときだけ）。",
        },
        null,
        2,
      );
    },
    async update(input, ask) {
      const self = requireSelf();
      // project は先に 1 回だけ引く（プロジェクトのチャットからほかを指せば projectForTool が断る）
      const given = input.project === undefined ? undefined : projectForTool(store.projects, self, input.project);
      const other = otherTarget(self, input, given);
      return other ? updateInOtherProject(input, other, ask) : updateInProject(self, input);
    },
  };
}

/**
 * 家系のチャットの一覧と、名前・固定・グループを変えるツールの組（聞かずに変える。孫チャット・子チャットを作らせない設定のときも出す）。
 * 共通のチャットには、ほかのプロジェクトのチャットを変える使い方も足す
 */
export function familyToolGroup(deps: AiChatEditDeps): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 30,
    instructions: (turn) => (isCommonChatTurn(deps.store.projects, turn) ? [...FAMILY_INSTRUCTIONS, ...COMMON_FAMILY_INSTRUCTIONS] : FAMILY_INSTRUCTIONS),
    open: ({ chatId }) => {
      const edit = createAiChatEditTools(deps, chatId);
      return [
        defineAiTool({
          server: "kickoff_chat",
          name: "list_family_chats",
          description: "このチャットと同じ家系のチャット（ID・名前・関係・固定・グループ）と、同じプロジェクトのグループの一覧",
          input: {},
          run: () => edit.listFamily(),
        }),
        defineAiTool({
          server: "kickoff_chat",
          name: "update_chat",
          description:
            "同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外す（家系の外でも同じプロジェクトなら名前だけ変えられる。聞かずに変える。省いた項目は変えない。親から外すのは利用者に頼まれたときだけ）",
          input: UPDATE_CHAT_INPUT,
          run: (args, turn) => edit.update(args, (card) => turn.ask(card)),
        }),
      ];
    },
  };
}
