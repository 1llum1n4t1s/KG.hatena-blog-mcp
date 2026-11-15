// 人が読む文言（CLI の起動時メッセージ）を9言語で出し分ける最小の仕組み。
// AI が読む文言（MCP ツールの説明・応答・エラー）は英語固定で、ここでは扱わない。
//
// 言語の決め方: HATENA_BLOG_MCP_LANGUAGE → LC_ALL → LC_MESSAGES → LANG → Intl の既定ロケール → en。
// 環境変数は「空・C・POSIX 以外で最初に見つかった値」で決め、未対応の言語なら英語にする。
import de from "./locales/de.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import ja from "./locales/ja.json" with { type: "json" };
import ko from "./locales/ko.json" with { type: "json" };
import ptBR from "./locales/pt-BR.json" with { type: "json" };
import zhCN from "./locales/zh-CN.json" with { type: "json" };
import zhTW from "./locales/zh-TW.json" with { type: "json" };

export const SUPPORTED_LANGUAGES = [
  "ja",
  "en",
  "zh-CN",
  "zh-TW",
  "ko",
  "es",
  "fr",
  "de",
  "pt-BR",
] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export type MessageKey = keyof typeof en;

export const DICTIONARIES: Record<Language, Record<string, string>> = {
  ja,
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ko,
  es,
  fr,
  de,
  "pt-BR": ptBR,
};

/**
 * ロケール文字列を対応言語へ照合する。空・C・POSIX は判定材料にならないため undefined を返す。
 * zh-Hans/CN/SG は zh-CN、zh-Hant/TW/HK/MO は zh-TW、pt-* は pt-BR、それ以外は主言語で照合する。
 */
export function matchLanguage(value: string): Language | undefined {
  const base = (value.trim().split(/[.@]/)[0] ?? "").toLowerCase();
  if (base === "" || base === "c" || base === "posix") return undefined;
  const [primary = "", ...rest] = base.split(/[_-]/);
  if (primary === "zh") {
    return rest.some((part) => ["hant", "tw", "hk", "mo"].includes(part)) ? "zh-TW" : "zh-CN";
  }
  if (primary === "pt") return "pt-BR";
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as Language)
    : "en";
}

/** 環境変数と Intl から言語を決める。env と intlLocale はテストで差し替える。 */
export function detectLanguage(
  env: NodeJS.ProcessEnv = process.env,
  intlLocale?: string,
): Language {
  for (const name of ["HATENA_BLOG_MCP_LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"]) {
    const matched = matchLanguage(env[name] ?? "");
    if (matched) return matched;
  }
  try {
    const locale = intlLocale ?? Intl.DateTimeFormat().resolvedOptions().locale;
    return matchLanguage(locale) ?? "en";
  } catch {
    return "en";
  }
}

/** 辞書に無いキーは英語、英語にも無ければキー自体を返す。{name} 形式のプレースホルダーを置換する。 */
export function translate(
  key: MessageKey,
  params: Record<string, string> = {},
  language: Language = detectLanguage(),
): string {
  const template = DICTIONARIES[language][key] ?? DICTIONARIES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}
