# 하나증권 AI 마켓 — SSOT 1.2 (Vercel + Supabase)

> **문서 버전:** SSOT 1.2 · **작성 기준일:** 2026-10-05 · **이전:** SSOT 1.1 (Python + SQLite + nginx)
> **v1.1 → v1.2 변경의 성격:** 인프라 전환. **닉네임 정책, 식별 모델, 화면 흐름, 투표 규칙, 에러 코드 의미는 1.1을 그대로 유지**하고, 서버·DB·파일·배포 방식을 Vercel Functions + Supabase(Postgres, Storage)로 바꾼다.
> **전제:** 운영 데이터가 없으므로 이관 없이 새 Postgres에 스키마를 만든다. `server.py`(v4)는 **이식 대상이 아니라 동작 명세**로 쓴다(상시 실행 `http.server`는 Vercel에서 동작하지 않는다).
> **확정 수준:** **요구확정**(사용자 지시) / **현재구현**(v4 소스 확인) / **v5결정**(권고 설계, 승인 시 확정) / **미정**(결정 필요)
> **문서 사용법:** 레포의 `docs/SSOT.md`로 두고 Cursor 규칙은 16.4절을 `.cursor/rules/ssot.mdc`에 복사한다. SQL 전체는 부록 A.

---

## 0. v1.1 → v1.2 변경 요약

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

**변하지 않는 것:** 닉네임만 수집, 내부 `participant_id`, 닉네임 정규화·중복 규칙, 복구코드 입장, 계정당 1표·정확히 N개·본인 작품 제외, 좋아요와 투표 분리, 접수·투표 상태 판정, 설정 잠금 규칙, 로고 미사용.

**가장 중요한 경고 (1.1과 동일):** 닉네임만으로는 "한 사람 = 계정 하나"를 보장할 수 없다. 보장되는 것은 **"닉네임 계정 1개 = 투표 1회"** 뿐이다. 시상에 연결되면 DEC-18(투표권 코드)을 검토한다.

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
| 참여자 입력 | 닉네임, 작품 정보(작품명·유형·도구·설명), 첨부 파일, 선택 작품 | 이름, 사번, 부서, 이메일, 전화번호 |
| 서버 생성 | `participant_id`, 복구코드 해시, 세션 해시, 요청 제한용 IP 해시 | IP 원문(앱 DB 기준) |
| 관리자 화면 | 닉네임·활동·투표 집계 | 닉네임↔실명 매핑 |

1. 앱 DB에 실명·사번·부서를 저장하지 않는다. 입력 안내와 닉네임 규칙으로 막는다.
2. 업로드 파일의 본문·메타데이터(PPT 작성자, 이미지 EXIF)에는 개인정보가 들어갈 수 있다. 시스템이 완전히 막지 못한다(DEC-20).
3. **외부 클라우드(Vercel·Supabase)에 IP가 남는 로그가 있다.** Vercel 런타임 로그와 Supabase 로그의 보관기간을 확인하고 DEC-12에 포함한다.
4. 업로드 파일에 **내부 기밀이 들어갈 수 있다.** 외부 클라우드 보관은 사내 정보보호 승인 대상이다(DEC-25, 최우선).

---

## 2. 식별 모델 (1.1 유지, 일부 보강)

### 2.1 개념
| 개념 | 설명 |
|---|---|
| 공통 비밀번호 | 역할별(참여자/관리자) 입장 비밀번호 |
| `participant_id` | 닉네임 등록 시 서버가 만드는 24자리 hex. **내부 전용**, 참여자 응답에 노출 금지 |
| 닉네임 | 화면 표시용. 전역 중복 불가. 사용자는 변경 불가 |
| `nickname_key` | 중복 판정용 정규화 값. UNIQUE |
| 복구코드 | 등록 시 1회 표시. 재입장용 비밀. 서버에는 HMAC만 저장 |
| 세션 | 12시간. 하나의 `participant_id`에 연결(관리자·미설정 세션은 NULL) |

### 2.2 입장 흐름
```
공통 비밀번호 → 세션 발급(participant_id = NULL)
   ├ [신규] 닉네임 입력 → 규칙·중복 검사 → 계정 생성 → 복구코드 1회 표시 → 갤러리
   └ [기존] 닉네임 + 복구코드 → 세션에 participant_id 연결 → 갤러리
```
- `participant_id` 없는 세션이 부를 수 있는 API: `/api/me`, `/api/nickname-check`, `/api/participants`, `/api/participants/recover`, `/api/logout`, `/api/public`. 그 외 참여자 API는 `403 participant_required`.
- 같은 계정이 여러 기기에서 동시에 접속할 수 있다. 좋아요·조회·투표는 계정 기준이다.
- 로그아웃 후 재입장은 복구코드가 필수다. 분실 시 본인 확인 수단이 앱에 없다(DEC-19).

