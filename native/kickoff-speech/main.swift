// macOS の音声認識（SpeechAnalyzer。macOS 26 以上）で、音声のファイルを文字にする小さなコマンド。
// Kickoff のコアが、音声入力の文字起こしの方法「macOS の音声認識」で呼ぶ（src/core/voice/macos.ts）。
//
//   kickoff-speech check <言語>               使えるかを JSON で返す {"available":…,"locale":…,"installed":…}
//   kickoff-speech transcribe <言語> <ファイル>  起こした文を標準出力に書く（失敗は標準エラーに理由を書いて 1 で終わる）
//
// 言語は Kickoff の設定の値（ja・en・zh・ko・auto）。auto は自動の判別ができないので、Mac の言語で起こす
import AVFoundation
import Foundation
import Speech

/** 言語コードだけのとき、まず選ぶ地域 */
let preferredLocales = ["ja": "ja-JP", "en": "en-US", "zh": "zh-CN", "ko": "ko-KR"]

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func printJson(_ value: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  print(String(data: data, encoding: .utf8)!)
}

/** 設定の言語から、音声認識が対応している言語と地域を選ぶ（なければ nil） */
@available(macOS 26.0, *)
func resolveLocale(_ language: String) async -> Locale? {
  let supported = await SpeechTranscriber.supportedLocales
  let ids = supported.map { $0.identifier(.bcp47) }
  let wanted = language == "auto" ? Locale.current.identifier(.bcp47) : (preferredLocales[language] ?? language)
  if let i = ids.firstIndex(of: wanted) { return supported[i] }
  let code = String(wanted.split(separator: "-").first ?? Substring(wanted))
  if let preferred = preferredLocales[code], let i = ids.firstIndex(of: preferred) { return supported[i] }
  return supported.first { $0.language.languageCode?.identifier == code }
}

@available(macOS 26.0, *)
func check(_ language: String) async {
  guard SpeechTranscriber.isAvailable, let locale = await resolveLocale(language) else {
    printJson(["available": SpeechTranscriber.isAvailable, "locale": NSNull(), "installed": false])
    return
  }
  let id = locale.identifier(.bcp47)
  let installed = await SpeechTranscriber.installedLocales.contains { $0.identifier(.bcp47) == id }
  printJson(["available": true, "locale": id, "installed": installed])
}

@available(macOS 26.0, *)
func transcribe(_ language: String, _ path: String) async throws {
  guard SpeechTranscriber.isAvailable else { fail("この Mac では macOS の音声認識を使えません。") }
  guard let locale = await resolveLocale(language) else { fail("macOS の音声認識は、選んだ言語に対応していません。") }
  let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
  // 言語のモデルがまだなければ、macOS に落としてもらう（はじめの 1 回だけ）
  if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
    try await request.downloadAndInstall()
  }
  let analyzer = SpeechAnalyzer(modules: [transcriber])
  let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
  async let text: String = transcriber.results.reduce(into: "") { acc, result in acc += String(result.text.characters) }
  if let last = try await analyzer.analyzeSequence(from: file) {
    try await analyzer.finalizeAndFinish(through: last)
  } else {
    await analyzer.cancelAndFinishNow()
  }
  print(try await text)
}

let usage = "使い方: kickoff-speech check <言語> | transcribe <言語> <ファイル>"

@available(macOS 26.0, *)
func run(_ arguments: [String]) async {
  switch arguments[1] {
  case "check":
    await check(arguments[2])
  case "transcribe" where arguments.count >= 4:
    do {
      try await transcribe(arguments[2], arguments[3])
    } catch {
      fail(error.localizedDescription)
    }
  default:
    fail(usage)
  }
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else { fail(usage) }
if #available(macOS 26.0, *) {
  await run(arguments)
} else if arguments[1] == "check" {
  printJson(["available": false, "locale": NSNull(), "installed": false])
} else {
  fail("macOS の音声認識は macOS 26 以上で使えます。")
}
