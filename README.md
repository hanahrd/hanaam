# 하나증권 AI 마켓 (v1.3)

AI 활용 공모전 사내 플랫폼. 사양은 [`docs/SSOT.md`](docs/SSOT.md) 전체를 기준으로 합니다. **역할이 셋입니다:** 제작자(업로더, 관리자가 생성한 닉네임+비밀번호로 `/`에서 로그인), 투표자(일반사용자, 로그인 없이 `/vote`에서 투표), 관리자(공통 비밀번호, `/admin`). 실명·사번·부서는 수집하지 않습니다.

## 구조
```
/public          정적 페이지
  /              제작자 포털 (index.html, data-portal="member")
  /vote          투표자 포털 (vote/index.html, data-portal="voter", 로그인 없음)
  /admin         관리자 포털 (admin/index.html, data-portal="admin")
  app.js, story.js, fonts.js, base.css, story.css, brand.css   세 포털이 공유
/api/index.ts     Hono 진입점 (Vercel Node.js Function)
/src              routes/ auth/ db/ storage/ lib/ (서버 로직)
/supabase/migrations/   DB 스키마(0001_init.sql) + 역할 개편(0002_restructure_roles.sql), RLS 전면 적용
/scripts/seed.ts  최초 설정값·관리자 비밀번호 시드 (제작자 계정은 시드하지 않음)
/server/banned_nicknames.txt         닉네임 금칙어 목록
/docs/SSOT.md     전체 사양 (원본 문서 복사)
.cursor/rules/ssot.mdc               Cursor에 적용되는 불변 규칙
```

## 로컬 개발 준비
1. **Supabase 프로젝트** 생성(서울 리전) 후 `npm run db:migrate`로 `supabase/migrations/`의 모든 SQL을 순서대로 적용(0001 → 0002). 또는 로컬 `supabase start`.
2. `.env.example`을 `.env`로 복사해 값 채우기: `DATABASE_URL`(트랜잭션 풀러 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, `ALLOWED_ORIGINS`. (`MEMBER_PASSWORD`·`RECOVERY_PEPPER`는 v1.3에서 삭제됨)
3. 의존성 설치: `npm install`
4. 시드 실행(최초 1회): `npm run seed` — `settings`(일정 기본값) · `credentials`(**관리자만**) 생성.
5. 관리자로 로그인해 "참여자 데이터" 탭의 "계정 추가"로 제작자(업로더) 닉네임+비밀번호를 일괄 생성하고 배포.
6. 타입체크: `npm run typecheck`
7. 로컬 서버 실행: `npm run dev` (Vercel CLI, `vercel dev`) 또는 `vercel link` 후 환경변수를 Vercel 프로젝트에 등록.

## 배포 전 꼭 확인할 것 (SSOT 참고)
- **DEC-25 (최우선)**: 외부 클라우드(Vercel·Supabase) 사용에 대한 사내 정보보호 승인.
- **DEC-18**: 투표가 완전 익명(쿠키 토큰)이라 복수 기기·브라우저 재투표를 막지 못합니다. 2026-10-05 결정으로 **일단 쿠키 방식만 적용하고 추후 회의 후 재검토**하기로 했습니다.
- **DEC-01**: 실제 접수마감·투표시작·투표마감·선정 개수(N).
- Supabase Storage 버킷 `works`(비공개, 50MiB 한도)이 마이그레이션으로 생성되는지 확인.
- `supabase/migrations/` 전체는 모든 테이블 RLS ON + 정책 없음 + anon/authenticated REVOKE까지 포함합니다. 운영 반영 전 Supabase 대시보드에서 재확인하세요.
- Vercel 환경변수는 Production/Preview/Development 환경별로 분리하고, Preview가 운영 Supabase 프로젝트를 바라보지 않게 하세요(AC-48).
- 서명 업로드 URL의 PUT 요청 헤더/본문 형식은 Supabase Storage 최신 공식 문서로 재확인하세요(`src/storage/index.ts`, `public/app.js`의 `putToSignedUrl`).
- `Moneygraphy Rounded` 폰트 파일은 라이선스 미확인 상태라 리포에 포함하지 않았습니다(DEC-21). `public/fonts.js`가 `/fonts/Moneygraphy-Rounded.woff2`를 자동으로 찾고, 없으면 시스템 서체로 대체합니다.

## 아직 결정되지 않은 항목
`docs/SSOT.md` 17절의 DEC 항목들(DEC-01, 12, 18, 19, 25 등)은 이 코드에서 **구현하지 않고 질문 대상으로 남겨두었습니다.** 승인·확정 후 반영하세요.