### 2.3 닉네임 규칙 (v5결정, 1.1과 동일)
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

### 2.4 복구코드 (v5결정, 1.1에서 보강)
- 형식: Crockford Base32(I, L, O, U 제외) 12자, 표시 `XXXX-XXXX-XXXX`(약 60비트).
- 저장: 정규화(대문자·하이픈 제거) 후 **`HMAC-SHA256(RECOVERY_PEPPER, code)`**. 평문 저장·로깅 금지.
  - 이유: 60비트 코드는 DB 유출 시 해시만으로 오프라인 대입이 가능한 수준이다. pepper를 환경변수로 분리하면 DB 유출만으로는 풀 수 없다.
  - `RECOVERY_PEPPER`를 바꾸면 모든 복구코드가 무효가 된다. 운영 중 교체하지 않는다.
- 비교: `crypto.timingSafeEqual`.
- 실패 제한: IP 해시 기준 10회/15분(`recover`). 오류는 닉네임 없음과 코드 불일치를 구분하지 않는다(`recovery_invalid`).

### 2.5 보장 범위
| 보장 | 보장하지 않음 |
|---|---|
| 닉네임 중복 방지 | 닉네임이 본인 것임 |
| 계정 1개당 투표 1회, 다기기 재투표 차단 | 사람 1명당 계정 1개 |
| 좋아요 계정당 1회 | 실제 직원 수 |
| 참여자에게 `participant_id` 비노출 | 관리자에 대한 투표 익명(DB에서 연결됨) |

---

## 3. 역할·권한·공개 범위

| 기능·정보 | 비로그인 | 닉네임 미설정 | 닉네임 설정 | 관리자 |
|---|---|---|---|---|
| 서비스명·환영문구 | 가능 | 가능 | 가능 | 가능 |
| 닉네임 등록·복구 | 불가 | 가능 | 해당 없음 | 해당 없음 |
| 작품·파일 조회 | 불가 | 불가 | 가능 | 가능 |
| 작품 신청 | 불가 | 불가 | 접수 가능 조건일 때 | 불가 |
| 좋아요 | 불가 | 불가 | 공개 작품, 계정당 1회 | 불가 |
| 최종 투표 | 불가 | 불가 | 투표 가능 조건일 때 | 불가 |
| 제작자 닉네임 | - | - | 보임 | 보임 |
| `participant_id` | 불가 | 불가 | 불가 | 보임 |
| 타인의 투표 여부·선택 | 불가 | 불가 | 불가 | 투표 여부·집계만 |
| 작품별 득표 | 불가 | 불가 | 응답 제외 | 보임·CSV |
| 일정·N·문구·비밀번호 | 불가 | 불가 | 불가 | 가능 |
| 닉네임 변경·복구코드 재발급·차단 | 불가 | 불가 | 불가 | 가능 |
| 작품 숨김·공개·삭제 | 불가 | 불가 | 불가 | 잠금 규칙에 따라 |

**인증 설정:** 참여자 초기 비밀번호는 코드에 넣지 않고 시드 스크립트가 환경변수(`MEMBER_PASSWORD`)로 해시해 저장한다(대소문자 무시, 앞뒤 공백 제거). 관리자는 `ADMIN_PASSWORD`(대소문자 구분). 비밀번호 해시는 PBKDF2-HMAC-SHA256 600,000회, salt 16바이트. 세션 12시간. 관리자 비밀번호 변경은 현재 비밀번호 재확인 필요.

---

## 4. 화면 및 이용 흐름 (1.1 유지, 업로드 UI 변경)

| ID | 화면 | 비고 |
|---|---|---|
| P-01 | 공통 비밀번호 입장 | |
| P-01a | 닉네임 설정 (실시간 중복 확인, 규칙 안내) | 1.1 신규 |
| P-01b | 복구코드 입장 | 1.1 신규 |
| P-01c | 복구코드 안내 모달 (1회 표시, 복사, 저장 확인 체크) | 1.1 신규 |
| P-02 | 스크롤 소개 | |
| P-03 | 작품 갤러리 | 닉네임·내 작품 배지 |
| P-04 | 작품 상세 | 이미지·영상은 서명 URL 리다이렉트로 표시 |
| P-05 | 신청 폼 | 작품명·유형·도구·설명·첨부·동의. **파일별 진행률은 Storage 업로드 진행률**(XHR) |
| P-06~08 | 투표 선정·최종 투표·완료 | 이름·사번 입력 없음 |
| P-09 | 일정·참여 안내 | |
| 헤더 | 현재 닉네임, 로그아웃 시 복구코드 경고 | |

