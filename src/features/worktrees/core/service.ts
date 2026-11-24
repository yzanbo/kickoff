// ワークツリーの手続き（一覧・作る・ブランチ名の案・［AI で整える］）。受け口・作業場所の土台の「作る人」・PR の取り出し・ゴミ箱から戻すは、ここを通って作る
import type { BranchSuggestions } from "@shared/git/types";
import type { GitWorktree } from "@shared/foundation/workplace";
import type { Project } from "@shared/projects/types";
import type { WorktreeEnvSetupResult } from "@shared/worktrees/envTypes";
import { gitRefs } from "@/features/git/core/index";
import type { AiApi } from "@/features/ai/core/index";
import type { ChatRunPort, ChatStoreDeps } from "@/features/chat/core/index";
import { asInvalid, Conflict, Invalid } from "@/foundation/core/errors";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import { branchSuggestPrompt, parseBranchSuggestions } from "./branchSuggest";
import { attachWorktreeHues } from "./colors";
import { addWorktree } from "./create";
import type { WorktreeStores } from "./db/stores";
import type { WorktreeEnvService } from "./env/service";
import { envSetupPrompt, envSetupTitle } from "./env/setupPrompt";
import type { HeadWatch } from "./headWatch";

export interface WorktreeServiceDeps {
  store: Pick<WorktreeStores, "worktreeColors"> & Pick<ChatStoreDeps, "chats">;
  envs: WorktreeEnvService;
  headWatch: HeadWatch;
  runner: ChatRunPort;
  /** ブランチ名の案を聞く AI */
  providers: AiApi["providers"];
}

export class WorktreeService {
  constructor(private readonly deps: WorktreeServiceDeps) {}

  /** 画面に返す一覧（ワークツリーの実行環境と作業場所の色を付ける） */
  present(projectId: number, list: GitWorktree[]): GitWorktree[] {
    return attachWorktreeHues(this.deps.store, projectId, this.deps.envs.attach(projectId, list));
  }

  /**
   * 画面の一覧。Git で管理していないフォルダは、ワークツリーのないもの（空）として返す（Git の状態の repo: false と同じ扱い。失敗にすると、画面が取り直し続ける）。
   * HEAD の見張りを一覧に合わせる（ブランチを替えた・ワークツリーを足した消したら worktrees_changed で知らせ、画面が取り直す）
   */
  async list(project: Project): Promise<GitWorktree[]> {
    if (!(await isGitWorkTree(project.repo_path))) return [];
    const list = await listWorktrees(project.repo_path);
    await this.deps.headWatch.watch(project.id, project.repo_path, list);
    return this.present(project.id, list);
  }

  /**
   * ワークツリーを作る（ブランチがあれば取り出し、同じブランチのものがあれば使い回す）。新しく作ったときだけ実行環境（ポートの帯・組の名前）を整える。
   * base は新しいブランチの元のコミット（省けば本体の HEAD）。worktree は作った・使い回したワークツリー（list は色を付けていない一覧）
   */
  async create(project: Project, branch: string, opts: { base?: string } = {}): Promise<{ worktree: GitWorktree | undefined; created: boolean; list: GitWorktree[] }> {
    let created = false;
    const list = await addWorktree(
      project.repo_path,
      branch,
      async (made) => {
        created = true;
        await this.deps.envs.prepare(project, made);
      },
      opts.base,
    );
    return { worktree: list.find((w) => w.branch === branch && !w.main), created, list };
  }

  /** やりたいことの概要から、ブランチ名の案を AI に出してもらう（軽いモデルで 1 回だけ。いまあるブランチと同じ名前は除く。案が作れなければ 400） */
  async suggestBranches(project: Project, summary: string): Promise<BranchSuggestions> {
    const provider = this.deps.providers[project.provider];
    if (!provider?.ask) throw new Invalid("このプロジェクトの AI は、ブランチ名の提案に対応していません");
    const taken = (await isGitWorkTree(project.repo_path)) ? (await gitRefs(project.repo_path)).branches.map((b) => b.name) : [];
    const answer = await provider.ask(branchSuggestPrompt(summary, taken), { model: "light" }).catch(asInvalid);
    const branches = parseBranchSuggestions(answer, taken);
    if (branches.length === 0) throw new Invalid("ブランチ名の案を作れませんでした。やりたいことを少し詳しく書いて、もう一度試してください");
    return { branches };
  }

  /**
   * ［AI で整える］（利用者が押したときだけ）: 覚えのないワークツリー（Kickoff の外で作ったものなど）なら先に手順を流し、
   * そのワークツリーで新しいチャット「実行環境を整える（ブランチ）」を始める（Git で管理していないファイルだけを書ける。選択はプロジェクトの既定）。
   * 同じワークツリーの［AI で整える］のチャットが作業中なら 409
   */
  async startEnvSetup(project: Project, folder: string): Promise<WorktreeEnvSetupResult> {
    const { store, runner, envs } = this.deps;
    const list = await listWorktrees(project.repo_path);
    const worktree = list.find((w) => w.path === folder && !w.main);
    if (!worktree) throw new Invalid("このプロジェクトのワークツリーではありません");
    if (store.chats.inWorktree(project.id, folder).some((r) => r.untracked_only && runner.isBusy(r.id))) {
      throw new Conflict("このワークツリーの実行環境を整えるチャットが作業中です。終わってから押してください");
    }
    const input = await envs.setupInput(project, worktree);
    const chat = await runner.start({ projectId: project.id, prompt: envSetupPrompt(input), title: envSetupTitle(input.label), worktreePath: folder, untrackedOnly: true });
    return { chat, worktrees: this.present(project.id, list) };
  }
}
