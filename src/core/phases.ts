import { PHASE_LABELS, type Phase, type Project, type Task } from "./types.js";

/**
 * フェーズごとのエージェントの権限ポリシー（プロバイダー非依存）。
 * 各プロバイダーはこれを自分の権限設定（Claude なら allowedTools / permissionMode）に変換する。
 */
export interface PhasePolicy {
  phase: Phase;
  /** ファイルの作成・編集を承認なしで許可するか */
  autoEdit: boolean;
  /** 承認なしで実行してよいシェルコマンドの接頭辞 */
  allowedCommands: string[];
  /** Web 検索・取得を承認なしで許可するか */
  web: boolean;
  /** 推論の深さ */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
}

const GIT_READ = ["git status", "git diff", "git log", "git show", "git branch"];
const CHECK_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "pnpm test",
  "pnpm run test",
  "pnpm run lint",
  "pnpm run typecheck",
  "pnpm run build",
  "npx tsc",
  "npx vitest run",
  "pytest",
  "python -m pytest",
  "go test",
  "cargo test",
];

export function phasePolicy(phase: Phase, project: Project): PhasePolicy {
  const testCommand = project.test_command.trim();
  const withTest = (cmds: string[]) => (testCommand ? [...cmds, testCommand] : cmds);

  switch (phase) {
    case "requirements":
      return { phase, autoEdit: false, allowedCommands: GIT_READ, web: true, effort: "high" };
    case "implementation":
      return {
        phase,
        autoEdit: true,
        allowedCommands: withTest([
          ...GIT_READ,
          ...CHECK_COMMANDS,
          ...(project.auto_commit ? ["git add", "git commit"] : []),
        ]),
        web: true,
        effort: "high",
      };
    case "testing":
      return { phase, autoEdit: true, allowedCommands: withTest([...GIT_READ, ...CHECK_COMMANDS]), web: false, effort: "high" };
    case "deployment":
      // デプロイは外部に影響するため、読み取り以外のコマンドはすべて承認制
      return { phase, autoEdit: false, allowedCommands: GIT_READ, web: true, effort: "medium" };
  }
}

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  requirements: `## あなたの役割: 要件定義
ユーザーのアイデアと既存のコード・資料をもとに、ユーザーと対話しながら要件定義書を作ります。

- 判断が分かれる点や、推測で埋めると手戻りが大きい点は AskUserQuestion でユーザーに確認してください。一度に聞くのは重要なものから数問にとどめ、自明な点まで聞く必要はありません。
- 要件定義書は mcp__kickoff__save_artifact（kind: "requirements", export_path: "docs/requirements.md"）で保存します。内容が変わったら同じ方法で保存し直してください。
- 構成の目安: 背景と目的 / 利用者 / スコープ（やること・やらないこと）/ 機能要件 / 非機能要件 / 技術スタック（選定理由つき）/ デプロイ先・リリース方法 / 受け入れ基準 / 未決事項。
- 技術スタックとデプロイ先は、要件に合わせて提案し、ユーザーの同意を得てから要件定義書に書いてください。
- このフェーズではタスクの起票とプロダクトコードの変更はしません。要件定義書がまとまったら、Kickoff の画面で「要件定義書を確定」するようユーザーに伝えてください。確定後に、タスク分解を別途依頼します。`,

  implementation: `## あなたの役割: 実装
割り当てられたタスクを実装します。

- 着手前に docs/requirements.md（あれば）と関連コードを読み、既存の設計・命名・スタイルに合わせてください。
- 変更はタスクの範囲に絞ります。途中で見つけた別の作業は mcp__kickoff__create_task で起票し、今のタスクには含めないでください。
- 必要に応じてテストを追加し、ビルド・型チェック・テストを実行して動作を確認してから完了にしてください。
- 完了したら mcp__kickoff__update_task でタスクを status: "review" にし、summary に変更内容と確認結果を簡潔に書きます。完了できなかった場合は status: "blocked" にして理由を書きます。`,

  testing: `## あなたの役割: テスト
要件定義書の受け入れ基準と実装済みのタスクに対して、テストを作成・実行して品質を確認します。

- docs/requirements.md と mcp__kickoff__list_tasks（phase: "implementation"）で対象を把握してください。
- テストコードの追加・修正は行ってよいですが、プロダクトコードは修正しません。不具合を見つけたら mcp__kickoff__create_task で実装フェーズに「[バグ] 〜」として起票し、再現手順と期待結果を書いてください。
- 結果は mcp__kickoff__save_artifact（kind: "test_report", export_path: "docs/test-report.md"）で保存します。実行したコマンド、結果の要約、失敗の詳細、起票したバグを含めてください。
- 最後に担当タスクを mcp__kickoff__update_task で更新します（すべて合格なら "review"、問題があれば "blocked"）。`,

  deployment: `## あなたの役割: デプロイ
プロジェクトに設定されたデプロイ手順に従ってデプロイします。

- 事前チェック: 未コミットの変更がないこと、テストが通っていることを確認し、問題があれば中止して報告してください。
- デプロイ手順が設定されていない場合は、リポジトリを調べてデプロイ方法を提案し、AskUserQuestion で確認してから進めてください。
- コマンドの実行はすべてユーザーの承認を経ます。承認を求める前に、そのコマンドが何をするかを一言説明してください。
- 結果は mcp__kickoff__save_artifact（kind: "deploy_log"）で保存します。実行したコマンド、デプロイ先 URL、確認結果、ロールバック方法を含めてください。
- 最後に担当タスクを mcp__kickoff__update_task で更新します。`,
};

