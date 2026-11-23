// ブランチ・タグ・退避の操作の画面の表: 実行中の名前（失敗の見出しにも）・衝突したときの操作・送る前の確かめと入力
import type { GitBranchAction, GitMergePreview, GitOperation, GitRefs } from "@shared/git/types";
import { errorMessage } from "@shared/foundation/errors";
import { alert, confirm, prompt } from "@/foundation/ui/kit/ask";

type BranchActionKind = GitBranchAction["action"];
type BodyOf<K extends BranchActionKind> = Extract<GitBranchAction, { action: K }>;

/** 確かめに使う、いまの様子 */
export interface BranchActionContext {
  current: string | null;
  refs: GitRefs | undefined;
  /** この作業場所で作業中のチャットの数 */
  busyChats: number;
  /** ファイルが入れ替わる操作の前の注意（作業中のチャット・コミットしていない変更）。どちらもなければ空 */
  filesWarning: () => string[];
  /** マージ・リベースの見込み（失敗は投げる） */
  mergePreview: (branch: string) => Promise<GitMergePreview>;
}

/** 表の prepare で送るものを作れる操作（ほかは呼ぶ側が確かめて送る） */
export type PreparedBranchAction = Exclude<BranchActionKind, "checkout_remote" | "set_upstream" | "delete_branch" | "stash_save" | "stash_pop" | "stash_apply" | "stash_drop">;

interface BranchActionUi<K extends BranchActionKind> {
  label: string;
  /** 衝突して止まったときの操作（途中の操作の名前がないときに使う） */
  operation?: GitOperation;
  /** 送る前に確かめ・聞いて、送るものを作る（null ならやめる）。name は操作の相手、label はその見せ方。省いた操作は呼ぶ側が送るものを作る */
  prepare?: (ctx: BranchActionContext, name: string, label: string) => Promise<BodyOf<K> | null> | BodyOf<K>;
}

/** 確かめて、よければ body を返す */
const confirmed = async <B>(ok: Promise<unknown>, body: B): Promise<B | null> => ((await ok) ? body : null);

/** ファイルが入れ替わるチェックアウトの確かめ（注意がなければ聞かない） */
const confirmCheckout = (ctx: BranchActionContext, branch: string) => {
  const warnings = ctx.filesWarning();
  return warnings.length === 0 || confirm({ title: `「${branch}」をチェックアウト`, message: warnings.join("\n\n"), confirmLabel: "チェックアウト" });
};

/** 衝突したファイルを、ダイアログに出す数まで並べる */
export function fileList(files: string[], max = 8): string {
  const shown = files.slice(0, max).map((f) => `・${f}`);
  if (files.length > max) shown.push(`ほか ${files.length - max} 件`);
  return shown.join("\n");
}

/** マージ・リベースの前に見込みを見せて確かめる（取り込むものがなければ知らせるだけ） */
async function confirmMerge(ctx: BranchActionContext, kind: "merge" | "rebase", other: string): Promise<boolean> {
  const { current } = ctx;
  if (!current) {
    await alert("ブランチから外れています", "マージ・リベースは、ブランチをチェックアウトしてから行ってください。");
    return false;
  }
  let preview;
  try {
    preview = await ctx.mergePreview(other);
  } catch (e) {
    await alert("見込みを調べられませんでした", errorMessage(e));
    return false;
  }
  if (preview.up_to_date) {
    await alert("取り込むものはありません", `「${current}」には「${other}」のコミットがすべて入っています。`);
    return false;
  }
  const outlook = preview.fast_forward
    ? "早送りで済みます（衝突しません）。"
    : preview.conflicts.length > 0
      ? `衝突しそうなファイルがあります（${preview.conflicts.length} 件）:\n${fileList(preview.conflicts)}\n\n進めると衝突したところで止まり、変更タブで解いてから続けます（取りやめることもできます）。`
      : "衝突せずにできる見込みです。";
  const title = kind === "merge" ? `「${current}」に「${other}」をマージ` : `「${current}」を「${other}」の上にリベース`;
  return confirm({ title, message: [outlook, ...ctx.filesWarning()].join("\n\n"), confirmLabel: kind === "merge" ? "マージ" : "リベース" }).then((r) => r !== null);
}

