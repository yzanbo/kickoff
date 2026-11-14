// チャットの AI がチャットを作る（kickoff_chat の create_chat の中身。プロバイダーに依らない。メモの仕様書「0019_AI の操作ツールの追加」の A・E）。
// 作る場所は relation で選ぶ: 自分の子（child）・自分の親の子（sibling）・親のないチャット（root）。どれも、このチャットと同じプロジェクトだけ。
// worktree_branch を渡すと、新しいブランチのワークツリーを、作る側のチャットの作業場所のいまのコミットから作り、そこを作業場所にする。
// 作って最初の依頼を送るだけで、作ったチャットの答えは待たない（答えは利用者がそのチャットで見て、要れば「親チャットに追加」で渡す）
import {
  AI_CHAT_MAX_GENERATION,
  AI_CHAT_RELATION_LABELS,
  AI_CHATS_PER_TURN,
  AI_CHILD_CHAT_MAX_DEPTH,
  createdChatMark,
  type AiChatRelation,
} from "@shared/chat/aiCreateChat";
import { childDepthLabel } from "@shared/chat/childDepth";
import { errorMessage } from "@shared/errors";
import type { Chat, Project } from "@shared/types";
import type { Store } from "../db/store.js";
import { gitOutput } from "../git/exec.js";
import { addWorktree, isGitWorkTree, newWorktreeProblem } from "../git/index.js";
import type { WorktreeEnvService } from "../worktreeEnv/service.js";
import type { ChildChatInput } from "./children.js";
import { workdirOf } from "./workdir.js";

/** 作ったチャットと、作る側の会話を引き継いだか（写し終えた・いま写している） */
export interface StartedChild {
  chat: Chat;
  inherited: boolean;
}

/** AI が頼んだチャット（承認カードに出す） */
export interface AiCreateChatRequest {
  relation: AiChatRelation;
  text: string;
  title: string | null;
  inherit: boolean;
  /** 入れるグループの名前（親のないチャットだけ。なければ null） */
  group: string | null;
  /** 新しく作るワークツリーのブランチ（なければ null） */
  worktree_branch: string | null;
  /** 作業場所の説明（「このチャットと同じ作業場所（本体）」「新しいワークツリー feat/a」など） */
  workplace: string;
}

/** 利用者の答え（allow_always は「次から聞かない」= 設定を「聞かずに作る」にする） */
export type AiCreateChatDecision = { action: "allow" } | { action: "allow_always" } | { action: "deny"; message: string | null };

/** AI がツールに渡す引数 */
export interface AiCreateChatInput {
  relation: AiChatRelation;
  text: string;
  title?: string;
  group_id?: number;
  worktree_branch?: string;
  inherit?: boolean;
}

/** チャットを作るツールの中身（作れたら AI に返す文。作れなければ理由の文で throw） */
export interface AiCreateChatTools {
  create(input: AiCreateChatInput, approve: (request: AiCreateChatRequest) => Promise<AiCreateChatDecision>): Promise<string>;
}

/** 根のチャットから何段目か（親のないチャット = 0。親子が輪になっていても止まる） */
export function chatDepth(store: Store, chat: Chat): number {
  const seen = new Set<number>([chat.id]);
  let depth = 0;
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    depth++;
    parentId = store.chats.get(parentId)?.parent_chat_id ?? null;
  }
  return depth;
}

/**
 * このチャットの AI に、チャットを作るツールを渡すか（設定で止めていない・AI が作った世代の上限に達していない）。
 * 孫チャットも、兄弟・親のないチャットは作れるので渡す（子チャットは呼んだときに断る）
 */
export function canCreateChat(store: Store, chat: Chat): boolean {
  return store.settings.get().ai_create_chat !== "off" && store.chats.aiGeneration(chat.id) < AI_CHAT_MAX_GENERATION;
}

/** チャットを作るのに使うもの（Runner が渡す） */
export interface AiCreateChatDeps {
  store: Store;
  /** 作る側のチャット（from）の会話を写す元にして、チャットを作って動かす（children.ts の startChildChat） */
  startChat: (from: Chat, input: ChildChatInput) => Promise<StartedChild>;
  /** ワークツリーの実行環境（作ったワークツリーにポートの帯と組の名前を割り当てる。なければ割り当てない） */
  worktreeEnvs?: WorktreeEnvService;
}

/** 新しいワークツリーを作れるか確かめる（承認を聞く前。Git でない・名前に使えない・同じ名前があれば理由の文で throw） */
async function assertNewWorktree(project: Project, branch: string) {
  if (!(await isGitWorkTree(project.repo_path).catch(() => false))) throw new Error("このプロジェクトは Git で管理していないので、ワークツリーを作れません");
  const problem = await newWorktreeProblem(project.repo_path, branch);
  if (problem) throw new Error(problem);
}

