export const DEFAULT_SITE_NAME = "기본 Site";

export const DURATION_TEXT = {
  "hour": "시간",
  "minute": "분"
};

export const statusMeta = {
  "free": {
    "label": "사용 가능",
    "color": "var(--status-free)",
    "tile": "tile-free"
  },
  "process": {
    "label": "공정 가동",
    "color": "var(--status-process)",
    "tile": "tile-process"
  },
  "maint": {
    "label": "유지보수",
    "color": "var(--status-maint)",
    "tile": "tile-maint"
  },
  "em": {
    "label": "환경 모니터",
    "color": "var(--status-em)",
    "tile": "tile-em"
  },
  "clean": {
    "label": "청소/소독",
    "color": "var(--status-clean)",
    "tile": "tile-clean"
  },
  "other": {
    "label": "기타",
    "color": "var(--status-other)",
    "tile": "tile-other"
  },
  "pending": {
    "label": "승인 대기",
    "color": "var(--status-pending)",
    "tile": "tile-pending"
  },
  "system": {
    "label": "자동 소독",
    "color": "var(--status-system)",
    "tile": "tile-system"
  }
};

export const defaultPurposeList = [
  {
    "key": "process",
    "label": "공정"
  },
  {
    "key": "maint",
    "label": "유지보수"
  },
  {
    "key": "em",
    "label": "EM"
  },
  {
    "key": "clean",
    "label": "청소"
  },
  {
    "key": "other",
    "label": "기타"
  }
];

export const defaultManualSections = [
  {
    "id": "manual-reservation",
    "title": "예약 등록 방법",
    "body": "1. 상단 메뉴에서 [예약 관리]로 이동합니다.\n2. 장비, 날짜, 시작 시간, 목적, 소요 시간을 입력합니다.\n3. 저장 버튼을 눌러 예약을 등록합니다.\n4. 중복 시간이 있으면 저장되지 않으므로 시간을 다시 조정합니다.",
    "imageUrl": "manual/reservation-step-02.png",
    "imageCaption": "예약 등록 화면",
    "order": 1,
    "active": true
  },
  {
    "id": "manual-dashboard",
    "title": "대시보드 확인 방법",
    "body": "1. 대시보드에서 현재 가동 상태와 실시간 타임라인을 확인합니다.\n2. 장소 또는 장비를 클릭하면 상세 현황을 확인할 수 있습니다.\n3. 라이브 ON 상태에서는 현재 시각 기준으로 화면이 갱신됩니다.",
    "imageUrl": "manual/reservation-step-03.png",
    "imageCaption": "대시보드 확인 화면",
    "order": 2,
    "active": true
  },
  {
    "id": "manual-notes",
    "title": "운영 유의사항",
    "body": "1. 현재는 베타 운영 단계이므로 화면 구성과 정책이 변경될 수 있습니다.\n2. 예약이 보이지 않거나 저장되지 않으면 필수 입력값과 시간을 먼저 확인합니다.\n3. 수정/삭제 권한이 보이지 않으면 운영 관리자에게 요청합니다.",
    "imageUrl": "",
    "imageCaption": "",
    "order": 3,
    "active": true
  }
];

