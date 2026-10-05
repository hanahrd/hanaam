# 하나증권 AI 마켓 — SSOT 1.3 (Vercel + Supabase)

> **문서 버전:** SSOT 1.3 · **작성 기준일:** 2026-10-05 · **이전:** SSOT 1.2 (Vercel + Supabase, 자가등록+복구코드) / 1.1 (Python + SQLite + nginx)
> **v1.2 → v1.3 변경의 성격:** **역할 모델 전환**(요구확정, 사용자 지시). 제작자(업로더)는 **자가등록을 폐지**하고 관리자가 닉네임+비밀번호 계정을 만들어 배포한다. 복구코드는 **삭제**(분실 시 관리자가 비밀번호를 재설정). 투표자(일반사용자)는 **로그인 없이** 별도 `/vote` 페이지에서 투표하며, 중복 투표는 **브라우저 쿠키 토큰 해시로만** 판정한다(약한 방어, 추후 재검토 — DEC-18). 모든 제출물은 **관리자 1차 심사 전까지 본인+관리자만 보이는 "심사중" 상태**이며, 승인해야 전체 공개된다(DEC-15 결정 반영, 토글 제거). v1.1→v1.2의 인프라 전환 내용(Vercel/Supabase)은 그대로 유지된다.
> **v1.1 → v1.2 변경의 성격 (참고, 유지됨):** 인프라 전환. 서버·DB·파일·배포 방식을 Vercel Functions + Supabase(Postgres, Storage)로 바꾼 부분은 1.3에서도 유지한다.
> **전제:** 운영 데이터가 없으므로 이관 없이 새 Postgres에 스키마를 만든다. `server.py`(v4)는 **이식 대상이 아니라 동작 명세**로 쓴다(상시 실행 `http.server`는 Vercel에서 동작하지 않는다).
> **확정 수준:** **요구확정**(사용자 지시) / **현재구현**(v4 소스 확인) / **v5결정**(권고 설계, 승인 시 확정) / **미정**(결정 필요)
> **문서 사용법:** 레포의 `docs/SSOT.md`로 두고 Cursor 규칙은 16.4절을 `.cursor/rules/ssot.mdc`에 복사한다. SQL 전체는 부록 A.

---

## 0. v1.2 → v1.3 변경 요약 (이번 변경, 요구확정)

| 영역 | v1.2 | v1.3 |
|---|---|---|
| 제작자(업로더) 계정 생성 | 참여자 본인이 닉네임 등록(자가등록) | **관리자가 닉네임+비밀번호를 만들어 배포**(일괄 생성 UI) |
| 제작자 재입장 | 복구코드 | **관리자에게 전달받은 비밀번호**(관리자가 비밀번호 재설정 가능) |
| 복구코드 | HMAC-SHA256(RECOVERY_PEPPER) 해시 저장 | **폐지.** `recovery_digest`·`RECOVERY_PEPPER` 삭제 |
| 투표자 | 제작자 계정으로 로그인 후 투표(계정당 1회) | **로그인 없이** `/vote` 페이지에서 투표. 식별은 **브라우저 쿠키 토큰 해시**뿐 |
| 투표 중복 방지 | 계정 1개 = 투표 1회(`ballots.participant_id UNIQUE`) | **쿠키 토큰 해시 1개 = 투표 1회**(`ballots.voter_token_hash UNIQUE`). 다른 기기·브라우저·쿠키 삭제는 막지 못함(약한 방어, 명시적으로 받아들인 리스크) |
| 본인 작품 투표 금지 | 서버가 `participant_id` 비교로 차단(`self_vote`) | **적용 불가**(투표자가 계정이 없어 식별할 수 없음). 투표자용 작품 목록에는 어차피 "내 작품" 표시가 없음 |
| 작품 공개 시점 | `requireApproval` 설정(관리자가 토글) | **항상 심사중으로 시작.** 토글 제거, 관리자 1차 심사(내부정보·기밀 확인) 승인 후에만 전체 공개(DEC-15 결정) |
| 작품 비공개 상태의 열람 | 숨김 작품은 관리자만 조회 가능 | **관리자 + 작성자 본인**만 조회 가능(제출자가 본인 제출물 상태를 확인할 수 있어야 함) |
| 참여자 데이터 테이블 | 투표 참여·투표일시 컬럼 포함 | **삭제**(투표가 계정과 연결되지 않으므로 집계 불가) |

**변하지 않는 것(1.2에서 유지):** 닉네임만 수집(제작자), `participant_id` 비노출, 닉네임 정규화·중복 규칙, 좋아요와 투표 분리, 접수·투표 상태 판정, 설정 잠금 규칙, 로고 미사용, Vercel+Supabase 인프라, PBKDF2 비밀번호 해시.

---

## 0-1. v1.1 → v1.2 변경 요약 (인프라 전환, 유지됨)

| 영역 | v1.1 | v1.2 | 수준 |
|---|---|---|---|
| 호스팅 | Docker + nginx (자체 서버) | **Vercel**(정적 + Functions) | 요구확정 |
| DB | SQLite(WAL) | **Supabase Postgres** | 요구확정 |
| 파일 | 서버 로컬 `data/uploads` | **Supabase Storage(비공개 버킷)**, 브라우저가 서명 URL로 직접 업로드 | v5결정 |
| API 서버 | Python `server.py` | **TypeScript + Hono** (Node.js 런타임) | v5결정 |
| 인증 | 자체 세션 | **자체 세션 유지**(`sessions` 테이블 + HttpOnly 쿠키). Supabase Auth 미사용 | v5결정 |
| 트랜잭션 | `BEGIN IMMEDIATE` | 트랜잭션 + **`settings` 행 잠금**(`FOR SHARE`/`FOR UPDATE`) | v5결정 |
| 정리 작업 | 서버 시작 시 | **Vercel Cron** 일 1회 | v5결정 |
| 요청 제한 IP | nginx `X-Forwarded-For` | Vercel이 덮어쓰는 클라이언트 IP 헤더 | v5결정 |
| 복구코드 저장 | SHA-256 | **HMAC-SHA256 + 서버 pepper** | v5결정 |
| 테이블/컬럼 | 12 / 50 | **12 / 51** (`files.uploaded_at` 추가) | v5결정 |
| 공개 API | 25개 | **25개** (`design-font` 삭제, `uploads/{id}/complete` 추가) + 내부 크론 1개 | v5결정 |
| `bootstrap` 폴링 | 20초 | **60초** (투표·마감 임박 시에만 단축) | v5결정 |

**(1.2 작성 당시 기준, 이후 1.3에서 일부 변경됨 — 위 0절 참고):** 닉네임만 수집, 내부 `participant_id`, 닉네임 정규화·중복 규칙, 복구코드 입장, 계정당 1표·정확히 N개·본인 작품 제외, 좋아요와 투표 분리, 접수·투표 상태 판정, 설정 잠금 규칙, 로고 미사용.

**가장 중요한 경고 (v1.3 갱신):** 투표는 로그인이 없으므로 "한 사람 = 투표 1회"를 보장할 수 없다. 보장되는 것은 **"쿠키 토큰 1개 = 투표 1회"** 뿐이며, 쿠키 삭제·시크릿 모드·다른 브라우저·다른 기기로 재투표를 막지 못한다. 이는 사용자가 명시적으로 받아들인 리스크다(2026-10-05 결정, "일단은 쿠키 방식으로 하고 추후 회의 후 재검토"). 시상에 연결되면 DEC-18(투표권 코드 등 강한 식별)을 재검토한다. 제작자 계정(닉네임+비밀번호)은 투표와 무관하며, 제출물 소유·심사 상태 확인용으로만 쓰인다.

---

## 1. 서비스 정의와 개인정보 원칙

### 1.1 정의
하나증권 임직원이 AI 활용 제작물을 **닉네임으로** 공개하고, 동료의 작품을 탐색·응원하며, 정해진 기간에 우수 작품을 선정하는 사내 공모전 플랫폼. 공유·투표 서비스이며 AI 호출·서비스 호스팅 플랫폼이 아니다. '마켓'은 발견·공유의 공간이며 결제·거래가 없다. 로고 이미지는 쓰지 않고 텍스트 서비스명만 쓴다. (요구확정)

| 항목 | 기준 |
|---|---|
| 서비스명 | 하나증권 AI 마켓 (헤더 축약: 하나 AI 마켓) |
| 대상 | 하나증권 임직원 |
| 운영 | 인재개발실 (담당·승인권자 개인은 미정) |

### 1.2 개인정보 최소수집 (요구확정)

| 구분 | 저장 | 저장하지 않음 |
|---|---|---|
| 제작자(업로더) 계정 | 닉네임, 비밀번호 해시, 작품 정보(작품명·유형·도구·설명), 첨부 파일 | 이름, 사번, 부서, 이메일, 전화번호 |
| 투표자(일반사용자) | **없음.** 로그인하지 않으며 서버는 선택한 작품·동의 여부만 받아 즉시 투표로 저장 | 이름, 사번, 부서, 닉네임, 계정 식별자 |
| 서버 생성 | `participant_id`(제작자 전용), 세션 해시, 투표자 쿠키 토큰 해시(`voter_token_hash`), 요청 제한용 IP 해시 | IP 원문(앱 DB 기준), 복구코드(v1.3 폐지) |
| 관리자 화면 | 제작자 닉네임·제출 활동, 작품별 집계 득표 | 닉네임↔실명 매핑, 투표자 식별 정보 |

1. 앱 DB에 실명·사번·부서를 저장하지 않는다. 입력 안내와 닉네임 규칙으로 막는다.
2. 업로드 파일의 본문·메타데이터(PPT 작성자, 이미지 EXIF)에는 개인정보가 들어갈 수 있다. 시스템이 완전히 막지 못한다(DEC-20).
3. **외부 클라우드(Vercel·Supabase)에 IP가 남는 로그가 있다.** Vercel 런타임 로그와 Supabase 로그의 보관기간을 확인하고 DEC-12에 포함한다.
4. 업로드 파일에 **내부 기밀이 들어갈 수 있다.** 외부 클라우드 보관은 사내 정보보호 승인 대상이다(DEC-25, 최우선).

---

## 2. 식별 모델 (v1.3 — 역할별로 완전히 다른 입장 방식)

### 2.1 세 가지 역할

| 역할 | 로그인 | 계정 생성 | 화면 |
|---|---|---|---|
| **제작자(업로더)** | 닉네임+비밀번호 | **관리자가 일괄 생성**(자가등록 폐지) | `/` |
| **투표자(일반사용자)** | **없음**(완전 비로그인) | 없음(쿠키 토큰만 자동 발급) | `/vote` |
| **관리자** | 공통 비밀번호(역할 전용) | 시드 스크립트 1회 | `/admin` |