- **접수기:** 입장 → 닉네임/복구 → 마감 카운트다운 → 소개 → 신청 → 갤러리.
- **투표기:** 입장 → 닉네임/복구 → 갤러리 → 선정 → 동의 → 제출.
- **첫 화면:** 접수+소개ON이면 소개 우선. 투표·대기·종료·소개OFF·직링크는 갤러리 우선. 화면 높이 580px 미만은 모션 줄이기가 기본.
- 신청 동의 문구: "닉네임과 제출 정보가 운영을 위해 저장되며, 작품에 개인정보·고객정보·내부 기밀이 포함되지 않았음을 확인합니다."
- **정적 페이지:** 참여자 `/`, 관리자 `/admin`. 직링크 `/#work-{id}`는 입장·닉네임 단계를 건너뛰지 않는다.

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
| 저장 | `likes` | `views` + `works.views` | `ballots` + `ballot_choices` |
| 중복 기준 | 계정+작품 | 계정+작품 | 계정당 1회 |
| 기간 제한 | 없음 | 없음 | 투표 기간 |
| 취소 | 재클릭 | 없음 | 제출 후 불가 |
| 공개 수치 | 좋아요 수 | 조회수 | 관리자만 |

- 인기순 = 조회수 + 좋아요×2 (심사점수 아님).
- 좋아요 토글: `DELETE … RETURNING`이 없으면 `INSERT … ON CONFLICT DO NOTHING` (원자적).
- 조회: `INSERT … ON CONFLICT DO NOTHING RETURNING`이 반환될 때만 같은 트랜잭션에서 `works.views += 1`.

### 7.1 투표 제출 조건 (서버가 한 트랜잭션에서 확인)
1. 투표 기간일 것. 2. 세션에 `participant_id`가 있고 `status='active'`. 3. `consent === true`. 4. 서로 다른 작품이 **정확히 `voteCount`개**. 5. 모든 작품이 `visible AND NOT deleted`. 6. **본인 작품이 아닐 것**(`self_vote`, DEC-05 권고). 7. 이 계정으로 기존 투표가 없을 것.

저장: `ballots` 1행(`participant_id UNIQUE`) + `ballot_choices` N행. 각 작품 1표, 순위·가중치 없음.

### 7.2 동시성 설계 (Postgres, v1.2 핵심)

SQLite의 `BEGIN IMMEDIATE`를 아래로 대체한다. 모든 쓰기는 **트랜잭션 풀러에서도 한 트랜잭션 안에서** 수행한다.

| 작업 | 잠금 | 목적 |
|---|---|---|
| 투표 | `settings` `FOR SHARE` → 작품 `FOR SHARE`(선택한 행) → INSERT | 설정 변경·작품 숨김과 직렬화 |
| 설정 저장 | `settings` `FOR UPDATE` → `ballots` 존재 확인 → UPDATE | "투표 1건 이상이면 잠금" 판정이 최초 투표와 경합하지 않게 |
| 작품 숨김·삭제 | `settings` `FOR SHARE` → 작품 UPDATE | 투표 기간·기록 확인과 직렬화 |
| 작품 확정 | `settings` `FOR SHARE` → 파일 `FOR UPDATE` | 마감 경계·파일 이중 귀속 방지 |
| 닉네임 등록 | UNIQUE 위반 처리 | 동시 등록 중 하나만 성공 |
| 투표 중복 | `ballots.participant_id UNIQUE` | 동시 투표 중 하나만 성공 |

UNIQUE 위반(`23505`)은 제약 이름으로 구분해 `nickname_taken` / `already_voted`로 변환한다. 실패 시 전체 롤백.

### 7.3 투표 규칙 잠금
| 항목 | 최초 투표 전 | 투표 1건 이상 |
|---|---|---|
| 제출마감·투표시작·N | 변경 가능(날짜 순서 안에서) | 금지 |
| 투표마감 | 변경 가능 | 단축 금지, 연장만 |
| 작품 숨김·공개·삭제 | 투표 기간이 아닐 때만 | 금지 |
| 문구·소개 | 가능 | 가능 |
| 닉네임 변경·복구코드 재발급·차단 | 가능 | 가능 (표·득표에 영향 없음) |

종료 후 `voteEnd` 연장으로 재개될 수 있다(DEC-13). 후보 < N이면 투표가 열려도 제출이 불가능하다. 투표 전 점검 항목.

**비공개 ≠ 익명.** DB에는 `participant_id`와 선택 작품의 연결이 남는다. 복수 계정 남용을 사후 탐지하려면 필요하므로 유지한다. 관리자 UI는 개인별 선택 목록을 보여주지 않고 집계만 제공한다(DEC-22).

---

## 8. 관리자 화면

| 탭 | 내용 |
|---|---|
| 운영 현황 | 작품 수, 계정 수, 투표 완료 수, 좋아요 합, 일정, 득표 상위, 최근 기록 |
| 접수·투표 설정 | 제출마감, 업로드 허용, 공개 전 승인, 투표 시작·마감, 정확한 선정 수 |
| 출품작 관리 | 검색, 상세, 공개·숨김·논리 삭제, 좋아요·득표, 결과 CSV |
| 참여자 데이터 | 닉네임, 가입시각, 제출 수, 투표 여부·시각, 상태. 닉네임 변경·복구코드 재발급·차단/해제. 참여자 CSV |
| 페이지 관리 | 사이트명, 환영·소개·공지·주의문구, 스크롤 3장면 카피, 비밀번호 |

