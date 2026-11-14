// AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れるコマンド）。起動のときにデータのフォルダの bin/ に置き、チャットの PATH に足す。
// 置き場の形（<id>/origin・chat・at と item/<名前>）は TrashService.importInbox が読む。uuidgen・mv・date は macOS のもの
import fs from "node:fs/promises";
import path from "node:path";
import { TRASH_COMMAND } from "../chat/guard/deleteGuard.js";

/** コマンドの中身（sh）。置き場は KICKOFF_TRASH_DIR、消したチャットは KICKOFF_CHAT_ID（どちらも Kickoff がチャットに渡す） */
export const TRASH_COMMAND_SCRIPT = `#!/bin/sh
# Kickoff のゴミ箱に入れる（rm の代わり。Kickoff が置いたもの。3 日は利用者が元に戻せる）
# 使い方: ${TRASH_COMMAND} <パス>…（rm の -r・-f などの印は読み飛ばす。- で始まる名前は -- のあとに書く）
dir="\${KICKOFF_TRASH_DIR:-}"
if [ -z "$dir" ]; then
  echo "${TRASH_COMMAND}: Kickoff のチャットの中でだけ使えます（KICKOFF_TRASH_DIR がありません）" >&2
  exit 2
fi
if [ "$#" -eq 0 ]; then
  echo "使い方: ${TRASH_COMMAND} <パス>…" >&2
  exit 2
fi
status=0
names_only=0
for arg in "$@"; do
  if [ "$names_only" = 0 ]; then
    case "$arg" in
      --) names_only=1; continue ;;
      -*) continue ;;
    esac
  fi
  if [ ! -e "$arg" ] && [ ! -L "$arg" ]; then
    echo "${TRASH_COMMAND}: $arg: ありません" >&2
    status=1
    continue
  fi
  name=$(basename -- "$arg")
  parent=$(cd -P -- "$(dirname -- "$arg")" && pwd -P) || { status=1; continue; }
  case "$name" in
    .|..|/) echo "${TRASH_COMMAND}: $arg: これは入れられません" >&2; status=1; continue ;;
  esac
  if [ "$parent" = "/" ]; then abs="/$name"; else abs="$parent/$name"; fi
  case "$abs" in
    "$HOME"|"$dir"|"$dir"/*) echo "${TRASH_COMMAND}: $abs: これは入れられません" >&2; status=1; continue ;;
  esac
  id=$(uuidgen | tr 'A-Z' 'a-z')
  mkdir -p "$dir/$id/item" || { status=1; continue; }
  printf '%s' "$abs" > "$dir/$id/origin"
  printf '%s' "\${KICKOFF_CHAT_ID:-}" > "$dir/$id/chat"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/$id/at"
  if mv -- "$arg" "$dir/$id/item/$name"; then
    echo "Kickoff のゴミ箱に入れました（3 日は元に戻せます）: $abs [${TRASH_COMMAND}:$id]"
  else
    rm -rf -- "$dir/$id"
    status=1
  fi
done
exit $status
`;

/** チャットに渡す kickoff-trash の場所と置き場 */
export interface TrashCommand {
  /** コマンドのファイル（<データのフォルダ>/bin/kickoff-trash） */
  path: string;
  /** ゴミ箱の置き場（TrashService.dir） */
  dir: string;
}

/** bin/ にコマンドを置く（中身が同じなら書き直さない）。置いた場所を返す */
export async function installTrashCommand(binDir: string): Promise<string> {
  const file = path.join(binDir, TRASH_COMMAND);
  const current = await fs.readFile(file, "utf8").catch(() => null);
  if (current !== TRASH_COMMAND_SCRIPT) {
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(file, TRASH_COMMAND_SCRIPT, { mode: 0o755 });
  }
  await fs.chmod(file, 0o755);
  return file;
}

/** チャットの AI に渡す環境変数（PATH の前にコマンドのフォルダ・置き場・消したチャット・コマンドの場所） */
export function trashCommandEnv(command: TrashCommand, chatId: number, basePath = process.env.PATH ?? ""): Record<string, string> {
  return {
    PATH: [path.dirname(command.path), basePath].filter(Boolean).join(":"),
    KICKOFF_TRASH_DIR: command.dir,
    KICKOFF_CHAT_ID: String(chatId),
    KICKOFF_TRASH: command.path,
  };
}
