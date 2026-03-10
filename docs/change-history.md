# 변경 이력 통합 문서

## 문서 목적
- 이 문서는 프로젝트의 **유일한 변경 이력 문서**입니다.
- 앞으로 기능/UX/권한/배포 관련 주요 변경은 이 문서에만 기록합니다.
- 기존 분산 변경 이력 문서는 정리(삭제)하고, 운영 정책 문서만 별도로 유지합니다.

## 기록 규칙
- 기록 위치: `docs/change-history.md` 단일 파일
- 기록 순서: 최신 변경이 위로 오도록(역순)
- 필수 항목: 날짜, 커밋, 변경 요약, 영향 범위, 검증
- 최소 검증: `node --check app.js`

## 누적 변경 이력

| 날짜 | 커밋 | 변경 요약 | 영향 범위 | 검증 |
|---|---|---|---|---|
| 2026-03-10 | `052237a` | 모바일 예약관리 270도 크로노그래프에 카테고리 칩 필터와 슬롯 상세 카드를 병합하고, 선택 슬롯 시간으로 예약 위저드가 이어지도록 확장 | `app.html`, `app.js`, `core-utils.mjs`, `styles.css`, `tests/run-tests.mjs` | `node --check app.js`, `node tests\run-tests.mjs` |
| 2026-03-10 | `3920099` | 사용자 메뉴얼 스크린샷이 원본보다 확대되지 않도록 원본 크기 기준으로 표시되게 조정 | `styles.css` | `node --check app.js`, `node tests\run-tests.mjs` |
| 2026-03-10 | `ab9029e` | 사용자 메뉴얼 기본 섹션 문자열의 줄바꿈 구문 오류를 수정해 app.js 문법 오류를 복구 | `app.js` | `node --check app.js`, `node tests\run-tests.mjs` |
| 2026-03-10 | `507187c` | 앱 셸 한글 깨짐과 잘못된 닫힘 태그를 복구하고 변경 이력 문서 인코딩을 정상화 | `app.html`, `docs/change-history.md` | `git diff --check -- app.html`, `node --check app.js`, `node tests\run-tests.mjs` |
| 2026-03-10 | `5e52ebe` | 사용자 메뉴얼을 로그인 사용자용 탭으로 확장하고 로그인 안내/1번 스크린샷을 제외 | `app.html`, `app.js`, `styles.css` | `node --check app.js`, `node tests\run-tests.mjs` |
| 2026-03-04 | `a6c755c` | 관리자 장소 유지보수 예약(전체/일부 장소 선택) 기능 추가 | `app.html`, `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-04 | `8546095` | 리사이즈 프리뷰와 포인터 위치 정렬 보정(px 기준) | `app.js`, `app.html` | `node --check app.js` |
| 2026-03-04 | `80baf37` | 리사이즈 의도잠금 + 실시간 프리뷰/가이드 UX 추가 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-04 | `f890e93` | 작업자 본인 예약 클릭 수정 모달 + 드래그/리사이즈 안정화 | `app.js`, `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-04 | `78a77c6` | 모바일 도넛 수치 위치 조정, 월간 일정 기준일 적용 액션 제거 | `app.js`, `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `5194f9d` | 모바일 Shell UX v2 적용 | `app.js`, `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `d81c757` | 작업자 모바일 UX 단순화 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `93c9382` | 모바일 예약/월간 일정 UX 단순화 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `3b7aa2d` | 대시보드 하이라이트 포커스 UX 자연화 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `512fd18` | 관리자 통계 확장 + 이력 관리 기반 강화 | `app.js`, `app.html` | `node --check app.js` |
| 2026-03-03 | `bf479a7` | 관리자 승인/보고 영역을 운영 이력 중심으로 재구성 | `app.js`, `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `195f40a` | 관리자 필터/리스크 가시성 개선 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `17032af` | 로그인 폼 경고 수정, favicon 추가 | `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `4d432e3` | 대시보드 가독성 및 모바일 포커스 UX 개선 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `968e8bc` | 대시보드 요약/우측 패널 UX 정리 | `app.js`, `app.html`, `styles.css` | `node --check app.js` |
| 2026-03-03 | `060dd7c` | 예약 흐름 안정화 및 네트워크 대응 문서화 | `app.js`, `docs/network-resilience-plan.md` | `node --check app.js` |
| 2026-01-30 | `bf583ba` | 작업자 예약 자동확정 + 09~18 시간 제한 | `app.js` | `node --check app.js` |
| 2026-01-30 | `5efca01` | 중복 선언 함수 제거(`renderPurposeOptions`) | `app.js` | `node --check app.js` |
| 2026-01-30 | `bd3364d` | 목적을 장비별로 제한 가능하도록 변경 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `851a359` | 관리자 목적 관리 기능 추가 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `9e3aa77` | 룸맵/타임라인 강제 스크롤바 적용 | `styles.css` | `node --check app.js` |
| 2026-01-30 | `8144ea3` | 예약관리 화면 스크롤 처리 | `styles.css`, `app.html` | `node --check app.js` |
| 2026-01-30 | `602293c` | 일일 리포트 날짜 선택 인쇄 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `cf2843c` | 반려 사유 입력 강제 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `43053bd` | 관리자 삭제 사유 입력 강제 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `467c160` | 자동 소독을 선택 옵션으로 변경 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-30 | `1cda7e3` | 1366x768 기준 대시보드 균형 조정(룸맵 축소 포함) | `styles.css` | `node --check app.js` |
| 2026-01-30 | `7c3510d` | 전체 레이아웃 스케일 재조정 | `styles.css` | `node --check app.js` |
| 2026-01-30 | `f0880c0` | 예약표 장비 열 폭 확장/텍스트 조정 | `styles.css` | `node --check app.js` |
| 2026-01-30 | `826fe38` | 룸맵 타일 축소 + 타임라인 확장 | `styles.css` | `node --check app.js` |
| 2026-01-30 | `3c62cb9` | 타임라인 잘림 방지 레이아웃 조정 | `styles.css`, `app.html` | `node --check app.js` |
| 2026-01-30 | `5065cb6` | 전반 레이아웃/반응형 개선 | `styles.css`, `app.html` | `node --check app.js` |
| 2026-01-29 | `649c8fa` | 장소/장비 설정을 Firestore config로 영속화 | `app.js`, `firestore.rules` | `node --check app.js` |
| 2026-01-29 | `f8c3bda` | 게스트/데모 접근 재정리 + 예약관리 장소 그룹화 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-29 | `2edd471` | 관리자 테이블 헤더 정합성/장비 렌더 복구 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-29 | `c353397` | `printReport` 복구 | `app.js` | `node --check app.js` |
| 2026-01-29 | `e669c89` | 드래그/리사이즈 핸들러 복구 | `app.js` | `node --check app.js` |
| 2026-01-29 | `c681881` | 장비 핸들러/라벨 연동 오류 수정 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-29 | `a2d86ab` | 사용자 관리 동작/배지 스타일 복구 | `app.js`, `styles.css` | `node --check app.js` |
| 2026-01-29 | `274a0c7` | 역할 정규화, 관리자 탭 접근 가드 | `app.js` | `node --check app.js` |
| 2026-01-29 | `38d6ecc` | 앱 메인 레이아웃 복구 | `app.html` | `node --check app.js` |
| 2026-01-29 | `f0e69bf` | 로그인 방식 단순화(ID/비밀번호) | `index.html`, `login.js` | `node --check app.js` |
| 2026-01-29 | `7794709` | 로그인/앱 페이지 분리 | `index.html`, `app.html` | `node --check app.js` |
| 2026-01-29 | `2fe0d5c` | 앱 JS 캐시 버스팅 반영 | `app.html` | `node --check app.js` |
| 2026-01-29 | `6e2aadc` | 초기 부트/이벤트 바인딩 복구 | `app.js` | `node --check app.js` |
| 2026-01-29 | `e219a0a` | 로그아웃 문법 오류 수정 | `app.js` | `node --check app.js` |
| 2026-01-29 | `6fd80f5` | Firestore rules/config 도입 | `firestore.rules`, `firebase.json` | `node --check app.js` |
| 2026-01-29 | `0a7ccd5` | Firebase Auth + 공유 예약 동기화 도입 | `app.js`, `app.html` | `node --check app.js` |
| 2026-01-29 | `1a32140` | 회원가입/승인 플로우 도입 | `login.js`, `app.js` | `node --check app.js` |
| 2026-01-28 | `f95bf4d` | 초기 데모 UI 구성 | `index.html`, `app.html`, `app.js`, `styles.css` | - |

