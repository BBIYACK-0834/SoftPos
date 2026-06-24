# 일일 인원현황/열외현황 보고문 생성기

군 부대의 **일일 인원현황 / 열외현황 보고문**을 웹에서 입력하고 자동 생성하는 MVP입니다. 사용자는 날짜별 열외자와 일일 보고사항만 입력하면, 시스템이 Supabase에 저장된 인원명부를 기준으로 총원·열외·현재원을 계산하고 정해진 양식의 보고문을 생성합니다.

이 프로젝트는 **백엔드 서버를 따로 두지 않는 구조**입니다. 프론트엔드는 Next.js로 구현하고, 데이터베이스는 Supabase를 사용합니다. 기본 기능은 비로그인으로 작동하며, 인원명부와 카테고리 수정만 앱 내부 관리자 모드로 제한합니다. 배포는 Vercel을 기준으로 합니다.

---

## 1. 핵심 목표

- 웹에서 날짜별 열외자와 보고사항을 입력합니다.
- Supabase DB에 저장된 active 인원명부를 기준으로 총원을 계산합니다.
- 특정 날짜의 열외자를 제외해 현재원을 자동 계산합니다.
- 열외자는 열외구분별로 그룹화해 보고문에 출력합니다.
- 최종 보고문은 미리보기로 확인하고 **복사하기** 버튼으로 클립보드에 복사합니다.
- Express, NestJS 같은 별도 백엔드 서버 없이 Supabase SDK를 프론트엔드에서 직접 사용합니다.

---

## 2. 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Database | Supabase Postgres |
| Admin Mode | 앱 내부 고정 관리자 계정 |
| Deployment | Vercel |
| Backend Server | 없음. 프론트엔드에서 Supabase SDK 직접 사용 |

---

## 3. 주요 기능

### 3.1 기본 사용 / 관리자 모드

- 기본 사용자는 로그인 없이 열외 입력, 일일 보고사항 입력, 보고문 생성을 사용할 수 있습니다.
- 인원명부와 열외 카테고리 수정만 관리자 모드에서 가능합니다.
- 관리자 계정은 앱 내부 고정값을 사용합니다.
  - ID: `tnthdrmsan`
  - Password: `1q2w3e3r!`
- 관리자 로그인 상태는 브라우저 `localStorage`에 저장됩니다. 보안보다 빠른 MVP 사용성을 우선한 방식입니다.

### 3.2 인원명부 관리

인원명부는 `members` 테이블에 저장됩니다.

지원 기능:

- 인원 추가
- 인원 수정
- 활성/비활성 처리
- 계급 선택
- 소속 입력
- 정렬 순서 입력

입력 필드:

| 필드 | 설명 |
| --- | --- |
| 이름 | 인원 이름 |
| 계급 | 병장, 상병, 일병, 이병 중 선택 |
| 소속 | 기본값: 전투지원소대 수송분대 |
| 활성 여부 | `active=false`인 인원은 총원에서 제외 |
| 정렬 순서 | 같은 계급 내 출력 순서 |

정렬 규칙:

1. 계급 순서: 병장 → 상병 → 일병 → 이병
2. 같은 계급이면 `sort_order` 오름차순
3. `sort_order`가 같으면 이름순

### 3.3 날짜별 열외 입력

열외 정보는 `daily_exceptions` 테이블에 날짜별로 저장됩니다.

지원 기능:

- 날짜 선택
- 인원 선택
- 열외구분 선택
- 세부사유 입력
- 저장
- 수정
- 삭제
- 같은 날짜에 같은 인원 중복 등록 방지

기본 열외구분:

- 외출
- 외박
- 휴가
- 전투휴무
- 외진
- 식청

관리자 모드에서 열외 카테고리를 추가/수정/비활성화할 수 있습니다.

중복 방지 방식:

- DB에서 `unique(date, member_id)` 제약을 사용합니다.
- 같은 날짜에 같은 인원을 두 번 열외자로 등록하면 Supabase/Postgres에서 저장을 거부합니다.

### 3.4 일일 보고사항 입력

일일 보고사항은 `daily_reports` 테이블에 날짜별로 저장됩니다.

입력 항목:

- 구타 및 가혹행위
- 언어폭력
- 성군기위반행위
- 자살징후자
- 애로 및 건의사항
- 환자
- 익일 처부일과

기본 규칙:

- 대부분의 항목 기본값은 `없음`입니다.
- 해당 날짜의 보고사항이 없으면 보고문 생성 시 기본값 `없음`으로 처리합니다.
- `date`는 unique이므로 같은 날짜 보고사항은 upsert 방식으로 저장됩니다.

