# 하나증권 AI 마켓 (v1.2)

AI 활용 공모전 사내 플랫폼. 사양은 [`docs/SSOT.md`](docs/SSOT.md) 전체를 기준으로 하며, 화면 디자인은 제공된 `hana_ai_market_v4_preview.html`을 그대로 재현하되 **닉네임 전용 식별 모델**(실명·사번·부서 미수집)에 맞게 로그인/신청/투표 흐름만 바꿨습니다.

## 구조
```
/public          정적 참여자/관리자 페이지 (index.html, admin/index.html, app.js, story.js, fonts.js, base.css, story.css, brand.css)
/api/index.ts     Hono 진입점 (Vercel Node.js Function)
/src              routes/ auth/ db/ storage/ lib/ (서버 로직)
/supabase/migrations/0001_init.sql   DB 스키마 (12테이블/51컬럼, RLS 전면 적용)
/scripts/seed.ts  최초 설정값·비밀번호 시드
/server/banned_nicknames.txt         닉네임 금칙어 목록
/docs/SSOT.md     전체 사양 (원본 문서 복사)
.cursor/rules/ssot.mdc               Cursor에 적용되는 불변 규칙
```

## 로컬 개발 준비
1. **Supabase 프로젝트** 생성(서울 리전) 후 `supabase db push`로 `supabase/migrations/0001_init.sql` 적용. 또는 로컬 `supabase start`.
2. `.env.example`을 `.env`로 복사해 값 채우기: `DATABASE_URL`(트랜잭션 풀러 6543), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MEMBER_PASSWORD`, `ADMIN_PASSWORD`, `RECOVERY_PEPPER`(32바이트 이상 난수), `CRON_SECRET`, `ALLOWED_ORIGINS`.
3. 의존성 설치: `npm install`
4. 시드 실행(최초 1회): `npm run seed` — `settings`(일정 기본값) · `credentials`(참여자/관리자 비밀번호 해시) 생성.
5. 타입체크: `npm run typecheck`
6. 로컬 서버 실행: `npm run dev` (Vercel CLI, `vercel dev`) 또는 `vercel link` 후 환경변수를 Vercel 프로젝트에 등록.

## 배포 전 꼭 확인할 것 (SSOT 참고)
- **DEC-25 (최우선)**: 외부 클라우드(Vercel·Supabase) 사용에 대한 사내 정보보호 승인.
- **DEC-18**: 복수 닉네임으로 다중 투표 방지 정책(시상 연계 시 투표권 코드 검토).
- **DEC-01**: 실제 접수마감·투표시작·투표마감·선정 개수(N).
- Supabase Storage 버킷 `works`(비공개, 50MiB 한도)이 마이그레이션으로 생성되는지 확인.
- `supabase/migrations/0001_init.sql`은 모든 테이블 RLS ON + 정책 없음 + anon/authenticated REVOKE까지 포함합니다. 운영 반영 전 Supabase 대시보드에서 재확인하세요.
- Vercel 환경변수는 Production/Preview/Development 환경별로 분리하고, Preview가 운영 Supabase 프로젝트를 바라보지 않게 하세요(AC-48).
- 서명 업로드 URL의 PUT 요청 헤더/본문 형식은 Supabase Storage 최신 공식 문서로 재확인하세요(`src/storage/index.ts`, `public/app.js`의 `putToSignedUrl`).
- `Moneygraphy Rounded` 폰트 파일은 라이선스 미확인 상태라 리포에 포함하지 않았습니다(DEC-21). `public/fonts.js`가 `/fonts/Moneygraphy-Rounded.woff2`를 자동으로 찾고, 없으면 시스템 서체로 대체합니다.

## 아직 결정되지 않은 항목
`docs/SSOT.md` 17절의 DEC 항목들(DEC-01, 12, 18, 19, 25 등)은 이 코드에서 **구현하지 않고 질문 대상으로 남겨두었습니다.** 승인·확정 후 반영하세요.
