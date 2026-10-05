-- 하나증권 AI 마켓 — 역할 구조 개편
-- 제작자(업로더): 관리자가 닉네임+비밀번호 계정을 미리 만들어 배포한다. 자가등록·복구코드 폐지.
-- 투표자(일반사용자): 로그인 없이 투표 기간에만 공개 작품에 투표한다. 중복 투표는 브라우저 쿠키 기준으로만 판정한다.
-- 출시 전 테스트 데이터뿐이므로 식별 모델이 바뀌는 테이블은 비우고 다시 만든다.

truncate table ballot_choices, ballots, likes, views, files, works, participants, sessions, attempts, audit restart identity;

-- participants: 복구코드 폐지 → 비밀번호(PBKDF2 salt/digest)로 전환
alter table participants drop column if exists recovery_digest;
alter table participants add column if not exists password_salt text not null;
alter table participants add column if not exists password_digest text not null;

-- credentials: 참여자 공통 비밀번호(member) 폐지. 관리자 비밀번호만 유지한다.
delete from credentials where role = 'member';

-- ballots: 참여자 계정이 아니라 익명 투표자 쿠키 토큰 해시로 중복 투표를 판정한다.
alter table ballots drop constraint if exists ballots_participant_uq;
alter table ballots drop column if exists participant_id;
alter table ballots add column if not exists voter_token_hash text not null unique;
