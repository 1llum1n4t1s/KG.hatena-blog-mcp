import type { BasicCredentials } from "../utils/auth.js";

interface WsseOptions {
  created?: string;
  nonce?: Uint8Array;
}

function apiKeyFromBasicHeader(authHeader: string): string {
  const match = /^Basic\s+(.+)$/i.exec(authHeader.trim());
  if (!match?.[1]) throw new Error("Basic Authorization header is required for Fotolife");
  let decoded: string;
  try {
    decoded = atob(match[1]);
  } catch {
    throw new Error("Basic Authorization header has invalid base64");
  }
  const colon = decoded.indexOf(":");
  if (colon <= 0 || colon === decoded.length - 1) {
    throw new Error("Basic Authorization payload must contain an API key");
  }
  return decoded.slice(colon + 1);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(new ArrayBuffer(first.length + second.length));
  combined.set(first, 0);
  combined.set(second, first.length);
  return combined;
}

export async function buildWsseHeaders(
  credentials: BasicCredentials,
  options: WsseOptions = {},
): Promise<Record<string, string>> {
  const apiKey = apiKeyFromBasicHeader(credentials.authHeader);
  const nonce = options.nonce ?? crypto.getRandomValues(new Uint8Array(20));
  const created = options.created ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const encoder = new TextEncoder();
  const digestInput = concatBytes(nonce, encoder.encode(created + apiKey));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", digestInput));
  const xWsse =
    `UsernameToken Username="${credentials.hatenaId}", ` +
    `PasswordDigest="${bytesToBase64(digest)}", ` +
    `Nonce="${bytesToBase64(nonce)}", Created="${created}"`;

  return {
    Authorization: 'WSSE profile="UsernameToken"',
    "X-WSSE": xWsse,
  };
}