### 3.5 보고문 생성

보고문 생성 화면에서는 선택 날짜를 기준으로 아래 값을 자동 계산합니다.

| 항목 | 계산 방식 |
| --- | --- |
| 총원 | `members.active = true` 인원 수 |
| 열외 | 선택 날짜의 `daily_exceptions` 등록 인원 수 |
| 현재원 | 총원 - 열외 |
| 현재원 명단 | active 인원 전체 - 선택 날짜 열외자 |
| 열외내용 | 열외구분별 그룹화 |

보고문 출력 기능:

- 보고문 미리보기 표시
- 원문 textarea 표시
- 클립보드 복사 버튼 제공
- 저장된 인원/열외/보고사항 변경 후 화면에서 즉시 반영

---

## 4. 보고문 생성 규칙

날짜 형식:

```text
6.22(목)
```

첫 줄 형식:

```text
지금 {날짜} 전투지원소대 수송분대
```

현재원 형식:

```text
현재원 : 6(상병 손현태, 상병 허주원, 일병 유재현)
```

열외내용 형식:

```text
열외내용 :
- 전투휴무5 (병장 유승종, 상병 조승수, 상병 서문수, 상병 남윤형, 상병 서연호)
병장 유승종: 12월 당직으로 인한 전투휴무
상병 조승수: 오대기 전투휴무(2.16)
- 외진2 (상병 김승범, 일병 한승훈)
```

세부 규칙:

- 열외자는 category별로 그룹화합니다.
- 그룹 제목은 `- {열외구분}{인원수} ({명단})` 형식입니다.
- 세부사유가 있는 인원은 그룹 제목 아래에 `{계급} {이름}: {사유}`로 출력합니다.
- 세부사유가 없는 인원은 그룹 제목 명단에만 포함됩니다.
- 일일 보고사항 값이 비어 있으면 `없음`으로 출력합니다.

---

## 5. 프로젝트 폴더 구조

```text
app/
  globals.css        # 반응형 UI 및 공통 스타일
  layout.tsx         # 앱 메타데이터와 루트 레이아웃
  page.tsx           # 관리자 모드, 인원명부, 카테고리, 열외 입력, 보고사항, 보고문 생성 UI
lib/
  report.ts          # 날짜 포맷, 인원 정렬, 보고문 생성 로직
  supabase.ts        # Supabase 클라이언트 생성
  types.ts           # Member, DailyException, DailyReport 타입과 상수
supabase/
  migration.sql      # 테이블 생성, 제약조건, RLS 정책
.env.example         # 환경변수 예시
package.json         # Next.js 프로젝트 의존성 및 스크립트
```

---

## 6. 주요 파일 설명

### `app/page.tsx`

실제 화면과 Supabase CRUD 함수가 들어 있는 메인 클라이언트 컴포넌트입니다.

포함 기능:

- 관리자 모드 로그인/종료
- 비로그인 기본 사용
- 날짜 선택
- 인원명부 관리
- 열외자 저장/수정/삭제
- 일일 보고사항 저장
- 보고문 미리보기
- 보고문 클립보드 복사

주요 함수:

- `fetchMembers()`
- `fetchExceptionsByDate(date)`
- `fetchDailyReport(date)`
- `saveException()`
- `deleteException()`
- `upsertDailyReport()`
- `copyToClipboard(text)`

### `lib/report.ts`

보고문 생성과 관련된 순수 함수가 들어 있습니다.

주요 함수:

- `todayIso()`
- `formatKoreanDate(date)`
- `sortMembers(members)`
- `displayMember(member)`
- `emptyDailyReport(date)`
- `generateReportText(date, members, exceptions, dailyReport)`

### `supabase/migration.sql`

Supabase SQL Editor에서 실행할 DB 스키마입니다.

포함 내용:

- `members` 테이블
- `exception_categories` 테이블
- `daily_exceptions` 테이블
- `daily_reports` 테이블
- 열외자 중복 방지 unique 제약
- RLS 활성화
- anon/authenticated 사용자 CRUD 정책
- 조회 성능용 인덱스

---

## 7. Supabase 테이블 설계

### 7.1 `members`

```sql
create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null,
  unit text not null default '전투지원소대 수송분대',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamp with time zone default now()
);
```

### 7.2 `exception_categories`

```sql
create table exception_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamp with time zone default now()
);
```

기본 데이터는 `외출`, `외박`, `휴가`, `전투휴무`, `외진`, `식청`입니다.

### 7.3 `daily_exceptions`

```sql
create table daily_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  member_id uuid not null references members(id) on delete cascade,
  category text not null,
  reason text,
  created_at timestamp with time zone default now(),
  unique(date, member_id)
);
```

