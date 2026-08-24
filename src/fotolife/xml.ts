import { XMLParser } from "fast-xml-parser";
import { AtomPubError } from "../atompub/errors.js";
import { MAX_IMAGE_BASE64_CHARS, MAX_IMAGE_BYTES } from "../utils/limits.js";
import { assertValidXmlChars } from "../utils/xml.js";
import type { FotolifeImage, FotolifeUploadPayload } from "./types.js";

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true,
  removeNSPrefix: true,
  textNodeName: "#text",
  isArray: (name) => {
    const localName = name.split(":").at(-1) ?? name;
    return localName === "entry" || localName === "link";
  },
});

function parse(xml: string): XmlNode {
  try {
    return parser.parse(xml) as XmlNode;
  } catch (cause) {
    throw new AtomPubError("Failed to parse Fotolife XML", {
      status: 0,
      code: "parse_error",
      body: xml.slice(0, 500),
      cause,
    });
  }
}

function asObject(value: unknown): XmlNode {
  if (value === null || value === undefined || typeof value !== "object") return {};
  return value as XmlNode;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const text = (value as XmlNode)["#text"];
    if (typeof text === "string") return text;
  }
  return undefined;
}

function escapeText(value: string): string {
  assertValidXmlChars(value);
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function normalizeBlogSyntax(syntax: string): string {
  const bare = syntax
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/:image$/, ":plain");
  return `[${bare}]`;
}

function photoFromNode(node: XmlNode): FotolifeImage {
  const links = asArray(node.link as XmlNode | XmlNode[] | undefined);
  let pageUrl: string | undefined;
  let editUrl: string | undefined;
  for (const link of links) {
    const rel = link["@_rel"];
    const href = link["@_href"];
    if (typeof href !== "string") continue;
    if (rel === "alternate") pageUrl = href;
    if (rel === "service.edit" || rel === "edit") editUrl = href;
  }

  const syntax = asString(node.syntax) ?? "";
  const idFromEdit = editUrl ? /\/atom\/edit\/([^/?#]+)/.exec(editUrl)?.[1] : undefined;
  const idFromSyntax = /:([0-9]+)[a-z]?:/.exec(syntax)?.[1];
  const id = idFromEdit ?? idFromSyntax ?? "";
  const imageUrl = asString(node.imageurl) ?? "";
  if (!id || !syntax || !imageUrl) {
    throw new AtomPubError("Fotolife response is missing required image fields", {
      status: 0,
      code: "parse_error",
    });
  }

  return {
    id,
    title: asString(node.title) ?? "",
    syntax,
    blogSyntax: normalizeBlogSyntax(syntax),
    imageUrl,
    ...(asString(node.imageurlsmall) !== undefined
      ? { imageUrlSmall: asString(node.imageurlsmall) as string }
      : {}),
    ...(pageUrl !== undefined ? { pageUrl } : {}),
    ...(editUrl !== undefined ? { editUrl } : {}),
    ...(asString(node.subject) !== undefined ? { folder: asString(node.subject) as string } : {}),
    ...(asString(node.issued) !== undefined ? { issued: asString(node.issued) as string } : {}),
  };
}

export function normalizeImageBase64(data: string): string {
  if (data.length > MAX_IMAGE_BASE64_CHARS) {
    throw new Error(`画像は${MAX_IMAGE_BYTES / 1024 / 1024} MiB以下にしてください。`);
  }
  const compact = data.replace(/\s+/g, "");
  if (!compact) throw new Error("画像のbase64データが空です。");
  if (
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)
  ) {
    throw new Error("画像のbase64データが不正です。");
  }
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const decodedBytes = (compact.length / 4) * 3 - padding;
  if (decodedBytes > MAX_IMAGE_BYTES) {
    throw new Error(`画像は${MAX_IMAGE_BYTES / 1024 / 1024} MiB以下にしてください。`);
  }
  return compact;
}

export function buildFotolifeUploadXml(payload: FotolifeUploadPayload): string {
  const data = normalizeImageBase64(payload.dataBase64);
  const folder = payload.folder ?? "Hatena Blog";
  const generator = payload.generator ?? "hatena-blog-mcp";
  return (
    '<entry xmlns="http://purl.org/atom/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<title>${escapeText(payload.title)}</title>` +
    `<content mode="base64" type="${escapeAttr(payload.contentType)}">${data}</content>` +
    `<dc:subject>${escapeText(folder)}</dc:subject>` +
    `<generator>${escapeText(generator)}</generator>` +
    "</entry>"
  );
}

export function parseFotolifeImage(xml: string): FotolifeImage {
  const doc = parse(xml);
  const raw = doc.entry;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  if (!entry || typeof entry !== "object") {
    throw new AtomPubError("Expected <entry> root element for Fotolife image", {
      status: 0,
      code: "parse_error",
    });
  }
  return photoFromNode(asObject(entry));
}