- **참여자 = `participants` 행.** 닉네임만 등록하고 활동이 없어도 포함. 실명 검증된 명부가 아니다.
- **관리자 조치:** `rename`(닉네임 변경, 변경 전 값 audit 기록), `reset_recovery`(새 코드 1회 표시), `block`/`unblock`(업로드·좋아요·투표·로그인 불가. 기존 표·작품 유지. 표 무효화 없음, DEC-08).
- **CSV:** 참여자(계정 1명당 1행: 닉네임, 가입일시 KST, 제출 수, 투표 여부, 투표일시 KST, 상태), 결과(작품별: 작품명, 제작자(닉네임), 유형, 좋아요, 득표수). `participant_id`는 넣지 않는다. 수식 주입 방어(`= + - @ \t \r` 시작 시 `'` 접두). UTF-8 BOM.

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
| 로그 보관 짧음 | 감사는 DB `audit`가 기준. 런타임 로그에는 닉네임·복구코드·본문 미기록 |

---

## 10. 데이터베이스 (Supabase Postgres)

### 10.1 구성
**12개 테이블, 51개 컬럼.** 1.1 대비 컬럼 변경은 `files.uploaded_at` 추가 하나와 타입 변환뿐이다. 전체 DDL은 부록 A.

| 테이블 | 용도 |
|---|---|
| `settings` | id=1 단일 행, `payload jsonb`(19키) |
| `credentials` | 역할별 비밀번호 salt·digest |
| `participants` | 닉네임 계정 |
| `sessions` | 세션(토큰 해시, CSRF, 만료, `participant_id`) |
| `works` | 작품 |
| `files` | 첨부 메타데이터. 바이트는 Storage |
| `likes`, `views` | 계정×작품 |
| `ballots`, `ballot_choices` | 투표 묶음, 선택 |
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
| `works[].liked`, `works[].mine` | 내 계정 기준 |
| `voted` | 내 계정의 `ballots` 존재 |
| `phase` | 현재 시각과 설정 날짜 비교 (저장 안 함) |
| 계정 수 / 투표 완료 수 | `COUNT(participants)` / `COUNT(ballots)` |

### 10.5 settings.payload (19키, 1.1 동일)
`siteName`, `welcome`, `description`, `notice`, `uploadGuide`, `submissionDeadline`, `voteStart`, `voteEnd`, `voteCount`(1~20, bool 불가), `uploadsEnabled`, `requireApproval`, `version`, `storyEnabled`, `storyTitle1~3`, `storyCaption1~3`.

- 길이: `siteName`·`welcome` 1~180, `description` 0~180, `notice`·`uploadGuide` 0~500, `storyTitle` 1~140, `storyCaption` 0~180.
- `uploadGuide` 기본값: "실명·사번·부서·고객정보·내부 기밀 및 권한 없는 저작물은 닉네임, 작품 설명, 첨부 파일에 포함하지 마세요."
- 저장 시 현재 `version`을 보내야 하며 불일치면 `409 settings_conflict`. 성공 시 +1. 페이지 문구와 운영 일정이 같은 version을 공유한다.
- **초기값은 시드 스크립트가 계산해 넣는다**(제출마감: 시드일 +14일 18:00 KST, 투표시작: 다음 날 09:00, 투표마감: +7일 18:00, `voteCount=3`). 모두 예시이며 실제 일정은 DEC-01.
- 설정으로 바꿀 수 없는 것: 파일 한도·확장자, 닉네임 규칙, 세션 시간, 좋아요 계산식, 폰트·색상, 재투표 허용, 익명화.

---

## 11. API 계약

동일 출처 HTTPS. 변경 요청은 Origin 검사 + `X-CSRF-Token`. **SSOT에 없는 경로를 추가하지 않는다.**