### 2.2 개념
| 개념 | 설명 |
|---|---|
| 관리자 비밀번호 | 관리자 전용 입장 비밀번호(대소문자 구분) |
| 제작자 계정 | `(닉네임, 비밀번호)` 쌍. **관리자가 만들어 사내망·메신저 등 사외 수단으로 배포**한다. 앱은 배포 수단을 관리하지 않는다 |
| `participant_id` | 제작자 계정 생성 시 서버가 만드는 24자리 hex. **내부 전용**, 참여자 응답에 노출 금지 |
| 닉네임 | 화면 표시용. 전역 중복 불가. 참여자 본인은 변경 불가(관리자만 변경) |
| `nickname_key` | 중복 판정용 정규화 값. UNIQUE |
| 비밀번호 분실 | 복구코드 없음. **관리자가 "비밀번호 재설정"으로 즉시 새 비밀번호를 지정**하고 본인에게 전달 |
| 투표자 쿠키 토큰 | `/vote` 최초 방문 시 서버가 발급하는 32바이트 난수. `__Host-hana_voter` 쿠키(HttpOnly·Secure·SameSite=Lax, 약 400일)에 저장. **서버는 토큰의 SHA-256 해시만** `ballots.voter_token_hash`에 저장한다 |
| 세션 | 12시간. 하나의 `participant_id`에 연결(관리자 세션은 NULL). **투표자는 세션이 없다**(쿠키 토큰만 있음) |

### 2.2a 입장 흐름

**제작자(업로더):**
```
관리자가 "닉네임 비밀번호" 쌍을 일괄 생성해 배포
   → 제작자가 닉네임+비밀번호로 /api/login 호출 → 세션 발급(participant_id 연결) → 갤러리
```
- 참여자 API는 전부 로그인(세션의 `participant_id`)이 필요하다. 없으면 `403 participant_required`.
- 같은 계정이 여러 기기에서 동시에 접속할 수 있다. 좋아요·조회는 계정 기준. **투표는 더 이상 제작자 계정과 연결되지 않는다**(2.1 참고).
- 비밀번호 변경·재설정은 참여자 본인이 할 수 없다. 분실·변경은 관리자에게 요청한다.

**투표자(일반사용자):**
```
/vote 접속 → (쿠키 없으면) 서버가 쿠키 토큰 발급 → 투표 기간이면 공개 작품 목록 표시
   → 정확히 N개 선택 → 동의 → POST /api/votes → 쿠키 토큰 해시로 1회만 저장
```
- 로그인·닉네임·세션이 전혀 없다. `/api/vote/bootstrap`, `/api/votes`는 완전 공개 API다(요청 제한으로만 보호).
- 투표 기간이 아니면 작품 목록을 내려주지 않는다(2.4·DEC-15 참고: 투표 기간에만 갤러리를 공개하기로 결정).

### 2.3 닉네임 규칙 (제작자 계정, v1.2와 동일한 형식 규칙을 유지)
| 항목 | 기준 |
|---|---|
| 길이 | 2~12자 |
| 허용 | 한글 완성형, 영문, 숫자, 밑줄 `_` |
| 불가 | 공백, 이모지, 특수문자, 자모만 |
| 정규화 | 앞뒤 공백 제거 → Unicode NFKC. 저장 `nickname`은 NFKC 결과(표시용) |
| 중복 키 | `nickname_key` = NFKC → `toLowerCase()`(casefold 대응) → `_` 제거 |
| 중복 예 | `Hana_AI`, `hanaai`, `ＨＡＮＡＡＩ`, `hana_ai` → 동일 키 |
| 사번 방지 | 키가 전부 숫자이면 불가. `^[a-z]{0,2}\d{4,}$` 형태 불가 |
| 예약어 | `관리자`, `운영`, `admin`, `administrator`, `하나증권`, `인재개발`, `system` 포함 시 불가 |
| 금칙어 | `server/banned_nicknames.txt`의 단어가 키에 포함되면 불가 |
| 변경 | 사용자 불가, 관리자만 |
| 동시성 | 앱 검사 후 최종 판정은 DB `UNIQUE`. SQLSTATE `23505` → `nickname_taken` |

> TypeScript에는 Python `casefold()`가 없다. `toLocaleLowerCase('en-US')` + NFKC를 쓰고, 구현 시 한글·영문·전각 케이스를 테스트(AC-18)로 고정한다. 독일어 ß 같은 특수 케이스는 허용 문자에 없으므로 무관하다.

화면 안내(고정): "실명·사번·부서가 드러나지 않는 닉네임을 사용해 주세요. 한 번 정하면 직접 바꿀 수 없습니다."

### 2.4 복구코드 — v1.3에서 폐지
자가등록이 없으므로 복구코드도 없다. 제작자가 비밀번호를 분실하면 관리자 화면의 "비밀번호 재설정"으로 새 비밀번호를 지정해 본인에게 전달한다(사외 수단, 앱이 관리하지 않음). `recovery_digest` 컬럼과 `RECOVERY_PEPPER` 환경변수는 마이그레이션으로 삭제했다(`0002_restructure_roles.sql`).

### 2.5 보장 범위
| 보장 | 보장하지 않음 |
|---|---|
| 제작자 닉네임 중복 방지 | 닉네임이 본인 것임 |
| 제작자 좋아요 계정당 1회 | 실제 직원 수 |
| 제작자에게 `participant_id` 비노출 | - |
| **쿠키 토큰 1개당 투표 1회** | **사람 1명당 투표 1회**(다른 브라우저·기기·쿠키 삭제로 재투표 가능, 명시적으로 받아들인 리스크) |
| 관리자 1차 심사 전 작품은 본인+관리자만 열람 | - |

---

## 3. 역할·권한·공개 범위

| 기능·정보 | 투표자(비로그인, `/vote`) | 제작자(로그인, `/`) | 관리자 |
|---|---|---|---|
| 서비스명·환영문구 | 가능 | 가능 | 가능 |
| 로그인 | 해당 없음(계정 없음) | 관리자가 발급한 닉네임+비밀번호 | 공통 비밀번호 |
| 작품·파일 조회 | **공개 작품만**(투표 기간에만 목록 노출) | 공개 작품 전체 + **본인이 올린 심사중 작품** | 전체(심사중 포함) |
| 작품 신청 | 불가 | 접수 가능 조건일 때 | 불가 |
| 좋아요 | 불가 | 공개 작품, 계정당 1회 | 불가 |
| 최종 투표 | **투표 가능 기간에, 로그인 없이** | **불가**(계정이 있어도 투표 API를 쓰지 않음) | 불가 |
| 제작자 닉네임 | 공개 작품에 보임 | 보임 | 보임 |
| `participant_id` | 불가 | 불가 | 보임 |
| 타인의 투표 선택 | 불가 | 불가 | 불가(투표 자체가 익명이라 선택도 계정과 연결되지 않음) |
| 작품별 득표 | 불가 | 응답 제외 | 보임·CSV |
| 일정·N·문구·비밀번호 | 불가 | 불가 | 가능 |
| 제작자 계정 생성·닉네임 변경·비밀번호 재설정·차단 | 불가 | 불가 | 가능 |
| 작품 심사(심사중 → 공개) | 불가 | 본인 작품 상태만 열람 | 가능(승인 전까지 공개 안 됨) |
| 작품 숨김·공개·삭제 | 불가 | 불가 | 잠금 규칙에 따라 |

**인증 설정:** 제작자 계정은 자가등록이 아니라 **관리자가 `POST /api/admin/participants`로 일괄 생성**한다(닉네임·평문 비밀번호 입력 → 서버가 PBKDF2로 해시해 저장, 평문은 응답에도 로그에도 남기지 않음). 관리자 비밀번호는 `ADMIN_PASSWORD`(시드 1회, 대소문자 구분). 비밀번호 해시는 PBKDF2-HMAC-SHA256 600,000회, salt 16바이트. 세션 12시간. 관리자 비밀번호 변경은 현재 비밀번호 재확인 필요. 투표자는 비밀번호·세션이 전혀 없다.

---

## 4. 화면 및 이용 흐름 (v1.3 — 제작자 화면과 투표자 화면이 분리됨)

| ID | 화면 | 비고 |
|---|---|---|
| P-01 | 제작자 로그인(닉네임+비밀번호) | v1.3 변경(닉네임 설정·복구코드 화면 삭제) |
| P-02 | 스크롤 소개 | |
| P-03 | 작품 갤러리(제작자) | 닉네임·내 작품 배지·**심사중 배지** |
| P-04 | 작품 상세 | 이미지·영상은 서명 URL 리다이렉트로 표시 |
| P-05 | 신청 폼 | 작품명·유형·도구·설명·첨부·동의. **파일별 진행률은 Storage 업로드 진행률**(XHR). 제출 즉시 "심사중" |
| P-09 | 일정·참여 안내 | |
| **P-10** | **투표자 갤러리·투표**(`/vote`, 비로그인) | **v1.3 신규.** 투표 기간에만 공개 작품 목록 노출, 선정 N개 → 동의 → 제출 → 완료 |
| 헤더(제작자) | 현재 닉네임, 로그아웃(비밀번호 재확인 불필요, 복구코드 경고 없음) | |

- **제작자 접수기:** 로그인(닉네임+비밀번호) → 마감 카운트다운 → 소개 → 신청(제출 시 심사중) → 갤러리.
- **투표자:** `/vote` 접속(로그인 없음) → 투표 기간이 아니면 안내만 표시 → 투표 기간이면 공개 작품 갤러리 → 선정 N개 → 동의 → 제출 → 완료.
- **첫 화면(제작자 `/`):** 접수+소개ON이면 소개 우선. 투표·대기·종료·소개OFF·직링크는 갤러리 우선. 화면 높이 580px 미만은 모션 줄이기가 기본.
- 신청 동의 문구: "닉네임과 제출 정보가 운영을 위해 저장되며, 작품에 개인정보·고객정보·내부 기밀이 포함되지 않았음을 확인합니다."
- 투표 동의 문구: "선택한 작품으로 1회 투표를 제출하는 것에 동의합니다." (닉네임·계정 관련 문구 없음)
- **정적 페이지:** 제작자 `/`, 투표자 `/vote`, 관리자 `/admin`. 직링크 `/#work-{id}`는 제작자 로그인 단계를 건너뛰지 않는다(공개 작품이라도 제작자 포털에서는 로그인 필요).

### 4.1 스크롤 스토리·카피 (1.1 유지)
| 장면 | 기본 제목 |
|---|---|
| 01 가능성 | 내가 만든 AI 서비스가\n하나증권의 기준이 된다면? |
| 02 상상력 | 지금은, 여러분의 상상력을\n마음껏 발휘할 시간입니다. |
| 03 참여 | 지금 바로,\n여러분의 AI 서비스를\n공개해주세요! |

사용자 원문(02)은 "이번 순간이 여러분의 상상력을…"이라 코드와 다르다(DEC-02). CTA "나만의 AI 서비스 신청하기"는 기존 신청 폼을 연다. 02 장면 유형 카드 클릭 시 해당 유형이 선택된 폼이 열린다. 접수 불가 시 비활성.

### 4.2 디자인 (1.1 유지)
주색 `#009178`, 짙은 그린 `#006F5D`·`#083F37`, 강조 레드 `#DC231E`, 배경 `#FCFEFD`·`#E8F8F2`·`#F5FCF9`. 제목·카운트다운은 Moneygraphy Rounded(사용자 소유 원본 연결), 미연결 시 시스템 서체. 색상은 첨부 이미지에서 추출한 값이며 공식 CI 수치가 아니다. **서체 파일을 Vercel에 배포하는 것은 라이선스 확인이 필요하다(DEC-21).** 배포 불가 시 사용자 로컬 연결 방식(`fonts.js`)만 유지한다.