### 7.4 `daily_reports`

```sql
create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  assault text default '없음',
  verbal_abuse text default '없음',
  sexual_misconduct text default '없음',
  suicide_risk text default '없음',
  complaints text default '없음',
  patient text default '없음',
  next_day_work text,
  created_at timestamp with time zone default now()
);
```

실제 실행용 SQL은 `supabase/migration.sql`을 사용하면 됩니다.

---

## 8. 환경변수

`.env.local` 파일을 만들고 아래 값을 입력합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

환경변수 설명:

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key |

> `NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저에 노출됩니다. Supabase anon key는 RLS 정책과 함께 쓰는 공개 키이며, service role key를 프론트엔드에 넣으면 안 됩니다.

---

## 9. 로컬 실행 방법

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

---

## 10. Supabase 설정 방법

1. Supabase 프로젝트를 생성합니다.
2. Project Settings > API에서 Project URL과 anon public key를 확인합니다.
3. SQL Editor에서 `supabase/migration.sql` 전체를 실행합니다.
4. `.env.local`에 Supabase URL과 anon key를 입력합니다.
5. 앱에 접속하면 비로그인 상태로 기본 기능을 사용할 수 있습니다.
6. 인원명부 또는 카테고리 수정이 필요하면 관리자 ID `tnthdrmsan`, 비밀번호 `1q2w3e3r!`로 관리자 모드에 진입합니다.

RLS 정책:

- `members`: anon/authenticated CRUD 허용
- `exception_categories`: anon/authenticated CRUD 허용
- `daily_exceptions`: anon/authenticated CRUD 허용
- `daily_reports`: anon/authenticated CRUD 허용

MVP에서는 보안보다 즉시 사용성을 우선하여 anon CRUD 정책을 사용합니다. 운영 환경에서 보안을 강화하려면 Supabase Auth, 관리자 role, 서버 액션 또는 Edge Function 기반 권한 검증으로 확장하는 것을 권장합니다.

---

## 11. Vercel 배포 방법

1. GitHub에 이 저장소를 push합니다.
2. Vercel에서 **New Project**를 선택합니다.
3. GitHub 저장소를 import합니다.
4. Framework Preset은 **Next.js**로 둡니다.
5. Environment Variables에 아래 값을 등록합니다.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy를 실행합니다.
7. 배포 URL에 접속하면 비로그인 상태로 기본 기능을 바로 사용할 수 있습니다.

---

## 12. 사용 흐름

1. 웹에 접속하면 비로그인 상태로 기본 입력 화면을 사용할 수 있습니다.
2. 인원명부 또는 카테고리 수정이 필요하면 관리자 ID `tnthdrmsan`, 비밀번호 `1q2w3e3r!`로 관리자 모드에 진입합니다.
3. `관리자 설정` 탭에서 모든 active 인원과 열외 카테고리를 등록합니다.
4. `열외 입력` 탭에서 보고 날짜의 열외자만 등록합니다.
5. `일일 보고사항` 탭에서 날짜별 보고사항을 입력합니다.
6. `보고문 생성` 탭에서 자동 생성된 보고문을 확인합니다.
7. `복사하기` 버튼을 눌러 보고문을 클립보드에 복사합니다.
8. 필요한 보고 채널에 붙여넣어 전송합니다.

---

## 13. 현재 MVP 범위

포함된 것:

- 프론트엔드 단일 앱
- 비로그인 기본 사용
- 앱 내부 관리자 모드
- Supabase DB 직접 CRUD
- 인원명부 관리
- 날짜별 열외자 관리
- 날짜별 보고사항 관리
- 보고문 자동 생성
- 클립보드 복사
- RLS 기본 정책
- Vercel 배포 가능 구조

포함하지 않은 것:

- 별도 Express/Nest 백엔드 서버
- 강한 보안이 필요한 관리자/일반 사용자 권한 분리
- 감사 로그
- 첨부파일 업로드
- 다중 부대/다중 분대 관리
- 오프라인 동기화

---

## 14. 나중에 개선할 기능

- 관리자 role 테이블을 추가해 인원명부 수정 권한 분리
- 보고문 템플릿 DB 관리 기능
- 부대/분대 다중 관리
- CSV/엑셀 인원명부 일괄 업로드
- 날짜별 변경 이력 및 감사 로그
- 열외구분별 색상/필터
- 자주 쓰는 열외 사유 템플릿
- 월별/주별 열외 통계
- PWA 오프라인 임시 저장
- 카카오톡/문자 공유에 최적화된 복사 포맷