### 11.1 참여자 API
| 메서드 | 경로 | 권한 | 요청 | 응답 | v1.2 |
|---|---|---|---|---|---|
| GET | `/api/public` | 공개 | - | siteName, welcome | 유지 |
| POST | `/api/login` | 공개 | password | ok, csrf | 유지 |
| POST | `/api/logout` | 세션+CSRF | - | ok | 유지 |
| GET | `/api/me` | 참여자 세션 | - | `{participant:{nickname}\|null, csrf}` | 유지 |
| GET | `/api/nickname-check` | 참여자 세션 | `nickname` | `{available, reason?}` | 유지 |
| POST | `/api/participants` | 세션+CSRF, 닉네임 미설정만 | nickname | 201 `{ok, nickname, recoveryCode}` | 유지 |
| POST | `/api/participants/recover` | 세션+CSRF, 닉네임 미설정만 | nickname, recoveryCode | `{ok, nickname}` | 유지 |
| GET | `/api/bootstrap` | 닉네임 설정됨 | - | settings, phase, serverNow, csrf, works, voted, limits | 유지 |
| POST | `/api/uploads` | 닉네임 설정+CSRF | **JSON** `{name,size}` | 201 `{id,name,mime,size,uploadUrl}` | **변경**(본문이 파일 → JSON) |
| POST | `/api/uploads/{fileId}/complete` | 닉네임 설정+CSRF | - | `{ok}` | **신규** |
| DELETE | `/api/staged/{fileId}` | 닉네임 설정+CSRF | - | ok(객체도 삭제) | 유지 |
| POST | `/api/works` | 닉네임 설정+CSRF | title, category, tools, description, fileIds, consent | 201 ok, id, pending | 유지 |
| GET | `/api/files/{fileId}` | 닉네임 설정 또는 관리자 | `download=1` | **302 서명 URL(60초)** | **변경**(본문 → 리다이렉트) |
| POST | `/api/works/{workId}/like` | 닉네임 설정+CSRF | - | ok(토글) | 유지 |
| POST | `/api/works/{workId}/view` | 닉네임 설정+CSRF | - | ok | 유지 |
| POST | `/api/votes` | 닉네임 설정+CSRF | workIds, consent | 201 ok, receipt | 유지 |

~~`GET /api/design-font`~~ **삭제.** 클라이언트가 정적 경로 `/fonts/Moneygraphy-Rounded.woff2`를 직접 확인하고 없으면 시스템 서체를 쓴다.

### 11.2 관리자 API
| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/api/admin/login`, `/api/admin/logout` | password / - | ok, csrf |
| GET | `/api/admin/bootstrap` | - | 공통 + ballots(`id`,`nickname`,`created`), participants(`id`,`nickname`,`created`,`uploads`,`voted`,`votedAt`,`status`), audit 최근 50건 |
| PATCH | `/api/admin/settings` | version + 설정키 | ok, settings |
| PATCH | `/api/admin/works/{workId}` | action: show/hide/delete | ok |
| PATCH | `/api/admin/participants/{participantId}` | action: `rename`(+nickname)/`reset_recovery`/`block`/`unblock` | ok (`reset_recovery`는 `recoveryCode` 1회 포함) |
| POST | `/api/admin/password` | role, currentAdminPassword, newPassword | ok |
| GET | `/api/admin/export/participants`, `/api/admin/export/results` | - | CSV |

**공개 계약 합계 25개**(참여자 16 + 관리자 9 중복 제외 기준: 위 표의 경로 수). 별도로 **내부 크론** `GET /api/cron/cleanup`(공개 계약 아님, `CRON_SECRET` 필수).

### 11.3 예시 (테스트용)
```json
POST /api/uploads        { "name": "시연영상.mp4", "size": 31457280 }
→ 201 { "id": "0123456789abcdef0123456789abcdef", "name": "시연영상.mp4",
        "mime": "video/mp4", "size": 31457280, "uploadUrl": "https://…supabase.co/storage/v1/…" }

POST /api/works
{ "title": "AI 회의록 실행과제 정리", "category": "업무자동화", "tools": "ChatGPT, Claude",
  "description": "반복적인 회의록 정리에서 담당자와 실행기한을 분리한 제작 사례입니다.",
  "fileIds": ["0123456789abcdef0123456789abcdef"], "consent": true }

POST /api/votes
{ "workIds": ["111111111111111111111111","222222222222222222222222","333333333333333333333333"],
  "consent": true }
