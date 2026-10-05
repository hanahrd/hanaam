import { createClient } from "@supabase/supabase-js";
import { env } from "../lib/env.js";

const BUCKET = "works";

let client: ReturnType<typeof createClient> | null = null;

/** 서버 전용 service role 클라이언트. 브라우저에 내려주지 않는다 (SSOT 9.1). */
export function storageAdmin() {
  if (!client) {
    client = createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** ① 서명 업로드 URL 발급. 브라우저가 이 URL로 직접 PUT한다 (SSOT 6.3). */
export async function createUploadUrl(objectKey: string): Promise<string> {
  const { data, error } = await storageAdmin().storage.from(BUCKET).createSignedUploadUrl(objectKey);
  if (error || !data) throw new Error("storage_error:" + (error?.message ?? "unknown"));
  return data.signedUrl;
}

/** 다운로드/표시용 서명 URL(60초 유효). download 지정 시 Content-Disposition 첨부. */
export async function createDownloadUrl(objectKey: string, expiresInSeconds: number, downloadName?: string): Promise<string> {
  const { data, error } = await storageAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(objectKey, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error("storage_error:" + (error?.message ?? "unknown"));
  return data.signedUrl;
}

/** 업로드 완료 확인용 — 객체의 실제 크기를 조회한다. 없으면 null. */
export async function getObjectSize(objectKey: string): Promise<number | null> {
  const { data, error } = await storageAdmin().storage.from(BUCKET).list("", { search: objectKey, limit: 100 });
  if (error || !data?.length) return null;
  const found = data.find((f) => f.name === objectKey);
  const size = (found?.metadata as { size?: number } | undefined)?.size;
  return typeof size === "number" ? size : null;
}

export async function removeObject(objectKey: string): Promise<void> {
  await storageAdmin().storage.from(BUCKET).remove([objectKey]);
}

/**
 * 업로드 완료 시 앞 N바이트를 읽어 시그니처 검사용으로 쓴다.
 * 서명 다운로드 URL + Range 헤더를 사용한다(구현 시 Supabase Storage 공식 문서로
 * Range 지원 여부를 재확인한다 — SSOT 부록 C).
 */
export async function readObjectHead(objectKey: string, bytes: number): Promise<Uint8Array | null> {
  const url = await createDownloadUrl(objectKey, 60);
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok && res.status !== 206) return null;
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
