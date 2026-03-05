# 장비 예약 관리 시스템 프로젝트 개요

## 1) 프로젝트 목적
- 장비(예: BSC 포함)의 사전 예약, 승인/관리, 운영 현황 조회를 웹에서 처리하는 데모/시험운영용 시스템
- 프론트엔드 중심으로 구현하고, 백엔드는 Firebase(Auth/Firestore) 기반으로 최소 구성

## 2) 현재 아키텍처(요약)
- 클라이언트: 정적 웹(HTML/CSS/Vanilla JS ES Module)
- 인증: Firebase Authentication (이메일/비밀번호 + 익명 둘러보기 흐름)
- 데이터 저장/동기화: Cloud Firestore (`onSnapshot` 실시간 반영)
- 권한 제어: Firestore Security Rules (`admin/supervisor/worker/guest` 역할 기반)
- 배포: Vercel 정적 배포 (GitHub 연동)

## 3) 핵심 기술 스택
- HTML5 (시맨틱 구조, 모달/폼/접근성 속성 일부 적용)
- CSS3
  - 반응형 레이아웃(`@media`)
  - 대시보드/타임라인/트리형 룸맵 UI
  - 드래그/리사이즈 상태 스타일
- JavaScript (Vanilla, ES Modules)
  - 상태 기반 렌더링
  - DnD/리사이즈/타임라인 상호작용
  - SVG 렌더(도넛/모바일 크로노그래프)
- Firebase JS SDK v10.12.5 (CDN import)
  - `firebase-app`, `firebase-auth`, `firebase-firestore`
- Firestore Rules v2 (서버리스 권한 정책)
- 브라우저 내장 API
  - `localStorage`(관리자 작업 이력 로컬 저장)
  - `window.matchMedia`(모바일 분기)
  - `crypto.randomUUID`(리포트 ID 생성 fallback 포함)

## 4) 코드/파일 구조
- `index.html` : 로그인/회원가입/데모 진입 화면
- `login.js` : 로그인 페이지 인증 로직
- `app.html` : 메인 애플리케이션 화면(대시보드/예약/월간/관리)
- `app.js` : 핵심 비즈니스 로직/상태/렌더링(단일 엔트리)
- `styles.css` : 전체 UI 스타일 + 반응형 규칙
- `firestore.rules` : Firestore 접근 권한 정책
- `firebase.json` : Firebase 규칙 연결 설정
- `docs/change-history.md` : 변경 이력 통합 문서
- `docs/network-resilience-plan.md` : 네트워크 불안정 대응 계획
- `docs/history-backup-handover.md` : 운영/백업 이관 메모

## 5) 데이터 모델(요약)
- `users/{uid}`
  - `id`, `email`, `name`, `role`, `approved`, `createdAt`
- `bookings/{bookingId}`
  - `machineId`, `user`, `userId`, `createdBy`, `date`, `start`, `duration`, `purpose`, `status`, `createdAt`, `updatedAt`
- `config/app`
  - `configVersion`
  - `sites[]`, `rooms[]`
  - `machines{}`(관리번호/설명/roomId 등)
  - 레거시 `location` 기반 데이터 자동 이관 로직 포함

## 6) 주요 기능 범주
- 역할 기반 접근: 관리자/감독자/작업자/게스트
- 대시보드
  - Site > Room > 장비 트리 + 맵 연동
  - 실시간 타임라인(시간 가이드, 장비 하이라이트)
  - 선택 대상 상세 패널
- 예약 관리
  - 일정표 조회/예약 등록/드래그 이동/리사이즈
  - 중복 검증, 시간 제한(운영시간)
- 관리자
  - 사용자/장비/Site/Room/목적 관리
  - 보고서 출력/이력 백업(CSV/JSON)

## 7) 운영 특성
- 서버 렌더링/번들러 없이 정적 자산 기반으로 빠르게 시험운영 가능
- 실시간 동기화는 Firestore 구독 중심
- 장기 운영 시 권장 보완
  - `app.js` 모듈 분리
  - 감사 로그 영구 저장 백엔드 도입
  - CI 기반 린트/테스트 자동화
