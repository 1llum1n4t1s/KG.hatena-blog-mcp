export function assertValidXmlChars(value: string): string {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      continue;
    }
    throw new Error(
      `XML 1.0 で使用できない文字 U+${codePoint.toString(16).toUpperCase()} が含まれています。`,
    );
  }
  return value;
}
