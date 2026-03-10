# 검증 실행 절차

## 1. 목적
- 커밋 또는 배포 전에 문법 오류, 예약 로직 회귀, 한글 깨짐, 줄바꿈/인코딩 문제를 먼저 차단한다.
- 데모 운영 단계에서도 최소한의 검증 게이트를 고정해 같은 유형의 사고를 반복하지 않는다.

## 2. 기본 실행 순서
1. JavaScript 문법 검사
2. 순수 함수 테스트 실행
3. 텍스트 무결성 검사 실행
4. Git diff 형식 검사
5. 핵심 수동 QA 확인

## 3. 필수 명령
```powershell
node --check app.js
node tests/run-tests.mjs
node tests/check-text-integrity.mjs
git diff --check
```

## 3-1. 단축 실행
```powershell
.\scripts\verify-demo.cmd
```

## 4. 수동 QA 최소 항목
- 로그인 후 주요 탭 진입 여부 확인
- 예약 생성/수정/삭제 기본 흐름 확인
- 모바일 예약관리의 시간/카테고리 필터 확인
- 실시간 타임라인 정렬 및 현재 시각선 확인
- CRF 장비가 타임라인 상단 규칙대로 표시되는지 확인

## 5. 실패 시 처리 원칙
- `node --check app.js` 실패: 문법 오류를 먼저 해결하고 다음 단계로 넘어가지 않는다.
- `node tests/run-tests.mjs` 실패: 예약/정렬/권한 관련 회귀로 간주하고 원인 함수부터 수정한다.
- `node tests/check-text-integrity.mjs` 실패: 한글 문자열, BOM, CRLF, mojibake를 우선 복구한다.
- `git diff --check` 실패: 공백, 줄바꿈, 패치 포맷 문제를 정리한 후 다시 검사한다.

## 6. 작업 방식 제한
- `app.js`, `app.html`, `styles.css` 같은 대형 파일은 전체 재기록보다 최소 범위 패치를 우선한다.
- PowerShell here-string으로 긴 한글 블록을 직접 덮어쓰는 방식은 지양한다.
- 사용자 노출 문자열 변경과 기능 로직 변경은 가능하면 커밋을 분리한다.
- 임시 복구 파일은 저장소 루트에 두지 않고 `.codex-temp/` 아래로 옮긴다.
