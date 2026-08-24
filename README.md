# 장지연 워크캘린더

Google Calendar처럼 한 달 일정을 한눈에 보고, 날짜별 업무를 등록·수정·삭제·완료 처리할 수 있는 정적 웹앱입니다.

## 포함 기능

- 월간 달력 / 오늘 이동 / 이전·다음 달 이동 / 월 직접 선택
- 날짜 클릭 후 업무 등록
- 업무명·날짜·구분·메모 저장
- 업무별 체크 버튼
- 완료 체크 즉시 초록색으로 변경
- 업무 수정 및 삭제
- 이번 달 전체·완료·남은 업무와 완료율 표시
- 완료 업무 숨기기
- JSON 백업 및 복원
- 모바일 대응
- 브라우저 `localStorage` 자동 저장

## 가장 빠른 실행 방법

`index.html` 파일을 더블클릭하면 바로 실행됩니다.

## GitHub에 올리는 방법

1. GitHub에서 **New repository**를 누릅니다.
2. 저장소 이름을 예: `jangjiyeon-work-calendar`로 입력합니다.
3. **Create repository**를 누릅니다.
4. 저장소 화면에서 **uploading an existing file**을 누릅니다.
5. 이 폴더 안의 파일 전체를 드래그해서 올립니다.
6. 아래 **Commit changes**를 누릅니다.

## Vercel 배포 방법

1. Vercel에 로그인합니다.
2. **Add New → Project**를 누릅니다.
3. 방금 만든 GitHub 저장소를 선택하고 **Import**를 누릅니다.
4. Framework Preset은 자동으로 `Other`가 선택되면 그대로 둡니다.
5. Build Command, Output Directory, 환경변수는 입력하지 않습니다.
6. **Deploy**를 누릅니다.

## 데이터 저장 범위

현재 버전은 입력한 업무를 브라우저 `localStorage`에 저장합니다.

- 같은 기기·같은 브라우저: 새로고침하거나 다시 접속해도 유지
- 다른 컴퓨터·다른 휴대폰·다른 브라우저: 자동 동기화되지 않음
- 브라우저 데이터를 삭제하면 일정도 삭제될 수 있으므로 상단의 **백업** 기능을 이용하는 것이 안전

여러 기기에서 같은 업무를 실시간 공유하려면 다음 단계에서 Supabase 데이터베이스와 로그인 기능을 연결하면 됩니다.

## 파일 구조

```text
jangjiyeon-work-calendar/
├─ index.html
├─ styles.css
├─ app.js
├─ favicon.svg
├─ vercel.json
└─ README.md
```
