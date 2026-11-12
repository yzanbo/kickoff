import assert from "node:assert/strict";
import { test } from "node:test";
import { redactSecrets } from "./redact";

test("redactSecrets: 8 つの形を名前つきで伏せ、数を返す", () => {
  const cases: [string, string][] = [
    ["key=AKIAIOSFODNN7EXAMPLE", "key=[伏せた値: AWS のアクセスキー]"],
    [`token ghp_${"a".repeat(36)} end`, "token [伏せた値: GitHub のトークン] end"],
    [`github_pat_${"A1_".repeat(10)}`, "[伏せた値: GitHub のトークン]"],
    [`sk-ant-api03-${"x".repeat(30)}`, "[伏せた値: Anthropic の API キー]"],
    [`OPENAI=sk-proj-${"a1".repeat(15)}`, "OPENAI=[伏せた値: API キー]"],
    ["xoxb-1234567890-abcdefghij", "[伏せた値: Slack のトークン]"],
    [`AIza${"B".repeat(35)}`, "[伏せた値: Google の API キー]"],
    [`sk_live_${"c".repeat(24)}`, "[伏せた値: Stripe の秘密鍵]"],
    ["-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\nafter", "[伏せた値: 秘密鍵]\nafter"],
    ["postgres://app:s3cret@db.example.com:5432/shop", "postgres://app:[伏せた値: URL のパスワード]@db.example.com:5432/shop"],
  ];
  for (const [input, expected] of cases) assert.deepEqual(redactSecrets(input), { text: expected, count: 1 }, input);
});

test("redactSecrets: @ を含む URL のパスワードは最後の @ まで、パスのあとの @ は含めない", () => {
  assert.equal(redactSecrets("mysql://root:p@ss@host/db").text, "mysql://root:[伏せた値: URL のパスワード]@host/db");
  assert.equal(redactSecrets("https://u:pw@host/a?x=a@b").text, "https://u:[伏せた値: URL のパスワード]@host/a?x=a@b");
});

test("redactSecrets: 終わりのない秘密鍵（切った中身）は終わりまで伏せる", () => {
  assert.deepEqual(redactSecrets("x\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc"), { text: "x\n[伏せた値: 秘密鍵]", count: 1 });
});

test("redactSecrets: 鍵らしくないものは伏せない", () => {
  for (const text of ["sk-learn-is-a-python-library-name", "task-1234567890123456789012", "https://example.com/a@b", "ユーザー名とパスワード", "ghp_short"]) {
    assert.deepEqual(redactSecrets(text), { text, count: 0 }, text);
  }
});

test("redactSecrets: いくつもあれば全部数える", () => {
  const result = redactSecrets(`AKIAIOSFODNN7EXAMPLE と ASIAIOSFODNN7EXAMPLE と postgres://a:b@h`);
  assert.equal(result.count, 3);
});