export const BRANCH_ACTION_UI: { [K in BranchActionKind]: K extends PreparedBranchAction ? BranchActionUi<K> & Required<Pick<BranchActionUi<K>, "prepare">> : BranchActionUi<K> } = {
  checkout: { label: "チェックアウト", prepare: (ctx, branch) => confirmed(Promise.resolve(confirmCheckout(ctx, branch)), { action: "checkout", branch }) },
  // リモートのブランチは、追いかける手元のブランチがあるかで分かれるので呼ぶ側（useBranchActions の checkoutRemote）
  checkout_remote: { label: "チェックアウト" },
  checkout_detached: {
    label: "チェックアウト",
    prepare: (ctx, ref) =>
      confirmed(
        confirm({
          title: `「${ref}」をチェックアウト`,
          message: ["ブランチから外れた状態（detached HEAD）になります。ここでコミットするなら、先に新しいブランチを作ってください。", ...ctx.filesWarning()].join("\n\n"),
          confirmLabel: "チェックアウト",
        }),
        { action: "checkout_detached", ref },
      ),
  },
  fast_forward: { label: "早送り", prepare: (_, branch) => ({ action: "fast_forward", branch }) },
  pull: {
    label: "プル",
    operation: "merge",
    // いまのブランチは分かれていればマージになるので、作業中のチャットがあれば確かめる
    prepare: (ctx, branch) =>
      confirmed(
        Promise.resolve(branch !== ctx.current || ctx.busyChats === 0 || confirm({ title: `「${branch}」をプル`, message: ctx.filesWarning().join("\n\n"), confirmLabel: "プル" })),
        { action: "pull", branch },
      ),
  },
  push: {
    label: "プッシュ",
    prepare: (ctx, branch) => {
      const upstream = ctx.refs?.branches.find((b) => b.name === branch)?.upstream;
      return confirmed(
        confirm({
          title: `「${branch}」をプッシュ`,
          message: upstream ? `「${upstream}」へプッシュします。` : "まだリモートにないので、origin に同じ名前で公開し、追いかけるようにします。",
          confirmLabel: "プッシュ",
        }),
        { action: "push", branch },
      );
    },
  },
  push_pr: {
    label: "PR の作成",
    prepare: (_, branch) =>
      confirmed(confirm({ title: `「${branch}」をプッシュして PR を作る`, message: "プッシュしてから、GitHub に PR を作ります（タイトルと本文はコミットから）。", confirmLabel: "PR を作る" }), { action: "push_pr", branch }),
  },
  merge: { label: "マージ", operation: "merge", prepare: (ctx, branch) => confirmed(confirmMerge(ctx, "merge", branch), { action: "merge", branch }) },
  rebase: { label: "リベース", operation: "rebase", prepare: (ctx, branch) => confirmed(confirmMerge(ctx, "rebase", branch), { action: "rebase", branch }) },
  /** 新しいブランチ（name から。作ったらチェックアウトするかも選ぶ） */
  create_branch: {
    label: "ブランチの作成",
    prepare: async (ctx, from, fromLabel) => {
      const picked = await prompt({
        title: "新しいブランチ",
        message: `「${fromLabel}」から作ります。`,
        label: "ブランチの名前",
        placeholder: "例: feature/login",
        confirmLabel: "作る",
        checks: [{ label: "作ったらチェックアウトする", initial: ctx.busyChats === 0, help: (on) => (on && ctx.busyChats > 0 ? ctx.filesWarning()[0] : "") }],
      });
      return picked && { action: "create_branch", name: picked.value, from, checkout: picked.checked[0] };
    },
  },
  /** 新しいタグ（name に付ける。注釈つきのタグで、メッセージはタグの名前。origin にもプッシュするかも選ぶ） */
  create_tag: {
    label: "タグの作成",
    prepare: async (_, at, atLabel) => {
      const picked = await prompt({
        title: "新しいタグ",
        message: `「${atLabel}」に付けます。`,
        label: "タグの名前",
        placeholder: "例: v1.0.0",
        confirmLabel: "作る",
        checks: [{ label: "origin にもプッシュする", initial: false }],
      });
      return picked && { action: "create_tag", name: picked.value, at, message: picked.value, push: picked.checked[0] };
    },
  },
  set_upstream: { label: "追跡の設定" },
  rename_branch: {
    label: "名前の変更",
    prepare: async (_, branch) => {
      const name = (await prompt({ title: `「${branch}」の名前を変更`, label: "新しい名前", initial: branch, confirmLabel: "変更" }))?.value;
      return name && name !== branch ? { action: "rename_branch", branch, name } : null;
    },
  },
  // マージしていなければ強制で消すか確かめ直すので、呼ぶ側（useBranchActions の deleteBranch）
  delete_branch: { label: "ブランチの削除" },
  delete_remote_branch: {
    label: "リモートのブランチの削除",
    prepare: (_, remoteBranch) =>
      confirmed(confirm({ title: `リモートのブランチ「${remoteBranch}」を削除`, message: "リモートからブランチを消します（ほかの人の手元のブランチは残ります）。", confirmLabel: "削除", danger: true }), {
        action: "delete_remote_branch",
        remote_branch: remoteBranch,
      }),
  },
  push_tag: { label: "タグのプッシュ", prepare: (_, name) => confirmed(confirm({ title: `タグ「${name}」をプッシュ`, message: "origin へプッシュします。", confirmLabel: "プッシュ" }), { action: "push_tag", name }) },
  delete_tag: {
    label: "タグの削除",
    prepare: async (_, name) => {
      const picked = await confirm({ title: `タグ「${name}」を削除`, message: "手元のタグを消します。", confirmLabel: "削除", danger: true, checks: [{ label: "origin のタグも消す", initial: false }] });
      return picked && { action: "delete_tag", name, remote: picked.checked[0] };
    },
  },
  // 退避は useStashActions が確かめて送る
  stash_save: { label: "退避" },
  stash_pop: { label: "退避の取り出し" },
  stash_apply: { label: "退避の適用" },
  stash_drop: { label: "退避の削除" },
};