---

## 5. 접수·투표 상태와 시간 (1.1 유지)

```text
submissionDeadline <= voteStart < voteEnd      (KST +09:00, 서버가 최종 판정)
```
| 상태 | 조건 | 신청 | 투표 |
|---|---|---|---|
| `submitting` | 현재 < 제출마감 | `uploadsEnabled=true`일 때 | 불가 |
| `waiting` | 제출마감 ≤ 현재 < 투표시작 | 불가 | 불가 |
| `voting` | 투표시작 ≤ 현재 < 투표마감 | 불가 | 가능 |
| `ended` | 투표마감 ≤ 현재 | 불가 | 불가 |

마감 정각부터 불가, 투표시작 정각은 허용. 카운트다운 1초 갱신, 데이터 폴링 **60초**(탭 활성 시; 투표 시작·마감 10분 전부터는 20초). `uploadsEnabled=false`는 접수기간 내 수동 중지. 좋아요·열람은 기간과 무관.

**시간 직렬화:** DB는 `timestamptz`로 저장하고 API 응답은 항상 **KST ISO 8601(`+09:00`, 초 단위)** 문자열로 변환한다. `settings.payload`의 일정은 ISO 문자열(`+09:00`) 그대로 jsonb에 저장한다. 서버가 `serverNow`를 내려 클라이언트 시계를 보정한다.

---

## 6. 제작물 신청

### 6.1 입력
| 필드 | API | 저장 | 검증 |
|---|---|---|---|
| 작품명 | `title` | `works.title` | 필수 2~90자 |
| 유형 | `category` | `works.category` | PPT·이미지·영상·업무자동화·기타 |
| 활용 AI 도구 | `tools` | `works.tools` | 0~150자 |
| 작품 설명 | `description` | `works.description` | 필수 10~5,000자 |
| 첨부 | `fileIds` | `files.work_id` | 서로 다른 1~5개, **모두 업로드 완료** |
| 동의 | `consent` | 저장 안 함 | JSON boolean `true` |
| 제작자 | (입력 없음) | `works.participant_id` | 세션 계정 |

`department`, `author`, `employee`를 보내도 서버는 무시한다.

**심사 상태(v1.3, DEC-15 결정):** 모든 작품은 제출 즉시 `visible=false`("심사중")로 등록된다. 설정으로 끄는 토글은 없다(1.2의 `requireApproval`은 삭제). 심사중인 동안에는 **관리자와 작성자 본인만** 조회할 수 있다(`GET /api/files/{fileId}`의 3단계 접근 제어: 관리자 → 소유 작성자 → 공개 작품만 그 외). 관리자가 "출품작 관리" 탭에서 내부정보·기밀 포함 여부를 확인하고 공개 처리해야 전체 공개된다.

### 6.2 파일 정책
| 항목 | 기준 |
|---|---|
| 개수·크기 | 작품당 1~5개, 파일당 50 MiB(52,428,800 B), 합계 100 MiB(104,857,600 B) |
| 확장자 | `.ppt .pptx .pdf .png .jpg .jpeg .gif .webp .mp4 .webm .mov` |
| 실행파일·ZIP | 불허. 업무자동화는 문서·이미지·시연영상으로 제출 |
| 저장 키 | Storage 객체 키 = `files.id`(난수 32자리 hex). 원본명은 `files.name` |
| 검사 | 확장자 + **업로드 완료 시 서버가 앞 4KB 시그니처 검사**. 악성파일 검사 아님 |
| 이중 한도 | 서버 검증 + **버킷 `file_size_limit` 52,428,800 / 허용 MIME**(서버 우회 업로드 방어) |

한도는 사용자 확정값이 아니라 현재 구현값이다(DEC-14). **Supabase 플랜별 파일 크기 상한은 결제 전에 확인한다.**

### 6.3 업로드 3단계 (v1.2 변경)

Vercel Functions는 요청 본문이 약 4.5MB로 제한되어 **50MiB 파일을 함수가 중계할 수 없다.** 브라우저가 Storage로 직접 올린다.

```
① POST /api/uploads {name,size}
     서버: 닉네임 확인 · 접수 기간 · 확장자 · size 1~50MiB · 요청 제한
           files 행 생성(work_id=NULL, uploaded_at=NULL)
           Storage 서명 업로드 URL 발급
     응답: {id, name, mime, size, uploadUrl}
② 브라우저 → Storage 서명 URL로 PUT (XHR, 진행률 표시)
③ POST /api/uploads/{id}/complete
     서버: 객체 존재·실제 크기 = 선언 크기 확인 → 앞 4KB 시그니처 검사
           통과: uploaded_at = now()   불일치: 객체·행 삭제 → invalid_file_content
④ POST /api/works {…, fileIds}
     서버(트랜잭션): 설정 행 FOR SHARE → 접수 기간 확인 → 파일 소유·미귀속·uploaded_at 확인 → 합계 ≤ 100MiB
                    → works INSERT → files.work_id 설정
```
- 마감 전에 올려도 **④ 시점이 마감 이후면 거부**.
- 서명 업로드 URL의 PUT 본문 형식과 헤더는 Supabase Storage 문서 기준으로 구현한다(부록 C).
- 시그니처: PDF `%PDF`, PNG `89504E47`, JPEG `FFD8FF`, GIF `GIF8`, WEBP `RIFF….WEBP`, MP4/MOV `ftyp`(오프셋 4), WebM `1A45DFA3`, PPTX `PK`(zip), PPT `D0CF11E0`.
- **다운로드:** `GET /api/files/{id}`는 인증 확인 후 **60초 유효 서명 URL로 302**. `?download=1`이면 `Content-Disposition: attachment; filename=원본명` 서명 URL. 응답에 `Cache-Control: private, no-store`. Range는 Storage가 처리한다.
- **미귀속·미완료 파일 정리:** Vercel Cron이 24시간 지난 `work_id IS NULL` 파일을 객체와 함께 삭제한다.

### 6.4 없는 기능
수정·취소, 임시저장, 버전 관리, 팀 출품, 외부 URL, 제출 건수 제한.

---

## 7. 좋아요·조회·투표

| 구분 | 좋아요 | 조회 | 투표 |
|---|---|---|---|
| 목적 | 응원 | 열람 표시 | 우수 작품 선정 |
| 누가 | **제작자(로그인)만** | 제작자(로그인)만 | **투표자(비로그인) 전용** |
| 저장 | `likes` | `views` + `works.views` | `ballots` + `ballot_choices` |
| 중복 기준 | 제작자 계정+작품 | 제작자 계정+작품 | **투표자 쿠키 토큰 해시당 1회**(계정과 무관) |
| 기간 제한 | 없음 | 없음 | 투표 기간, `/vote`에서만 |
| 취소 | 재클릭 | 없음 | 제출 후 불가 |
| 공개 수치 | 좋아요 수 | 조회수 | 관리자만 |

- 인기순 = 조회수 + 좋아요×2 (심사점수 아님).
- 좋아요 토글: `DELETE … RETURNING`이 없으면 `INSERT … ON CONFLICT DO NOTHING` (원자적).
- 조회: `INSERT … ON CONFLICT DO NOTHING RETURNING`이 반환될 때만 같은 트랜잭션에서 `works.views += 1`.

### 7.1 투표 제출 조건 (서버가 한 트랜잭션에서 확인, v1.3 — 로그인 없음)
1. 투표 기간일 것. 2. `consent === true`. 3. 서로 다른 작품이 **정확히 `voteCount`개**. 4. 모든 작품이 `visible AND NOT deleted`. 5. 이 쿠키 토큰 해시로 기존 투표가 없을 것.

**v1.2에서 삭제된 조건:** 로그인 확인(투표자는 계정이 없음), 본인 작품 투표 금지(`self_vote`, DEC-05) — 투표자를 식별할 방법이 없어 "본인 작품"이라는 개념이 성립하지 않는다.

저장: `ballots` 1행(`voter_token_hash UNIQUE`) + `ballot_choices` N행. 각 작품 1표, 순위·가중치 없음. 투표 요청에 CSRF 토큰이 없다(세션이 없으므로). Origin 검사(`checkOrigin`)로만 사이트 간 요청을 막는다.

### 7.2 동시성 설계 (Postgres, v1.2 핵심)

SQLite의 `BEGIN IMMEDIATE`를 아래로 대체한다. 모든 쓰기는 **트랜잭션 풀러에서도 한 트랜잭션 안에서** 수행한다.

| 작업 | 잠금 | 목적 |
|---|---|---|
| 투표 | `settings` `FOR SHARE` → 작품 `FOR SHARE`(선택한 행) → INSERT | 설정 변경·작품 숨김과 직렬화 |
| 설정 저장 | `settings` `FOR UPDATE` → `ballots` 존재 확인 → UPDATE | "투표 1건 이상이면 잠금" 판정이 최초 투표와 경합하지 않게 |
| 작품 숨김·삭제 | `settings` `FOR SHARE` → 작품 UPDATE | 투표 기간·기록 확인과 직렬화 |
| 작품 확정 | `settings` `FOR SHARE` → 파일 `FOR UPDATE` | 마감 경계·파일 이중 귀속 방지 |
| 제작자 계정 생성(관리자) | UNIQUE 위반 처리 | 동시 생성 중 닉네임이 겹치면 하나만 성공 |
| 투표 중복 | `ballots.voter_token_hash UNIQUE` | 동일 쿠키 토큰의 동시 투표 중 하나만 성공 |

UNIQUE 위반(`23505`)은 제약 이름으로 구분해 `nickname_taken` / `already_voted`로 변환한다. 실패 시 전체 롤백.

### 7.3 투표 규칙 잠금
| 항목 | 최초 투표 전 | 투표 1건 이상 |
|---|---|---|
| 제출마감·투표시작·N | 변경 가능(날짜 순서 안에서) | 금지 |
| 투표마감 | 변경 가능 | 단축 금지, 연장만 |
| 작품 숨김·공개·삭제 | 투표 기간이 아닐 때만 | 금지 |
| 문구·소개 | 가능 | 가능 |
| 제작자 닉네임 변경·비밀번호 재설정·차단 | 가능 | 가능 (표·득표에 영향 없음, 투표와 제작자 계정은 애초에 연결되지 않음) |

종료 후 `voteEnd` 연장으로 재개될 수 있다(DEC-13). 후보 < N이면 투표가 열려도 제출이 불가능하다. 투표 전 점검 항목.

**v1.3 변경: 투표가 완전히 익명이다.** DB에는 쿠키 토큰 해시와 선택 작품의 연결만 남고, 어떤 사람·제작자 계정과도 연결되지 않는다(제작자 계정은 투표 자체를 하지 않는다). 복수 쿠키·기기로의 중복 투표는 서버가 탐지하지 못한다(2.5·DEC-18 참고). 관리자 UI는 토큰 해시조차 보여주지 않고 집계만 제공한다.

---

## 8. 관리자 화면