## 유지 문서(변경 이력 외)
- `docs/network-resilience-plan.md`: 네트워크 불안정 대응 계획
- `docs/history-backup-handover.md`: 백업/이관 운영 정책

## 2026-03-04 WIP
- 대시보드 룸맵을 Site/Room split view로 교체.
- 우측 상태 목록/가동 분석 카드를 제거하고 선택 대상 상세 패널로 통합.
- 상단 개요에 가동률(숫자 %) 지표를 추가.
- `config/app`에 `configVersion:2`, `sites`, `rooms`, `machines[*].roomId`를 추가하고 legacy `location` 데이터 자동 이관을 반영.
- 관리자 장소/장비 설정을 Site/Room 구조와 연동하고, 장비 배정을 `Site -> Room` 기준으로 재구성.
- 관리자 전용 룸 배치 편집 UX 추가(드래그 이동/크기 조절, 겹침 경고, 저장/취소).
- 대시보드 룸맵 트리를 파일 탐색기형 계층(Site > Room > 장비)으로 전환하고 클릭 확장 UX를 적용.
- 작업자/게스트/감독자 계정에서 룸맵 배치 편집 버튼을 숨기고(관리자 전용), 대시보드 범례에서 승인 대기/자동 소독 항목을 제외.
- 실시간 타임라인 행 렌더를 정규화(빈 장비 ID 스킵)하고 행 간격을 고정해 상/하단 시각 불일치를 완화.
- 타임라인 렌더 대상을 bscIds 직접순회에서 Room 기반 장비 목록으로 전환해 숨은/비정상 ID 행에 의한 단차를 방지.
- 타임라인 렌더 장비 ID에 허용 문자 정규식과 Room 매핑 조건을 추가해 비정상/미배정 ID 행이 생성되지 않도록 보정.
- 타임라인 음영 오버레이를 제거해 스크롤 위치에 따른 상/하단 배경 불일치를 해소하고, 숨은 공백/제어문자가 포함된 장비 ID 정규화를 강화.
- 숨김 input과 연결된 라벨 및 for 미지정 라벨 구조를 수정해 콘솔의 접근성(label-for) 경고를 정리.
- 실시간 타임라인 장비 정렬 규칙 변경: 세포은행 Room의 CRF를 최상단 고정, 나머지 장비는 Room 순서 내 ID 오름차순으로 정렬.
- 타임라인 장비 ID 필터를 문자 시작 규칙으로 강화(숫자 시작/비정상 키 제외)하고 app.js/styles.css 캐시 버전을 갱신.
- 프로젝트 구조/기술 스택 요약 문서(docs/project-overview.md)를 신규 추가.
- 구조 개선 권장안 문서(docs/architecture-recommendations.md)를 신규 추가.