```
`workIds` 3개는 N=3일 때만 유효. `receipt`는 투표 ID일 뿐 증명서가 아니다.

### 11.4 정보 경계
- 참여자 응답 제외: `participant_id`, `votes`, 복구코드 해시, 타인의 투표 여부.
- 관리자 응답 제외: 비밀번호·복구코드 해시, 세션 토큰, Storage 내부 경로. 서명 URL은 요청 시점에만 발급.
- 작품 검색·정렬·필터는 `bootstrap` 응답을 브라우저에서 처리한다.

---

## 12. 오류 코드 (1.1 유지, 추가 1개)

| 코드 | HTTP | 의미 |
|---|---|---|
| `wrong_password` | 401 | 비밀번호 확인 |
| `unauthorized` | 401 | 세션 만료 |
| `csrf_denied`, `origin_denied` | 403 | 검증 실패 |
| `participant_required` | 403 | 닉네임 설정·복구 필요 |
| `account_blocked` | 403 | 차단 계정 |
| `invalid_input` | 400 | 필드·길이 |
| `nickname_invalid`, `nickname_reserved` | 400 | 규칙·예약어·금칙어 |
| `nickname_taken` | 409 | 중복 |
| `recovery_invalid` | 401 | 닉네임·코드 불일치(구분 안 함) |
| `already_registered` | 409 | 이미 닉네임이 설정된 세션 |
| `invalid_dates`, `date_order`, `invalid_count` | 400 | 일정·N |
| `selection_count`, `invalid_selection`, `self_vote` | 400 | 선정 오류 |
| `consent_required` | 400 | 동의 |
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
- 비밀번호 PBKDF2-SHA256 600,000회. 세션 토큰은 해시 저장. 복구코드 HMAC + pepper.
- HttpOnly·Secure·SameSite 쿠키(`__Host-` 접두), CSRF 토큰, Origin 검사, SQL 파라미터 바인딩(postgres.js 태그드 템플릿), 서버측 기간·개수·중복·권한 검증.
- 파일은 난수 키, 비공개 버킷, 서명 URL(60초), 업로드 완료 시 크기·시그니처 검사, 버킷 수준 한도·MIME 이중 방어.
- CSV 수식 주입 방어, CSP, noindex.
- **서비스 키 관리:** `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RECOVERY_PEPPER`, `CRON_SECRET`은 Vercel 환경변수(서버)에만 둔다. 브라우저 번들에 포함되면 안 된다(AC-42).

### 13.2 요청 제한 (`attempts` 테이블 기준)
| 대상 | 제한 | 기준 |
|---|---|---|
| 로그인 실패 | 15회/15분 | IP 해시, 역할별 |
| 파일 업로드 시작(`/api/uploads`) | 60회/1시간 | 계정 |
| 투표 | 40회/15분 | 계정 |
| 비밀번호 변경 | 10회/15분 | 관리자 세션 |
| 닉네임 등록 | 10회/1시간 | IP 해시 |
| 복구코드 시도 | 10회/15분 | IP 해시 |
| 닉네임 확인 | 60회/15분 | 세션 |

닉네임 등록 제한은 복수 계정 생성을 **늦출** 뿐 막지 못한다. **사내 단일 공인 IP(NAT)에서 접속하면 모든 직원이 같은 IP로 보인다.** IP 기준 제한(로그인·등록·복구)은 전 직원이 한도를 공유하므로 운영 전 실제 접속 경로를 확인하고, 필요하면 한도를 상향한다(DEC-26).

### 13.3 아직 없는 범위
SSO·사번 대조, 관리자 개인 계정·세부 권한, 다중요소 인증, 바이러스 검사, 개인정보 자동 파기, audit의 행위자·변경 전후, 이메일 알림, 회차 분리, 동의 이력 저장.

### 13.4 audit 기록
작품 등록, 투표 접수, 설정 변경, 작품 관리, 비밀번호 변경, 데이터 내보내기, 닉네임 변경(전→후), 복구코드 재발급, 차단/해제. 복구코드는 어떤 로그에도 남기지 않는다.

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
| `MEMBER_PASSWORD`, `ADMIN_PASSWORD` | **시드 스크립트 전용**(로컬/CI에서 1회 실행). 런타임 함수에는 불필요 | 서버 |
| `RECOVERY_PEPPER` | 복구코드 HMAC 키(32바이트 이상 난수) | 서버 |
| `CRON_SECRET` | 크론 엔드포인트 보호 | 서버 |
| `ALLOWED_ORIGINS` | Origin 검사 | 서버 |

`NEXT_PUBLIC_` 등 브라우저 노출 접두사를 쓰지 않는다. 관리자 비밀번호는 시드 로그에 찍지 않고 비밀번호 관리자에 보관한다.

### 14.3 배포 절차
1. 스테이징·운영 Supabase 프로젝트 생성(서울), Supabase CLI로 `0001_init.sql` 적용(`supabase db push`), 버킷 생성 확인.
2. 시드 스크립트 실행: `settings`(19키 기본값), `credentials`(참여자·관리자 해시).
3. Vercel 프로젝트 연결, 환경별 환경변수 등록, 리전 `icn1`.
4. **스테이징 전체 리허설**(접수 → 대기 → 투표 → 종료)과 동시성 시나리오(AC-17, 19, 20, 47).
5. 운영 반영 → **관리자 비밀번호·참여자 비밀번호를 운영 값으로 확정** → 공개.
6. 투표 전 점검: 공개 작품 수 ≥ N, 일정·N 확인, 부하 점검.

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
- 서버를 **TypeScript/Hono로 재구현**한다. `server.py`는 동작 명세, 기존 pytest(59개)는 시나리오 원본으로 쓴다. v4 검증 보고서는 v4 기준이므로 v1.2에서 **재작성·재실행**한다.
- UI는 기존 `app.js` 로직을 유지하되 (a) `DEMO` 분기·`createHanaDemo`·데모 비밀번호 제거, (b) 업로드를 3단계(15.3 4단계)로 변경, (c) 인라인 스크립트·스타일 분리, (d) 폴링 60초.

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

**Phase 2. 닉네임·복구**
정규화·검증, 예약어·금칙어, 등록(UNIQUE 처리), 복구(HMAC·timingSafeEqual), 제한(`register`·`recover`), `/api/me`, `/api/nickname-check`.

**Phase 3. 업로드·작품**
`/api/uploads`(서명 URL), `complete`(크기·시그니처), `/api/works` 트랜잭션, 파일 302 리다이렉트, 정리 크론.

**Phase 4. 좋아요·조회·투표·관리자**
7.2의 잠금 설계 구현, 관리자 설정·작품·참여자 조치, CSV.

**Phase 5. 프런트 정리**
데모 제거, 닉네임 화면 3종, 신청 폼에서 부서·이름·사번 제거, 업로드 3단계·진행률, 스크립트·스타일 분리 후 CSP 적용.

**Phase 6. 테스트·배포**
17절 AC를 vitest(동시성 포함)와 Playwright(닉네임·신청·투표·모바일 폭)로 자동화 → 스테이징 리허설 → 운영.

### 15.4 Cursor 규칙 (`.cursor/rules/ssot.mdc`)
```
# 하나증권 AI 마켓 불변 규칙 (SSOT 1.2)
- 참여자 PII는 닉네임만 저장한다. 이름·사번·부서·이메일 필드/컬럼/로그 추가 금지.
- participant_id는 참여자 응답에 노출하지 않는다. 화면 식별은 닉네임.
- 닉네임 중복 판정은 nickname_key, 최종 방어는 DB UNIQUE(23505 → nickname_taken).
- 복구코드는 평문 저장·로깅 금지. HMAC-SHA256(RECOVERY_PEPPER) 해시만 저장.
- 투표와 좋아요는 테이블·API·UI 모두 분리한다.
- 기간·개수·중복·권한 검증은 서버가 최종 판정한다. 프런트 검증은 보조.
- 모든 테이블 RLS ON + 정책 없음. anon/authenticated 권한 REVOKE.
- DB/Storage 접근은 서버 코드에서만. 브라우저에 Supabase URL·키를 내려보내지 않는다.
- SERVICE_ROLE_KEY·DATABASE_URL·RECOVERY_PEPPER는 서버 환경변수로만 사용. NEXT_PUBLIC_ 금지.
- Supabase Auth 미사용. 세션은 sessions 테이블 + HttpOnly Secure 쿠키(__Host-).
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
| AC-01 | 공통 비밀번호 대소문자 변형 입장 | 성공 후 닉네임 설정 화면 |
| AC-02 | 닉네임 미설정 세션으로 작품 API | `403 participant_required` |
| AC-17 | 같은 계정을 복구코드로 다른 기기에서 입장해 재투표 | `409 already_voted`, `voted=true` 표시 |
| AC-18 | `Hana_AI` 등록 후 `hanaai`·`ＨＡＮＡＡＩ`·`hana_ai` 등록 | 모두 `nickname_taken` |
| AC-19 | 같은 닉네임 동시 등록 2요청 | 하나만 성공, 부분 저장 없음 |
| AC-20 | 같은 계정 동시 투표 2요청 | 하나만 접수 |
| AC-24 | 참여자 응답 점검 | `participant_id`·`votes`·복구코드 해시 미노출 |
| AC-31~40 | 닉네임 규칙·복구 제한·관리자 조치·PII 필드 부재 | 1.1과 동일 |
| **AC-41** | **anon 키로 PostgREST `participants`·`ballots`·`works` 조회** | **데이터 없음/권한 오류.** 모든 테이블에서 확인 |
| **AC-42** | **빌드 산출물(`public/`)과 응답에서 서비스 키·연결 문자열 검색** | **없음** |
| **AC-43** | **50 MiB 파일 업로드 / 50 MiB + 1바이트** | **성공(함수 경유 없음) / 거부**(서버·버킷 양쪽) |
| **AC-44** | **`complete` 호출 전 `fileIds`로 작품 확정** | **`upload_incomplete`** |
| **AC-45** | **확장자와 내용이 다른 파일(`.pdf`로 위장한 exe) `complete`** | **`invalid_file_content`**, 객체·행 삭제 |
| **AC-46** | **서명 URL 만료(60초) 후 재사용** | **접근 거부.** 인증 없이 `/api/files/{id}` 호출은 401 |
| **AC-47** | **동일 계정으로 20개 병렬 투표 요청** | **정확히 1건**, `ballot_choices`는 N행 |
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
| **DEC-18** | 복수 닉네임으로 다중 투표 방지 | 이벤트성이면 닉네임만 + 완화책(등록 제한, 신규 계정 급증 모니터링, 사후 점검, `block`). **시상에 직결되면 투표권 코드**(인재개발실이 개별 배포, 앱은 실명을 모름) |
| **DEC-05** | 본인 작품 투표 | **금지**(기본 적용) |
| DEC-01 | 실제 일정·N | 운영 확정 필요 |
| DEC-12 | 닉네임·활동·파일·**Vercel·Supabase 로그** 보관·파기, 종료 후 프로젝트 삭제 시점 | 종료 후 일정 기간 뒤 삭제. 기간은 정보보호 담당과 협의 |
| DEC-19 | 복구코드 분실·수상자 본인 확인 | 수상 닉네임 공지 → 수상자가 인재개발실에 닉네임·작품명 통지 → 관리자가 작품 파일·설명 대조 → 필요 시 `reset_recovery` |

