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