- 사용자 메뉴얼 스크린샷은 원본 크기를 넘겨 확대하지 않도록 `.manual-image`를 `width:auto; max-width:100%`로 조정해 예약 등록 화면(367x484) 비율을 유지.
## 2026-03-09 검증 체계 1차
- `core-utils.mjs` 추가: 시간 처리, 예약 중복 판정, 타임라인 정렬 규칙을 공용 유틸로 분리
- `app.js`에서 공용 유틸을 사용하도록 연결하여 순수 함수 검증 대상과 실제 로직을 일치시킴
- `tests/run-tests.mjs` 추가: 포맷/시간 스냅/중복 판정/CRF 최상단 정렬 규칙 자동 확인
- `docs/qa-checklist.md` 추가: 수동 QA 기준 문서화
- `docs/verification-workflow.md` 추가: 배포 전 실행 명령과 실패 시 처리 원칙 문서화
- 검증 결과: `node --check app.js`, `node tests/run-tests.mjs` 통과
- 후속 수정: `app.js` 공용 유틸 연결 과정에서 깨진 문자열/구문 오류를 복구하고, `app.js`가 다시 `core-utils.mjs`를 정상 참조하도록 정리
- 검증 체계 2차: 권한 노출 규칙과 예약 이동/리사이즈 판정 로직을 `core-utils.mjs` 공용 유틸로 분리하고, 자동 테스트를 8건으로 확장
- 실시간 타임라인 정렬 보강: 장비 ID에 `CRF`가 포함된 장비는 Room과 무관하게 상단 고정되도록 정렬 규칙 확장
- 실시간 타임라인 UX 보정: 현재 시각선과 과거 음영을 스크롤 컨텐츠 전체 높이에 맞춰 렌더하도록 구조를 조정하고, 경과 영역을 회색 음영으로 표시
- 관리자 전용 장소 관리 확장: 장소 유지보수 예약을 일괄 관리하는 표를 추가하고, 기존 예약의 일괄 수정/삭제 기능을 연결
- 장소 유지보수 예약 저장 로직 개선: 관리자만 등록/수정/삭제 가능하도록 고정하고, 동일 배치(`maintenanceBatchId`) 기준으로 일괄 편집되도록 보강
- 장소 유지보수 예약 수정 시 중복 예약이 있으면 일괄 저장을 차단하고, 선택 장소/대상 장비 수를 즉시 재계산하도록 UI를 보정
- 장소 유지보수 신규 등록 진입 보정: 상단 `+ 장소 유지보수 예약` 버튼 클릭 시 이벤트 객체가 수정 키로 오인되지 않도록 모달 진입 인자를 정규화
- 관리자 전용 사용자 메뉴얼 섹션 추가: 관리 화면에 위키형 메뉴얼 뷰어(목차 + 본문)와 섹션 관리 표를 신규 도입
- 메뉴얼 설정 저장 추가: `config/app`에 `manualSections`를 저장하고, 관리자만 섹션 등록/수정/삭제할 수 있도록 편집 모달을 연결
- 초기 사용자 메뉴얼 초안 반영: 접속/예약/대시보드/운영 유의사항 기본 섹션을 추가하고, 이미지가 없을 때는 스크린샷 대기 플레이스홀더를 표시
- 관리자 사용자 메뉴얼 기본 섹션에 실제 스크린샷 경로(manual/reservation-step-01~03.png)를 연결하고, 이미지가 없는 섹션은 플레이스홀더 없이 본문만 표시하도록 정리

