// AI のファイルを消すコマンドの守り（純粋な関数。メモの仕様書「ファイル削除」の Q2〜Q5・Q9）:
// rm・unlink・shred・find -delete・find -exec rm・git clean は消したものを戻せないので、どこのファイルでも断り、
// Kickoff のゴミ箱に入れる kickoff-trash を使うよう AI に伝える（AI がやり直す。コマンドは書き換えない）。
// rmdir（空のフォルダしか消せない）・git rm（コミット済みなら Git から戻せる）は断らない。抜け道（完全に消す例外）は作らない。
// うっかりを防ぐもので、スクリプトのファイル・Python の os.remove など、わざと避ける書き方までは見抜けない
import path from "node:path";
import { commandWords, splitCommands, type Word } from "./shellWords.js";

/** Kickoff のゴミ箱に入れるコマンドの名前（PATH に入れて AI に渡す。trash/command.ts が置く） */
export const TRASH_COMMAND = "kickoff-trash";

/** そのまま消すコマンド */
const DELETE_COMMANDS = new Set(["rm", "unlink", "shred", "srm"]);
/** find の、後ろのコマンドを流すオプション */
const FIND_EXEC = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
/** git のサブコマンドより前の、値を取るオプション */
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
/** 文字列をシェルの文として流すもの（中の文も見る） */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

type Found = { kind: "delete"; what: string } | { kind: "git_clean" };

const base = (w: Word | undefined) => (w ? path.basename(w.text) : "");

/** git clean が下見（-n・--dry-run）だけか */
function isDryRun(args: Word[]): boolean {
  return args.some((w) => w.text === "--dry-run" || (/^-[a-zA-Z]+$/.test(w.text) && w.text.includes("n")));
}

/** 1 つのコマンドの語から、消すものを見つける（なければ null） */
function findInWords(segment: Word[], depth: number): Found | null {
  const { words } = commandWords(segment);
  const head = base(words[0]);
  if (!head) return null;
  if (DELETE_COMMANDS.has(head)) return { kind: "delete", what: head };
  if (head === "xargs") {
    // xargs のオプションの後ろの最初のコマンド
    const cmd = words.slice(1).find((w) => !w.text.startsWith("-"));
    if (cmd && DELETE_COMMANDS.has(base(cmd))) return { kind: "delete", what: `xargs ${base(cmd)}` };
    return null;
  }
  if (head === "find") {
    if (words.some((w) => w.text === "-delete")) return { kind: "delete", what: "find -delete" };
    for (let i = 1; i < words.length - 1; i++) {
      if (FIND_EXEC.has(words[i].text) && DELETE_COMMANDS.has(base(words[i + 1]))) return { kind: "delete", what: `find ${words[i].text} ${base(words[i + 1])}` };
    }
    return null;
  }
  if (head === "git") {
    let i = 1;
    while (i < words.length && words[i].text.startsWith("-")) i += GIT_GLOBAL_WITH_VALUE.has(words[i].text) ? 2 : 1;
    if (words[i]?.text === "clean" && !isDryRun(words.slice(i + 1))) return { kind: "git_clean" };
    return null;
  }
  // sh -c '…' / bash -c "…" の中の文も見る（入れ子は 3 段まで）
  if (SHELLS.has(head) && depth < 3) {
    const at = words.findIndex((w) => w.text === "-c" || /^-[a-z]*c$/.test(w.text));
    const script = at > 0 ? words[at + 1] : undefined;
    if (script) return findIn(script.text, depth + 1);
  }
  return null;
}

function findIn(command: string, depth: number): Found | null {
  for (const segment of splitCommands(command)) {
    const found = findInWords(segment, depth);
    if (found) return found;
  }
  return null;
}

/** 断るときに AI に返す文（コマンドの書き方と、ゴミ箱に入って 3 日は戻せること） */
export function deleteDeniedReason(found: Found): string {
  const how = `代わりに ${TRASH_COMMAND} <パス>…（rm と同じく、いくつでも並べられます。-r・-f は要りません。command not found なら "$KICKOFF_TRASH" <パス>… で呼べます）を使ってください。Kickoff のゴミ箱に入り、3 日は利用者が元に戻せます`;
  if (found.kind === "git_clean") {
    return `Kickoff では git clean を使えません（Git にない新しいファイルを、戻せない形で消すため）。git clean -n で消えるものの一覧を見てから、${how}`;
  }
  return `Kickoff では ${found.what} でファイルを消せません（消したものを戻せないため。どこのファイルでも同じです）。${how}`;
}

type Decision = { decision: "pass" } | { decision: "deny"; reason: string };

/** ツールの呼び出しがファイルを消すコマンド（Bash）なら断る */
export function evaluateDeleteCommand(toolName: string, input: Record<string, unknown>): Decision {
  if (toolName !== "Bash" || typeof input.command !== "string") return { decision: "pass" };
  const found = findIn(input.command, 0);
  return found ? { decision: "deny", reason: deleteDeniedReason(found) } : { decision: "pass" };
}
