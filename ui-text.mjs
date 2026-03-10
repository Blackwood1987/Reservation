export const DEFAULT_SITE_NAME = "기본 Site";

export const DURATION_TEXT = {
  hour: "시간",
  minute: "분"
};

export const statusMeta = {
  free: { label: "사용 가능", color: "var(--status-free)", tile: "tile-free" },
  process: { label: "공정 가동", color: "var(--status-process)", tile: "tile-process" },
  maint: { label: "유지보수", color: "var(--status-maint)", tile: "tile-maint" },
  em: { label: "환경 모니터", color: "var(--status-em)", tile: "tile-em" },
  clean: { label: "청소/소독", color: "var(--status-clean)", tile: "tile-clean" },
  other: { label: "기타", color: "var(--status-other)", tile: "tile-other" },
  pending: { label: "승인 대기", color: "var(--status-pending)", tile: "tile-pending" },
  system: { label: "자동 소독", color: "var(--status-system)", tile: "tile-system" }
};

export const defaultPurposeList = [
  { key: "process", label: "공정" },
  { key: "maint", label: "유지보수" },
  { key: "em", label: "EM" },
  { key: "clean", label: "청소" },
  { key: "other", label: "기타" }
];

export const defaultManualSections = [
  {
    id: "manual-reservation",
    title: "예약 등록 방법",
    body: "1. 상단 메뉴에서 [예약 관리]로 이동합니다.\n2. 장비, 날짜, 시작 시간, 목적, 소요 시간을 입력합니다.\n3. 저장 버튼을 눌러 예약을 등록합니다.\n4. 중복 시간이 있으면 저장되지 않으므로 시간을 다시 조정합니다.",
    imageUrl: "manual/reservation-step-02.png",
    imageCaption: "예약 등록 화면",
    order: 1,
    active: true
  },
  {
    id: "manual-dashboard",
    title: "대시보드 확인 방법",
    body: "1. 대시보드에서 현재 가동 상태와 실시간 타임라인을 확인합니다.\n2. 장소 또는 장비를 클릭하면 상세 현황을 확인할 수 있습니다.\n3. 라이브 ON 상태에서는 현재 시각 기준으로 화면이 갱신됩니다.",
    imageUrl: "manual/reservation-step-03.png",
    imageCaption: "대시보드 확인 화면",
    order: 2,
    active: true
  },
  {
    id: "manual-notes",
    title: "운영 유의사항",
    body: "1. 현재는 베타 운영 단계이므로 화면 구성과 정책이 변경될 수 있습니다.\n2. 예약이 보이지 않거나 저장되지 않으면 필수 입력값과 시간을 먼저 확인합니다.\n3. 수정/삭제 권한이 보이지 않으면 운영 관리자에게 요청합니다.",
    imageUrl: "",
    imageCaption: "",
    order: 3,
    active: true
  }
];
