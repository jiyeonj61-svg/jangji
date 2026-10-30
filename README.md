# 장지연 워크캘린더 · PC/휴대폰 실시간 연동 버전

컴퓨터와 갤럭시폰에서 같은 계정으로 로그인하면 업무 등록·수정·삭제·완료 상태가 Supabase를 통해 실시간으로 반영되는 정적 웹앱입니다. GitHub와 Vercel로 배포할 수 있습니다.

## v3 · 연속 일정과 목표

- 업무 등록·수정에서 **단일 날짜 / 연속 날짜**를 선택합니다. 연속 일정은 시작일과 종료일을 모두 포함하며, 주·월 경계에서 이어지는 막대로 표시됩니다.
- 달력 위에 선택한 연도의 **연간 목표**와 선택한 달의 **월간 목표**가 고정됩니다. 추가·수정·삭제와 완료 체크를 지원합니다.
- 목표도 로그인 계정별로 Supabase에 저장되며 다른 기기에 실시간 반영됩니다. 백업 파일에는 일정의 종료일과 목표가 함께 포함됩니다. 기존 업무 백업도 복원할 수 있습니다.
- 월별 업무 수는 해당 월과 겹치는 연속 일정을 한 건으로 계산합니다.

### 기존 설치 업데이트

앱을 배포하기 전에 `supabase/migrations/20261030_ranges_and_goals.sql`을 Supabase SQL Editor에서 실행합니다. 기존 업무 데이터는 유지하며 nullable `end_date`와 사용자별 RLS가 적용된 `calendar_goals` 테이블을 추가합니다. 신규 설치는 아래 `supabase-setup.sql` 실행 후 이 마이그레이션도 실행합니다.

검증: `node tests/calendar-layout.test.js`, `node --check app.js`, `node --check goals.js`.

## 이번 버전에서 추가된 기능

- Supabase 이메일·비밀번호 로그인
- PC와 휴대폰 실시간 업무 동기화
- 사용자별 데이터 분리용 RLS 보안 정책
- 업무 완료 체크 시 모든 기기에서 초록색으로 변경
- 기존 로컬 저장 업무를 Supabase로 한 번에 이전
- JSON 백업·복원
- 갤럭시 홈 화면 설치용 PWA
- 네트워크 상태 및 동기화 상태 표시
- 오프라인 시 마지막 동기화 내용을 읽기 전용으로 표시

---

## 적용 전에 꼭 확인할 내용

기존 사이트에 업무가 들어 있다면 먼저 기존 페이지 상단의 **백업** 버튼을 눌러 JSON 파일을 저장해 두세요.

기존 Vercel 도메인과 GitHub 저장소를 그대로 유지한 채 파일만 교체하면, 같은 브라우저에 있던 기존 업무를 자동으로 감지해 서버로 이전할 수 있습니다. 다른 도메인으로 새로 배포하면 자동 감지가 되지 않을 수 있으므로 JSON 백업 파일을 새 버전의 **복원** 버튼으로 불러오면 됩니다.

---

## 1단계 · Supabase 데이터베이스 만들기

1. Supabase에 로그인합니다.
2. **New project**를 눌러 프로젝트를 만듭니다.
3. 프로젝트가 준비되면 왼쪽 메뉴에서 **SQL Editor**를 엽니다.
4. **New query**를 누릅니다.
5. 이 폴더의 `supabase-setup.sql` 내용을 전부 복사해 붙여넣습니다.
6. 오른쪽 아래 **Run**을 누릅니다.
7. 오류 없이 완료되면 `calendar_tasks` 테이블, 사용자별 보안 정책, Realtime 설정이 한 번에 생성됩니다.

이미 다른 용도로 쓰는 Supabase 프로젝트가 있다면 같은 프로젝트에서 SQL을 실행해도 됩니다. 기존 테이블을 지우지 않고 `calendar_tasks`만 추가하도록 작성되어 있습니다.

---

## 2단계 · Supabase 주소와 키 입력하기

Supabase 프로젝트에서 **Project Settings → API** 또는 **Connect** 화면으로 이동해 다음 값을 확인합니다.

- Project URL
- Publishable key 또는 legacy `anon public` key

`supabase-config.js` 파일을 열어 아래 두 자리만 교체합니다.

```js
window.WORK_CALENDAR_CONFIG = Object.freeze({
  supabaseUrl: "https://내프로젝트주소.supabase.co",
  supabasePublishableKey: "내 Publishable key",
});
```

> `service_role` 키는 관리자용 비밀키이므로 웹사이트 코드에 절대로 넣지 마세요.

---

## 3단계 · 로그인 리디렉션 주소 등록하기

Supabase 왼쪽 메뉴에서 **Authentication → URL Configuration**으로 이동합니다.

Vercel 주소가 아래와 같다고 가정하면:

```text
https://jangjiyeon-work-calendar.vercel.app
```

다음처럼 등록합니다.

