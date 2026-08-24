export type FotolifeContentType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "image/bmp";

export interface FotolifeImage {
  id: string;
  title: string;
  syntax: string;
  blogSyntax: string;
  imageUrl: string;
  imageUrlSmall?: string;
  pageUrl?: string;
  editUrl?: string;
  folder?: string;
  issued?: string;
}

export interface FotolifeUploadPayload {
  title: string;
  contentType: FotolifeContentType;
  dataBase64: string;
  folder?: string;
  generator?: string;
}