**v1.2 신규**

| ID | 결정할 것 | 권고 |
|---|---|---|
| DEC-26 | 사내 NAT 환경에서 IP 기반 요청 제한 한도 | 접속 경로 확인 후 로그인·등록·복구 한도 상향. 계정·세션 기준 제한은 유지 |
| DEC-27 | 접속망 한정 여부·도메인 | Vercel은 기본 공개 URL. 사내망 전용이 필수면 별도 접근 제어 필요(요금제·구성 확인). 비밀번호 + 요청 제한으로 충분한지 정보보호 판단 |
| DEC-28 | 백업 수단과 담당 | `pg_dump` + 버킷 다운로드를 투표 종료 직후·삭제 직전 수동 수행. 담당자 지정 |
| DEC-29 | Vercel·Supabase 요금제 | 공모전 기간 Pro, 종료 후 다운그레이드·삭제 |

**기타 (1.1 유지):** DEC-02(스토리 02 문구), DEC-03(팀 출품·1인 제출 수), DEC-04(수정·취소), DEC-06(정확히 N개/최대 N개), DEC-08(표 무효화), DEC-09(시상·동점), DEC-10(결과 공개), DEC-11(다음 회차), DEC-13(종료 후 연장), DEC-14(업로드 한도), DEC-15(승인 대기 vs 숨김), DEC-17(디자인 편집 범위), DEC-20(파일 속 개인정보, EXIF 제거 권고), DEC-21(Moneygraphy 배포 라이선스), DEC-22(투표 선택 연결 분리, 유지 권고), DEC-23(닉네임 길이·문자), DEC-24(초기 비밀번호 값).

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
| **1.2** | **2026-10-05** | **Vercel Functions + Supabase(Postgres·Storage) 전환. 업로드 3단계, Postgres 잠금 설계, RLS, 크론, 환경 분리, 복구코드 HMAC, 컬럼 51개** |