/** 作ったワークツリー（作業するフォルダ・元のコミット・作る側のまだコミットしていない変更の数） */
interface MadeWorktree {
  path: string;
  base: string;
  uncommitted: number;
}

/** 作る側のチャットの作業場所のいまのコミットから、新しいブランチのワークツリーを作る（画面の「ワークツリーを作る」と同じ手順。ポートの帯・組の名前・.env の写しも） */
async function makeWorktree(deps: AiCreateChatDeps, project: Project, from: Chat, branch: string): Promise<MadeWorktree> {
  const cwd = workdirOf(from, project);
  const base = (await gitOutput(cwd, ["rev-parse", "HEAD"])).trim();
  const status = await gitOutput(cwd, ["status", "--porcelain"]).catch(() => "");
  const list = await addWorktree(project.repo_path, branch, deps.worktreeEnvs ? (made) => deps.worktreeEnvs!.prepare(project, made) : undefined, base);
  const made = list.find((w) => w.branch === branch && !w.main);
  if (!made) throw new Error(`ワークツリー（${branch}）を作れませんでした`);
  return { path: made.path, base, uncommitted: status.split("\n").filter(Boolean).length };
}

/**
 * chatId のチャットの AI に渡す、チャットを作るツールの中身。設定・世代・深さは呼ぶたびに確かめ直す（作業の途中で設定を変えたら次の呼び出しから効く）。
 * 1 回の作業で作れるのは AI_CHATS_PER_TURN まで（このツールの中身は作業ごとに作るので、数はこの中で数える）。
 * 設定が「毎回聞く」なら approve で利用者に聞く（権限モード・Auto mode によらない）。「常に許可」なら設定を「聞かずに作る」にしてから作る
 */
export function createAiCreateChatTools(deps: AiCreateChatDeps, chatId: number): AiCreateChatTools {
  const { store } = deps;
  let createdThisTurn = 0;
  const requireSelf = () => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  return {
    async create(input, approve) {
      const relation = input.relation;
      const label = AI_CHAT_RELATION_LABELS[relation];
      const text = input.text.trim();
      if (!text) throw new Error(`${label}に送る依頼の文（text）が空です`);
      const self = requireSelf();
      const project = store.projects.get(self.project_id);
      if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
      const mode = store.settings.get().ai_create_chat;
      if (mode === "off") throw new Error("利用者が設定（チャット →「AI がチャットを作るとき」）で、AI がチャットを作るのを止めています");
      const generation = store.chats.aiGeneration(self.id) + 1;
      if (generation > AI_CHAT_MAX_GENERATION) {
        throw new Error(`このチャットは AI が作ったチャットから作られた ${AI_CHAT_MAX_GENERATION} 世代目なので、ここからはチャットを作れません（作り続けて増えすぎないように）`);
      }
      if (createdThisTurn >= AI_CHATS_PER_TURN) throw new Error(`1 回の作業で作れるチャットは ${AI_CHATS_PER_TURN} つまでです`);
      // 置き場所（親・グループ）を決める
      let parentChatId: number | null = null;
      if (relation === "child") {
        if (chatDepth(store, self) >= AI_CHILD_CHAT_MAX_DEPTH) {
          throw new Error(`AI が作れる子チャットは${childDepthLabel(AI_CHILD_CHAT_MAX_DEPTH)}までです。このチャットからは子チャットを作れません（兄弟チャット（relation: "sibling"）か親のないチャット（"root"）なら作れます）`);
        }
        parentChatId = self.id;
      } else if (relation === "sibling") {
        if (self.parent_chat_id === null) throw new Error('このチャットには親がないので、兄弟チャットは作れません。親のないチャットを作るなら relation: "root" にしてください');
        if (!store.chats.get(self.parent_chat_id)) throw new Error("このチャットの親チャットが見つかりません（消された可能性があります）");
        parentChatId = self.parent_chat_id;
      }
      let group: { id: number; name: string } | null = null;
      if (input.group_id !== undefined) {
        if (relation !== "root") throw new Error("グループに入れられるのは親のないチャット（relation: \"root\"）だけです（子チャットはグループに入りません）");
        const found = store.groups.get(input.group_id);
        if (!found || found.project_id !== project.id) throw new Error(`グループ ${input.group_id} はこのプロジェクトにありません（list_family_chats の groups から選んでください）`);
        group = { id: found.id, name: found.name };
      }
      const branch = input.worktree_branch?.trim() || null;
      if (branch) await assertNewWorktree(project, branch);
      const inherit = input.inherit ?? relation === "child";
      const workplace = branch ? `新しいワークツリー（ブランチ ${branch}。このチャットの作業場所のいまのコミットから作る）` : relation === "root" ? "プロジェクトの本体" : `このチャットと同じ作業場所（${self.worktree_path ? `ワークツリー ${self.branch ?? self.worktree_path}` : "本体"}）`;
      const request: AiCreateChatRequest = { relation, text, title: input.title?.trim() || null, inherit, group: group?.name ?? null, worktree_branch: branch, workplace };
      if (mode === "ask") {
        const decision = await approve(request);
        if (decision.action === "deny") throw new Error(decision.message ? `利用者が断りました: ${decision.message}` : "利用者が断りました");
        if (decision.action === "allow_always") store.settings.update({ ai_create_chat: "allow" });
      }
      // 聞いている間に消えていないか確かめ直す
      const from = requireSelf();
      if (parentChatId !== null && !store.chats.get(parentChatId)) throw new Error("作る先の親チャットが見つかりません（消された可能性があります）");
      let made: MadeWorktree | null = null;
      if (branch) {
        try {
          made = await makeWorktree(deps, project, from, branch);
        } catch (e) {
          throw new Error(`ワークツリー（${branch}）を作れませんでした: ${errorMessage(e)}`);
        }
      }
      const worktreePath = made ? made.path : relation === "root" ? null : from.worktree_path;
      // 子チャットの聞いた位置は、いまの作業のもとになった自分の発言（その発言の下に子チャットの札が出る）。兄弟・親のないチャットは親の発言から聞いたのではないので付けない
      const { chat, inherited } = await deps.startChat(from, {
        text,
        quote: null,
        inherit,
        eventId: relation === "child" ? store.events.latestUserId(chatId) : null,
        ...(request.title ? { title: request.title } : {}),
        placement: { relation, parentChatId, groupId: group?.id ?? null, worktreePath },
        aiGeneration: generation,
      });
      createdThisTurn++;
      return resultText(chat, relation, inherit ? (inherited ? "inherited" : "failed") : "fresh", made && branch ? { ...made, branch } : null);
    },
  };
}