const DECOMPOSITION_INSTRUCTIONS = `## あなたの役割: タスク分解
ユーザーが確定した要件定義書（docs/requirements.md、または mcp__kickoff__list_artifacts の kind: "requirements" の最新）をもとに、タスクを起票します。

- 実装フェーズのタスクを mcp__kickoff__create_task で起票します。1 タスクは 1 回のエージェント実行で完了できる粒度にし、内容・関連ファイル・受け入れ基準を具体的に書いてください。
- まだコードがない（または雛形がない）場合は、最初のタスクを「雛形の作成」（要件定義書の技術スタックでプロジェクトを初期化し、起動とテストが通る状態にする）にしてください。
- 優先度（1: 高 / 2: 中 / 3: 低）は依存関係と重要度で決めます。先に必要なものほど高くしてください。
- 受け入れ基準を検証するテストフェーズのタスクと、要件定義書のデプロイ方法に沿ったデプロイフェーズのタスクも起票します。
- 起票前に mcp__kickoff__list_tasks で既存タスクを確認し、重複を避けてください。
- 要件定義書の変更とプロダクトコードの変更はしません。
- 最後に、起票したタスクの一覧と、実装を進める順番の考え方を短くまとめてください。`;

/** 要件定義を始めるときの最初のメッセージ */
export function requirementsKickoffPrompt(project: Project): string {
  const idea = project.description.trim();
  return idea
    ? `次のアイデアについて、要件定義を一緒に進めてください。\n\n${idea}`
    : "このプロジェクトの要件定義を一緒に進めてください。まずリポジトリの内容を確認し、何を作るかを私に質問してください。";
}

/** 要件定義書の確定後に、タスク分解を依頼するメッセージ */
export const DECOMPOSITION_PROMPT = "確定した要件定義書をもとに、タスクを起票してください。";

/** プロバイダーのシステムプロンプトに追記するプロジェクト文脈 */
export function buildSystemPrompt(project: Project, phase: Phase, task: Task | null): string {
  const lines = [
    `# Kickoff からの指示`,
    `あなたはローカルのプロジェクト管理アプリ「Kickoff」から起動されたエージェントです。プロジェクトのタスクと成果物は mcp__kickoff__ で始まるツールで読み書きします。ユーザーへの返答と成果物は日本語で書いてください。`,
    ``,
    `## プロジェクト`,
    `- 名前: ${project.name}`,
    `- リポジトリ: ${project.repo_path}`,
    `- 現在のフェーズ: ${PHASE_LABELS[phase]}`,
  ];
  if (project.description.trim()) lines.push(`- 概要:\n${indent(project.description.trim())}`);
  if (project.test_command.trim()) lines.push(`- テストコマンド: \`${project.test_command.trim()}\``);
  if (phase === "deployment") {
    lines.push(
      project.deploy_instructions.trim()
        ? `- デプロイ手順:\n${indent(project.deploy_instructions.trim())}`
        : `- デプロイ手順: 未設定`,
    );
  }
  if (phase === "implementation" && project.auto_commit) {
    lines.push(
      `- コミット: リポジトリが git 管理されていれば、タスク完了時に変更をコミットしてください（メッセージ例: "[Kickoff #<タスクID>] <要約>"）。`,
    );
  }

  if (task) {
    lines.push(``, `## 担当タスク (#${task.id})`, `- タイトル: ${task.title}`);
    if (task.description.trim()) lines.push(`- 内容:\n${indent(task.description.trim())}`);
    if (task.acceptance_criteria.trim()) lines.push(`- 受け入れ基準:\n${indent(task.acceptance_criteria.trim())}`);
  }

  const instructions =
    phase === "requirements" && project.requirements_confirmed_at ? DECOMPOSITION_INSTRUCTIONS : PHASE_INSTRUCTIONS[phase];
  lines.push(``, instructions);
  return lines.join("\n");
}

/** タスク実行時の最初のメッセージ（ユーザーが指示を書かなかった場合） */
export function defaultTaskPrompt(task: Task): string {
  return `タスク #${task.id}「${task.title}」を進めてください。`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