### 인계용 요약
> 하나증권 임직원 대상 AI 제작물 공모전 서비스. 참여자는 공통 비밀번호로 입장해 **닉네임만** 정하고(내부 ID로 식별, 복구코드로 재입장) 작품을 제출·탐색·응원하며, 지정 기간에 정확히 N개를 골라 계정당 1회 투표한다. 이름·사번·부서는 저장하지 않는다. 구현은 **Vercel(정적 + Hono 함수, 서울) + Supabase(Postgres, 비공개 Storage)**이며, 파일은 서명 URL로 브라우저가 직접 올리고, 모든 DB 접근은 서버에서만 한다(RLS 전면 적용). 스테이징·운영 Supabase를 분리한다. **착수 전 최우선은 외부 클라우드 사용에 대한 사내 정보보호 승인(DEC-25)과 복수 닉네임 대응(DEC-18)이다.**

---

## 부록 A. `supabase/migrations/0001_init.sql`

```sql
-- 하나증권 AI 마켓 v1.2 — Postgres 스키마 (12 테이블 / 51 컬럼)
-- 서버(서비스 연결)에서만 접근한다. 모든 테이블 RLS ON, 정책 없음.

create table if not exists settings (
  id smallint primary key check (id = 1),
  payload jsonb not null
);

create table if not exists credentials (
  role text primary key check (role in ('member','admin')),
  salt text not null,
  digest text not null
);

create table if not exists participants (
  id text primary key,
  nickname text not null,
  nickname_key text not null,
  recovery_digest text not null,
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

create table if not exists ballots (
  id text primary key,
  participant_id text not null references participants(id),
  created timestamptz not null default now(),
  constraint ballots_participant_uq unique (participant_id)
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

컬럼 수: settings 2, credentials 3, participants 6, sessions 5, works 10, files 8, likes 2, views 2, ballots 3, ballot_choices 2, attempts 4, audit 4 = **51**.

시드(`scripts/seed.ts`, SQL이 아님): `settings` id=1에 19키 기본값(일정은 실행일 기준 계산), `credentials`에 `member`·`admin` 해시(PBKDF2 600,000회, salt 16바이트). 이미 행이 있으면 덮어쓰지 않는다.

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