/** 会話を引き継いだか（引き継いだ / 頼んだが引き継げなかった / 頼まなかった）ごとの、AI に伝える文 */
const INHERIT_TEXT = {
  inherited: "作ったチャットは、このチャットの会話のうち、いまの作業より前に終わったところまでを引き継いでいます。",
  failed: "このチャットの会話は引き継げなかったので（まだ終わった作業がないなど）、作ったチャットは依頼の文だけで始めています。",
  fresh: "作ったチャットは、このチャットの会話を引き継がずに、依頼の文だけで始めています。",
} as const;

/** 作ったことを AI に伝える文（どこに作ったか・ワークツリー・引き継いだか・答えは返らないこと・同じ依頼で作り直さないことも） */
function resultText(chat: Chat, relation: AiChatRelation, inherit: keyof typeof INHERIT_TEXT, worktree: (MadeWorktree & { branch: string }) | null): string {
  const name = chat.title.trim() || "（名前は依頼の文から付きます）";
  const where = {
    child: "",
    sibling: "（このチャットと同じ親の子）",
    root: "（サイドバーの一覧に並びます。このチャットの家系の外なので、open_chat・update_chat では触れません。利用者がツールの行の札から開きます）",
  }[relation];
  return [
    `${AI_CHAT_RELATION_LABELS[relation]}「${name}」${where}を作り、依頼を送りました${createdChatMark(chat.id)}。`,
    ...(worktree
      ? [
          `作業場所は新しいワークツリーです（ブランチ ${worktree.branch}・フォルダ ${worktree.path}。このチャットの作業場所のいまのコミット ${worktree.base.slice(0, 7)} から作りました）。`,
          worktree.uncommitted > 0
            ? `このチャットのまだコミットしていない変更（${worktree.uncommitted} ファイル）は、新しいワークツリーに入っていません（要るなら、先にコミットしてから作ってください）。`
            : "このチャットのまだコミットしていない変更は、新しいワークツリーに入りません（いまはありません）。",
          "本体への取り込み（マージ）は別に行います。ワークツリーは自分の判断で消さないでください（消すのは利用者に頼まれたときだけ。finish_worktree で）。",
        ]
      : []),
    INHERIT_TEXT[inherit],
    "作ったチャットの答えはこのツールには返りません。利用者がそのチャットを開いて見ます。答えを待たずに、いまの作業を続けてください。同じ依頼で何度も作らないでください。",
  ].join("\n");
}
