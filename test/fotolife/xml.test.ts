import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFotolifeUploadXml,
  normalizeImageBase64,
  parseFotolifeImage,
} from "../../src/fotolife/xml.js";
import { MAX_IMAGE_BASE64_CHARS } from "../../src/utils/limits.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");

describe("Fotolife XML", () => {
  it("画像エントリをblog_syntax付きで解析する", () => {
    const image = parseFotolifeImage(readFileSync(join(fixtures, "fotolife-entry.xml"), "utf8"));
    expect(image.id).toBe("20260824010101");
    expect(image.blogSyntax).toBe("[f:id:example_user:20260824010101p:plain]");
    expect(image.folder).toBe("Hatena Blog");
  });

  it("アップロードXMLへ画像・フォルダ・タイトルを含める", () => {
    const xml = buildFotolifeUploadXml({
      title: "A & B",
      contentType: "image/png",
      dataBase64: "aGVsbG8=",
      folder: "Hatena Blog",
    });
    expect(xml).toContain("<title>A &amp; B</title>");
    expect(xml).toContain('content mode="base64" type="image/png"');
    expect(xml).toContain("<dc:subject>Hatena Blog</dc:subject>");
  });

  it("不正なbase64を拒否する", () => {
    expect(() => normalizeImageBase64("***")).toThrow("不正");
  });

  it("名前空間prefixが変わっても画像フィールドを解析する", () => {
    const xml = readFileSync(join(fixtures, "fotolife-entry.xml"), "utf8")
      .replaceAll("xmlns:hatena", "xmlns:x")
      .replaceAll("hatena:", "x:")
      .replaceAll("xmlns:dc", "xmlns:y")
      .replaceAll("dc:", "y:");
    const image = parseFotolifeImage(xml);
    expect(image.imageUrl).toContain("20260824010101.png");
    expect(image.folder).toBe("Hatena Blog");
  });

  it("entry以外のルートを拒否する", () => {
    expect(() => parseFotolifeImage("<feed/>")).toThrow(/entry/);
  });

  it("XML 1.0で禁止された文字を拒否する", () => {
    expect(() =>
      buildFotolifeUploadXml({
        title: "bad\u0000title",
        contentType: "image/png",
        dataBase64: "aGVsbG8=",
      }),
    ).toThrow(/XML 1.0/);
  });

  it("10 MiBを超えるbase64入力を処理前に拒否する", () => {
    expect(() => normalizeImageBase64("A".repeat(MAX_IMAGE_BASE64_CHARS + 1))).toThrow(/10 MiB/);
  });
});
