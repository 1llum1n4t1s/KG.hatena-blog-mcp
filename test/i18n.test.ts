import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DICTIONARIES,
  detectLanguage,
  matchLanguage,
  SUPPORTED_LANGUAGES,
  translate,
} from "../src/i18n.js";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("辞書の整合", () => {
  it("locales ディレクトリが対応9言語と一致する", () => {
    const files = readdirSync(new URL("../src/locales/", import.meta.url))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(files).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it("全言語が同じキー集合と同じプレースホルダーを持つ", () => {
    const base = DICTIONARIES.en;
    for (const language of SUPPORTED_LANGUAGES) {
      const dict = DICTIONARIES[language];
      expect(Object.keys(dict).sort(), language).toEqual(Object.keys(base).sort());
      for (const key of Object.keys(base)) {
        expect(placeholders(dict[key] ?? ""), `${language}:${key}`).toEqual(
          placeholders(base[key] ?? ""),
        );
        expect((dict[key] ?? "").trim(), `${language}:${key}`).not.toBe("");
      }
    }
  });

  it("コードが参照するキーが辞書にある", () => {
    const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
    const keys = [...source.matchAll(/translate\("([^"]+)"/g)].map((m) => m[1] as string);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(DICTIONARIES.en[key], key).toBeDefined();
  });
});

describe("言語判定", () => {
  it("言語タグを仕様どおり照合する", () => {
    expect(matchLanguage("zh-Hans")).toBe("zh-CN");
    expect(matchLanguage("zh_SG.UTF-8")).toBe("zh-CN");
    expect(matchLanguage("zh-Hant-TW")).toBe("zh-TW");
    expect(matchLanguage("zh_HK")).toBe("zh-TW");
    expect(matchLanguage("zh-MO")).toBe("zh-TW");
    expect(matchLanguage("pt")).toBe("pt-BR");
    expect(matchLanguage("pt_PT.UTF-8")).toBe("pt-BR");
    expect(matchLanguage("ja-JP")).toBe("ja");
    expect(matchLanguage("de_DE@euro")).toBe("de");
    expect(matchLanguage("ru_RU")).toBe("en");
    for (const v of ["", "C", "C.UTF-8", "POSIX"]) expect(matchLanguage(v)).toBeUndefined();
  });

  it("優先順位 HATENA_BLOG_MCP_LANGUAGE → LC_ALL → LC_MESSAGES → LANG → Intl → en", () => {
    const all = {
      HATENA_BLOG_MCP_LANGUAGE: "ko",
      LC_ALL: "fr",
      LC_MESSAGES: "de",
      LANG: "es",
    };
    expect(detectLanguage(all, "ja")).toBe("ko");
    expect(detectLanguage({ ...all, HATENA_BLOG_MCP_LANGUAGE: "" }, "ja")).toBe("fr");
    expect(detectLanguage({ LC_MESSAGES: "de", LANG: "es" }, "ja")).toBe("de");
    expect(detectLanguage({ LC_ALL: "C", LANG: "es_ES.UTF-8" }, "ja")).toBe("es");
    expect(detectLanguage({ LANG: "C.UTF-8" }, "pt-BR")).toBe("pt-BR");
    expect(detectLanguage({}, "")).toBe("en");
  });
});

describe("translate", () => {
  it("プレースホルダーを置換し、言語ごとに出し分ける", () => {
    expect(translate("cli.startFailed", { errorName: "Boom" }, "en")).toContain("(Boom)");
    expect(translate("cli.startFailed", { errorName: "Boom" }, "ja")).toContain("起動できません");
  });
});