export const uiMessages = {
  "sync": {
    "locationMigrated": "장소 데이터가 Site/Room 구조로 자동 변환되었습니다.",
    "roomLayoutOverlap": "Room 영역이 겹쳐 저장할 수 없습니다.",
    "roomLayoutSaved": "Room 배치 좌표를 저장했습니다.",
    "configSyncFailed": "설정 동기화에 실패했습니다.",
    "bookingSyncFailed": "예약 동기화에 실패했습니다.",
    "networkUnstable": "네트워크 상태가 불안정합니다. 잠시 후 다시 시도해주세요.",
    "requestFailed": "요청 처리 중 오류가 발생했습니다."
  },
  "common": {
    "permissionDenied": "접근 권한이 없습니다.",
    "noPermission": "권한이 없습니다.",
    "infoRequired": "정보를 모두 입력해주세요.",
    "movedToReservation": "예약 관리 화면으로 이동했습니다."
  },
  "auth": {
    "demoAccountMissing": "데모 계정을 확인해주세요.",
    "demoLoginFailed": "데모 계정 로그인에 실패했습니다. 관리자에게 문의하세요.",
    "credentialsRequired": "아이디 또는 비밀번호를 입력해주세요.",
    "loginFailed": "로그인에 실패했습니다.",
    "nameRequired": "이름을 입력해주세요.",
    "signupCompleted": "가입이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.",
    "signupFailed": "회원가입에 실패했습니다.",
    "accountNotFound": "계정 정보를 찾을 수 없습니다.",
    "approvalPending": "승인 대기 중입니다."
  },
  "manual": {
    "adminOnlyEdit": "관리자만 메뉴얼을 편집할 수 있습니다.",
    "sectionNotFound": "수정할 메뉴얼 섹션을 찾을 수 없습니다.",
    "titleRequired": "제목을 입력하세요.",
    "bodyRequired": "본문을 입력하세요.",
    "sectionInfoMissing": "메뉴얼 섹션 정보를 찾을 수 없습니다.",
    "sectionUpdated": "메뉴얼 섹션을 수정했습니다.",
    "sectionCreated": "메뉴얼 섹션을 등록했습니다.",
    "adminOnlyDelete": "관리자만 메뉴얼을 삭제할 수 있습니다.",
    "sectionDeleted": "메뉴얼 섹션을 삭제했습니다.",
    "sectionSaveFailed": "메뉴얼 섹션 저장에 실패했습니다."
  },
  "backup": {
    "noOperationHistory": "백업할 운영 이력이 없습니다.",
    "operationHistorySaved": "운영 이력 CSV 백업을 저장했습니다.",
    "noAdminHistory": "백업할 관리자 작업 이력이 없습니다.",
    "adminHistorySaved": "작업 이력 JSON 백업을 저장했습니다."
  },
  "booking": {
    "dragPayloadEmpty": "드래그 정보가 비어 있습니다.",
    "dragPayloadInvalid": "유효하지 않은 드래그 데이터입니다.",
    "moved": "예약 장비/시간을 변경했습니다.",
    "timeChanged": "예약 시간을 변경했습니다.",
    "timeAdjusted": "예약 시간을 조정했습니다.",
    "reservePermissionDenied": "예약 권한이 없습니다.",
    "dateRequired": "날짜를 선택해주세요.",
    "locationRequired": "장소를 선택해주세요.",
    "machineRequired": "장비를 선택해주세요.",
    "outsideOperatingHours": "운영 시간(09:00~18:00)을 벗어났습니다.",
    "selectedTimeTaken": "선택 시간에 이미 예약이 있습니다. 시간을 다시 확인해주세요.",
    "purposeNotAllowed": "선택한 목적은 해당 장비에서 사용할 수 없습니다.",
    "created": "예약이 등록되었습니다.",
    "createPermissionDenied": "예약 생성 권한이 없습니다.",
    "editableNotFound": "수정 가능한 예약을 찾을 수 없습니다.",
    "ownBookingOnly": "본인 예약만 수정할 수 있습니다.",
    "deletePermissionDenied": "삭제 권한이 없습니다.",
    "deleteReasonRequired": "삭제 사유를 입력해주세요.",
    "deleted": "예약이 삭제되었습니다.",
    "editTargetNotFound": "수정할 예약을 찾을 수 없습니다.",
    "alreadyStarted": "이미 시작된 예약은 수정할 수 없습니다.",
    "overlapDetected": "해당 날짜/시간에 예약이 중복됩니다.",
    "updated": "예약이 변경되었습니다.",
    "operatingHoursExceeded": "운영 시간(09:00~18:00)을 초과합니다.",
    "recurringFailedAll": "모든 반복 예약이 중복으로 인해 실패했습니다.",
    "requestRegistered": "예약 요청이 등록되었습니다.",
    "confirmed": "예약이 확정되었습니다."
  },
  "admin": {
    "machineIdRequired": "장비 ID를 입력하세요.",
    "roomSelectionRequired": "Room을 선택하세요.",
    "duplicateMachineId": "이미 존재하는 장비 ID입니다.",
    "machineListUpdated": "장비 목록이 갱신되었습니다.",
    "siteNameRequired": "Site명을 입력하세요.",
    "duplicateSiteId": "이미 존재하는 Site ID입니다.",
    "siteInfoMissing": "Site 정보를 찾을 수 없습니다.",
    "siteHasRooms": "하위 Room이 있는 Site는 삭제할 수 없습니다.",
    "roomNameRequired": "Room명을 입력하세요.",
    "siteSelectionRequired": "Site를 선택하세요.",
    "roomInfoMissing": "Room 정보를 찾을 수 없습니다.",
    "duplicateRoomName": "동일한 Room명이 이미 존재합니다.",
    "roomHasMachines": "장비가 배정된 Room은 삭제할 수 없습니다.",
    "purposeCodeAndLabelRequired": "코드와 표시명을 입력하세요.",
    "purposeMachineSelectionRequired": "적용할 장비를 하나 이상 선택하세요.",
    "duplicatePurposeCode": "이미 존재하는 코드입니다.",
    "purposeInUse": "해당 목적이 예약에 사용 중이어서 삭제할 수 없습니다.",
    "signupFromLoginScreen": "회원가입은 로그인 화면에서 진행합니다.",
    "maintenanceCreateAdminOnly": "관리자만 장소 유지보수 예약을 등록할 수 있습니다.",
    "maintenanceEditTargetNotFound": "수정할 장소 유지보수 예약을 찾을 수 없습니다.",
    "maintenanceDeleteAdminOnly": "관리자만 장소 유지보수 예약을 삭제할 수 있습니다.",
    "maintenanceDeleteTargetNotFound": "삭제할 장소 유지보수 예약을 찾을 수 없습니다.",
    "maintenanceExistingGroupMissing": "기존 장소 유지보수 예약 정보를 찾을 수 없습니다. 다시 시도해주세요.",
    "maintenanceLocationRequired": "유지보수 대상 장소를 선택해주세요.",
    "maintenanceNoMachines": "선택한 장소에 등록된 장비가 없습니다."
  }
};
