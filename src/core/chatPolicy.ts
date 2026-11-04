import type { Project } from "./types.js";

/**
 * チャットのエージェントの権限ポリシー（プロバイダー非依存。どのチャットも同じ）。
 * 各プロバイダーはこれを自分の権限設定（Claude なら allowedTools）に変換する。
 * ファイルの編集を自動で承認するかは、チャット欄の権限モードだけで決まる
 */
export interface ChatPolicy {
  /** 承認なしで実行してよいシェルコマンドの接頭辞 */
  allowedCommands: string[];
  /** Web 検索・取得を承認なしで許可するか */
  web: boolean;
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

/** すべてのチャットに共通のポリシー（Git の読み取りと、テスト・型チェック・ビルドは承認なし。Web も許可） */
export const CHAT_POLICY: ChatPolicy = { allowedCommands: [...GIT_READ, ...CHECK_COMMANDS], web: true };

/**
 * プロバイダーのシステムプロンプトに追記するプロジェクト文脈。
 * workdir: チャットの作業場所（ワークツリーで作業するチャットはそのフォルダ。「リポジトリ」として伝え、本体の場所は添えるだけにする）
 */
export function buildSystemPrompt(project: Project, workdir = project.repo_path): string {
  const lines = [
    `# Kickoff からの指示`,
    `あなたはローカルの開発アプリ「Kickoff」から起動されたエージェントです。ユーザーへの返答は日本語で書いてください。`,
    ``,
    `## プロジェクト`,
    `- 名前: ${project.name}`,
    `- リポジトリ: ${workdir}`,
    ...(workdir !== project.repo_path
      ? [`- 本体のフォルダ: ${project.repo_path}（このチャットはワークツリーで作業しています。ファイルの読み書き・コマンドは上のリポジトリで行い、本体は変えないでください）`]
      : []),
  ];
  if (project.description.trim()) lines.push(`- 概要:\n${indent(project.description.trim())}`);

  lines.push(
    ``,
    `## 作業の進め方`,
    `- 利用者が作業を中断すると、いまの作業と一緒に、裏で動かしたサブエージェント（Agent ツール）やコマンド（Bash の run_in_background）も止まり、報告は届きません。作業中に利用者が送った指示は、作業を止めずに届きます（いまの手順の切れ目で読んでください）。`,
    `- 開発サーバーや監視など、自分では終わらないコマンドを裏で動かしたまま返答を終えないでください。裏で動いているものがある間はこのチャットが作業中のまま終わらず、利用者は次の指示を送れません。確かめが済んだら、返答の前に止めてください（動かし続ける必要があるときは、利用者に自分のターミナルで起動してもらってください）。`,
    `- 急がない作業のサブエージェントは、終わるまで待つ形（run_in_background: false）で動かしてください。`,
    `- サブエージェントが API・通信のエラー（終わりの知らせに API Error・Connection などとある）で途中で止まったときは、SendMessage でそのサブエージェントに止まったところから続けるよう伝えて、1 回だけ再開してください（記録が見つからず再開できないときだけ、同じ依頼で立ち上げ直してください）。それでも止まったとき、通信以外の理由で失敗したとき、利用者が止めたもの（中断）は、再開も立ち上げ直しもせず、何が止まったかを利用者に伝えてください。`,
  );

  if (project.references.length > 0) {
    lines.push(
      ``,
      `## 参照資料`,
      `このプロジェクトでは、次のフォルダ・ファイルを参照資料として読めます。必要に応じて Read / Glob / Grep で読んでください（書き込みはできません）。`,
      ...project.references.map((r) => `- ${r.path}${r.kind === "folder" ? "/（フォルダ）" : "（ファイル）"}`),
    );
  }
  return lines.join("\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
