import assert from "node:assert/strict";
import { test } from "node:test";
import { findHeredocs } from "./heredoc";

const find = (code: string) => findHeredocs(code.split("\n"));
const langOf = (code: string) => find(code)[0]?.lang;

test("findHeredocs: 本文の行の範囲（終わりの区切りの行は含めない）と、実行するコマンドからの言語", () => {
  const code = ["python3 - <<'EOF'", "import pathlib", 'p = pathlib.Path("src/core/http/server.ts")', "EOF", "echo done"].join("\n");
  assert.deepEqual(find(code), [{ start: 1, end: 3, lang: "python" }]);
});

test("findHeredocs: 続けて書いた heredoc はそれぞれ見つけ、1 行に 2 つあれば本文はその順に続く", () => {
  const code = ["python3 - <<'EOF'", "print(1)", "EOF", "cat > src/a.ts <<'EOF'", "const a = 1;", "EOF"].join("\n");
  assert.deepEqual(find(code), [
    { start: 1, end: 2, lang: "python" },
    { start: 4, end: 5, lang: "typescript" },
  ]);
  assert.deepEqual(find(["cat <<A <<B", "a", "A", "b", "B"].join("\n")), [
    { start: 1, end: 2, lang: undefined },
    { start: 3, end: 4, lang: undefined },
  ]);
});

test("findHeredocs: ファイルへの書き出し（cat > / >| / >> ・<< の後ろの書き出し・tee）は、そのファイルの種類", () => {
  assert.equal(langOf("cat > src/a.ts <<'EOF'\nconst a = 1;\nEOF"), "typescript");
  assert.equal(langOf("cat <<'EOF' >| /tmp/net-watch.mjs\nconsole.log(1)\nEOF"), "javascript");
  assert.equal(langOf("cat >>notes.md <<EOF\n# 見出し\nEOF"), "markdown");
  assert.equal(langOf('cat > "conf/app.yaml" <<EOF\na: 1\nEOF'), "yaml");
  assert.equal(langOf("tee -a config.json <<EOF\n{}\nEOF"), "json");
  // 書き出し先の分からない cat・エラーの書き出し（2>）だけのものは分からない
  assert.equal(langOf("cat <<EOF\nhello\nEOF"), undefined);
  assert.equal(langOf("cat 2>/dev/null <<EOF\nhello\nEOF"), undefined);
});

test("findHeredocs: コードを標準入力から読むときだけ、実行するコマンドの言語（前の環境変数・sudo・uv run・パスは飛ばす）", () => {
  assert.equal(langOf("cd /x && FOO=1 uv run python - <<EOF\nprint(1)\nEOF"), "python");
  assert.equal(langOf("/usr/bin/python3 -I - \"$f\" <<'EOF'\nprint(1)\nEOF"), "python");
  assert.equal(langOf("node --input-type=module - <<'EOF'\nimport fs from 'node:fs';\nEOF"), "javascript");
  assert.equal(langOf("bash -s <<'EOF'\necho hi\nEOF"), "shellscript");
  // 実行するファイル・-c / -e のコードを渡したら、heredoc はその入力のデータ
  assert.equal(langOf("python3 script.py <<EOF\n1 2\nEOF"), undefined);
  assert.equal(langOf('node -e "process.stdin.pipe(process.stdout)" <<EOF\nhello\nEOF'), undefined);
  // データベースのコマンドは、ファイルを渡しても本文は SQL
  assert.equal(langOf("sqlite3 db.sqlite <<'SQL'\nselect 1;\nSQL"), "sql");
  // コマンドからは決まらないもの
  assert.equal(langOf("git commit -q -F - <<'EOF'\nfix: 直す\nEOF"), undefined);
});

test("findHeredocs: コマンドから決まらなければ、区切りの名前（SQL・PY など）から", () => {
  assert.equal(langOf("some-tool <<'SQL'\nselect 1;\nSQL"), "sql");
  assert.equal(langOf("ssh host <<PY\nprint(1)\nPY"), "python");
});

test("findHeredocs: <<- は終わりの区切りの行の先頭のタブを許す", () => {
  assert.deepEqual(find("cat <<-EOF > a.py\n\tprint(1)\n\tEOF"), [{ start: 1, end: 2, lang: "python" }]);
});

test("findHeredocs: <<<・引用符の中・コメント・計算の << と、閉じていないものは heredoc にしない", () => {
  assert.deepEqual(find('cat <<< "$x"\nx'), []);
  assert.deepEqual(find('echo "a << b"\nb'), []);
  assert.deepEqual(find("echo $((1 << 2))\n2"), []);
  assert.deepEqual(find("# 例: cat <<EOF\nEOF"), []);
  // 複数行の文字列の中も（引用符は行をまたいで数える）
  assert.deepEqual(find('echo "start\nx << y\nend"\ny'), []);
  // 終わりの区切りがない（見間違いかもしれない）ものは本文として扱わず、続きの行もふつうに読む
  assert.deepEqual(find("python3 - <<'EOF'\nprint(1)"), []);
  assert.deepEqual(find("echo a << b\ncat > a.ts <<EOF\nconst a = 1;\nEOF"), [{ start: 2, end: 3, lang: "typescript" }]);
});
