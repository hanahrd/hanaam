import { randomBytes } from "node:crypto";

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** 내부 전용. 24자리 hex (SSOT 2.1). 참여자 응답에 노출하지 않는다. */
export const newParticipantId = (): string => hex(12);

/** Storage 객체 키 = files.id. 난수 32자리 hex (SSOT 6.2). */
export const newFileId = (): string => hex(16);

export const newWorkId = (): string => hex(16);

export const newBallotId = (): string => hex(16);