- **Site URL**: `https://jangjiyeon-work-calendar.vercel.app`
- **Redirect URLs**: `https://jangjiyeon-work-calendar.vercel.app/**`

개인 도메인을 사용한다면 개인 도메인도 Redirect URLs에 추가합니다.

가입 직후 이메일 확인 과정 없이 바로 쓰고 싶다면 Supabase의 **Authentication → Providers → Email**에서 이메일 확인 설정을 해제할 수 있습니다. 보안을 더 중시하면 이메일 확인을 유지하세요.

---

## 4단계 · GitHub 파일 교체 후 Vercel 배포하기

기존 GitHub 저장소에서 기존 파일을 삭제하거나 덮어쓴 뒤, 이 폴더 안의 파일과 폴더를 전부 업로드합니다.

```text
jangjiyeon-work-calendar-realtime/
├─ icons/
│  ├─ icon-192.png
│  └─ icon-512.png
├─ app.js
├─ favicon.svg
├─ index.html
├─ manifest.webmanifest
├─ README.md
├─ styles.css
├─ supabase-config.js
├─ supabase-setup.sql
├─ sw.js
└─ vercel.json
```

GitHub에서 **Commit changes**를 누르면 기존 Vercel 프로젝트가 자동으로 다시 배포됩니다. Framework Preset은 `Other`이며 Build Command, Output Directory, 환경변수는 필요하지 않습니다.

배포 후 예전 화면이 계속 보이면:

1. 페이지를 새로고침합니다.
2. 그래도 같으면 브라우저를 완전히 종료했다가 다시 엽니다.
3. 홈 화면 앱은 한 번 삭제한 뒤 다시 설치하면 가장 확실합니다.

---

## 5단계 · 컴퓨터와 갤럭시폰 연결하기

1. 컴퓨터에서 배포 주소를 엽니다.
2. **계정 만들기**를 눌러 이메일과 비밀번호를 등록합니다.
3. 기존 업무 이전 창이 나오면 **기존 업무 연동하기**를 누릅니다.
4. 갤럭시폰의 Chrome 또는 삼성 인터넷에서 같은 주소를 엽니다.
5. 컴퓨터에서 만든 것과 **동일한 이메일·비밀번호**로 로그인합니다.
6. 휴대폰 브라우저 메뉴에서 **홈 화면에 추가** 또는 **앱 설치**를 누릅니다.

이후 컴퓨터에서 업무를 추가하면 휴대폰에 반영되고, 휴대폰에서 완료 체크하면 컴퓨터에서도 해당 업무가 초록색으로 바뀝니다.

---

## 정상 작동 확인 방법

1. 컴퓨터와 휴대폰에서 같은 계정으로 로그인합니다.
2. 두 기기의 상단 상태가 **실시간 연동 중**인지 확인합니다.
3. 컴퓨터에서 테스트 업무를 하나 등록합니다.
4. 휴대폰 화면에 업무가 나타나는지 확인합니다.
5. 휴대폰에서 체크 버튼을 누릅니다.
6. 컴퓨터에서 해당 업무가 초록색 완료 상태로 바뀌는지 확인합니다.

---

## 문제 해결

### `Supabase 연결 설정이 필요합니다`가 표시될 때

`supabase-config.js`에 실제 Project URL과 Publishable key가 입력되지 않았거나 GitHub에 수정 파일이 반영되지 않은 상태입니다.

### 로그인은 되지만 업무를 저장할 수 없을 때

Supabase SQL Editor에서 `supabase-setup.sql`을 다시 실행하고, `calendar_tasks` 테이블과 RLS 정책이 생성됐는지 확인하세요.

### PC에서는 보이는데 휴대폰에서는 안 보일 때

두 기기가 같은 이메일 계정으로 로그인했는지 먼저 확인하세요. 서로 다른 이메일이면 각자의 캘린더가 표시됩니다.

### 상태가 `실시간 연결 재시도 중`으로 나올 때

인터넷 연결을 확인한 뒤 페이지를 새로고침하세요. 계속 발생하면 Supabase Dashboard에서 `calendar_tasks`가 Realtime publication에 포함됐는지 확인합니다. 제공된 SQL을 다시 실행하면 중복 없이 설정을 재확인합니다.

### 기존 업무 이전 창이 나오지 않을 때

예전 사이트와 다른 도메인 또는 다른 브라우저에서 접속했을 가능성이 큽니다. 기존 사이트에서 JSON 백업을 내려받은 뒤 새 사이트의 **복원** 버튼으로 불러오세요.

---

## 보안 구조

- 로그인한 사용자만 업무 테이블을 사용할 수 있습니다.
- 각 사용자는 자신의 `user_id`와 일치하는 업무만 조회·등록·수정·삭제할 수 있습니다.
- Publishable/anon key는 브라우저에서 사용하는 공개 키이며, 실제 데이터 접근 제한은 Supabase Auth와 RLS 정책이 담당합니다.
- `service_role` 키는 모든 보안 정책을 우회할 수 있으므로 프런트엔드에 넣으면 안 됩니다.
