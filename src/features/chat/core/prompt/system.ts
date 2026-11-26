import { TRASH_COMMAND } from "@/features/trash/core/index";
import { isCommonProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import type { PromptSection } from "./sections";

/**
 * 利用者がプロジェクトフォルダのことを指して言う呼び名（「ホーム」「ルート」もこのプロジェクトのプロジェクトフォルダのことで、
 * macOS のホーム（~）・ディスクのいちばん上（/）ではない。ノート・ノートフォルダと同じく、ファイルの場所を言われたときの起点にしてもらう）
 */
const PROJECT_FOLDER_WORDS = [
  "プロジェクトフォルダ",
  "プロジェクトディレクトリ",
  "ルートフォルダ",
  "ルートディレクトリ",
  "ホームフォルダ",
  "ホームディレクトリ",
] as const;

/**
 * プロバイダーのシステムプロンプトに追記するプロジェクト文脈（節ごと。並べてつなぐのは joinSections）。
 * 言葉は画面とそろえる: プロジェクトフォルダ（プロジェクトの repo_path。呼び名は PROJECT_FOLDER_WORDS）・作業フォルダ（workdir。ワークツリーで作業するチャットはそのフォルダ）・ノートフォルダ（note.dir）。
 * git で管理していないフォルダ・git のリポジトリの中のフォルダもあるので「リポジトリ」とは呼ばない。送るたびに作り直すので、フォルダを変えたら次の指示から新しい場所が伝わる
 */
export function projectSection(project: Project, workdir = project.repo_path, editScopeEnabled?: boolean, commonChat: CommonChatInfo | null = null): PromptSection {
  // 共通（共通のチャット・共通のノートのチャット）は、利用者から見てどのプロジェクトにも属さないので「プロジェクトフォルダ」と呼ばない
  if (isCommonProject(project)) return commonChat ? commonChatSection(project, workdir, commonChat) : commonNoteChatSection(workdir);
  const lines = [
    `あなたはローカルの開発アプリ「Kickoff」から起動されたエージェントです。ユーザーへの返答は日本語で書いてください。`,
    ``,
    `## プロジェクト`,
    `- 名前: ${project.name}`,
    `- プロジェクトフォルダ: ${project.repo_path}（利用者が${PROJECT_FOLDER_WORDS.map((w) => `「${w}」`).join("")}と言ったら、このフォルダのこと。「ルートの README」「ホームディレクトリの src」のようにファイルの場所を言われたら、このフォルダからの場所として探してください${workdir !== project.repo_path ? "（読み書きは作業フォルダの中の同じ場所で）" : ""}）`,
    workdir !== project.repo_path
      ? `- 作業フォルダ: ${workdir}（このチャットはワークツリーで作業しています。${editScopeEnabled === false ? "作業フォルダとプロジェクトフォルダ（本体）を区別してください" : "ファイルの読み書き・コマンドはこの作業フォルダで行い、プロジェクトフォルダ（本体）は変えないでください"}）`
      : `- 作業フォルダ: プロジェクトフォルダと同じ`,
    // 利用者は会話の途中でプロジェクトフォルダ・作業フォルダ（本体 / ワークツリー）・ノートフォルダを変えられる。この指示は送るたびに作り直すので、ここがいまの場所
    `- プロジェクトフォルダ・作業フォルダ・ノートフォルダは、利用者が会話の途中で変えることがあります。ここに書いた場所がいまの場所です。前の会話に出てきたパスと違っていたら、こちらを使ってください。`,
  ];
  const description = project.description?.trim();
  if (description) lines.push(`- 概要:\n${indent(description)}`);
  return { order: 100, heading: `# Kickoff からの指示`, lines };
}

/** 共通のチャット（ノートのチャットでないもの）に伝える、ほかのプロジェクトのこと */
export interface CommonChatInfo {
  /** アーカイブしていない利用者のプロジェクトの名前（サイドバーの並び。中身・チャット・ノートは入れず、要るときにツールで読んでもらう） */
  projectNames: readonly string[];
}

/** 共通のノートのチャット: ノートの横で話すので、作業フォルダだけを伝える（ノートのことはノートの節） */
function commonNoteChatSection(workdir: string): PromptSection {
  return {
    order: 100,
    heading: `# Kickoff からの指示`,
    lines: [
      `あなたはローカルの開発アプリ「Kickoff」から起動されたエージェントです。ユーザーへの返答は日本語で書いてください。`,
      ``,
      `## 作業フォルダ`,
      `- このチャットは、どのプロジェクトにも属しません。作業フォルダ: ${workdir}`,
      `- 作業フォルダ・ノートフォルダは、利用者が会話の途中で変えることがあります。ここに書いた場所がいまの場所です。前の会話に出てきたパスと違っていたら、こちらを使ってください。`,
    ],
  };
}

/**
 * 共通のチャット: どのプロジェクトにも属さない調べもの・相談のチャット。作業フォルダ（利用者の画面に出ない .common-work）と、
 * 利用者のプロジェクトの名前だけを伝える（名前を知らないと「〇〇のあれ」をプロジェクトのことだと気づけない）。
 * ほかのプロジェクトのコードは書かせない（砂場の書ける場所に入れない。書き込みはツールを通して利用者に聞く）
 */
function commonChatSection(project: Project, workdir: string, { projectNames }: CommonChatInfo): PromptSection {
  const lines = [
    `あなたはローカルの開発アプリ「Kickoff」から起動されたエージェントです。ユーザーへの返答は日本語で書いてください。`,
    ``,
    `## 共通のチャット`,
    `- このチャットは「共通のチャット」です。利用者のどのプロジェクトにも属さない、調べもの・相談のためのチャットです。`,
    `- 作業フォルダ: ${workdir}（利用者の画面には出ない、共通のチャットの作業用のフォルダです。作業用のファイルはここに置いてください）`,
    `- 作業フォルダ・共通のノートのフォルダは、利用者が会話の途中で変えることがあります。ここに書いた場所がいまの場所です。前の会話に出てきたパスと違っていたら、こちらを使ってください。`,
  ];
  const description = project.description?.trim();
  if (description) lines.push(`- 概要（利用者が共通のチャットでいつも守ってほしいこと）:\n${indent(description)}`);
  lines.push(
    ``,
    `## 利用者のプロジェクト`,
    projectNames.length > 0
      ? `- 利用者が Kickoff で使っているプロジェクト: ${projectNames.map((n) => `「${n}」`).join("")}`
      : `- 利用者のプロジェクトは、いまはありません。`,
    `- 会話にプロジェクトの名前が出たら（大文字・小文字、略し方、日本語と英語の言い換えの違いだけでも）、そのプロジェクトのことです。そのプロジェクトのチャットは kickoff_chat の list_project_chats・read_chat に project を渡して読めます。`,
    `- ほかのプロジェクトへの書き込みは、kickoff_chat のツールを通してください（チャットを作って頼む = create_chat の project・チャットの名前 / 固定 / グループを変える = update_chat・ノートを書く = write_project_note・ノートを動かす = move_note の project / to_project。利用者の設定によっては承認を聞きます）。プロジェクトのフォルダ（コード）とノートのフォルダは直接書き換えられません（Write・Edit は断られます）。コードを変えたいときは、そのプロジェクトにチャットを作って頼んでください。`,
  );
  return { order: 100, heading: `# Kickoff からの指示`, lines };
}

/** 作業の進め方の行（中断・裏のコマンド・サブエージェントの再開。作業場所の行は workSection が足す） */
const WORK_LINES = [
    `- 利用者が作業を中断すると、いまの作業と一緒に、裏で動かしたサブエージェント（Agent ツール）やコマンド（Bash の run_in_background）も止まり、報告は届きません。作業中に利用者が送った指示は、作業を止めずに届きます（いまの手順の切れ目で読んでください）。`,
    `- 開発サーバーや監視など、自分では終わらないコマンドを裏で動かしたまま返答を終えないでください。裏で動いているものがある間はこのチャットが作業中のまま終わらず、利用者は次の指示を送れません。確かめが済んだら、返答の前に止めてください（動かし続ける必要があるときは、利用者に自分のターミナルで起動してもらってください）。`,
    `- 急がない作業のサブエージェントは、終わるまで待つ形（run_in_background: false）で動かしてください。`,
    `- サブエージェントが API・通信のエラー（終わりの知らせに API Error・Connection などとある）で途中で止まったときは、SendMessage でそのサブエージェントに止まったところから続けるよう伝えて、1 回だけ再開してください（記録が見つからず再開できないときだけ、同じ依頼で立ち上げ直してください）。それでも止まったとき、通信以外の理由で失敗したとき、利用者が止めたもの（中断）は、再開も立ち上げ直しもせず、何が止まったかを利用者に伝えてください。`,
    `- ただし、サブエージェントが 1 回の返答で書ける量の上限（終わりの知らせに max_output_tokens・output token maximum とある）で止まったときは、通信のエラーではありません。同じやり方で続けると同じところでまた止まるので、「報告は短くまとめる」「大きなファイルは何回かに分けて書く」と添えて、SendMessage で 1 回だけ続きを頼んでください。それでも止まったら、利用者に伝えてください。`,
];

/**
 * 作業の進め方（中断・裏のコマンド・サブエージェントの再開・作業場所）。作業場所は Kickoff が決めて覚えるので、会話ごと別のフォルダへ移らせない
 * （Claude Code の EnterWorktree は外してある）。プロジェクトのチャットには代わりの道（ワークツリーのチャット）を伝え、共通（Git で管理しない作業フォルダで、
 * ワークツリーを作れない）には伝えない
 */
export function workSection(common: boolean): PromptSection {
  return {
    order: 200,
    heading: `## 作業の進め方`,
    lines: [
      ...WORK_LINES,
      common
        ? `- 会話ごと別のフォルダへ移る機能（Claude Code の EnterWorktree / ExitWorktree）は使えません。`
        : `- 会話ごと別のフォルダへ移る機能（Claude Code の EnterWorktree / ExitWorktree）は使えません。書き換えを分けたいときは、自分でチャットもワークツリーも作らずに、利用者に「画面の［ワークツリーを作る］で作ったワークツリーのチャットで行うか、ワークツリーの子チャットを作るか」を提案してください（サブエージェントの isolation: "worktree" はこれまでどおり使えます）。`,
    ],
  };
}

/** 作業の進め方の続き: rm などは守りが断るので、初めから kickoff-trash を使ってもらう（断られてやり直す手間を省く） */
export const TRASH_SECTION: PromptSection = {
  order: 210,
  heading: null,
  lines: [
    `- ファイル・フォルダを消すときは、rm・unlink・find -delete・git clean ではなく ${TRASH_COMMAND} <パス>… を使ってください（Kickoff のゴミ箱に入り、${TRASH_KEEP_DAYS} 日は利用者が元に戻せます。rm などは Kickoff が断ります。command not found なら "$KICKOFF_TRASH" <パス>… で呼べます）。`,
  ],
};

/** 参照資料（プロジェクトに参照資料がなければ null） */
export function referenceSection(project: Project): PromptSection | null {
  if (project.reference_paths.length === 0) return null;
  return {
    order: 600,
    heading: `## 参照資料`,
    lines: [
      `このプロジェクトでは、次のフォルダ・ファイルを参照資料として読めます。必要に応じて Read / Glob / Grep で読んでください（書き込みはできません）。`,
      ...project.reference_paths.map((r) => `- 「${referenceName(r.path)}」: \`${r.path}${r.kind === "folder" ? "/" : ""}\`（${r.kind === "folder" ? "フォルダ" : "ファイル"}）`),
      // プロジェクトフォルダ・ノートと同じく、名前で言われたら参照資料のことだと分かるようにする（似た名前でも）
      `- 利用者が「参照資料」と言ったら、この一覧のフォルダ・ファイルのことです。`,
      `- 利用者がフォルダ名・ファイル名を言ったら（「spec を見て」「design の画像」など）、まずこの一覧の名前と照らし合わせてください。完全に同じでなくても、大文字・小文字、区切り（- _ 空白）、単数・複数、略し方、日本語と英語の言い換えの違いだけなら、その参照資料のことです。「spec の api.md」のように中の場所を言われたら、その参照資料のフォルダからの場所として探してください。`,
      `- プロジェクトフォルダ・作業フォルダに同じ名前があるときは、そちらを先に見て、なければ参照資料を見てください。どれのことか分からないときは、候補を挙げて利用者に聞いてください。`,
      `- 参照資料のパス（\` \` の中）には空白が入ることがあります。シェルのコマンドで使うときは引用符で囲んでください。`,
    ],
  };
}

/** 参照資料の呼び名（パスの最後の名前。末尾の / は除く） */
function referenceName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
