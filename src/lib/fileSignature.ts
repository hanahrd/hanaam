// 확장자 ↔ MIME ↔ 시그니처 (SSOT 6.3)
export const EXT_MIME: Record<string, string> = {
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? null;
}

function matchesAt(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

type Checker = (bytes: Uint8Array) => boolean;

const CHECKERS: Record<string, Checker> = {
  "application/pdf": (b) => matchesAt(b, 0, [0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/png": (b) => matchesAt(b, 0, [0x89, 0x50, 0x4e, 0x47]),
  "image/jpeg": (b) => matchesAt(b, 0, [0xff, 0xd8, 0xff]),
  "image/gif": (b) => matchesAt(b, 0, [0x47, 0x49, 0x46, 0x38]),
  "image/webp": (b) => matchesAt(b, 0, [0x52, 0x49, 0x46, 0x46]) && matchesAt(b, 8, [0x57, 0x45, 0x42, 0x50]),
  "video/mp4": (b) => matchesAt(b, 4, [0x66, 0x74, 0x79, 0x70]), // ftyp (offset 4)
  "video/quicktime": (b) => matchesAt(b, 4, [0x66, 0x74, 0x79, 0x70]),
  "video/webm": (b) => matchesAt(b, 0, [0x1a, 0x45, 0xdf, 0xa3]),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (b) => matchesAt(b, 0, [0x50, 0x4b]), // zip
  "application/vnd.ms-powerpoint": (b) => matchesAt(b, 0, [0xd0, 0xcf, 0x11, 0xe0]),
};

/** 앞 4KB 시그니처 검사 (악성파일 검사 아님, SSOT 6.3). */
export function verifySignature(mime: string, head: Uint8Array): boolean {
  const check = CHECKERS[mime];
  if (!check) return false;
  return check(head);
}