| 탭 | 내용 |
|---|---|
| 운영 현황 | 작품 수, 제작자 계정 수, 투표 완료 수(익명), 좋아요 합, 일정, 득표 상위, 최근 기록 |
| 접수·투표 설정 | 제출마감, 업로드 허용, 투표 시작·마감, 정확한 선정 수. **"공개 전 승인" 토글 삭제**(항상 심사 필요, v1.3) |
| 출품작 관리 | 검색, 상세, **심사중 작품 1차 심사 후 공개**, 공개·숨김·논리 삭제, 좋아요·득표, 결과 CSV |
| 참여자 데이터 | 닉네임, 계정 생성시각, 제출 수, 상태. **"계정 추가"(일괄 생성)**, 닉네임 변경, **비밀번호 재설정**, 차단/해제. 참여자 CSV. **투표 참여·투표일시 컬럼 삭제**(투표가 계정과 연결되지 않음) |
| 페이지 관리 | 사이트명, 환영·소개·공지·주의문구, 스크롤 3장면 카피, **관리자 비밀번호**(참여자 공통 비밀번호 변경 UI는 삭제, 계정별 비밀번호이므로) |

- **참여자 = `participants` 행 = 제작자(업로더) 계정.** 전부 관리자가 생성한다. 자가등록은 없다.
- **관리자 조치:** `rename`(닉네임 변경, 변경 전 값 audit 기록), **`reset_password`**(새 비밀번호 지정, 평문은 요청 바디에만 있고 즉시 해시해 저장·로그에 남기지 않음, 해당 계정의 기존 세션 종료), `block`/`unblock`(업로드·좋아요·로그인 불가. 기존 작품 유지, DEC-08). **신규:** `POST /api/admin/participants`로 `{nickname, password}` 배열을 한 번에 생성(일부 실패해도 나머지는 계속 생성, 실패 사유는 `nickname_taken` 등으로 반환).
- **CSV:** 참여자(계정 1개당 1행: 닉네임, 계정 생성일시 KST, 제출 수, 상태 — **투표 여부·투표일시 컬럼 삭제**), 결과(작품별: 작품명, 제작자(닉네임), 유형, 좋아요, 득표수). `participant_id`는 넣지 않는다. 수식 주입 방어(`= + - @ \t \r` 시작 시 `'` 접두). UTF-8 BOM.

---

## 9. 시스템 아키텍처 (v1.2 신설)

```text
브라우저 (참여자 / 관리자)
   │ 정적: /  /admin  (Vercel CDN, Vercel public/)
   │ API : /api/*  ──▶ Vercel Function (Node.js, 리전 icn1, Hono 단일 진입점)
   │                        ├─▶ Supabase Postgres (서울, 트랜잭션 풀러 6543)
   │                        └─▶ Supabase Storage (비공개 버킷 'works')
   └ 파일: Storage 서명 URL로 직접 PUT / GET (함수는 파일 본문을 중계하지 않음)
Vercel Cron ──▶ /api/cron/cleanup (일 1회, CRON_SECRET)
```

### 9.1 기술 선택
| 항목 | 선택 | 이유 |
|---|---|---|
| 프런트 | 바닐라 UI(`public/`)를 그대로 정적 배포 | 재작성 이득 없음. 인라인 CSS/JS는 파일로 분리 |
| API | TypeScript + **Hono** (`hono/vercel`), **Node.js 런타임**(Edge 아님) | `pg`·`crypto.pbkdf2`·Supabase SDK가 Node에서 안정적 |
| DB 클라이언트 | `postgres`(postgres.js) 원시 SQL, 입력 검증 `zod` | 쿼리가 수십 개이고 `server.py`의 SQL을 거의 그대로 옮길 수 있음. ORM 불필요 |
| 연결 | **Supavisor 트랜잭션 풀러(포트 6543)**, `prepare: false`, 인스턴스당 `max: 1` | 서버리스는 인스턴스가 늘 때 직접 연결이 한도를 넘김 |
| Storage SDK | `@supabase/supabase-js`, **서버 전용**, service role 키 | 서명 URL 발급·객체 확인에만 사용 |
| 인증 | 자체 세션 (Supabase Auth 미사용) | 개인정보 최소수집 방침, 이미 설계된 흐름 |
| 리전 | Vercel `icn1`, Supabase `ap-northeast-2` | 지연 최소화 |
| 로컬 개발 | `supabase start`(로컬 Postgres·Storage) + `vercel dev` 또는 Hono Node 서버 | 동시성 테스트는 실 Postgres 필요 |
| 마이그레이션 | Supabase CLI(`supabase/migrations/`) | 스테이징→운영 동일 SQL |

### 9.2 Vercel 설정 요지 (부록 B 예시)
- `regions: ["icn1"]`, API `maxDuration` 30초.
- `/api/*`를 단일 함수로 라우팅(rewrite). `/admin`은 `public/admin/index.html`.
- 크론: `0 18 * * *`(UTC 18시 = KST 03시) → `/api/cron/cleanup`. 요청에 `Authorization: Bearer ${CRON_SECRET}` 확인.
- 응답 헤더: `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP(아래).
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://<project>.supabase.co; media-src 'self' blob: https://<project>.supabase.co; connect-src 'self' https://<project>.supabase.co; frame-ancestors 'none'`. 현재 UI가 `style=""` 속성을 쓰므로 `style-src 'unsafe-inline'`은 유지한다. **인라인 `<script>`는 파일로 분리해야 `script-src 'self'`가 가능하다**(4단계).
- 쿠키: `__Host-hana_member`, `__Host-hana_admin` — `HttpOnly; Secure; SameSite=Lax; Path=/`, Domain 없음.
- Origin 검사: 요청 `Origin` 호스트가 `ALLOWED_ORIGINS`(운영 도메인)와 일치해야 한다. Preview 배포는 해당 배포 호스트만 허용.
- 클라이언트 IP: Vercel이 덮어쓰는 헤더(`x-vercel-forwarded-for` 또는 `x-real-ip`)만 사용하고 클라이언트가 보낸 `x-forwarded-for`는 신뢰하지 않는다. 해시해서 `attempts.fingerprint`에 저장.

### 9.3 서버리스 제약과 대응
| 제약 | 대응 |
|---|---|
| 요청·응답 본문 ≈ 4.5MB | 파일은 Storage 직접 전송. `bootstrap`은 작품 수백 건까지는 이 한도 안. 초과 우려 시 페이지네이션(현재 범위 아님) |
| 인스턴스 메모리 비공유 | 요청 제한·세션은 DB 기준. 프로세스 메모리 상태에 의존하지 않음 |
| 콜드스타트 | PBKDF2는 로그인에서만, 비동기(`crypto.pbkdf2`). 로그인은 제한(15회/15분) |
| 상시 작업 없음 | Cron으로 정리 |
| 로그 보관 짧음 | 감사는 DB `audit`가 기준. 런타임 로그에는 닉네임·비밀번호(평문)·본문 미기록 |

---

## 10. 데이터베이스 (Supabase Postgres)

### 10.1 구성
**12개 테이블.** v1.3에서 `participants`(복구코드 → 비밀번호)와 `ballots`(제작자 연결 → 쿠키 토큰 연결)의 컬럼 구성이 바뀌었다. 전체 DDL은 부록 A. 적용은 `supabase/migrations/0002_restructure_roles.sql`(기존 테스트 데이터는 `truncate`로 초기화, 운영 데이터 없음 전제).

| 테이블 | 용도 |
|---|---|
| `settings` | id=1 단일 행, `payload jsonb`(18키, v1.3에서 `requireApproval` 삭제) |
| `credentials` | `admin` 역할 비밀번호 salt·digest(`member` 공통 비밀번호는 v1.3에서 폐지) |
| `participants` | **제작자(업로더) 계정.** 닉네임 + 비밀번호 salt·digest(관리자가 생성). `recovery_digest` 삭제 |
| `sessions` | 제작자·관리자 세션(토큰 해시, CSRF, 만료, `participant_id`). **투표자는 세션이 없다** |
| `works` | 작품(제출 즉시 `visible=false`로 시작) |
| `files` | 첨부 메타데이터. 바이트는 Storage |
| `likes`, `views` | 제작자 계정×작품 |
| `ballots` | **투표자 쿠키 토큰 해시(`voter_token_hash`) 1건당 1행.** `participant_id` 컬럼 삭제 |
| `ballot_choices` | 투표 선택(작품) |
| `attempts` | 요청 제한 기록 |
| `audit` | 운영 기록 |

### 10.2 타입 변환 (SQLite → Postgres)
| v4/1.1 | v1.2 |
|---|---|
| `TEXT` 시각(KST ISO) | `timestamptz` (API에서 KST ISO로 직렬화) |
| `REAL` epoch 시각(`expires`, `attempts.created`, `files.created`) | `timestamptz` |
| `INTEGER` 0/1(`visible`, `deleted`) | `boolean` |
| `settings.payload TEXT` | `jsonb` |
| `INTEGER PRIMARY KEY`(`attempts`, `audit`) | `bigint generated always as identity` |
| `TEXT` id(`token_hex`) | `text` 유지 (앱이 생성) |
| `files.size INTEGER` | `bigint` |

