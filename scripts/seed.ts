/**
 * 시드 스크립트 — 로컬/CI에서 1회 실행한다. 이미 행이 있으면 덮어쓰지 않는다 (SSOT 부록 A, 14.3).
 * 실행: npm run seed  (DATABASE_URL, MEMBER_PASSWORD, ADMIN_PASSWORD, RECOVERY_PEPPER 등 .env 필요)
 */
import postgres from "postgres";
import { hashPassword } from "../src/lib/password";

function setKst(ms: number, hour: number): number {
  const d = new Date(ms + 9 * 3600_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.getTime() - 9 * 3600_000;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL 환경변수가 필요합니다.");
  const sql = postgres(databaseUrl, { prepare: false, max: 1, ssl: "require" });

  try {
    const existingSettings = await sql`select id from settings where id = 1`;
    if (existingSettings.length === 0) {
      const now = Date.now();
      const submissionDeadline = setKst(now + 14 * 86400_000, 18);
      const voteStart = setKst(submissionDeadline + 86400_000, 9);
      const voteEnd = setKst(voteStart + 7 * 86400_000, 18);

      const payload = {
        siteName: "하나증권 AI 마켓",
        welcome: "하나증권 AI 마켓에 오신 것을 환영합니다.",
        description: "동료의 AI 아이디어를 발견하고, 함께 더 나은 업무를 만들어보세요.",
        notice: "좋아요는 응원입니다. 우수 작품 투표는 정해진 기간에 별도로 열립니다.",
        uploadGuide: "실명·사번·부서·고객정보·내부 기밀 및 권한 없는 저작물은 닉네임, 작품 설명, 첨부 파일에 포함하지 마세요.",
        submissionDeadline: iso(submissionDeadline),
        voteStart: iso(voteStart),
        voteEnd: iso(voteEnd),
        voteCount: 3,
        uploadsEnabled: true,
        requireApproval: false,
        version: 1,
        storyEnabled: true,
        storyTitle1: "내가 만든 AI 서비스가\n하나증권의 기준이 된다면?",
        storyCaption1: "한 사람의 아이디어가, 모두의 일하는 방식을 바꿉니다.",
        storyTitle2: "지금은, 여러분의 상상력을\n마음껏 발휘할 시간입니다.",
        storyCaption2: "보고서 한 장부터 일하는 방식까지. 가능성의 크기는 여러분이 정합니다.",
        storyTitle3: "지금 바로,\n여러분의 AI 서비스를\n공개해주세요!",
        storyCaption3: "여러분의 새로운 시도를 하나증권 AI 마켓에서 만나고 싶습니다.",
      };
      await sql`insert into settings (id, payload) values (1, ${sql.json(payload)})`;
      console.log("settings 시드 완료. 제출마감:", payload.submissionDeadline);
    } else {
      console.log("settings 행이 이미 있어 건너뜁니다.");
    }

    const existingCreds = await sql`select role from credentials`;
    const roles = new Set(existingCreds.map((r) => r.role as string));

    const memberPassword = process.env.MEMBER_PASSWORD;
    if (!roles.has("member")) {
      if (!memberPassword) throw new Error("MEMBER_PASSWORD 환경변수가 필요합니다.");
      const { salt, digest } = await hashPassword(memberPassword.trim().toLowerCase());
      await sql`insert into credentials (role, salt, digest) values ('member', ${salt}, ${digest})`;
      console.log("참여자 비밀번호 시드 완료.");
    } else {
      console.log("member 자격증명이 이미 있어 건너뜁니다.");
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!roles.has("admin")) {
      if (!adminPassword) throw new Error("ADMIN_PASSWORD 환경변수가 필요합니다.");
      const { salt, digest } = await hashPassword(adminPassword.trim());
      await sql`insert into credentials (role, salt, digest) values ('admin', ${salt}, ${digest})`;
      console.log("관리자 비밀번호 시드 완료.");
    } else {
      console.log("admin 자격증명이 이미 있어 건너뜁니다.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