### 10.3 Supabase 보안 설정 (필수)
- **모든 테이블 `ENABLE ROW LEVEL SECURITY`, 정책은 만들지 않는다.** `public` 스키마는 PostgREST로 외부에 노출되므로 RLS가 없으면 anon 키만으로 `participants`·`ballots`가 읽힌다.
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` 추가(이중 방어). 이후 생성 테이블에도 적용되도록 `ALTER DEFAULT PRIVILEGES`를 건다.
- 앱은 **서버에서 DB 연결 문자열**로만 접근한다(RLS를 우회하는 서버 역할). 브라우저에는 Supabase URL·키를 내려보내지 않는다.
- Storage 버킷 `works`: `public=false`, `file_size_limit=52428800`, 허용 MIME 지정. **객체 정책을 만들지 않는다**(서명 URL로만 접근).
- 환경 분리: **스테이징과 운영은 별도 Supabase 프로젝트.**

### 10.4 응답 계산값
| 값 | 원천 |
|---|---|
| `works[].nickname` | `works` JOIN `participants` |
| `works[].likes` | `COUNT(likes)` |
| `works[].votes` | `COUNT(ballot_choices)` (관리자만) |
| `works[].liked`, `works[].mine` | 제작자 응답: 내 계정 기준. **투표자 응답(`/api/vote/bootstrap`)에는 없음** |
| `works[].visible` | 제작자 응답에만 포함(본인 심사중 작품 배지 표시용) |
| 제작자 응답의 `voted` | **삭제.** 제작자 계정은 투표하지 않는다 |
| 투표자 응답의 `voted` | **쿠키 토큰 해시**로 `ballots` 존재 확인 |
| `phase` | 현재 시각과 설정 날짜 비교 (저장 안 함) |
| 제작자 계정 수 / 투표 완료 수 | `COUNT(participants)` / `COUNT(ballots)` |

### 10.5 settings.payload (18키, v1.3에서 `requireApproval` 삭제)
`siteName`, `welcome`, `description`, `notice`, `uploadGuide`, `submissionDeadline`, `voteStart`, `voteEnd`, `voteCount`(1~20, bool 불가), `uploadsEnabled`, `version`, `storyEnabled`, `storyTitle1~3`, `storyCaption1~3`.

> `requireApproval`은 v1.2에서 "관리자 승인 후 공개"를 켜고 끌 수 있는 토글이었다. v1.3에서는 **항상 심사가 필요**하도록 결정했으므로(DEC-15) 토글 자체를 없앴다.

- 길이: `siteName`·`welcome` 1~180, `description` 0~180, `notice`·`uploadGuide` 0~500, `storyTitle` 1~140, `storyCaption` 0~180.
- `uploadGuide` 기본값: "실명·사번·부서·고객정보·내부 기밀 및 권한 없는 저작물은 닉네임, 작품 설명, 첨부 파일에 포함하지 마세요."
- 저장 시 현재 `version`을 보내야 하며 불일치면 `409 settings_conflict`. 성공 시 +1. 페이지 문구와 운영 일정이 같은 version을 공유한다.
- **초기값은 시드 스크립트가 계산해 넣는다**(제출마감: 시드일 +14일 18:00 KST, 투표시작: 다음 날 09:00, 투표마감: +7일 18:00, `voteCount=3`). 모두 예시이며 실제 일정은 DEC-01.
- 설정으로 바꿀 수 없는 것: 파일 한도·확장자, 닉네임 규칙, 세션 시간, 좋아요 계산식, 폰트·색상, 재투표 허용, 익명화.

---

## 11. API 계약

동일 출처 HTTPS. 변경 요청은 Origin 검사 + `X-CSRF-Token`. **SSOT에 없는 경로를 추가하지 않는다.**

### 11.1 제작자(업로더) API — 로그인 필요
| 메서드 | 경로 | 권한 | 요청 | 응답 | v1.3 |
|---|---|---|---|---|---|
| GET | `/api/public` | 공개 | - | siteName, welcome | 유지 |
| POST | `/api/login` | 공개 | **nickname, password** | ok, csrf, nickname | **변경**(공통 비밀번호 → 계정별 닉네임+비밀번호) |
| POST | `/api/logout` | 세션+CSRF | - | ok | 유지 |
| GET | `/api/me` | 제작자 세션 | - | `{participant:{nickname}\|null, csrf}` | 유지(의미상 "미설정"이 없어짐 — 세션에 참가자가 없으면 로그인 화면) |
| GET | `/api/bootstrap` | 제작자 세션 | - | settings, phase, serverNow, csrf, works(`visible` 포함, 본인 심사중 작품 포함), limits | **변경**(`voted` 삭제, `works[].visible` 추가) |
| POST | `/api/uploads` | 제작자 세션+CSRF | **JSON** `{name,size}` | 201 `{id,name,mime,size,uploadUrl}` | 유지 |
| POST | `/api/uploads/{fileId}/complete` | 제작자 세션+CSRF | - | `{ok}` | 유지 |
| DELETE | `/api/staged/{fileId}` | 제작자 세션+CSRF | - | ok(객체도 삭제) | 유지 |
| POST | `/api/works` | 제작자 세션+CSRF | title, category, tools, description, fileIds, consent | 201 `{ok, id, pending: true}` | **변경**(`pending`은 항상 `true`, 토글 없음) |
| GET | `/api/files/{fileId}` | 관리자 **또는** 소유 제작자 **또는** (공개 작품이면 누구나) | `download=1` | **302 서명 URL(60초)** | **변경**(3단계 접근 제어: 관리자 → 소유자 → 공개 여부) |
| POST | `/api/works/{workId}/like` | 제작자 세션+CSRF | - | ok(토글) | 유지 |
| POST | `/api/works/{workId}/view` | 제작자 세션+CSRF | - | ok | 유지 |

**v1.2에서 삭제됨:** `GET /api/nickname-check`, `POST /api/participants`(자가등록), `POST /api/participants/recover`(복구코드 입장). 제작자 API에서 `POST /api/votes`도 제거됨(아래 11.1b로 이동, 완전 공개 API가 됨).

### 11.1b 투표자(일반사용자) API — v1.3 신규, 완전 공개(로그인·세션 없음)
| 메서드 | 경로 | 권한 | 요청 | 응답 |
|---|---|---|---|---|
| GET | `/api/vote/bootstrap` | 공개(쿠키 토큰 자동 발급) | - | `{settings, phase, serverNow, works, voted}`. 투표 기간이 아니면 `works=[]` |
| POST | `/api/votes` | 공개(Origin 검사만, CSRF 없음) | workIds, consent | 201 `{ok, receipt}` |

- 식별은 `__Host-hana_voter` 쿠키(토큰)뿐이며 서버는 **해시만** 저장한다(2.2 참고).
- `works[]`에는 `participant_id`·`mine`·`liked` 등 제작자 전용 필드가 없다. 심사중 작품은 애초에 쿼리에서 제외된다(`visible=true and deleted=false`만 조회).

### 11.2 관리자 API
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/api/admin/login`, `/api/admin/logout` | password / - | ok, csrf |
| GET | `/api/admin/bootstrap` | - | 공통 + ballots(`id`,`created` — **익명, 닉네임 없음**), participants(`id`,`nickname`,`created`,`uploads`,`status` — **`voted`/`votedAt` 삭제**), audit 최근 50건 |
| PATCH | `/api/admin/settings` | version + 설정키(**`requireApproval` 없음**) | ok, settings |
| PATCH | `/api/admin/works/{workId}` | action: show/hide/delete | ok |
| **POST** | **`/api/admin/participants`** | **`{accounts:[{nickname,password}, ...]}`(최대 300개)** | **201 `{ok, created:[nickname...], failed:[{nickname,reason}...]}`. v1.3 신규** |
| PATCH | `/api/admin/participants/{participantId}` | action: `rename`(+nickname)/**`reset_password`**(+newPassword)/`block`/`unblock` | ok |
| POST | `/api/admin/password` | currentAdminPassword, newPassword | ok (**`role` 파라미터 삭제, 관리자 전용 고정**) |
| GET | `/api/admin/export/participants`, `/api/admin/export/results` | - | CSV(`participants` CSV는 투표 관련 컬럼 없음) |

별도로 **내부 크론** `GET /api/cron/cleanup`(공개 계약 아님, `CRON_SECRET` 필수).

### 11.3 예시 (테스트용)
```json
POST /api/uploads        { "name": "시연영상.mp4", "size": 31457280 }
→ 201 { "id": "0123456789abcdef0123456789abcdef", "name": "시연영상.mp4",
        "mime": "video/mp4", "size": 31457280, "uploadUrl": "https://…supabase.co/storage/v1/…" }

POST /api/works
{ "title": "AI 회의록 실행과제 정리", "category": "업무자동화", "tools": "ChatGPT, Claude",
  "description": "반복적인 회의록 정리에서 담당자와 실행기한을 분리한 제작 사례입니다.",
  "fileIds": ["0123456789abcdef0123456789abcdef"], "consent": true }

POST /api/login (제작자)
{ "nickname": "하나_AI", "password": "관리자가 전달한 비밀번호" }
→ 200 { "ok": true, "csrf": "…", "nickname": "하나_AI" }

POST /api/admin/participants (관리자, 일괄 생성)
{ "accounts": [ { "nickname": "사용자1", "password": "temp1234" }, { "nickname": "사용자2", "password": "temp5678" } ] }
→ 201 { "ok": true, "created": ["사용자1","사용자2"], "failed": [] }

POST /api/votes (투표자, 로그인·세션 없음)
{ "workIds": ["111111111111111111111111","222222222222222222222222","333333333333333333333333"],
  "consent": true }
```
`workIds` 3개는 N=3일 때만 유효. `receipt`는 투표 ID일 뿐 증명서가 아니다. 투표 요청에는 CSRF 토큰이 없다(세션이 없음). 쿠키가 없으면 서버가 응답에 `Set-Cookie`로 새 토큰을 내려준다.

### 11.4 정보 경계
- 제작자 응답 제외: `participant_id`, `votes`(작품별 득표수), 타인(투표자)의 선택.
- 투표자 응답 제외: 로그인 자체가 없음. `participant_id`, 심사중 작품, 다른 투표자의 선택.
- 관리자 응답 제외: 비밀번호 해시, 세션 토큰, 투표자 쿠키 토큰(해시도 응답에 포함 안 함), Storage 내부 경로. 서명 URL은 요청 시점에만 발급.
- 작품 검색·정렬·필터는 `bootstrap` 응답을 브라우저에서 처리한다.

---

## 12. 오류 코드 (v1.3 — 복구·자가등록·본인작품 관련 코드 삭제)

| 코드 | HTTP | 의미 |
|---|---|---|
| `wrong_password` | 401 | 비밀번호 확인(제작자 로그인·관리자 로그인·관리자 비밀번호 변경) |
| `unauthorized` | 401 | 세션 만료 |
| `csrf_denied`, `origin_denied` | 403 | 검증 실패(투표자 `/api/votes`는 `csrf_denied` 대상이 아님, CSRF가 없으므로) |
| `participant_required` | 403 | 제작자 로그인 필요 |
| `account_blocked` | 403 | 차단된 제작자 계정 |
| `invalid_input` | 400 | 필드·길이 |
| `nickname_invalid`, `nickname_reserved` | 400 | 규칙·예약어·금칙어(제작자 계정 생성·닉네임 변경 시) |
| `nickname_taken` | 409 | 중복(관리자 일괄 생성 시 계정별로 반환) |
| `invalid_dates`, `date_order`, `invalid_count` | 400 | 일정·N |
| `selection_count`, `invalid_selection` | 400 | 선정 오류 |
| `consent_required` | 400 | 동의 |

**v1.2에서 삭제됨:** `recovery_invalid`(복구코드 폐지), `already_registered`(자가등록 폐지), `self_vote`(투표자를 식별할 수 없어 본인 작품 판정 불가).
| `submissions_closed`, `voting_closed` | 409 | 기간 아님 |
| `already_voted` | 409 | 이미 투표 |
| `rules_locked`, `works_locked`, `end_extend_only`, `settings_conflict` | 409 | 잠금·충돌 |
| `not_enough_works` | 400 | 공개 작품 < N |
| `file_required`, `invalid_file`, `invalid_file_content` | 400 | 개수·소유·형식·**시그니처·크기 불일치** |
| **`upload_incomplete`** | 400 | **업로드 완료 확인(`complete`) 전 파일을 작품에 연결 시도** |
| `file_too_large`, `total_too_large` | 413/400 | 용량 |
| `too_many_requests` | 429 | 요청 제한 |
| `not_found` | 404 | 없음 |
| `server_error` | 500 | 서버 오류 |

응답을 못 받았어도 투표가 커밋됐을 수 있다. 재시도는 중복 저장되지 않지만 같은 영수증을 돌려주지는 않는다.

---

## 13. 보안·개인정보

### 13.1 구현 기준
- 비밀번호 PBKDF2-SHA256 600,000회(제작자 계정·관리자 공통). 세션 토큰은 해시 저장. **복구코드·HMAC·pepper는 v1.3에서 전부 삭제**(관리자가 비밀번호를 재설정하는 방식으로 대체).
- HttpOnly·Secure·SameSite 쿠키(`__Host-` 접두: 제작자·관리자 세션 쿠키 + **투표자 쿠키 토큰**), CSRF 토큰(세션이 있는 요청만), Origin 검사(세션 없는 `/api/votes`도 포함), SQL 파라미터 바인딩(postgres.js 태그드 템플릿), 서버측 기간·개수·중복·권한 검증.
- 파일은 난수 키, 비공개 버킷, 서명 URL(60초), 업로드 완료 시 크기·시그니처 검사, 버킷 수준 한도·MIME 이중 방어.
- **투표자 쿠키 토큰은 32바이트 난수이며 서버는 SHA-256 해시만 저장한다.** 토큰 자체는 DB에 없다(복구 불가능, 분실 시 그냥 새 토큰이 발급되고 다시 투표 가능 — 2.5의 "약한 방어" 리스크와 동일한 성질).
- CSV 수식 주입 방어, CSP, noindex.
- **서비스 키 관리:** `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET`은 Vercel 환경변수(서버)에만 둔다. 브라우저 번들에 포함되면 안 된다(AC-42). **`RECOVERY_PEPPER`는 v1.3에서 삭제**(더 이상 필요 없음).

### 13.2 요청 제한 (`attempts` 테이블 기준, v1.3)
| 대상 | 제한 | 기준 |
|---|---|---|
| 제작자 로그인 실패(`login:member`) | 15회/15분 | IP 해시 |
| 관리자 로그인 실패(`login:admin`) | 15회/15분 | IP 해시 |
| 파일 업로드 시작(`/api/uploads`) | 60회/1시간 | 제작자 계정 |
| 투표(`/api/votes`) | 40회/15분 | **투표자 쿠키 토큰 해시**(계정 없음) |
| 관리자 비밀번호 변경 | 10회/15분 | 관리자 세션 |

**v1.2에서 삭제됨:** 닉네임 등록 제한(자가등록 폐지), 복구코드 시도 제한(복구코드 폐지), 닉네임 확인 제한(`/api/nickname-check` 삭제).

**사내 단일 공인 IP(NAT)에서 접속하면 모든 직원이 같은 IP로 보인다.** 로그인 IP 기준 제한은 전 직원이 한도를 공유하므로 운영 전 실제 접속 경로를 확인하고, 필요하면 한도를 상향한다(DEC-26). 투표는 쿠키 토큰 기준이라 이 문제의 영향을 받지 않지만, 반대로 **같은 사람이 쿠키를 지우면 몇 번이든 다시 투표할 수 있다**는 별도 리스크가 있다(DEC-18).

### 13.3 아직 없는 범위
SSO·사번 대조, 관리자 개인 계정·세부 권한, 다중요소 인증, 바이러스 검사, 개인정보 자동 파기, audit의 행위자·변경 전후, 이메일 알림, 회차 분리, 동의 이력 저장. **투표자 신원 확인(완전 익명이므로 사실상 불가능, DEC-18이 해결되지 않는 한 유지됨)**.

### 13.4 audit 기록
작품 등록, **익명 투표 접수**(선정 개수만 기록, 어떤 작품인지는 기록하되 누가인지는 기록 안 함), 설정 변경, 작품 관리, 관리자 비밀번호 변경, 데이터 내보내기, 닉네임 변경(전→후), **제작자 계정 생성**(건수+닉네임 목록), **제작자 비밀번호 재설정**, 차단/해제. 비밀번호(평문)·투표자 쿠키 토큰은 어떤 로그에도 남기지 않는다.

### 13.5 삭제·보관
관리자 삭제는 `deleted=true` 논리 삭제. 원본 파일·계정·투표는 파기되지 않는다. **공모전 종료 후 Supabase 프로젝트와 버킷을 삭제하는 시점·절차는 DEC-12·28에서 정한다.**

---

## 14. 환경·배포·운영 (v1.2 신설)

### 14.1 환경 구성
| 환경 | Vercel | Supabase | 용도 |
|---|---|---|---|
| Production | `main` 배포 | **운영 프로젝트** | 실사용 |
| Preview | PR 배포 | **스테이징 프로젝트** | 리허설·검수 |
| Local | `vercel dev` | `supabase start` | 개발·동시성 테스트 |

- **Preview가 운영 DB를 바라보지 않게** Vercel 환경변수를 환경별로 분리한다(AC-48). Preview에는 **Deployment Protection**을 켠다.
- 운영 도메인: `*.vercel.app`을 쓰거나 사내 도메인을 연결한다(DEC-27).

### 14.2 환경변수
| 이름 | 용도 | 노출 |
|---|---|---|
| `DATABASE_URL` | Supabase **트랜잭션 풀러(6543)** 연결 문자열 | 서버 |
| `SUPABASE_URL` | Storage API 호출 | 서버 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서명 URL 발급·객체 확인 | 서버 전용 |
| `ADMIN_PASSWORD` | **시드 스크립트 전용**(로컬/CI에서 1회 실행). 런타임 함수에는 불필요 | 서버 |
| `CRON_SECRET` | 크론 엔드포인트 보호 | 서버 |
| `ALLOWED_ORIGINS` | Origin 검사 | 서버 |

`NEXT_PUBLIC_` 등 브라우저 노출 접두사를 쓰지 않는다. 관리자 비밀번호는 시드 로그에 찍지 않고 비밀번호 관리자에 보관한다.

### 14.3 배포 절차
1. 스테이징·운영 Supabase 프로젝트 생성(서울), Supabase CLI로 `0001_init.sql` + `0002_restructure_roles.sql` 적용(`supabase db push` 또는 `npm run db:migrate`), 버킷 생성 확인.
2. 시드 스크립트 실행: `settings`(18키 기본값), `credentials`(**관리자만**).
3. Vercel 프로젝트 연결, 환경별 환경변수 등록, 리전 `icn1`.
4. **관리자가 "계정 추가"로 제작자 닉네임+비밀번호 일괄 생성**, 사외 수단으로 배포.
5. **스테이징 전체 리허설**(접수 → 심사 → 대기 → 투표 → 종료)과 동시성 시나리오(AC-17, 19, 20, 47).
6. 운영 반영 → **관리자 비밀번호를 운영 값으로 확정** → 제작자 계정 배포 완료 확인 → 공개.
7. 투표 전 점검: 공개 작품 수 ≥ N(심사 완료 기준), 일정·N 확인, 부하 점검.

### 14.4 백업·종료
- Supabase 플랜의 DB 백업에는 **Storage 객체가 포함되지 않는다.** 투표 종료 직후와 삭제 직전에 `pg_dump`(직접 연결)와 버킷 전체 다운로드(`rclone` 등)를 **함께** 수행한다.
- 종료 후 일정 기간이 지나면 프로젝트·버킷 삭제(DEC-12). 삭제 전에 수상 확인과 결과 CSV 보관을 마친다.

### 14.5 비용·플랜 (결제 전에 공식 요금 페이지로 확인)
- Vercel **Hobby 플랜은 비상업 용도 한정**으로 알고 있다. 회사 업무 용도면 **Pro**가 필요하다.
- Supabase 무료 플랜은 비활성 시 프로젝트 일시중지, 백업 없음, 파일 크기·저장 용량 한도가 있다. 공모전 기간에는 **Pro** 권고, 종료 후 다운그레이드 또는 삭제.
- 함수 실행·Storage 전송량·DB 연결 수는 예상 동시 접속자 기준으로 점검한다. 사내 이벤트 규모(수백 명)면 일반적으로 여유가 있으나 `bootstrap` 폴링이 가장 큰 호출원이다.

### 14.6 관측
- Vercel 런타임 로그(보관기간 짧음), Supabase 대시보드(풀러 연결 수, 느린 쿼리), `audit` 테이블. 로그에 요청 본문·닉네임·복구코드를 남기지 않는다.
- 경보: 함수 5xx 증가, 풀러 연결 한도 근접, Storage 용량.

---

## 15. 개발 계획 (Cursor 작업)

### 15.1 접근
- 서버를 **TypeScript/Hono로 재구현**한다. `server.py`는 동작 명세, 기존 pytest(59개)는 시나리오 원본으로 쓴다. v4 검증 보고서는 v4 기준이므로 재작성·재실행한다.
- UI는 기존 `app.js` 로직을 유지하되 (a) `DEMO` 분기·`createHanaDemo`·데모 비밀번호 제거, (b) 업로드를 3단계(15.3 4단계)로 변경, (c) 인라인 스크립트·스타일 분리, (d) 폴링 60초.
- **v1.3 추가:** (e) 닉네임 설정·복구코드 화면 삭제, 닉네임+비밀번호 로그인으로 교체, (f) 투표자 전용 정적 페이지 `/vote` + 전용 렌더 함수 추가(로그인 로직과 완전히 분리), (g) 관리자 화면에 계정 일괄 생성·비밀번호 재설정 UI 추가, 복구코드·투표 참여 관련 UI 삭제.

### 15.2 레포 구조
```
/public          index.html, admin/index.html, app.js, story.js, story.css, brand.css, fonts.js (fonts/는 DEC-21 결정 후)
/api             index.ts            Hono 진입점(hono/vercel)
/src             routes/ auth/ db/ storage/ lib/(nickname, recovery, phase, csv)
/supabase        migrations/0001_init.sql, config.toml
/scripts         seed.ts, backup.sh
/tests           vitest 통합 테스트(실 Postgres)
/docs            SSOT.md, OPERATIONS.md
/server          banned_nicknames.txt
vercel.json
.cursor/rules/ssot.mdc
```

### 15.3 단계

**Phase 0. 결정 (코딩 전)**
DEC-25(정보보호 승인), DEC-18(복수 계정 대응), DEC-01(일정·N), DEC-12(보관·로그·종료 후 삭제), DEC-27(접속망·도메인).

**Phase 1. Supabase·골격**
`0001_init.sql`(RLS 포함), 버킷, 시드 스크립트, Hono 골격, 세션·`participant_required` 미들웨어, 환경변수 검증(zod).

**Phase 2. 제작자 계정(관리자 생성) — v1.3에서 교체됨**
~~닉네임·복구(자가등록, HMAC)~~ → **관리자 전용 계정 일괄 생성**(`POST /api/admin/participants`), 닉네임+비밀번호 로그인(`POST /api/login`), 비밀번호 재설정(`PATCH /api/admin/participants/{id}`). 닉네임 정규화·예약어·금칙어 검증은 유지.

**Phase 3. 업로드·작품**
`/api/uploads`(서명 URL), `complete`(크기·시그니처), `/api/works` 트랜잭션(**항상 `pending=true`로 등록**), 파일 접근 3단계 제어(관리자/소유자/공개), 정리 크론.

**Phase 4. 좋아요·조회·투표(익명)·관리자**
7.2의 잠금 설계 구현, **투표자 쿠키 토큰 발급·해시 저장·중복 판정**(`/api/vote/bootstrap`, `/api/votes`), 관리자 설정·작품 심사·참여자 계정 관리(생성/비밀번호 재설정/차단), CSV.

**Phase 5. 프런트 정리**
데모 제거, 로그인 화면 교체(닉네임+비밀번호), **투표자 전용 포털(`/vote`) 신설**, 신청 폼에서 부서·이름·사번 제거, 업로드 3단계·진행률, 스크립트·스타일 분리 후 CSP 적용.

**Phase 6. 테스트·배포**
17절 AC를 vitest(동시성 포함)와 Playwright(제작자 로그인·신청·심사·투표자 투표·모바일 폭)로 자동화 → 스테이징 리허설 → 운영.

### 15.4 Cursor 규칙 (`.cursor/rules/ssot.mdc`)
```
# 하나증권 AI 마켓 불변 규칙 (SSOT 1.3)
- 참여자(제작자) PII는 닉네임만 저장한다. 이름·사번·부서·이메일 필드/컬럼/로그 추가 금지.
- participant_id는 참여자 응답에 노출하지 않는다. 화면 식별은 닉네임.
- 닉네임 중복 판정은 nickname_key, 최종 방어는 DB UNIQUE(23505 → nickname_taken).
- 제작자(업로더) 계정은 관리자가 닉네임+비밀번호로 생성한다. 자가등록·복구코드 기능을 추가하지 않는다. 비밀번호 분실은 관리자의 비밀번호 재설정으로만 처리한다.
- 투표자(일반사용자)는 로그인 없이 투표한다. 투표 중복 판정은 서버가 발급하는 쿠키 토큰의 해시(voter_token_hash)로만 한다. 투표자 세션·계정·닉네임을 만들지 않는다.
- 작품은 제출 시 항상 심사중(visible=false)으로 등록된다. 관리자와 작성자 본인만 조회 가능하며, 관리자 승인 후에만 전체 공개로 전환된다. 이 심사 단계를 건너뛰는 설정 토글을 추가하지 않는다.
- 투표와 좋아요는 테이블·API·UI 모두 분리한다.
- 기간·개수·중복·권한 검증은 서버가 최종 판정한다. 프런트 검증은 보조.
- 모든 테이블 RLS ON + 정책 없음. anon/authenticated 권한 REVOKE.
- DB/Storage 접근은 서버 코드에서만. 브라우저에 Supabase URL·키를 내려보내지 않는다.
- SERVICE_ROLE_KEY·DATABASE_URL은 서버 환경변수로만 사용. NEXT_PUBLIC_ 금지.
- Supabase Auth 미사용. 제작자·관리자 세션은 sessions 테이블 + HttpOnly Secure 쿠키(__Host-). 투표자 식별 쿠키도 동일한 쿠키 속성을 쓴다.
- 파일은 Storage 서명 URL로만 업로드/다운로드한다. 함수가 파일 본문을 중계하지 않는다(본문 4.5MB 한도).
- DB 연결은 트랜잭션 풀러(6543), prepare:false. 인스턴스당 max 1.
- 쓰기 로직은 트랜잭션 안에서 settings 행을 FOR SHARE(조회·판정) / FOR UPDATE(설정 저장)로 잠근다.
- 시각은 timestamptz 저장, API 응답은 KST ISO(+09:00).
- 스테이징/운영 Supabase 프로젝트 분리. Preview 배포는 운영 DB에 연결하지 않는다.
- SSOT에 없는 API·컬럼을 추가하지 않는다. DEC 항목은 구현하지 말고 질문한다.
- 로고 이미지, 데모 코드, 데모 비밀번호를 운영 번들에 포함하지 않는다.
```

---

## 16. 수용 기준(AC)

v1.1의 AC-01~40 중 인프라와 무관한 항목(소개 동선, 모션, 신청 폼, 마감 경계, 좋아요 토글, 설정 잠금, 닉네임 규칙, 응답 노출, CSV)은 **그대로 유지**한다. 아래는 핵심 항목과 v1.2 신규다.

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 관리자가 생성하지 않은 닉네임+비밀번호로 제작자 로그인 | `wrong_password`(계정 없음과 비밀번호 불일치를 구분하지 않음) |
| AC-02 | 로그인하지 않은 상태로 제작자 작품 API 호출 | `403 participant_required` |
| **AC-17** | **투표자가 투표 쿠키를 지우고 같은 작품들을 다시 선택해 재투표** | **새 쿠키 토큰으로 새 `ballots` 행 생성(차단되지 않음) — 받아들인 리스크(DEC-18), 회귀 테스트 아님, 동작 확인용** |
| AC-18 | 관리자가 `Hana_AI` 생성 후 `hanaai`·`ＨＡＮＡＡＩ`·`hana_ai`를 추가로 생성 | 모두 `nickname_taken`(일괄 생성 응답의 `failed`에 포함) |
| AC-19 | 같은 닉네임을 관리자가 동시에 2건 생성 요청 | 하나만 성공, 부분 저장 없음 |
| **AC-20** | **같은 투표자 쿠키 토큰으로 동시 투표 2요청** | **하나만 접수(`already_voted`)** |
| AC-24 | 제작자 응답 점검 | `participant_id`·`votes` 미노출. **투표자 응답 점검:** 세션·쿠키 토큰(평문)·심사중 작품 미노출 |
| AC-31~40 | 닉네임 규칙·관리자 조치·PII 필드 부재 | 유지(복구 관련 항목은 폐지) |
| **AC-54** | **심사중 작품을 비로그인·타 제작자 계정으로 조회** | **`not_found`(또는 403). 관리자·작성자 본인만 성공** |
| **AC-55** | **투표 기간이 아닐 때 `/api/vote/bootstrap` 호출** | **`works=[]`, `phase`는 실제 단계 값** |
| **AC-56** | **관리자가 "비밀번호 재설정" 후 제작자의 기존 세션으로 API 호출** | **`401 unauthorized`(세션 삭제됨), 새 비밀번호로 재로그인은 성공** |
| **AC-41** | **anon 키로 PostgREST `participants`·`ballots`·`works` 조회** | **데이터 없음/권한 오류.** 모든 테이블에서 확인 |
| **AC-42** | **빌드 산출물(`public/`)과 응답에서 서비스 키·연결 문자열 검색** | **없음** |
| **AC-43** | **50 MiB 파일 업로드 / 50 MiB + 1바이트** | **성공(함수 경유 없음) / 거부**(서버·버킷 양쪽) |
| **AC-44** | **`complete` 호출 전 `fileIds`로 작품 확정** | **`upload_incomplete`** |
| **AC-45** | **확장자와 내용이 다른 파일(`.pdf`로 위장한 exe) `complete`** | **`invalid_file_content`**, 객체·행 삭제 |
| **AC-46** | **서명 URL 만료(60초) 후 재사용** | **접근 거부.** 인증 없이 `/api/files/{id}` 호출은 401 |
| **AC-47** | **동일 쿠키 토큰 해시로 20개 병렬 투표 요청** | **정확히 1건**, `ballot_choices`는 N행 |
| **AC-48** | **Preview 배포의 환경변수** | **운영 `DATABASE_URL`·키가 아님**(스테이징 프로젝트) |
| **AC-49** | **동시 200 `bootstrap`** (스테이징) | 풀러 연결 한도 이내, 오류율 낮음, 응답 시간 허용 범위 |
| **AC-50** | **크론 호출: 시크릿 없음/있음** | **401 / 24시간 지난 미귀속 파일·객체와 만료 세션 삭제** |
| **AC-51** | **설정 저장과 첫 투표 동시 실행**(N 변경) | **직렬화**: 투표가 먼저면 설정 거부, 설정이 먼저면 투표가 새 N 기준 |
| **AC-52** | **작품 숨김과 투표 동시 실행** | 직렬화: 투표 기간·기록 존재 시 숨김 거부 |
| **AC-53** | **CSP 위반 점검**(콘솔) | 인라인 스크립트 없음, Storage 도메인의 이미지·영상 정상 로드 |

테스트는 **실 Postgres(로컬 Supabase 또는 스테이징)**에서 실행한다. SQLite·모킹으로는 AC-19, 20, 47, 51이 검증되지 않는다.

---

## 17. 결정 사항

**최우선 (착수 전)**

| ID | 결정할 것 | 권고 |
|---|---|---|
| **DEC-25** | **외부 클라우드(Vercel·Supabase) 사용에 대한 사내 정보보호 승인** | **개발보다 먼저 확인.** 승인 불가 시 사내 인프라(1.1 구조)로 회귀. 업로드 파일의 기밀 포함 가능성, 데이터 국외 보관 여부, 클라우드 이용 절차가 쟁점 |
| **DEC-18** | 투표가 완전 익명(쿠키 전용)이라 복수 기기·브라우저로 다중 투표 방지가 안 됨 | **2026-10-05 사용자 결정: "일단은 쿠키 방식으로 하고 추후 회의 후 재검토."** 현재는 추가 완화책 없음(요구확정, v1.3). 시상에 직결되거나 남용이 확인되면 로그인 기반 투표나 투표권 코드로 재검토 |
| ~~DEC-05~~ | ~~본인 작품 투표~~ | **v1.3에서 해소(적용 불가로 변경).** 투표자가 로그인하지 않아 "본인 작품"을 식별할 방법이 없다. 제작자 계정으로는 투표를 아예 할 수 없으므로 우회 경로도 없다 |
| DEC-01 | 실제 일정·N | 운영 확정 필요 |
| DEC-12 | 닉네임·활동·파일·**Vercel·Supabase 로그** 보관·파기, 종료 후 프로젝트 삭제 시점 | 종료 후 일정 기간 뒤 삭제. 기간은 정보보호 담당과 협의 |
| ~~DEC-19~~ | ~~복구코드 분실·수상자 본인 확인~~ | **v1.3에서 해소.** 복구코드가 없다. 비밀번호 분실은 관리자가 "비밀번호 재설정"으로 즉시 처리(사외 수단으로 본인에게 전달) |
| ~~DEC-15~~ | ~~승인 대기 vs 숨김~~ | **2026-10-05 사용자 결정으로 해소(요구확정).** 모든 작품은 제출 즉시 "심사중"(관리자+작성자 본인만 열람) → 관리자가 내부정보·기밀 포함 여부를 1차 심사 → 승인해야 전체 공개. 설정 토글은 없음(항상 이 흐름) |

**v1.2 신규**

| ID | 결정할 것 | 권고 |
|---|---|---|
| DEC-26 | 사내 NAT 환경에서 IP 기반 요청 제한 한도 | 접속 경로 확인 후 로그인·등록·복구 한도 상향. 계정·세션 기준 제한은 유지 |
| DEC-27 | 접속망 한정 여부·도메인 | Vercel은 기본 공개 URL. 사내망 전용이 필수면 별도 접근 제어 필요(요금제·구성 확인). 비밀번호 + 요청 제한으로 충분한지 정보보호 판단 |
| DEC-28 | 백업 수단과 담당 | `pg_dump` + 버킷 다운로드를 투표 종료 직후·삭제 직전 수동 수행. 담당자 지정 |
| DEC-29 | Vercel·Supabase 요금제 | 공모전 기간 Pro, 종료 후 다운그레이드·삭제 |

**기타 (미해결, 유지):** DEC-02(스토리 02 문구), DEC-03(팀 출품·1인 제출 수), DEC-04(수정·취소), DEC-06(정확히 N개/최대 N개), DEC-08(표 무효화), DEC-09(시상·동점), DEC-10(결과 공개), DEC-11(다음 회차), DEC-13(종료 후 연장), DEC-14(업로드 한도), DEC-17(디자인 편집 범위), DEC-20(파일 속 개인정보, EXIF 제거 권고), DEC-21(Moneygraphy 배포 라이선스), DEC-22(투표 선택 연결 분리 — v1.3에서는 투표 자체가 익명이라 사실상 항상 분리됨, 재검토 필요), DEC-23(닉네임 길이·문자), DEC-24(초기 비밀번호 값 — 제작자는 관리자가 임의로 지정, 결정 불필요하게 됨).

**v1.3에서 해소됨:** DEC-05(본인 작품 투표, 적용 불가로 변경), DEC-15(승인 대기 vs 숨김, 항상 심사 흐름으로 확정), DEC-19(복구코드 분실 대응, 관리자 비밀번호 재설정으로 대체).

---

## 18. 후속 확장 (미승인)
회차 분리(`contests`, `contest_id`), 승인 상태·사유 분리, 파일 `checksum`·`scan_status`, 동의 이력, 관리자 개인 계정, audit 행위자·변경 전후, `bootstrap` 페이지네이션. 컬럼 추가로 끝나지 않고 쿼리·잠금·권한·통계를 함께 바꿔야 한다.

---

## 19. 변경 관리

| 변경 | 함께 바꿀 것 |
|---|---|
| 문구 | settings 키, 카피 표 |
| 닉네임 규칙 | 2.3, 서버 검증, 프런트 안내, AC-18·31 |
| 식별 방식(SSO·투표권 코드) | 2절, DB, 세션, 제약, 개인정보 안내, AC |
| 파일 한도 | 서버 상수, **버킷 `file_size_limit`**, UI, AC-43 |
| 스키마 변경 | `supabase/migrations/` 새 파일, 스테이징 먼저, 이 문서 10절·부록 A |
| 환경변수 추가 | 14.2, 환경별 등록, 노출 범위 점검 |
| 선정 규칙 | 서버 검증, UI, 잠금, 집계 |

**후속 개발자 주의:** 사번·이름·부서를 되살리지 않는다. 파일 본문을 함수로 중계하지 않는다. RLS를 끄지 않는다. 브라우저에 서비스 키를 내리지 않는다. 직접 연결(5432)을 서버리스 함수에서 쓰지 않는다. 기존 데이터를 시드로 덮어쓰지 않는다.

### 변경 이력
| 버전 | 기준일 | 내용 |
|---|---|---|
| 1.0 | 2026-10-02 | 대화·v4 코드 기준 통합 |
| 1.1 | 2026-10-04 | 닉네임 단일 수집, 내부 ID, 중복 방지, 복구코드, DB v5 |
| 1.2 | 2026-10-05 | Vercel Functions + Supabase(Postgres·Storage) 전환. 업로드 3단계, Postgres 잠금 설계, RLS, 크론, 환경 분리, 복구코드 HMAC, 컬럼 51개 |
| **1.3** | **2026-10-05** | **역할 모델 전환(요구확정). 제작자 자가등록·복구코드 폐지 → 관리자가 닉네임+비밀번호 일괄 생성. 투표자는 완전 비로그인, `/vote` 페이지, 쿠키 토큰 해시로만 중복 판정(DEC-18 완화책 보류, 추후 재검토). 모든 작품은 제출 즉시 심사중 → 관리자 1차 심사 후 공개(DEC-15 해소). DEC-05·DEC-19도 해소** |

### 인계용 요약
> 하나증권 임직원 대상 AI 제작물 공모전 서비스. **역할이 셋으로 나뉜다:** 제작자(업로더)는 관리자가 만들어 배포한 **닉네임+비밀번호**로 로그인해 작품을 제출·탐색·응원한다(제출물은 관리자 1차 심사 후 공개). 투표자(일반사용자)는 **로그인 없이** `/vote` 페이지에서 지정 기간에 정확히 N개를 골라 투표하며, 중복 투표는 **브라우저 쿠키 토큰 해시로만** 막는다(약한 방어, 명시적으로 받아들인 리스크 — DEC-18). 관리자는 공통 비밀번호로 `/admin`에 입장해 계정 생성·심사·설정·결과를 관리한다. 이름·사번·부서는 어디에도 저장하지 않는다. 구현은 **Vercel(정적 + Hono 함수, 서울) + Supabase(Postgres, 비공개 Storage)**이며, 파일은 서명 URL로 브라우저가 직접 올리고, 모든 DB 접근은 서버에서만 한다(RLS 전면 적용). 스테이징·운영 Supabase를 분리한다. **착수 전 최우선은 외부 클라우드 사용에 대한 사내 정보보호 승인(DEC-25)이다. 복수 쿠키 재투표 대응(DEC-18)은 사용자 결정에 따라 추후 회의 후 재검토한다.**

---

## 부록 A. 스키마 (`supabase/migrations/0001_init.sql` + `0002_restructure_roles.sql` 적용 후 최종 상태)

> `0001_init.sql`은 v1.2 초기 스키마(아래 블록은 그 원본과 다르다: `participants`·`ballots`는 **v1.3에서 `0002_restructure_roles.sql`로 변경된 최종 컬럼 구성**을 보여준다). 두 마이그레이션을 순서대로 적용해야 한다(`npm run db:migrate`가 `supabase/migrations/*.sql`을 정렬 순서로 모두 실행).

```sql
-- 하나증권 AI 마켓 v1.3 — Postgres 스키마 (12 테이블)
-- 서버(서비스 연결)에서만 접근한다. 모든 테이블 RLS ON, 정책 없음.

create table if not exists settings (
  id smallint primary key check (id = 1),
  payload jsonb not null
);

create table if not exists credentials (
  role text primary key check (role in ('admin')),  -- v1.3: 'member'(공통 비밀번호) 폐지
  salt text not null,
  digest text not null
);

-- v1.3: 제작자(업로더) 계정. 관리자가 생성한다. recovery_digest → password_salt/password_digest로 교체(0002)
create table if not exists participants (
  id text primary key,
  nickname text not null,
  nickname_key text not null,
  password_salt text not null,
  password_digest text not null,
  status text not null default 'active' check (status in ('active','blocked')),
  created timestamptz not null default now(),
  constraint participants_nickname_key_uq unique (nickname_key)
);

create table if not exists sessions (
  token_hash text primary key,
  role text not null check (role in ('member','admin')),
  csrf text not null,
  expires timestamptz not null,
  participant_id text references participants(id)
);
create index if not exists sessions_expires on sessions(expires);

create table if not exists works (
  id text primary key,
  title text not null,
  category text not null,
  tools text not null,
  description text not null,
  participant_id text not null references participants(id),
  visible boolean not null default true,
  deleted boolean not null default false,
  created timestamptz not null default now(),
  views integer not null default 0
);
create index if not exists works_created on works(created desc);
create index if not exists works_participant on works(participant_id);

create table if not exists files (
  id text primary key,
  name text not null,
  mime text not null,
  size bigint not null,
  participant_id text not null references participants(id),
  work_id text references works(id),
  created timestamptz not null default now(),
  uploaded_at timestamptz                      -- NULL = 업로드 완료 미확인
);
create index if not exists files_work on files(work_id);
create index if not exists files_orphans on files(created) where work_id is null;

create table if not exists likes (
  work_id text not null references works(id),
  participant_id text not null references participants(id),
  primary key (work_id, participant_id)
);

create table if not exists views (
  work_id text not null references works(id),
  participant_id text not null references participants(id),
  primary key (work_id, participant_id)
);

-- v1.3: 투표자는 로그인하지 않는다. participant_id 대신 쿠키 토큰 해시로 중복을 판정한다(0002)
create table if not exists ballots (
  id text primary key,
  voter_token_hash text not null unique,
  created timestamptz not null default now()
);

create table if not exists ballot_choices (
  ballot_id text not null references ballots(id),
  work_id text not null references works(id),
  primary key (ballot_id, work_id)
);
create index if not exists choices_work on ballot_choices(work_id);

create table if not exists attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  bucket text not null,
  created timestamptz not null default now()
);
create index if not exists attempts_lookup on attempts(fingerprint, bucket, created);

create table if not exists audit (
  id bigint generated always as identity primary key,
  action text not null,
  detail text not null,
  created timestamptz not null default now()
);

-- ── 보안: 전 테이블 RLS ON, 정책 없음, anon/authenticated 차단 ──
alter table settings        enable row level security;
alter table credentials     enable row level security;
alter table participants    enable row level security;
alter table sessions        enable row level security;
alter table works           enable row level security;
alter table files           enable row level security;
alter table likes           enable row level security;
alter table views           enable row level security;
alter table ballots         enable row level security;
alter table ballot_choices  enable row level security;
alter table attempts        enable row level security;
alter table audit           enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Storage 버킷 (비공개, 50 MiB, 허용 MIME). 객체 정책은 만들지 않는다 ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'works', 'works', false, 52428800,
  array[
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'image/png','image/jpeg','image/gif','image/webp',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

컬럼 수(v1.3 최종): settings 2, credentials 3, participants 7(`password_salt`/`password_digest`로 1컬럼 증가), sessions 5, works 10, files 8, likes 2, views 2, ballots 2(`participant_id` 삭제, `voter_token_hash` 추가로 1컬럼 감소), ballot_choices 2, attempts 4, audit 4 = **51**(순증감 상쇄로 총수는 동일).

시드(`scripts/seed.ts`, SQL이 아님): `settings` id=1에 **18키** 기본값(일정은 실행일 기준 계산, `requireApproval` 없음), `credentials`에 **`admin`만** 해시(PBKDF2 600,000회, salt 16바이트). `member` 공통 비밀번호는 더 이상 시드하지 않는다. 제작자 계정은 시드가 만들지 않고 **관리자가 운영 화면에서 생성**한다. 이미 행이 있으면 덮어쓰지 않는다.

## 부록 B. `vercel.json` 예시

```json
{
  "regions": ["icn1"],
  "functions": { "api/index.ts": { "maxDuration": 30 } },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" },
    { "source": "/admin", "destination": "/admin/index.html" }
  ],
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 18 * * *" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
```
CSP 헤더는 9.2절 값에 `<project>`를 실제 Supabase 프로젝트 도메인으로 바꿔 추가한다. 위 예시는 구조만 보여 주며, **라우팅(rewrite)과 Hono 어댑터 구성은 구현 시 Vercel 공식 문서로 확인한다.**

## 부록 C. 구현 전에 공식 문서로 확인할 항목

아래는 제가 기억하는 내용이라 구현·결제 전에 최신 문서로 확인해야 한다.

| 항목 | 확인할 내용 |
|---|---|
| Vercel Functions | 요청·응답 본문 한도(약 4.5MB), 플랜별 `maxDuration`, Hono 어댑터·rewrite 구성, 클라이언트 IP 헤더 이름, Cron 호출 시 `Authorization` 헤더 방식, 플랜별 크론 한도 |
| Vercel 요금 | Hobby의 상업 사용 제한, Pro 포함량 |
| Supabase Storage | 서명 업로드 URL의 PUT 본문 형식·헤더, 파일 크기 상한(플랜별), 객체 존재·크기 조회 API, 서명 다운로드 URL의 `download` 옵션 |
| Supabase DB | 트랜잭션 풀러 사용 시 prepared statement 제한, 플랜별 연결 한도, 백업 범위(Storage 제외 여부), 서울 리전 가용 |
| 규정 | 금융회사 클라우드 이용 절차·정보보호 요건(사내 규정과 관련 감독규정). 법률 자문이 아니며 사내 정보보호·준법 부서 확인 사항 |
