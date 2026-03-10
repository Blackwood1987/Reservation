import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { buildTimelineMachineIds, canRolePerform, canUserOperateBooking, clampHour, formatTime, hasBookingOverlap, snapToHalfHour, sortByOrderThenName, validateBookingDrop, validateBookingResize } from "./core-utils.mjs";

const firebaseConfig = {
  apiKey: "AIzaSyC3hAHfZFH6g4SjQbwdFIh-V61wezsoDnY",
  authDomain: "reservation-e033a.firebaseapp.com",
  projectId: "reservation-e033a",
  storageBucket: "reservation-e033a.firebasestorage.app",
  messagingSenderId: "380110711617",
  appId: "1:380110711617:web:2c938ef843c87fc00a4fc0",
  measurementId: "G-CXXB40V1KE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const configRef = doc(db, "config", "app");
let bscIds = ["A-01","A-02","A-03","A-04","B-01","B-02","B-03","B-04"];
let locations = ["Room A","Room B"];
let machineLocations = {"A-01":"Room A","A-02":"Room A","A-03":"Room A","A-04":"Room A","B-01":"Room B","B-02":"Room B","B-03":"Room B","B-04":"Room B"};
let machineMgmtNos = {"A-01":"EQ-001","A-02":"EQ-002","A-03":"EQ-003","A-04":"EQ-004","B-01":"EQ-005","B-02":"EQ-006","B-03":"EQ-007","B-04":"EQ-008"};
let machineDescs = {"A-01":"Class II cabinet","A-02":"Class II cabinet","A-03":"Service unit","A-04":"Service unit","B-01":"Process station","B-02":"Monitoring station","B-03":"Process station","B-04":"Cleaning station"};
let sites = [{ id: "site-default", name: "기본 Site", order: 1, active: true }];
let rooms = [
  { id: "room-a", siteId: "site-default", name: "Room A", order: 1, active: true, layout: { x: 4, y: 6, w: 44, h: 40 } },
  { id: "room-b", siteId: "site-default", name: "Room B", order: 2, active: true, layout: { x: 52, y: 6, w: 44, h: 40 } }
];
let machineRoomIds = {
  "A-01": "room-a", "A-02": "room-a", "A-03": "room-a", "A-04": "room-a",
  "B-01": "room-b", "B-02": "room-b", "B-03": "room-b", "B-04": "room-b"
};

const statusMeta = {
  free:{label:"사용 가능",color:"var(--status-free)",tile:"tile-free"},
  process:{label:"공정 가동",color:"var(--status-process)",tile:"tile-process"},
  maint:{label:"유지보수",color:"var(--status-maint)",tile:"tile-maint"},
  em:{label:"환경 모니터",color:"var(--status-em)",tile:"tile-em"},
  clean:{label:"청소/소독",color:"var(--status-clean)",tile:"tile-clean"},
  other:{label:"기타",color:"var(--status-other)",tile:"tile-other"},
  pending:{label:"승인 대기",color:"var(--status-pending)",tile:"tile-pending"},
  system:{label:"자동 소독",color:"var(--status-system)",tile:"tile-system"}
};

const defaultPurposeList = [
  { key: "process", label: "공정" },
  { key: "maint", label: "유지보수" },
  { key: "em", label: "EM" },
  { key: "clean", label: "청소" },
  { key: "other", label: "기타" }
];

let purposeList = [...defaultPurposeList];

const defaultManualSections = [
  {
    id: "manual-reservation",
    title: "예약 등록 방법",
    body: "1. 상단 메뉴에서 [예약 관리]로 이동합니다.
2. 장비, 날짜, 시작 시간, 목적, 소요 시간을 입력합니다.
3. 저장 버튼을 눌러 예약을 등록합니다.
4. 중복 시간이 있으면 저장되지 않으므로 시간을 다시 조정합니다.",
    imageUrl: "manual/reservation-step-02.png",
    imageCaption: "예약 등록 화면",
    order: 1,
    active: true
  },
  {
    id: "manual-dashboard",
    title: "대시보드 확인 방법",
    body: "1. 대시보드에서 현재 가동 상태와 실시간 타임라인을 확인합니다.
2. 장소 또는 장비를 클릭하면 상세 현황을 확인할 수 있습니다.
3. 라이브 ON 상태에서는 현재 시각 기준으로 화면이 갱신됩니다.",
    imageUrl: "manual/reservation-step-03.png",
    imageCaption: "대시보드 확인 화면",
    order: 2,
    active: true
  },
  {
    id: "manual-notes",
    title: "운영 유의사항",
    body: "1. 현재는 베타 운영 단계이므로 화면 구성과 정책이 변경될 수 있습니다.
2. 예약이 보이지 않거나 저장되지 않으면 필수 입력값과 시간을 먼저 확인합니다.
3. 수정/삭제 권한이 보이지 않으면 운영 관리자에게 요청합니다.",
    imageUrl: "",
    imageCaption: "",
    order: 3,
    active: true
  }
];

const defaultManualSectionsById = Object.fromEntries(defaultManualSections.map(section=>[section.id, section]));

let manualSections = defaultManualSections.map(section=>({ ...section }));

const appState = {
  currentUser:null,currentView:"dashboard",currentHour:9,
  currentDate:todayISO(),currentYear:new Date().getFullYear(),
  currentMonth:new Date().getMonth()+1,dragPayload:null,
  statsYear:new Date().getFullYear(),statsMonth:new Date().getMonth()+1,
  isResizing:false,resizeStartX:0,resizeOriginDuration:0,resizeTarget:null,
  bookingTarget:{id:null,start:9},bookingEditTarget:null,deleteTarget:null,
  suppressBookingClickUntil:0,
  resizeSlotWidth:0,resizeOriginWidthPx:0,resizeMinWidthPx:0,resizeMaxWidthPx:0,
  resizeMovedPx:0,resizePreviewDuration:0,resizeValidationOk:true,resizeIntentLocked:false,
  isLiveMode:true,dayModalDate:null,dashboardSidePanel:"status",
  focusMachineId:null,mobileDashboardView:"summary",adminCompact:false,
  locationMaintenanceEdit:null,
  map:{
    selectedSiteId:null,
    selectedRoomId:null,
    selectedMachineId:null,
    searchText:"",
    expandedSiteIds:new Set(),
    expandedRoomIds:new Set(),
    layoutEditMode:false,
    layoutDraft:null,
    layoutDrag:null,
    layoutInvalidRoomIds:new Set(),
    layoutDirty:false
  },
  mobile:{activePane:"dashboard",layoutMode:"drawer",drawerOpen:false,canReserveNow:false},
  reserveWizard:null
};

let users = [];
const demoAccounts = {
  worker: { email: "demo-worker@reservation.local", password: "demo1234" }
};

const bookings = Object.fromEntries(bscIds.map(id=>[id,[]]));
let bookingsUnsub = null;
let configUnsub = null;
let clockTicker = null;
const configState = { loaded: false, exists: false, needsMigrationSave: false, migrationNotified: false };
let bookingsQueryKey = "";
let usersFetchedAt = 0;
let usersFetchPromise = null;
const adminFilters = {};
let adminToolbarView = "users";
let auditHistoryRows = [];
let auditHistoryDate = "";
let auditHistoryLoading = false;
const adminActivityKey = "reservation_admin_activity";
const focusCache = {
  section: null,
  allNodes: [],
  byMachine: new Map(),
  activeId: null,
  dimmed: false,
  clearTimer: null
};

const RESIZE_INTENT_HIT_PX = 22;
const RESIZE_CLICK_GUARD_MS = 360;
const RESIZE_MIN_COMMIT_PX = 5;
const MAP_LAYOUT_SNAP_PCT = 2;
const MAP_LAYOUT_MIN_SIZE_PCT = 16;



function todayISO(){return new Date().toISOString().slice(0,10);} 
function formatDurationText(val){
  const totalMinutes=Math.max(30,Math.round((Number(val)||0)*60));
  const hour=Math.floor(totalMinutes/60);
  const min=totalMinutes%60;
  if(min===0) return `${hour}시간`;
  if(hour===0) return `${min}분`;
  return `${hour}시간 ${min}분`;
}
function formatDateLabel(iso){return iso.replace(/-/g,". ");}
function getNowHour(){
  const now=new Date();
  return clampHour(now.getHours()+now.getMinutes()/60+now.getSeconds()/3600);
}
function getViewDate(){return appState.currentDate;}
function getMachineLocation(id){return machineLocations[id]||locations[0];}
function getMachineMgmtNo(id){return machineMgmtNos[id]||"";}
function getMachineDesc(id){return machineDescs[id]||"";}
function makeSafeId(value,prefix){
  const base=String(value||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const safe=base || `${prefix}-${Math.random().toString(36).slice(2,8)}`;
  return safe.startsWith(prefix) ? safe : `${prefix}-${safe}`;
}
function cloneLayout(layout){
  return {
    x:Number(layout?.x) || 0,
    y:Number(layout?.y) || 0,
    w:Number(layout?.w) || 30,
    h:Number(layout?.h) || 28
  };
}
function normalizeRoomLayout(layout,index,total){
  const cols=Math.max(1,Math.ceil(Math.sqrt(Math.max(1,total))));
  const row=Math.floor(index/cols);
  const col=index%cols;
  const gap=3;
  const baseW=(100-gap*(cols+1))/cols;
  const rowsCount=Math.ceil(total/cols);
  const baseH=(100-gap*(rowsCount+1))/rowsCount;
  const fallback={ x:gap+col*(baseW+gap), y:gap+row*(baseH+gap), w:baseW, h:baseH };
  const merged={...fallback,...cloneLayout(layout)};
  merged.w=Math.max(18,Math.min(96,merged.w));
  merged.h=Math.max(18,Math.min(96,merged.h));
  merged.x=Math.max(0,Math.min(100-merged.w,merged.x));
  merged.y=Math.max(0,Math.min(100-merged.h,merged.y));
  return merged;
}
function assignAutoRoomLayouts(roomList){
  const grouped={};
  for(const room of roomList){
    const siteId=room.siteId || "site-default";
    if(!grouped[siteId]) grouped[siteId]=[];
    grouped[siteId].push(room);
  }
  Object.values(grouped).forEach(siteRooms=>{
    const sorted=sortByOrderThenName(siteRooms);
    sorted.forEach((room,index)=>{
      room.layout=normalizeRoomLayout(room.layout,index,sorted.length);
    });
  });
}
function getActiveSites(){
  const active=sites.filter(site=>site.active!==false);
  return sortByOrderThenName(active);
}
function getSiteById(siteId){
  return sites.find(site=>site.id===siteId) || null;
}
function getRoomsBySite(siteId,{ includeInactive=false } = {}){
  const list=rooms.filter(room=>room.siteId===siteId && (includeInactive || room.active!==false));
  return sortByOrderThenName(list);
}
function getRoomById(roomId){
  return rooms.find(room=>room.id===roomId) || null;
}
function getMachineRoomId(machineId){
  return machineRoomIds[machineId] || null;
}
function getMachineRoom(machineId){
  const roomId=getMachineRoomId(machineId);
  return roomId ? getRoomById(roomId) : null;
}
function getMachineSite(machineId){
  const room=getMachineRoom(machineId);
  return room ? getSiteById(room.siteId) : null;
}
function getMachineDisplayPath(machineId){
  const room=getMachineRoom(machineId);
  if(!room) return getMachineLocation(machineId);
  const site=getSiteById(room.siteId);
  if(!site) return room.name;
  return `${site.name} / ${room.name}`;
}
function getTimelineMachineIds(){
  ensureSiteRoomState();
  const orderedRooms=getActiveSites().flatMap(site=>getRoomsBySite(site.id));
  const machineIdsByRoomId=Object.fromEntries(orderedRooms.map(room=>[room.id,getMachinesByRoomId(room.id)]));
  const machineRoomIdsById=Object.fromEntries(bscIds.map(id=>[id,getMachineRoomId(id)]));
  return buildTimelineMachineIds({
    orderedRooms,
    machineIdsByRoomId,
    allMachineIds:bscIds,
    machineRoomIdsById
  });
}
function getMachinesByRoomId(roomId){
  return bscIds.filter(id=>getMachineRoomId(id)===roomId);
}
function syncLocationsFromRooms(){
  const names=sortByOrderThenName(rooms).map(room=>room.name);
  locations=names.length ? names : ["Room A"];
}
function buildRoomsFromLocations(locationList,siteId){
  const unique=[...new Set((locationList||[]).map(name=>String(name||"").trim()).filter(Boolean))];
  const rows=unique.length ? unique : ["Room A"];
  return rows.map((name,index)=>({
    id: makeSafeId(name,"room"),
    siteId,
    name,
    order:index+1,
    active:true,
    layout:{ x:0, y:0, w:30, h:28 }
  }));
}
function ensureSiteRoomSelection(){
  if(!(appState.map.expandedSiteIds instanceof Set)){
    appState.map.expandedSiteIds=new Set();
  }
  if(!(appState.map.expandedRoomIds instanceof Set)){
    appState.map.expandedRoomIds=new Set();
  }
  const activeSites=getActiveSites();
  const validSiteIds=new Set(activeSites.map(site=>site.id));
  [...appState.map.expandedSiteIds].forEach(siteId=>{
    if(!validSiteIds.has(siteId)) appState.map.expandedSiteIds.delete(siteId);
  });
  const selectedSite=activeSites.find(site=>site.id===appState.map.selectedSiteId) || activeSites[0] || null;
  appState.map.selectedSiteId=selectedSite?.id || null;
  const roomCandidates=selectedSite ? getRoomsBySite(selectedSite.id) : [];
  const validRoomIds=new Set(rooms.map(room=>room.id));
  [...appState.map.expandedRoomIds].forEach(roomId=>{
    if(!validRoomIds.has(roomId)) appState.map.expandedRoomIds.delete(roomId);
  });
  const selectedRoom=roomCandidates.find(room=>room.id===appState.map.selectedRoomId) || null;
  appState.map.selectedRoomId=selectedRoom?.id || null;
  if(appState.map.selectedMachineId && !bscIds.includes(appState.map.selectedMachineId)){
    appState.map.selectedMachineId=null;
  }
}
function toggleSiteTreeExpand(siteId){
  if(!(appState.map.expandedSiteIds instanceof Set)){
    appState.map.expandedSiteIds=new Set();
  }
  if(appState.map.expandedSiteIds.has(siteId)){
    appState.map.expandedSiteIds.delete(siteId);
    const siteRooms=getRoomsBySite(siteId,{includeInactive:true});
    siteRooms.forEach(room=>appState.map.expandedRoomIds.delete(room.id));
    if(appState.map.selectedRoomId){
      const selectedRoom=getRoomById(appState.map.selectedRoomId);
      if(selectedRoom && selectedRoom.siteId===siteId){
        appState.map.selectedRoomId=null;
        appState.map.selectedMachineId=null;
      }
    }
    return false;
  }
  appState.map.expandedSiteIds.add(siteId);
  return true;
}
function toggleRoomTreeExpand(roomId){
  if(!(appState.map.expandedRoomIds instanceof Set)){
    appState.map.expandedRoomIds=new Set();
  }
  if(appState.map.expandedRoomIds.has(roomId)){
    appState.map.expandedRoomIds.delete(roomId);
    const selectedMachineRoom=appState.map.selectedMachineId ? getMachineRoomId(appState.map.selectedMachineId) : null;
    if(selectedMachineRoom===roomId) appState.map.selectedMachineId=null;
    return false;
  }
  appState.map.expandedRoomIds.add(roomId);
  return true;
}
function expandTreePathForRoom(siteId,roomId){
  if(!(appState.map.expandedSiteIds instanceof Set)){
    appState.map.expandedSiteIds=new Set();
  }
  if(!(appState.map.expandedRoomIds instanceof Set)){
    appState.map.expandedRoomIds=new Set();
  }
  if(siteId) appState.map.expandedSiteIds.add(siteId);
  if(roomId) appState.map.expandedRoomIds.add(roomId);
}
function applyLegacyMigrationData(data){
  const siteId="site-default";
  const legacyLocations=Array.isArray(data?.locations) && data.locations.length ? data.locations : locations;
  sites=[{ id: siteId, name: "기본 Site", order: 1, active: true }];
  rooms=buildRoomsFromLocations(legacyLocations,siteId);
  assignAutoRoomLayouts(rooms);
  const roomByName=new Map(rooms.map(room=>[room.name,room.id]));
  const nextRoomIds={};
  for(const id of bscIds){
    const legacyName=(data?.machines && data.machines[id]?.location) || machineLocations[id] || rooms[0]?.name;
    const roomId=roomByName.get(legacyName) || rooms[0]?.id || null;
    if(roomId) nextRoomIds[id]=roomId;
    machineLocations[id]=getRoomById(roomId)?.name || legacyName;
  }
  machineRoomIds=nextRoomIds;
  syncLocationsFromRooms();
  configState.needsMigrationSave=true;
  if(!configState.migrationNotified){
    configState.migrationNotified=true;
    showToast("장소 데이터가 Site/Room 구조로 자동 변환되었습니다.","info");
  }
}
function ensureSiteRoomState(){
  if(!Array.isArray(sites) || sites.length===0){
    sites=[{ id: "site-default", name: "기본 Site", order: 1, active: true }];
  }
  if(!Array.isArray(rooms) || rooms.length===0){
    rooms=buildRoomsFromLocations(locations,sites[0].id);
  }
  assignAutoRoomLayouts(rooms);
  const validRoomIds=new Set(rooms.map(room=>room.id));
  const nextRoomIds={};
  const roomByName=new Map(rooms.map(room=>[room.name,room.id]));
  for(const id of bscIds){
    const existing=machineRoomIds[id];
    if(existing && validRoomIds.has(existing)){
      nextRoomIds[id]=existing;
      machineLocations[id]=getRoomById(existing)?.name || machineLocations[id];
      continue;
    }
    const fromName=machineLocations[id];
    const roomId=roomByName.get(fromName) || rooms[0]?.id || null;
    if(roomId){
      nextRoomIds[id]=roomId;
      machineLocations[id]=getRoomById(roomId)?.name || fromName;
    }
  }
  machineRoomIds=nextRoomIds;
  syncLocationsFromRooms();
  ensureSiteRoomSelection();
}
function canEditMapLayout(){
  return isAdminUser() && appState.currentView==="dashboard" && !isMobileViewport();
}
function getRoomLayoutSnapshot(){
  const snapshot={};
  rooms.forEach(room=>{
    snapshot[room.id]=cloneLayout(room.layout);
  });
  return snapshot;
}
function startMapLayoutEditMode(){
  if(!canEditMapLayout()) return;
  appState.map.searchText="";
  appState.map.layoutEditMode=true;
  appState.map.layoutDraft=getRoomLayoutSnapshot();
  appState.map.layoutInvalidRoomIds=new Set();
  appState.map.layoutDirty=false;
  appState.map.layoutDrag=null;
}
function stopMapLayoutEditMode(resetDraft=true){
  appState.map.layoutEditMode=false;
  appState.map.layoutDrag=null;
  appState.map.layoutInvalidRoomIds=new Set();
  appState.map.layoutDirty=false;
  if(resetDraft){
    appState.map.layoutDraft=null;
  }
  document.body.classList.remove("map-layout-dragging");
}
function snapLayoutPercent(value){
  return Math.round((Number(value)||0)/MAP_LAYOUT_SNAP_PCT)*MAP_LAYOUT_SNAP_PCT;
}
function clampRoomLayout(layout){
  const next=cloneLayout(layout);
  next.w=Math.max(MAP_LAYOUT_MIN_SIZE_PCT,Math.min(96,next.w));
  next.h=Math.max(MAP_LAYOUT_MIN_SIZE_PCT,Math.min(96,next.h));
  next.x=Math.max(0,Math.min(100-next.w,next.x));
  next.y=Math.max(0,Math.min(100-next.h,next.y));
  next.x=snapLayoutPercent(next.x);
  next.y=snapLayoutPercent(next.y);
  next.w=snapLayoutPercent(next.w);
  next.h=snapLayoutPercent(next.h);
  next.w=Math.max(MAP_LAYOUT_MIN_SIZE_PCT,Math.min(100-next.x,next.w));
  next.h=Math.max(MAP_LAYOUT_MIN_SIZE_PCT,Math.min(100-next.y,next.h));
  return next;
}
function getRoomLayoutForRender(roomId){
  if(appState.map.layoutEditMode && appState.map.layoutDraft && appState.map.layoutDraft[roomId]){
    return appState.map.layoutDraft[roomId];
  }
  return cloneLayout(getRoomById(roomId)?.layout);
}
function collectSiteRoomLayouts(siteId){
  const result=[];
  const siteRooms=getRoomsBySite(siteId,{includeInactive:true});
  siteRooms.forEach(room=>{
    const layout=getRoomLayoutForRender(room.id);
    if(!layout) return;
    result.push({ id:room.id, layout });
  });
  return result;
}
function isRectOverlap(a,b){
  return a.x < (b.x+b.w) && (a.x+a.w) > b.x && a.y < (b.y+b.h) && (a.y+a.h) > b.y;
}
function getOverlappingRoomIds(siteId){
  const layouts=collectSiteRoomLayouts(siteId);
  const overlaps=new Set();
  for(let i=0;i<layouts.length;i+=1){
    for(let j=i+1;j<layouts.length;j+=1){
      if(isRectOverlap(layouts[i].layout,layouts[j].layout)){
        overlaps.add(layouts[i].id);
        overlaps.add(layouts[j].id);
      }
    }
  }
  return overlaps;
}
function updateMapLayoutValidationUI(siteId){
  const warning=document.getElementById("map-layout-warning");
  if(!appState.map.layoutEditMode || !siteId){
    if(warning){
      warning.hidden=true;
      warning.textContent="";
    }
    return;
  }
  const overlaps=getOverlappingRoomIds(siteId);
  appState.map.layoutInvalidRoomIds=overlaps;
  const hasIssue=overlaps.size>0;
  if(warning){
    warning.hidden=!hasIssue;
    warning.textContent=hasIssue ? "Room 영역이 겹칩니다. 겹침 해소 후 저장하세요." : "";
  }
  const saveBtn=document.getElementById("btn-map-layout-save");
  if(saveBtn){
    saveBtn.disabled=hasIssue || !appState.map.layoutDirty;
  }
  document.querySelectorAll(".map-room-box").forEach(el=>{
    const id=el.dataset.roomId;
    el.classList.toggle("layout-overlap",overlaps.has(id));
  });
}
function toggleMapLayoutEditMode(){
  if(!canEditMapLayout()) return;
  if(appState.map.layoutEditMode){
    stopMapLayoutEditMode(true);
  }else{
    startMapLayoutEditMode();
  }
  renderMap();
  renderSelectionDetailPanel();
}
function cancelMapLayoutEdit(){
  if(!appState.map.layoutEditMode) return;
  stopMapLayoutEditMode(true);
  renderMap();
}
async function saveMapLayoutEdit(){
  if(!appState.map.layoutEditMode || !canEditMapLayout()) return;
  const selectedSiteId=appState.map.selectedSiteId;
  const overlaps=getOverlappingRoomIds(selectedSiteId);
  if(overlaps.size>0){
    showToast("Room 영역이 겹쳐 저장할 수 없습니다.","warn");
    updateMapLayoutValidationUI(selectedSiteId);
    return;
  }
  try{
    rooms=rooms.map(room=>{
      const draft=appState.map.layoutDraft?.[room.id];
      if(!draft) return room;
      return { ...room, layout: clampRoomLayout(draft) };
    });
    stopMapLayoutEditMode(true);
    await saveConfig();
    renderAll();
    showToast("Room 배치 좌표를 저장했습니다.","success");
    addAdminActivity("Room 배치 저장", `${formatDateLabel(getViewDate())} / ${getSiteById(selectedSiteId)?.name || "-"}`);
  }catch(error){
    reportAsyncError("saveMapLayoutEdit", error, "Room 배치 저장에 실패했습니다.");
  }
}
function beginMapRoomLayoutDrag(event,roomId,mode){
  if(!appState.map.layoutEditMode || !canEditMapLayout()) return;
  const canvas=document.getElementById("map-canvas");
  if(!canvas) return;
  const room=getRoomById(roomId);
  if(!room || room.siteId!==appState.map.selectedSiteId) return;
  const layout=getRoomLayoutForRender(roomId);
  if(!layout) return;
  const rect=canvas.getBoundingClientRect();
  appState.map.layoutDrag={
    roomId,
    mode,
    startX:event.clientX,
    startY:event.clientY,
    canvasRect:rect,
    origin:cloneLayout(layout)
  };
  appState.map.selectedRoomId=roomId;
  appState.map.selectedMachineId=null;
  document.body.classList.add("map-layout-dragging");
  event.preventDefault();
}
function handleMapLayoutDragMove(event){
  const drag=appState.map.layoutDrag;
  if(!drag || !appState.map.layoutEditMode) return;
  const draft=appState.map.layoutDraft?.[drag.roomId];
  if(!draft) return;
  const dxPct=((event.clientX-drag.startX)/Math.max(1,drag.canvasRect.width))*100;
  const dyPct=((event.clientY-drag.startY)/Math.max(1,drag.canvasRect.height))*100;
  let next={...drag.origin};
  if(drag.mode==="move"){
    next.x=drag.origin.x+dxPct;
    next.y=drag.origin.y+dyPct;
  }else{
    next.w=drag.origin.w+dxPct;
    next.h=drag.origin.h+dyPct;
  }
  next=clampRoomLayout(next);
  appState.map.layoutDraft[drag.roomId]=next;
  appState.map.layoutDirty=true;
  const box=document.querySelector(`.map-room-box[data-room-id="${drag.roomId}"]`);
  if(box){
    box.style.left=`${next.x}%`;
    box.style.top=`${next.y}%`;
    box.style.width=`${next.w}%`;
    box.style.height=`${next.h}%`;
    const coord=box.querySelector(".map-room-coord");
    if(coord) coord.textContent=`x:${Math.round(next.x)} y:${Math.round(next.y)} w:${Math.round(next.w)} h:${Math.round(next.h)}`;
  }
  updateMapLayoutValidationUI(appState.map.selectedSiteId);
}
function handleMapLayoutDragEnd(){
  if(!appState.map.layoutDrag) return;
  appState.map.layoutDrag=null;
  document.body.classList.remove("map-layout-dragging");
  renderMap();
}
function getPurposeMeta(key){
  const found = purposeList.find(p=>p.key===key);
  const base = statusMeta[key] || statusMeta.other;
  return {
    label: found ? found.label : (base.label || key),
    color: base.color,
    tile: base.tile
  };
}

function isPurposeAllowedForMachine(purpose, machineId){
  if(!purpose || !machineId) return true;
  const list = Array.isArray(purpose.machines) ? purpose.machines : null;
  if(!list || list.length === 0) return true;
  return list.includes(machineId);
}

function getPurposesForMachine(machineId){
  return purposeList.filter(p=>isPurposeAllowedForMachine(p, machineId));
}

function renderPurposeOptions(machineId){
  const sel=document.getElementById("booking-purpose");
  if(!sel) return;
  const current=sel.value;
  const options = machineId ? getPurposesForMachine(machineId) : purposeList;
  if(options.length === 0){
    sel.innerHTML = '<option value="" disabled>선택 가능한 목적이 없습니다</option>';
    return;
  }
  sel.innerHTML=options.map(p=>`<option value="${p.key}">${p.label}</option>`).join("");
  if(current && options.some(p=>p.key===current)) sel.value=current;
}
function renderLocationOptions(){
  ensureSiteRoomState();
  const siteSel=document.getElementById("machine-site");
  const roomSel=document.getElementById("machine-room");
  if(!siteSel || !roomSel) return;
  const currentSite=siteSel.value;
  const siteOptions=sortByOrderThenName(sites);
  siteSel.innerHTML=siteOptions.map(site=>`<option value="${site.id}">${site.name}</option>`).join("");
  if(!siteOptions.length){
    roomSel.innerHTML='<option value="">Room 없음</option>';
    return;
  }
  const siteId=siteOptions.some(site=>site.id===currentSite) ? currentSite : siteOptions[0].id;
  siteSel.value=siteId;
  const currentRoom=roomSel.value;
  const roomOptions=getRoomsBySite(siteId,{includeInactive:true});
  roomSel.innerHTML=roomOptions.map(room=>`<option value="${room.id}">${room.name}</option>`).join("");
  if(!roomOptions.length){
    roomSel.innerHTML='<option value="">Room 없음</option>';
    return;
  }
  roomSel.value=roomOptions.some(room=>room.id===currentRoom) ? currentRoom : roomOptions[0].id;
}
function ensureBookingBuckets(){
  for(const id of bscIds){if(!bookings[id]) bookings[id]=[];}
  for(const key of Object.keys(bookings)){if(!bscIds.includes(key)) delete bookings[key];}
  ensureSiteRoomState();
}

function buildMachinesMap(){
  ensureSiteRoomState();
  const map = {};
  for(const id of bscIds){
    const roomId=getMachineRoomId(id);
    const room=getRoomById(roomId);
    map[id] = {
      roomId: roomId || null,
      siteId: room?.siteId || null,
      location: getMachineLocation(id),
      mgmtNo: getMachineMgmtNo(id),
      desc: getMachineDesc(id)
    };
  }
  return map;
}

function buildConfigPayload(){
  ensureSiteRoomState();
  return {
    configVersion: 2,
    sites: sites.map(site=>({
      id: site.id,
      name: site.name,
      order: Number(site.order) || 0,
      active: site.active!==false
    })),
    rooms: rooms.map(room=>({
      id: room.id,
      siteId: room.siteId,
      name: room.name,
      order: Number(room.order) || 0,
      active: room.active!==false,
      layout: cloneLayout(room.layout)
    })),
    locations: [...locations],
    machines: buildMachinesMap(),
    machineOrder: [...bscIds],
    purposes: purposeList.map(p=>({
      key: p.key,
      label: p.label,
      machines: Array.isArray(p.machines) ? p.machines : null
    })),
    manualSections: manualSections.map(section=>({
      id: section.id,
      title: section.title,
      body: section.body,
      imageUrl: section.imageUrl || "",
      imageCaption: section.imageCaption || "",
      order: Number(section.order) || 0,
      active: section.active!==false
    })),
    updatedAt: serverTimestamp()
  };
}

function applyConfigData(data){
  configState.needsMigrationSave = false;
  if(Array.isArray(data.locations) && data.locations.length){
    locations = [...data.locations];
  }
  if(Array.isArray(data.purposes) && data.purposes.length){
    purposeList = data.purposes.map(p=>({
      key: String(p.key),
      label: String(p.label),
      machines: Array.isArray(p.machines) ? p.machines.map(m=>String(m)) : null
    }));
  }else{
    purposeList = [...defaultPurposeList];
  }
  if(Array.isArray(data.manualSections) && data.manualSections.length){
    manualSections = data.manualSections
      .map((section,index)=>{
        const id = String(section.id || `manual-${index+1}`);
        if(id==="manual-login") return null;
        const baseSection = defaultManualSectionsById[id] || null;
        const rawImageUrl = String(section.imageUrl || "");
        const imageUrl = rawImageUrl || String(baseSection?.imageUrl || "");
        const rawImageCaption = String(section.imageCaption || "");
        const imageCaption = imageUrl
          ? (rawImageUrl ? rawImageCaption : String(baseSection?.imageCaption || rawImageCaption).replace(/\uCD94\uAC00 \uC608\uC815/g, "").trim())
          : "";
        return {
          id,
          title: String(section.title || baseSection?.title || `\uC139\uC158 ${index+1}`),
          body: String(section.body || baseSection?.body || ""),
          imageUrl,
          imageCaption,
          order: Number(section.order) || baseSection?.order || index+1,
          active: section.active!==false
        };
      })
      .filter(Boolean);
  }else{
    manualSections = defaultManualSections.map(section=>({ ...section }));
  }
  if(Array.isArray(data.sites) && data.sites.length){
    sites = data.sites.map((site,index)=>({
      id: String(site.id || makeSafeId(site.name || `site-${index+1}`,"site")),
      name: String(site.name || `Site ${index+1}`),
      order: Number(site.order) || index+1,
      active: site.active!==false
    }));
  }else{
    sites = [{ id: "site-default", name: "기본 Site", order: 1, active: true }];
  }
  if(Array.isArray(data.rooms) && data.rooms.length){
    rooms = data.rooms.map((room,index)=>({
      id: String(room.id || makeSafeId(room.name || `room-${index+1}`,"room")),
      siteId: String(room.siteId || sites[0]?.id || "site-default"),
      name: String(room.name || `Room ${index+1}`),
      order: Number(room.order) || index+1,
      active: room.active!==false,
      layout: cloneLayout(room.layout)
    }));
  }else{
    applyLegacyMigrationData(data);
  }
  if(data.machines && typeof data.machines === "object"){
    const order = Array.isArray(data.machineOrder) ? data.machineOrder : Object.keys(data.machines);
    const nextIds = order.filter(id=>data.machines[id]);
    bscIds = nextIds.length ? nextIds : Object.keys(data.machines);
    const nextLocations = {};
    const nextMgmt = {};
    const nextDescs = {};
    const nextRoomIds = {};
    const roomNameToId=new Map(rooms.map(room=>[room.name,room.id]));
    for(const id of bscIds){
      const entry = data.machines[id] || {};
      const entryRoomId=String(entry.roomId || "");
      const resolvedRoomId=getRoomById(entryRoomId)
        ? entryRoomId
        : (entry.location ? roomNameToId.get(entry.location) : null);
      if(resolvedRoomId){
        nextRoomIds[id]=resolvedRoomId;
      }
      const roomName=getRoomById(resolvedRoomId)?.name || entry.location || locations[0] || "Room A";
      nextLocations[id] = roomName;
      nextMgmt[id] = entry.mgmtNo || "";
      nextDescs[id] = entry.desc || "";
    }
    machineLocations = nextLocations;
    machineMgmtNos = nextMgmt;
    machineDescs = nextDescs;
    machineRoomIds = nextRoomIds;
  }
  ensureSiteRoomState();
  configState.loaded = true;
  configState.exists = true;
  ensureBookingBuckets();
  renderAll();
}

function handleConfigMissing(){
  configState.loaded = true;
  configState.exists = false;
  configState.needsMigrationSave = false;
  purposeList = [...defaultPurposeList];
  manualSections = defaultManualSections.map(section=>({ ...section }));
  sites=[{ id: "site-default", name: "기본 Site", order: 1, active: true }];
  rooms=buildRoomsFromLocations(locations,sites[0].id);
  assignAutoRoomLayouts(rooms);
  machineRoomIds={};
  ensureBookingBuckets();
  renderAll();
}

function subscribeConfig(){
  if(configUnsub) configUnsub();
  configUnsub = onSnapshot(configRef, snap=>{
    if(snap.exists()) applyConfigData(snap.data());
    else handleConfigMissing();
  }, ()=>showToast("설정 동기화에 실패했습니다.","warn"));
}

async function ensureConfigDoc(){
  if(!can("admin")) return;
  try{
    const snap = await getDoc(configRef);
    if(!snap.exists()){
      await setDoc(configRef, buildConfigPayload());
      configState.needsMigrationSave=false;
      return;
    }
    if(configState.needsMigrationSave){
      await setDoc(configRef, buildConfigPayload(), { merge: true });
      configState.needsMigrationSave=false;
    }
  }catch(error){
    reportAsyncError("ensureConfigDoc", error, "설정 초기화에 실패했습니다.");
  }
}

async function saveConfig(){
  if(!can("admin")) return;
  try{
    await setDoc(configRef, buildConfigPayload(), { merge: true });
  }catch(error){
    reportAsyncError("saveConfig", error, "설정 저장에 실패했습니다.");
    throw error;
  }
}

function syncBookingsSnapshot(snapshot){
  const next = Object.fromEntries(bscIds.map(id=>[id,[]]));
  snapshot.forEach(docSnap=>{
    const data = docSnap.data();
    if(data.status === "deleted" || data.status === "rejected") return;
    const machineId = data.machineId;
    if(!machineId || !next[machineId]) return;
    next[machineId].push({ docId: docSnap.id, ...data });
  });
  for(const id of bscIds){
    next[id].sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
  }
  Object.keys(bookings).forEach(key=>delete bookings[key]);
  Object.assign(bookings,next);
}

function dateToISO(dateObj){
  return dateObj.toISOString().slice(0,10);
}

function getBookingQueryRange(){
  const currentDate = new Date(`${getViewDate()}T00:00:00`);
  const safeCurrent = Number.isNaN(currentDate.getTime()) ? new Date() : currentDate;
  const monthStart = new Date(appState.currentYear, appState.currentMonth-1, 1);
  const monthEnd = new Date(appState.currentYear, appState.currentMonth, 0);
  const statsStart = new Date(appState.statsYear, appState.statsMonth-1, 1);
  const statsEnd = new Date(appState.statsYear, appState.statsMonth, 0);
  const startBase = new Date(Math.min(safeCurrent.getTime(), monthStart.getTime(), statsStart.getTime()));
  const endBase = new Date(Math.max(safeCurrent.getTime(), monthEnd.getTime(), statsEnd.getTime()));
  startBase.setDate(startBase.getDate()-7);
  endBase.setDate(endBase.getDate()+7);
  return { from: dateToISO(startBase), to: dateToISO(endBase) };
}

function renderAfterBookingsChange(){
  renderDateLabels();
  renderDashboard();
  renderSchedule();
  renderCalendar();
  if(appState.currentView==="admin" && can("admin")){
    refreshAuditHistory();
    renderAdminActivity();
    renderStats();
    renderMachineTable();
    renderLocationMaintenanceTable();
  }
}

function subscribeBookings(force=false){
  const { from, to } = getBookingQueryRange();
  const nextKey = `${from}:${to}`;
  if(!force && bookingsUnsub && bookingsQueryKey===nextKey) return;
  if(bookingsUnsub) bookingsUnsub();
  bookingsQueryKey = nextKey;
  const bookingsQuery = query(
    collection(db,"bookings"),
    where("date",">=",from),
    where("date","<=",to)
  );
  bookingsUnsub = onSnapshot(bookingsQuery, snapshot=>{
    syncBookingsSnapshot(snapshot);
    renderAfterBookingsChange();
  }, ()=> showToast("예약 동기화에 실패했습니다.","warn"));
}

function normalizeLoginId(value){
  if(!value) return "";
  return value.includes("@") ? value : value + "@reservation.local";
}

async function createBookingDoc(payload){
  const data = { ...payload, createdAt: serverTimestamp() };
  return addDoc(collection(db,"bookings"), data);
}

async function updateBookingDoc(docId, updates){
  return updateDoc(doc(db,"bookings",docId), { ...updates, updatedAt: serverTimestamp() });
}

async function deleteBookingDoc(docId){
  return deleteDoc(doc(db,"bookings",docId));
}

function getBookingsForDate(id,date){return (bookings[id]||[]).filter(b=>b.date===date&&b.status!=="deleted");} 
function findBookingByDocId(id, docId){return (bookings[id]||[]).find(b=>b.docId===docId);}  
function getCurrentBooking(id){const date=getViewDate();const hour=appState.currentHour;return getBookingsForDate(id,date).find(b=>b.start<=hour&&hour<(b.start+b.duration));}

function isBookingMine(booking,user=appState.currentUser){
  if(!booking||!user) return false;
  if(user.role==="guest") return false;
  if(booking.createdBy && user.uid && booking.createdBy===user.uid) return true;
  if(booking.userId && user.id && booking.userId===user.id) return true;
  if(booking.user && user.name && booking.user===user.name) return true;
  return false;
}

function getPendingBookings(date=getViewDate()){
  const pending=[];
  for(const id of bscIds){
    getBookingsForDate(id,date).filter(b=>b.status==="pending").forEach(b=>pending.push({id,docId:b.docId,booking:b}));
  }
  return pending.sort((a,b)=>a.id.localeCompare(b.id)||a.booking.start-b.booking.start);
}

function can(action){
  return canRolePerform(appState.currentUser?.role, action);
}

function isManagerUser(user=appState.currentUser){
  return !!user && (user.role==="admin" || user.role==="supervisor");
}

function isAdminUser(user=appState.currentUser){
  return !!user && user.role==="admin";
}

function isWorkerUser(user=appState.currentUser){
  return !!user && user.role==="worker";
}

function isWorkerLikeUser(user=appState.currentUser){
  return !!user && (user.role==="worker" || user.role==="guest");
}

function isWorkerMobileMode(){
  return isMobileViewport() && isWorkerLikeUser();
}

function canDragBooking(booking){
  return canUserOperateBooking(appState.currentUser, booking);
}

function canResizeBooking(booking){
  return canDragBooking(booking);
}

function canEditBooking(booking){
  return canDragBooking(booking);
}

function isResizeIntentTarget(event,block,booking){
  if(!event || !block || !canResizeBooking(booking)) return false;
  if(event.button!==0) return false;
  const rect=block.getBoundingClientRect();
  const hitWidth=Math.min(RESIZE_INTENT_HIT_PX,Math.max(10,rect.width*0.34));
  const distance=rect.right-event.clientX;
  return distance>=-2 && distance<=hitWidth;
}

function canUseScheduleDrop(){
  const user=appState.currentUser;
  if(!user) return false;
  if(user.role==="guest") return false;
  return isManagerUser(user) || isWorkerUser(user);
}

function getMinReservableHour(date){
  if(date!==todayISO()) return 9;
  return clampHour(Math.ceil(getNowHour()*2)/2);
}

function canDeleteBooking(){
  return appState.currentUser?.role === "admin";
}

function typeIcon(type){if(type==="success") return "✅"; if(type==="warn") return "⚠️"; return "ℹ️";}
function showToast(message,type="success"){
  const container=document.getElementById("toast-container");
  const toast=document.createElement("div");
  toast.className=`toast ${type}`;
  toast.innerHTML=`<span>${typeIcon(type)}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(()=>{toast.style.opacity="0";setTimeout(()=>toast.remove(),220);},2600);
}

function getErrorText(error){
  if(!error) return "";
  if(typeof error === "string") return error;
  if(typeof error.message === "string" && error.message) return error.message;
  if(typeof error.code === "string" && error.code) return error.code;
  return "";
}

function reportAsyncError(context, error, fallbackMessage){
  console.error(`[${context}]`, error);
  const text=getErrorText(error).toLowerCase();
  if(text.includes("network") || text.includes("unavailable") || text.includes("deadline-exceeded")){
    showToast("네트워크 상태가 불안정합니다. 잠시 후 다시 시도해주세요.","warn");
    return;
  }
  showToast(fallbackMessage || "요청 처리 중 오류가 발생했습니다.","warn");
}

function getReportDateValue(){
  const reportDate=document.getElementById("report-date");
  return (reportDate && reportDate.value) ? reportDate.value : getViewDate();
}

function mapStatusLabel(status){
  if(status==="deleted") return "삭제";
  if(status==="rejected") return "반려";
  if(status==="pending") return "대기";
  return "확정";
}

function mapStatusClass(status){
  if(status==="deleted") return "status-deleted";
  if(status==="rejected") return "status-rejected";
  if(status==="pending") return "status-pending";
  return "status-confirmed";
}

function addAdminActivity(action, detail=""){
  if(!isManagerUser()) return;
  try{
    const actor=appState.currentUser?.id || appState.currentUser?.name || "admin";
    const timestamp=new Date().toISOString();
    const nextItem={ action, detail, actor, timestamp };
    const existingRaw=localStorage.getItem(adminActivityKey);
    const existing=existingRaw ? JSON.parse(existingRaw) : [];
    const rows=Array.isArray(existing) ? existing : [];
    rows.unshift(nextItem);
    const sliced=rows.slice(0,80);
    localStorage.setItem(adminActivityKey, JSON.stringify(sliced));
  }catch(error){
    console.warn("[addAdminActivity]", error);
  }
  renderAdminActivity();
}

function readAdminActivity(){
  try{
    const raw=localStorage.getItem(adminActivityKey);
    if(!raw) return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(error){
    return [];
  }
}

function formatActivityTime(iso){
  const date=new Date(iso);
  if(Number.isNaN(date.getTime())) return iso || "-";
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  const h=String(date.getHours()).padStart(2,"0");
  const min=String(date.getMinutes()).padStart(2,"0");
  return `${y}.${m}.${d} ${h}:${min}`;
}

function renderAdminActivity(){
  const container=document.getElementById("admin-activity-list");
  if(!container) return;
  const rows=readAdminActivity();
  if(rows.length===0){
    container.innerHTML='<div class="activity-empty">최근 기록이 없습니다.</div>';
    return;
  }
  container.innerHTML=rows.slice(0,20).map(row=>{
    const detail=row.detail ? `<span>${row.detail}</span>` : "";
    return `<div class="activity-item"><strong>${row.action}</strong>${detail}<span>${formatActivityTime(row.timestamp)} · ${row.actor}</span></div>`;
  }).join("");
}



function initStartTimes(){
  const select=document.getElementById("booking-start"); select.innerHTML="";
  const viewDate=getViewDate();
  const minHour=getMinReservableHour(viewDate);
  for(let h=9;h<18;h+=0.5){
    const opt = document.createElement("option");
    opt.value = String(h);
    opt.textContent = formatTime(h);
    if(h < minHour) opt.disabled = true;
    select.appendChild(opt);
  }
}

function initTimelineHours(){
  const hours=[]; for(let h=9;h<=18;h+=1) hours.push(h);
  const nodes=hours.map(h=>`<span>${String(h).padStart(2,"0")}</span>`).join("");
  document.getElementById("timeline-hours").innerHTML=nodes;
  document.getElementById("day-timeline-hours").innerHTML=nodes;
}
async function login(role){
  const demo = demoAccounts[role];
  if(!demo){
    alert("데모 계정을 확인해주세요.");
    return;
  }
  try{
    await signInWithEmailAndPassword(auth,demo.email,demo.password);
  }catch(e){
    alert("데모 계정 로그인에 실패했습니다. 관리자에게 문의하세요.");
  }
}
async function loginWithCredentials(){
  const rawId=document.getElementById("login-id").value.trim();
  const password=document.getElementById("login-password").value;
  if(!rawId||!password){alert("\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");return;}
  const email=normalizeLoginId(rawId);
  try{
    await signInWithEmailAndPassword(auth,email,password);
  }catch(e){
    alert("\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
}

async function registerWithCredentials(){
  const name=document.getElementById("login-name").value.trim();
  const rawId=document.getElementById("login-id").value.trim();
  const password=document.getElementById("login-password").value;
  if(!name){alert("\uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");return;}
  if(!rawId||!password){alert("\uC544\uC774\uB514 \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");return;}
  const email=normalizeLoginId(rawId);
  try{
    const cred = await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,"users",cred.user.uid),{
      id: rawId,
      email,
      name,
      role:"worker",
      approved:false,
      createdAt: serverTimestamp()
    });
    alert("\uAC00\uC785\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uB85C\uADF8\uC778 \uAC00\uB2A5\uD569\uB2C8\uB2E4.");
    await signOut(auth);
  }catch(e){
    alert("\uD68C\uC6D0\uAC00\uC785\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
}
function applyHeaderSession(user){
  appState.currentUser = user;
  document.body.className=`role-${appState.currentUser.role}`;
  const badge=document.getElementById("user-badge");
  if(badge){
    badge.className=`user-badge role-${appState.currentUser.role}`;
    badge.textContent=appState.currentUser.role.toUpperCase();
  }
  const nameEl=document.getElementById("user-name");
  if(nameEl) nameEl.textContent=appState.currentUser.name;
  const logoutBtn=document.getElementById("btn-logout");
  if(logoutBtn) logoutBtn.textContent=appState.currentUser.role==="guest" ? "로그인" : "로그아웃";
  const adminTab=document.getElementById("tab-admin");
  if(adminTab) adminTab.hidden=!(appState.currentUser.role==="admin"||appState.currentUser.role==="supervisor");
  const manualTab=document.getElementById("tab-manual");
  if(manualTab) manualTab.hidden=!canReadManual();
  ["mobile-nav-manual-drawer","mobile-nav-manual-rail"].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn) btn.hidden=!canReadManual();
  });
  if(appState.currentUser.role==="supervisor") switchAdminView("audit"); else switchAdminView("users");
}

async function applySession(user){
  applyHeaderSession(user);
  ensureBookingBuckets();
  subscribeBookings(true);
  await ensureConfigDoc();
  renderAll();
}

function applyGuestSession(){
  applyHeaderSession({id:"guest", name:"게스트", role:"guest"});
  ensureBookingBuckets();
  subscribeBookings(true);
  renderAll();
}

function initAuthListener(){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){
      applyGuestSession();
      return;
    }
    try{
      const snap = await getDoc(doc(db,"users",user.uid));
      if(!snap.exists()){
        await signOut(auth);
        alert("계정 정보를 찾을 수 없습니다.");
        window.location.replace("index.html");
        return;
      }
      const data = snap.data();
      if(!data.approved){
        await signOut(auth);
        alert("승인 대기 중입니다.");
        window.location.replace("index.html");
        return;
      }
      const role = String(data.role||"worker").trim().toLowerCase();
      await applySession({uid:user.uid, id:data.id||user.email, name:data.name||user.email, role});
    }catch(error){
      reportAsyncError("initAuthListener", error, "로그인 세션 확인에 실패했습니다.");
      applyGuestSession();
    }
  });
}
async function logout(){
  try{
    await signOut(auth);
  }catch(e){}
  window.location.replace("index.html");
}

function switchView(view){
  if(isMobileViewport() && view==="calendar"){
    view="dashboard";
  }
  if(view!=="dashboard" && appState.map.layoutEditMode){
    stopMapLayoutEditMode(true);
  }
  if(view==="admin"&&!can("admin")){alert("접근 권한이 없습니다.");return;}
  if(view==="manual"&&!canReadManual()){alert("접근 권한이 없습니다.");return;}
  if(view!=="dashboard" && view!=="reservation"){
    closeReserveWizard();
  }
  if(view!=="dashboard") clearMachineFocusState();
  appState.currentView=view;
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===view));
  document.querySelectorAll(".view-section").forEach(sec=>sec.classList.toggle("active",sec.id===`view-${view}`));
  if(view==="calendar") renderCalendar();
  if(view==="manual") renderManualPublic();
  if(view==="admin") renderAdmin();
  if(view==="dashboard") renderDashboardMobileView();
  renderMobileShell();
}

function renderDashboardSidePanel(){
  const activePanel=appState.dashboardSidePanel==="chart" ? "chart" : "status";
  document.querySelectorAll(".side-tab-btn").forEach(btn=>{
    const selected=btn.dataset.sidePanel===activePanel;
    btn.classList.toggle("active",selected);
    btn.setAttribute("aria-selected",selected?"true":"false");
  });
  const chartPanel=document.getElementById("side-panel-chart");
  const statusPanel=document.getElementById("side-panel-status");
  if(chartPanel) chartPanel.classList.toggle("is-hidden",activePanel!=="chart");
  if(statusPanel) statusPanel.classList.toggle("is-hidden",activePanel!=="status");
}

function setDashboardSidePanel(panel){
  if(panel!=="chart" && panel!=="status") return;
  appState.dashboardSidePanel=panel;
  renderDashboardSidePanel();
}

function isMobileViewport(){
  return window.matchMedia("(max-width: 820px)").matches;
}

function isMobileShellMode(){
  return isMobileViewport() && (appState.currentView==="dashboard" || appState.currentView==="reservation");
}

function canReadManual(){
  return Boolean(appState.currentUser && appState.currentUser.role && appState.currentUser.role!=="guest");
}

function getMobileLayoutMode(){
  return window.matchMedia("(max-width: 429px)").matches ? "drawer" : "rail";
}

function getDashboardLegendItems(){
  const items=[{key:"free", label:statusMeta.free.label, color:statusMeta.free.color}];
  purposeList.forEach(p=>{
    const meta=getPurposeMeta(p.key);
    items.push({key:p.key, label:meta.label, color:meta.color});
  });
  const seen=new Set();
  return items.filter(item=>{
    if(seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function hasAnyReservableSlot(date,duration=0.5){
  for(const id of bscIds){
    const minHour=getMinReservableHour(date);
    for(let h=minHour; h<18; h+=0.5){
      if(h+duration>18) continue;
      if(!isOverlap(id,date,h,duration)) return true;
    }
  }
  return false;
}

function setMobilePane(pane, syncView=true){
  const nextPane=["dashboard","reservation","manual"].includes(pane) ? pane : "dashboard";
  appState.mobile.activePane=nextPane;
  appState.mobile.drawerOpen=false;
  if(syncView && appState.currentView!==nextPane){
    switchView(nextPane);
    return;
  }
  renderMobileShell();
}

function toggleMobileDrawer(forceOpen){
  if(appState.mobile.layoutMode!=="drawer") return;
  if(typeof forceOpen==="boolean") appState.mobile.drawerOpen=forceOpen;
  else appState.mobile.drawerOpen=!appState.mobile.drawerOpen;
  renderMobileShell();
}

function createSvgNode(tag, attrs={}){
  const node=document.createElementNS("http://www.w3.org/2000/svg",tag);
  Object.entries(attrs).forEach(([key,val])=>node.setAttribute(key,String(val)));
  return node;
}

function polarToCartesian(cx, cy, r, angleDeg){
  const rad=(angleDeg-90)*(Math.PI/180);
  return { x: cx+r*Math.cos(rad), y: cy+r*Math.sin(rad) };
}

function describeArcPath(cx, cy, r, startAngle, endAngle){
  const start=polarToCartesian(cx, cy, r, endAngle);
  const end=polarToCartesian(cx, cy, r, startAngle);
  const largeArc=(endAngle-startAngle)<=180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function getReservableLocationsByTime(date,time,duration=0.5){
  return locations.map(loc=>{
    const count=bscIds.filter(id=>
      getMachineLocation(id)===loc &&
      !isOverlap(id,date,time,duration)
    ).length;
    return { location:loc, count };
  }).filter(item=>item.count>0).sort((a,b)=>b.count-a.count||a.location.localeCompare(b.location));
}

function getReservableMachinesByTime(date,time,duration,location){
  return bscIds
    .filter(id=>getMachineLocation(id)===location && !isOverlap(id,date,time,duration))
    .map(id=>({ id, mgmtNo:getMachineMgmtNo(id) || "-" }));
}

function computeSlotStateForChronograph(date,slotStart){
  const slotEnd=slotStart+0.5;
  const purposeCounts={ process:0, maint:0, em:0, clean:0, other:0, pending:0, system:0 };
  let activeCount=0;
  for(const id of bscIds){
    const booking=getBookingsForDate(id,date).find(b=>b.start<slotEnd && slotStart<(b.start+b.duration));
    if(!booking) continue;
    activeCount+=1;
    if(booking.status==="pending"){
      purposeCounts.pending+=1;
      continue;
    }
    if(booking.user==="System"){
      purposeCounts.system+=1;
      continue;
    }
    const key=purposeCounts[booking.purpose]!==undefined ? booking.purpose : "other";
    purposeCounts[key]+=1;
  }
  if(activeCount===0){
    return { key:"free", color:statusMeta.free.color, label:statusMeta.free.label };
  }
  const priority=["process","maint","em","clean","other","pending","system"];
  let bestKey="other";
  let bestCount=-1;
  priority.forEach(key=>{
    const count=purposeCounts[key];
    if(count>bestCount){
      bestCount=count;
      bestKey=key;
    }
  });
  if(bestKey==="pending"){
    return { key:bestKey, color:statusMeta.pending.color, label:statusMeta.pending.label };
  }
  if(bestKey==="system"){
    return { key:bestKey, color:statusMeta.system.color, label:statusMeta.system.label };
  }
  const meta=getPurposeMeta(bestKey);
  return { key:bestKey, color:meta.color, label:meta.label };
}

function renderMobileLegend(){
  const items=getDashboardLegendItems();
  const html=items.map(item=>`<span class="mobile-legend-item"><span class="mobile-legend-dot" style="background:${item.color}"></span>${item.label}</span>`).join("");
  const rail=document.getElementById("mobile-legend-rail");
  const bottom=document.getElementById("mobile-legend-bottom");
  if(rail) rail.innerHTML=html;
  if(bottom) bottom.innerHTML=html;
}

function renderMobileDashboardDial(){
  const svg=document.getElementById("mobile-dashboard-donut");
  if(!svg) return;
  svg.innerHTML="";
  const stats=getDashboardSummaryStats();
  const total=Math.max(1,stats.total);
  const percent=Math.round((stats.running/total)*100);
  const cx=110;
  const cy=110;
  const r=74;
  const track=createSvgNode("circle",{ cx, cy, r, fill:"none", stroke:"#e4edf4", "stroke-width":"22" });
  const progress=createSvgNode("circle",{
    cx, cy, r, fill:"none", stroke:"var(--status-process)", "stroke-width":"22",
    "stroke-linecap":"round", transform:`rotate(-90 ${cx} ${cy})`,
    "stroke-dasharray":`${(2*Math.PI*r)*(percent/100)} ${(2*Math.PI*r)}`,
    "stroke-dashoffset":"0"
  });
  svg.appendChild(track);
  svg.appendChild(progress);

  const metric=document.getElementById("mobile-donut-metric");
  if(metric) metric.textContent=`가동률 ${percent}%`;

  const canReserve=can("create") && hasAnyReservableSlot(getViewDate(),0.5);
  appState.mobile.canReserveNow=canReserve;
  const reserveState=!can("create") ? "readonly" : (canReserve ? "available" : "unavailable");
  const reserveLabel=reserveState==="available" ? "예약 가능" : (reserveState==="unavailable" ? "예약 불가능" : "읽기 전용");
  const reserveIcon=reserveState==="available" ? "✓" : (reserveState==="unavailable" ? "!" : "•");
  const centerBtn=document.getElementById("btn-mobile-center-reserve");
  const topBtn=document.getElementById("btn-mobile-center-reserve-top");
  if(centerBtn){
    centerBtn.innerHTML=`<span class="reserve-center-icon" aria-hidden="true">${reserveIcon}</span>`;
    centerBtn.classList.remove("is-available","is-unavailable","is-readonly");
    centerBtn.classList.add(`is-${reserveState}`);
    centerBtn.disabled=!canReserve;
    centerBtn.title=reserveLabel;
    centerBtn.setAttribute("aria-label",reserveLabel);
  }
  if(topBtn){
    topBtn.textContent=reserveState==="available" ? "예약" : (reserveState==="unavailable" ? "불가" : "읽기");
    topBtn.disabled=!canReserve;
    topBtn.title=reserveLabel;
    topBtn.setAttribute("aria-label",reserveLabel);
  }
}

function renderMobileChronograph270(){
  const svg=document.getElementById("mobile-chrono");
  if(!svg) return;
  svg.innerHTML="";
  const date=getViewDate();
  const cx=120;
  const cy=130;
  const radius=84;
  const startDeg=135;
  const sweepDeg=270;
  const slots=18;
  const slotSweep=sweepDeg/slots;

  const track=createSvgNode("path",{
    d:describeArcPath(cx,cy,radius,startDeg,startDeg+sweepDeg),
    fill:"none",
    stroke:"#e4edf4",
    "stroke-width":"20",
    "stroke-linecap":"round"
  });
  svg.appendChild(track);

  for(let i=0;i<slots;i+=1){
    const slotStart=9+i*0.5;
    const segStart=startDeg + i*slotSweep + 0.9;
    const segEnd=segStart + slotSweep - 1.8;
    const slotState=computeSlotStateForChronograph(date,slotStart);
    const path=createSvgNode("path",{
      d:describeArcPath(cx,cy,radius,segStart,segEnd),
      fill:"none",
      stroke:slotState.color,
      "stroke-width":"18",
      "stroke-linecap":"round",
      class:"mobile-chrono-hit"
    });
    path.addEventListener("click",()=>openReserveWizard("chronograph",slotStart));
    path.setAttribute("title",`${formatTime(slotStart)}~${formatTime(slotStart+0.5)} · ${slotState.label}`);
    svg.appendChild(path);
  }

  [9,12,15,18].forEach(hour=>{
    const ratio=(hour-9)/9;
    const angle=startDeg + ratio*sweepDeg;
    const pos=polarToCartesian(cx,cy,radius+25,angle);
    const text=createSvgNode("text",{ x:pos.x, y:pos.y+4, "text-anchor":"middle", class:"mobile-chrono-label" });
    text.textContent=String(hour).padStart(2,"0");
    svg.appendChild(text);
  });

  const nowHour=getNowHour();
  if(date===todayISO() && nowHour>=9 && nowHour<=18){
    const ratio=(nowHour-9)/9;
    const angle=startDeg + ratio*sweepDeg;
    const inner=polarToCartesian(cx,cy,radius-20,angle);
    const outer=polarToCartesian(cx,cy,radius+8,angle);
    const line=createSvgNode("line",{
      x1:inner.x, y1:inner.y, x2:outer.x, y2:outer.y,
      stroke:"#c0392b", "stroke-width":"2.4"
    });
    const dot=createSvgNode("circle",{ cx:outer.x, cy:outer.y, r:"3.5", fill:"#c0392b" });
    svg.appendChild(line);
    svg.appendChild(dot);
    const label=createSvgNode("text",{ x:cx, y:cy+8, "text-anchor":"middle", class:"mobile-chrono-now-label" });
    label.textContent=`현재 ${formatTime(nowHour)}`;
    svg.appendChild(label);
  }
}

function renderMobileShell(){
  if(isMobileViewport() && appState.currentView==="calendar"){
    switchView("dashboard");
    return;
  }
  const calendarTab=document.querySelector('.tab-btn[data-view="calendar"]');
  if(calendarTab) calendarTab.hidden=isMobileViewport();

  const active=isMobileShellMode();
  document.body.classList.toggle("mobile-shell-active",active);
  if(!active){
    document.body.classList.remove("mobile-layout-drawer","mobile-layout-rail","mobile-drawer-open");
    return;
  }

  appState.mobile.layoutMode=getMobileLayoutMode();
  if(appState.currentView==="reservation") appState.mobile.activePane="reservation";
  if(appState.currentView==="dashboard") appState.mobile.activePane="dashboard";
  if(appState.mobile.layoutMode==="rail") appState.mobile.drawerOpen=false;

  const title=document.getElementById("mobile-pane-title");
  if(title) title.textContent=appState.mobile.activePane==="reservation" ? "예약 관리" : "대시보드";

  document.body.classList.toggle("mobile-layout-drawer",appState.mobile.layoutMode==="drawer");
  document.body.classList.toggle("mobile-layout-rail",appState.mobile.layoutMode==="rail");
  document.body.classList.toggle("mobile-drawer-open",appState.mobile.layoutMode==="drawer" && appState.mobile.drawerOpen);

  const drawer=document.getElementById("mobile-drawer");
  if(drawer) drawer.hidden=!(appState.mobile.layoutMode==="drawer" && appState.mobile.drawerOpen);

  document.querySelectorAll("[data-mobile-pane]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.mobilePane===appState.mobile.activePane);
  });
  document.querySelectorAll(".mobile-pane").forEach(pane=>{
    pane.classList.toggle("active",pane.id===`mobile-${appState.mobile.activePane}-pane`);
  });

  renderMobileLegend();
  renderMobileDashboardDial();
  renderMobileChronograph270();
}

function renderDashboardMobileView(){
  const section=document.getElementById("view-dashboard");
  if(!section) return;
  const isMobile=isMobileViewport();
  const workerMobile=isMobile && isWorkerLikeUser();
  section.classList.remove("mobile-view-summary","mobile-view-map","mobile-view-timeline");
  section.classList.toggle("worker-mobile-compact",workerMobile);
  if(workerMobile){
    appState.mobileDashboardView="map";
  }else if(isMobile){
    section.classList.add(`mobile-view-${appState.mobileDashboardView}`);
  }
  const mobileTabs=document.getElementById("dashboard-mobile-tabs");
  if(mobileTabs){
    mobileTabs.classList.toggle("worker-hidden",workerMobile);
  }
  document.querySelectorAll(".mobile-view-btn").forEach(btn=>{
    const isSummaryBtn=btn.dataset.mobileView==="summary";
    btn.hidden=workerMobile && isSummaryBtn;
    if(btn.hidden){
      btn.setAttribute("aria-selected","false");
      return;
    }
    const isActive=btn.dataset.mobileView===appState.mobileDashboardView;
    btn.classList.toggle("active",isActive);
    btn.setAttribute("aria-selected",isActive?"true":"false");
  });
}

function setDashboardMobileView(view){
  if(!["summary","map","timeline"].includes(view)) return;
  appState.mobileDashboardView=view;
  renderDashboardMobileView();
}

function applyMachineFocus(){
  const section=focusCache.section || document.getElementById("view-dashboard");
  if(!section) return;
  const nextId=appState.focusMachineId || null;
  const prevId=focusCache.activeId;
  if(!nextId){
    section.classList.remove("focus-active");
    if(focusCache.dimmed){
      focusCache.allNodes.forEach(node=>node.classList.remove("is-dimmed"));
      focusCache.dimmed=false;
    }
    if(prevId){
      const prevNodes=focusCache.byMachine.get(prevId) || [];
      prevNodes.forEach(node=>node.classList.remove("is-focused"));
    }
    focusCache.activeId=null;
    return;
  }
  section.classList.add("focus-active");
  if(!focusCache.dimmed){
    focusCache.allNodes.forEach(node=>node.classList.add("is-dimmed"));
    focusCache.dimmed=true;
  }
  if(prevId && prevId!==nextId){
    const prevNodes=focusCache.byMachine.get(prevId) || [];
    prevNodes.forEach(node=>{
      node.classList.remove("is-focused");
      node.classList.add("is-dimmed");
    });
  }
  const nextNodes=focusCache.byMachine.get(nextId) || [];
  nextNodes.forEach(node=>{
    node.classList.add("is-focused");
    node.classList.remove("is-dimmed");
  });
  focusCache.activeId=nextId;
}

function rebuildFocusCache(){
  const section=document.getElementById("view-dashboard");
  focusCache.section=section || null;
  focusCache.byMachine.clear();
  if(!section){
    focusCache.allNodes=[];
    focusCache.activeId=null;
    focusCache.dimmed=false;
    return;
  }
  const nodes=Array.from(section.querySelectorAll("[data-machine-id]"));
  focusCache.allNodes=nodes;
  nodes.forEach(node=>{
    const id=node.dataset.machineId;
    if(!id) return;
    if(!focusCache.byMachine.has(id)) focusCache.byMachine.set(id,[]);
    focusCache.byMachine.get(id).push(node);
  });
  focusCache.dimmed=false;
  if(focusCache.activeId && !focusCache.byMachine.has(focusCache.activeId)){
    focusCache.activeId=null;
  }
}

function setMachineFocusClearTimer(){
  if(focusCache.clearTimer){
    clearTimeout(focusCache.clearTimer);
    focusCache.clearTimer=null;
  }
}

function scheduleMachineFocusClear(){
  setMachineFocusClearTimer();
  focusCache.clearTimer=setTimeout(()=>{
    focusCache.clearTimer=null;
    setMachineFocus(null,true);
  },80);
}

function setMachineFocus(machineId, immediate=false){
  if(machineId){
    setMachineFocusClearTimer();
    appState.focusMachineId=machineId;
    applyMachineFocus();
    return;
  }
  if(immediate){
    setMachineFocusClearTimer();
    appState.focusMachineId=null;
    applyMachineFocus();
    return;
  }
  scheduleMachineFocusClear();
}

function clearMachineFocusState(){
  setMachineFocus(null,true);
  setMachineFocusClearTimer();
  if(focusCache.section){
    focusCache.section.classList.remove("focus-active");
  }
  focusCache.allNodes.forEach(node=>{
    node.classList.remove("is-focused");
    node.classList.remove("is-dimmed");
  });
  focusCache.activeId=null;
  focusCache.dimmed=false;
}

function switchAdminView(view){
  document.querySelectorAll(".admin-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.adminView===view));
  document.querySelectorAll(".admin-section").forEach(sec=>sec.classList.toggle("active",sec.id===`admin-${view}`));
  renderAdminToolbar(view);
  renderActiveAdminSection(view);
}

function getActiveAdminView(){
  const activeBtn=document.querySelector(".admin-btn.active");
  return activeBtn?.dataset.adminView || "users";
}

function getAdminFilterConfig(view){
  const map={
    users:{
      placeholder:"이름/아이디/권한 검색",
      statuses:[
        {value:"all",label:"상태 전체"},
        {value:"approved",label:"승인됨"},
        {value:"pending",label:"승인대기"},
        {value:"role-admin",label:"관리자"},
        {value:"role-supervisor",label:"감독자"},
        {value:"role-worker",label:"작업자"}
      ],
      sorts:[
        {value:"default",label:"기본순"},
        {value:"name-asc",label:"이름 오름차순"},
        {value:"name-desc",label:"이름 내림차순"}
      ]
    },
    machines:{
      placeholder:"장비ID/관리번호/장소/설명 검색",
      statuses:[
        {value:"all",label:"상태 전체"},
        {value:"booked",label:"예약 있음"},
        {value:"unbooked",label:"예약 없음"}
      ],
      sorts:[
        {value:"default",label:"기본순"},
        {value:"id-asc",label:"ID 오름차순"},
        {value:"id-desc",label:"ID 내림차순"},
        {value:"count-desc",label:"예약 수 많은순"}
      ]
    },
    locations:{
      placeholder:"Site/Room 검색",
      statuses:[
        {value:"all",label:"상태 전체"},
        {value:"active",label:"활성 Room"},
        {value:"inactive",label:"비활성 Room"},
        {value:"used",label:"장비 배정됨"},
        {value:"empty",label:"장비 없음"}
      ],
      sorts:[
        {value:"default",label:"기본순"},
        {value:"site-asc",label:"Site 오름차순"},
        {value:"name-asc",label:"Room 오름차순"},
        {value:"name-desc",label:"Room 내림차순"},
        {value:"count-desc",label:"장비 수 많은순"}
      ]
    },
    purposes:{
      placeholder:"목적 코드/표시명 검색",
      statuses:[
        {value:"all",label:"상태 전체"},
        {value:"global",label:"전체 적용"},
        {value:"scoped",label:"장비 지정"},
        {value:"used",label:"예약 사용중"},
        {value:"unused",label:"미사용"}
      ],
      sorts:[
        {value:"default",label:"기본순"},
        {value:"code-asc",label:"코드 오름차순"},
        {value:"label-asc",label:"표시명 오름차순"}
      ]
    },
    audit:{
      placeholder:"장비/작업자/목적/사유 검색",
      statuses:[
        {value:"all",label:"전체"},
        {value:"confirmed",label:"확정"},
        {value:"deleted",label:"삭제"},
        {value:"rejected",label:"반려"}
      ],
      sorts:[
        {value:"default",label:"시간 오름차순"},
        {value:"time-desc",label:"시간 내림차순"},
        {value:"user-asc",label:"작업자 오름차순"},
        {value:"machine-asc",label:"장비 오름차순"}
      ]
    }
  };
  return map[view] || null;
}

function getAdminFilterState(view=getActiveAdminView()){
  if(!adminFilters[view]){
    adminFilters[view]={ query:"", status:"all", sort:"default" };
  }
  return adminFilters[view];
}

function renderAdminToolbar(view=getActiveAdminView()){
  const toolbar=document.getElementById("admin-toolbar");
  if(!toolbar) return;
  adminToolbarView=view;
  const config=getAdminFilterConfig(view);
  toolbar.classList.toggle("hidden",!config);
  const panel=document.getElementById("view-admin");
  if(panel){
    panel.classList.toggle("compact-rows",appState.adminCompact);
  }
  const compactBtn=document.getElementById("btn-admin-compact");
  if(compactBtn){
    compactBtn.textContent=appState.adminCompact ? "기본 간격" : "행 간격 축소";
  }
  if(!config) return;

  const state=getAdminFilterState(view);
  const search=document.getElementById("admin-search");
  const statusSel=document.getElementById("admin-status-filter");
  const sortSel=document.getElementById("admin-sort-filter");
  if(search){
    search.placeholder=config.placeholder;
    search.value=state.query;
  }
  if(statusSel){
    statusSel.innerHTML=config.statuses.map(opt=>`<option value="${opt.value}">${opt.label}</option>`).join("");
    statusSel.value=config.statuses.some(opt=>opt.value===state.status) ? state.status : "all";
  }
  if(sortSel){
    sortSel.innerHTML=config.sorts.map(opt=>`<option value="${opt.value}">${opt.label}</option>`).join("");
    sortSel.value=config.sorts.some(opt=>opt.value===state.sort) ? state.sort : config.sorts[0].value;
  }
}

function applyAdminFilterInput(){
  const view=adminToolbarView || getActiveAdminView();
  const state=getAdminFilterState(view);
  const search=document.getElementById("admin-search");
  const statusSel=document.getElementById("admin-status-filter");
  const sortSel=document.getElementById("admin-sort-filter");
  state.query=(search?.value || "").trim();
  state.status=statusSel?.value || "all";
  state.sort=sortSel?.value || "default";
  renderActiveAdminSection(view);
}

function resetAdminFilter(){
  const view=adminToolbarView || getActiveAdminView();
  adminFilters[view]={ query:"", status:"all", sort:"default" };
  renderAdminToolbar(view);
  renderActiveAdminSection(view);
}

function setAdminCompactMode(enabled){
  appState.adminCompact=!!enabled;
  renderAdminToolbar(getActiveAdminView());
}

function renderActiveAdminSection(view=getActiveAdminView()){
  if(view==="users"){
    if(users.length) renderUserTable();
    else refreshUsersFromDb();
    return;
  }
  if(view==="locations"){
    renderSiteTable();
    renderRoomSiteFilterOptions();
    renderRoomTable();
    return;
  }
  if(view==="machines"){renderMachineTable(); return;}
  if(view==="manual"){renderManualAdmin(); return;}
  if(view==="purposes"){renderPurposeTable(); return;}
  if(view==="audit"){
    refreshAuditHistory();
    renderAdminActivity();
    return;
  }
  if(view==="stats"){renderStats(); return;}
}

function updateDate(delta){
  const date=new Date(appState.currentDate);
  date.setDate(date.getDate()+delta);
  appState.currentDate=date.toISOString().slice(0,10);
  initStartTimes();
  subscribeBookings();
  renderAll();
}

function setToday(){
  appState.currentDate=todayISO();
  const today=new Date();
  appState.currentYear=today.getFullYear();
  appState.currentMonth=today.getMonth()+1;
  resetToNow();
  initStartTimes();
  subscribeBookings();
  renderAll();
}

function changeMonth(delta){
  appState.currentMonth+=delta;
  if(appState.currentMonth>12){appState.currentMonth=1;appState.currentYear+=1;}
  if(appState.currentMonth<1){appState.currentMonth=12;appState.currentYear-=1;}
  subscribeBookings();
  renderCalendar();
  renderStats();
}

function shiftStatsMonth(delta){
  const next=new Date(appState.statsYear, appState.statsMonth-1+delta, 1);
  appState.statsYear=next.getFullYear();
  appState.statsMonth=next.getMonth()+1;
  subscribeBookings();
  renderStats();
}

function resetStatsMonthToCurrent(){
  const now=new Date();
  appState.statsYear=now.getFullYear();
  appState.statsMonth=now.getMonth()+1;
  subscribeBookings();
  renderStats();
}

function updateTimeFromSlider(val){
  appState.currentHour=clampHour(snapToHalfHour(val));
  appState.isLiveMode=false;
  syncLiveModeUI();
  renderDashboard();
}
function resetToNow(){
  appState.currentHour=getNowHour();
  appState.isLiveMode=true;
  document.getElementById("time-slider").value=String(appState.currentHour);
  syncLiveModeUI();
  renderDashboard();
}
function syncLiveModeUI(){
  const liveBtn=document.getElementById("btn-live");
  if(!liveBtn) return;
  if(appState.isLiveMode){
    liveBtn.textContent="라이브 ON";
    liveBtn.classList.add("active");
    liveBtn.disabled=true;
  }else{
    liveBtn.textContent="라이브 복귀";
    liveBtn.classList.remove("active");
    liveBtn.disabled=false;
  }
}

function startClockTicker(){
  if(clockTicker) clearInterval(clockTicker);
  clockTicker=setInterval(()=>{
    if(!appState.currentUser) return;
    if(appState.isLiveMode){
      appState.currentHour=getNowHour();
      const slider=document.getElementById("time-slider");
      if(slider) slider.value=String(appState.currentHour);
      renderDashboard();
      renderMobileShell();
      return;
    }
    updateTimelineIndicators(document.getElementById("timeline-body"));
    updateTimelineIndicators(document.getElementById("day-timeline"));
    renderMobileShell();
  },10000);
}

function renderAll(){
  renderLocationOptions();
  renderPurposeOptions(appState.bookingTarget?.id);
  renderDateLabels();
  renderDashboard();
  renderSchedule();
  renderCalendar();
  renderManualPublic();
  renderAdmin();
  renderMobileShell();
}

function getDashboardSummaryStats(){
  const date=getViewDate();
  const currentHour=appState.currentHour;
  let running=0;
  let upcoming=0;
  for(const id of bscIds){
    const active=getCurrentBooking(id);
    if(active && active.status==="confirmed" && active.user!=="System"){
      running+=1;
    }
    const nextBookings=getBookingsForDate(id,date).filter(b=>
      b.status==="confirmed" &&
      b.user!=="System" &&
      b.start>currentHour
    );
    upcoming+=nextBookings.length;
  }
  const total=bscIds.length;
  const utilization=total ? Math.round((running/total)*100) : 0;
  return {
    total,
    running,
    upcoming,
    utilization
  };
}

function renderDashboardSummary(){
  const container=document.getElementById("dashboard-summary");
  if(!container) return;
  const stats=getDashboardSummaryStats();
  container.innerHTML=
    `<div class="summary-item"><div class="summary-label">전체 장비</div><div class="summary-value">${stats.total}</div><div class="summary-sub">등록 장비 수</div></div>`+
    `<div class="summary-item"><div class="summary-label">가동중</div><div class="summary-value">${stats.running}</div><div class="summary-sub">현재 시각 기준</div></div>`+
    `<div class="summary-item"><div class="summary-label">가동률</div><div class="summary-value">${stats.utilization}%</div><div class="summary-sub">${stats.running}/${stats.total}대</div></div>`+
    `<div class="summary-item"><div class="summary-label">예약 예정</div><div class="summary-value">${stats.upcoming}</div><div class="summary-sub">${formatDateLabel(getViewDate())}</div></div>`;
}

function renderDashboardLegend(){
  const container=document.getElementById("dashboard-legend");
  if(!container) return;
  container.innerHTML=getDashboardLegendItems()
    .map(item=>`<span class="legend-chip"><span class="legend-swatch" style="background:${item.color}"></span>${item.label}</span>`)
    .join("");
}

function renderDateLabels(){
  const label=formatDateLabel(getViewDate());
  document.getElementById("reservation-date-label").textContent=label;
  const modeLabel=appState.isLiveMode ? "라이브" : "조회";
  document.getElementById("timeline-date-label").textContent=`${label} · ${modeLabel} ${formatTime(appState.currentHour)}`;
  const detailLabel=document.getElementById("detail-date-label");
  if(detailLabel) detailLabel.textContent=label;
}

function renderDashboard(){
  renderDashboardSummary();
  renderDashboardLegend();
  renderDashboardMobileView();
  renderTimeLabels();
  renderMap();
  renderTimeline(document.getElementById("timeline-body"),getViewDate());
  renderSelectionDetailPanel();
  rebuildFocusCache();
  applyMachineFocus();
  renderMobileShell();
}

function renderTimeLabels(){
  const time=formatTime(appState.currentHour);
  const prefix=appState.isLiveMode ? "현재 시각" : "조회 시각";
  document.getElementById("map-time-label").textContent=`${prefix}: ${time}`;
  document.getElementById("time-slider-label").textContent=time;
  syncLiveModeUI();
}
function renderMap(){
  ensureSiteRoomState();
  const tree=document.getElementById("map-site-list");
  const canvas=document.getElementById("map-canvas");
  const titleEl=document.getElementById("map-canvas-title");
  const subtitleEl=document.getElementById("map-canvas-subtitle");
  const actionWrap=document.getElementById("map-canvas-actions");
  const editBtn=document.getElementById("btn-map-layout-toggle");
  const cancelBtn=document.getElementById("btn-map-layout-cancel");
  const saveBtn=document.getElementById("btn-map-layout-save");
  const searchInput=document.getElementById("map-search");
  if(!tree || !canvas) return;

  const query=(appState.map.searchText || "").trim().toLowerCase();
  if(searchInput && searchInput.value !== appState.map.searchText){
    searchInput.value=appState.map.searchText;
  }
  const activeSites=getActiveSites();
  if(!activeSites.length){
    tree.innerHTML='<p class="map-empty-text">활성 Site가 없습니다.</p>';
    canvas.innerHTML='<p class="map-empty-text">표시할 Room이 없습니다.</p>';
    if(titleEl) titleEl.textContent="Room 배치";
    if(subtitleEl) subtitleEl.textContent="";
    return;
  }

  const selectedSite=activeSites.find(site=>site.id===appState.map.selectedSiteId) || activeSites[0];
  appState.map.selectedSiteId=selectedSite.id;
  const siteRooms=getRoomsBySite(selectedSite.id);
  const selectedRoom=siteRooms.find(room=>room.id===appState.map.selectedRoomId) || null;
  appState.map.selectedRoomId=selectedRoom?.id || null;
  if(appState.map.selectedMachineId && !bscIds.includes(appState.map.selectedMachineId)){
    appState.map.selectedMachineId=null;
  }
  const canEdit=Boolean(canEditMapLayout() && selectedSite?.id);
  if(appState.map.layoutEditMode && !canEdit){
    stopMapLayoutEditMode(true);
  }
  if(searchInput){
    searchInput.disabled=appState.map.layoutEditMode;
  }
  if(actionWrap){
    actionWrap.hidden=!canEdit;
  }
  if(editBtn){
    editBtn.textContent=appState.map.layoutEditMode ? "편집 종료" : "배치 편집";
  }
  if(cancelBtn){
    cancelBtn.hidden=!appState.map.layoutEditMode;
  }
  if(saveBtn){
    saveBtn.hidden=!appState.map.layoutEditMode;
    saveBtn.disabled=!appState.map.layoutDirty;
  }
  canvas.classList.toggle("layout-edit-mode",appState.map.layoutEditMode);

  tree.innerHTML="";
  const forceExpandBySearch=!!query;
  for(const site of activeSites){
    const roomsBySite=getRoomsBySite(site.id);
    const roomRows=roomsBySite.map(room=>{
      const machineIds=getMachinesByRoomId(room.id);
      const matchedMachineIds=getMatchedRoomMachineIds(room,machineIds,query,site);
      const roomMatched=!query || matchedMachineIds.length>0 || String(room.name||"").toLowerCase().includes(query) || String(site.name||"").toLowerCase().includes(query);
      return { room, machineIds, matchedMachineIds, roomMatched };
    }).filter(row=>row.roomMatched);
    if(query && !roomRows.length && !String(site.name||"").toLowerCase().includes(query)){
      continue;
    }

    const siteMachineTotal=roomsBySite.reduce((sum,room)=>sum+getMachinesByRoomId(room.id).length,0);
    const siteBlock=document.createElement("section");
    siteBlock.className="map-site-block";

    const siteExpanded=forceExpandBySearch || appState.map.expandedSiteIds.has(site.id);
    const siteBtn=document.createElement("button");
    siteBtn.type="button";
    siteBtn.className=`map-site-btn ${site.id===appState.map.selectedSiteId?"active":""}`;
    siteBtn.innerHTML=
      `<span class="tree-node-main"><span class="tree-node-toggle">${siteExpanded?"▾":"▸"}</span><span class="tree-node-label">${site.name}</span></span>`+
      `<span class="tree-node-meta">${siteMachineTotal}대</span>`;
    siteBtn.addEventListener("click",()=>{
      appState.map.selectedSiteId=site.id;
      appState.map.selectedMachineId=null;
      if(forceExpandBySearch){
        renderMap();
        renderSelectionDetailPanel();
        clearMachineFocusState();
        return;
      }
      const expanded=toggleSiteTreeExpand(site.id);
      if(!expanded){
        appState.map.selectedRoomId=null;
      }
      renderMap();
      renderSelectionDetailPanel();
      clearMachineFocusState();
    });
    siteBlock.appendChild(siteBtn);

    if(siteExpanded){
      const roomList=document.createElement("div");
      roomList.className="map-room-list";
      for(const row of roomRows){
        const room=row.room;
        const machineIds=row.machineIds;
        const roomExpanded=forceExpandBySearch || appState.map.expandedRoomIds.has(room.id);
        const runningCount=machineIds.filter(id=>isMachineRunning(id)).length;

        const roomBtn=document.createElement("button");
        roomBtn.type="button";
        roomBtn.className=`map-room-btn ${room.id===appState.map.selectedRoomId?"active":""}`;
        roomBtn.innerHTML=
          `<span class="tree-node-main"><span class="tree-node-toggle">${roomExpanded?"▾":"▸"}</span><span class="tree-node-label">${room.name}</span></span>`+
          `<span class="tree-node-meta">${machineIds.length}대 / 가동 ${runningCount}대</span>`;
        roomBtn.addEventListener("click",event=>{
          event.stopPropagation();
          appState.map.selectedSiteId=site.id;
          let expanded=true;
          if(!forceExpandBySearch){
            expanded=toggleRoomTreeExpand(room.id);
          }
          if(expanded){
            appState.map.selectedRoomId=room.id;
            appState.map.selectedMachineId=null;
          }else{
            appState.map.selectedRoomId=null;
            appState.map.selectedMachineId=null;
          }
          renderMap();
          renderSelectionDetailPanel();
        });
        roomList.appendChild(roomBtn);

        if(roomExpanded){
          const machineList=document.createElement("div");
          machineList.className="map-machine-list";
          const machineRows=query ? row.matchedMachineIds : machineIds;
          machineRows.forEach(id=>{
            const booking=getCurrentBooking(id);
            const statusLabel=booking ? (booking.user==="System" ? "소독" : getPurposeMeta(booking.purpose).label) : "사용 가능";
            const machineBtn=document.createElement("button");
            machineBtn.type="button";
            machineBtn.className=`map-machine-node ${appState.map.selectedMachineId===id?"active":""}`;
            machineBtn.innerHTML=
              `<span class="tree-node-main"><span class="tree-node-dot"></span><span class="tree-node-label">${id}</span></span>`+
              `<span class="tree-node-meta">${statusLabel}</span>`;
            machineBtn.addEventListener("click",event=>{
              event.stopPropagation();
              selectMachineInMap(id,true);
            });
            machineList.appendChild(machineBtn);
          });
          if(!machineRows.length){
            const empty=document.createElement("p");
            empty.className="map-empty-text";
            empty.textContent="표시할 장비가 없습니다.";
            machineList.appendChild(empty);
          }
          roomList.appendChild(machineList);
        }
      }
      if(!roomList.childElementCount){
        const empty=document.createElement("p");
        empty.className="map-empty-text";
        empty.textContent="조건에 맞는 Room이 없습니다.";
        roomList.appendChild(empty);
      }
      siteBlock.appendChild(roomList);
    }
    tree.appendChild(siteBlock);
  }
  if(!tree.childElementCount){
    tree.innerHTML='<p class="map-empty-text">검색 조건에 맞는 Site/Room이 없습니다.</p>';
  }

  canvas.innerHTML="";
  if(titleEl) titleEl.textContent=selectedSite.name;
  if(subtitleEl){
    const totalRooms=getRoomsBySite(selectedSite.id).length;
    subtitleEl.textContent=appState.map.layoutEditMode ? `Room ${totalRooms}개 · 배치 편집중` : `Room ${totalRooms}개`;
  }
  const visibleRooms=getRoomsBySite(selectedSite.id).filter(room=>{
    const ids=getMachinesByRoomId(room.id);
    const matched=getMatchedRoomMachineIds(room,ids,query,selectedSite);
    if(!query) return true;
    if(String(room.name).toLowerCase().includes(query) || String(selectedSite.name).toLowerCase().includes(query)) return true;
    return matched.length>0;
  });
  if(!visibleRooms.length){
    canvas.innerHTML='<p class="map-empty-text">검색 조건에 맞는 Room이 없습니다.</p>';
    return;
  }
  visibleRooms.forEach((room,index)=>{
    const layout=getRoomLayoutForRender(room.id);
    const box=document.createElement("section");
    box.className=`map-room-box ${room.id===appState.map.selectedRoomId?"selected":""} ${appState.map.layoutEditMode?"editable":""}`;
    box.style.left=`${layout.x}%`;
    box.style.top=`${layout.y}%`;
    box.style.width=`${layout.w}%`;
    box.style.height=`${layout.h}%`;
    box.dataset.roomId=room.id;
    const allMachineIds=getMachinesByRoomId(room.id);
    const machineIds=getMatchedRoomMachineIds(room,allMachineIds,query,selectedSite);
    const runningCount=machineIds.filter(id=>isMachineRunning(id)).length;
    box.innerHTML=`<header><strong>${room.name}</strong><span>${machineIds.length}대 / 가동 ${runningCount}대</span></header>`;
    box.addEventListener("click",()=>{
      appState.map.selectedSiteId=room.siteId;
      appState.map.selectedRoomId=room.id;
      appState.map.selectedMachineId=null;
      expandTreePathForRoom(room.siteId,room.id);
      renderMap();
      renderSelectionDetailPanel();
    });
    if(appState.map.layoutEditMode){
      box.addEventListener("mousedown",event=>{
        if(event.button!==0) return;
        if(event.target.closest(".map-room-resize-handle")) return;
        beginMapRoomLayoutDrag(event,room.id,"move");
      });
    }

    const machineWrap=document.createElement("div");
    machineWrap.className="map-room-machines";
    const revealMachines=appState.map.layoutEditMode || !!query || room.id===appState.map.selectedRoomId;
    const fallbackIds=!machineIds.length && !query ? allMachineIds : machineIds;
    if(revealMachines){
      fallbackIds.forEach(id=>{
        const booking=getCurrentBooking(id);
        const meta=getTileMeta(booking);
        const button=document.createElement("button");
        button.type="button";
        button.className=`map-machine-chip ${meta.tile} ${appState.map.selectedMachineId===id?"selected":""}`;
        button.dataset.machineId=id;
        button.textContent=id;
        button.title=getBookingTooltipText(booking) || `${id}: 사용 가능`;
        button.addEventListener("click",event=>{
          event.stopPropagation();
          handleTileClick(id);
        });
        button.addEventListener("mouseenter",()=>setMachineFocus(id,true));
        button.addEventListener("mouseleave",()=>setMachineFocus(null,false));
        button.addEventListener("mousemove",e=>showTooltip(e,id,booking));
        button.addEventListener("mouseleave",hideTooltip);
        machineWrap.appendChild(button);
      });
    }
    if(appState.map.layoutEditMode){
      machineWrap.classList.add("disabled");
    }
    if(!machineWrap.childElementCount){
      const empty=document.createElement("span");
      empty.className="map-empty-inline";
      empty.textContent=revealMachines ? "표시할 장비 없음" : "Room 클릭 시 장비 표시";
      machineWrap.appendChild(empty);
    }
    if(appState.map.layoutEditMode){
      const coord=document.createElement("span");
      coord.className="map-room-coord";
      coord.textContent=`x:${Math.round(layout.x)} y:${Math.round(layout.y)} w:${Math.round(layout.w)} h:${Math.round(layout.h)}`;
      box.appendChild(coord);
      const handle=document.createElement("button");
      handle.type="button";
      handle.className="map-room-resize-handle";
      handle.setAttribute("aria-label","Room 크기 조절");
      handle.addEventListener("mousedown",event=>{
        if(event.button!==0) return;
        beginMapRoomLayoutDrag(event,room.id,"resize");
      });
      box.appendChild(handle);
    }
    box.appendChild(machineWrap);
    canvas.appendChild(box);
  });
  updateMapLayoutValidationUI(selectedSite.id);
}

function getMatchedRoomMachineIds(room,machineIds,query,site){
  if(!query) return [...machineIds];
  const roomMatch=String(room.name||"").toLowerCase().includes(query);
  const siteMatch=String(site?.name||"").toLowerCase().includes(query);
  if(roomMatch || siteMatch) return [...machineIds];
  return machineIds.filter(id=>{
    const haystack=`${id} ${getMachineMgmtNo(id)} ${getMachineDesc(id)}`.toLowerCase();
    return haystack.includes(query);
  });
}

function isMachineRunning(machineId){
  const booking=getCurrentBooking(machineId);
  return !!(booking && booking.status==="confirmed" && booking.user!=="System");
}

function getTileMeta(booking){
  if(!booking) return {tile:statusMeta.free.tile,labelText:statusMeta.free.label};
  if(booking.status==="pending") return {tile:statusMeta.pending.tile,labelText:`${statusMeta.pending.label} · ${booking.user}`};
  if(booking.user==="System") return {tile:statusMeta.system.tile,labelText:statusMeta.system.label};
  const meta=getPurposeMeta(booking.purpose);
  return {tile:meta.tile,labelText:`${meta.label} · ${booking.user}`};
}

function handleTileClick(id){
  selectMachineInMap(id,true);
}

function selectMachineInMap(machineId,focus=true){
  const room=getMachineRoom(machineId);
  if(room){
    appState.map.selectedSiteId=room.siteId;
    appState.map.selectedRoomId=room.id;
    expandTreePathForRoom(room.siteId,room.id);
  }
  appState.map.selectedMachineId=machineId;
  if(focus){
    setMachineFocus(machineId,true);
  }
  renderMap();
  renderSelectionDetailPanel();
}

function getRoomSummary(roomId){
  const machineIds=getMachinesByRoomId(roomId);
  const date=getViewDate();
  const hour=appState.currentHour;
  const running=machineIds.filter(id=>isMachineRunning(id)).length;
  let upcoming=0;
  for(const id of machineIds){
    upcoming+=getBookingsForDate(id,date).filter(b=>b.status==="confirmed" && b.user!=="System" && b.start>hour).length;
  }
  let nextAvailable=null;
  for(let slot=Math.ceil(hour*2)/2; slot<18; slot+=0.5){
    const hasFree=machineIds.some(id=>!isMachineBusyAt(id,date,slot));
    if(hasFree){
      nextAvailable=slot;
      break;
    }
  }
  return { machineCount: machineIds.length, running, upcoming, nextAvailable, machineIds };
}

function renderSelectionDetailPanel(){
  const body=document.getElementById("detail-panel-body");
  if(!body) return;
  ensureSiteRoomState();
  const machineId=appState.map.selectedMachineId;
  const roomId=appState.map.selectedRoomId;
  if(machineId && bscIds.includes(machineId)){
    const booking=getCurrentBooking(machineId);
    const room=getMachineRoom(machineId);
    const site=getMachineSite(machineId);
    const availability=getMachineAvailabilityHint(machineId,getViewDate(),appState.currentHour);
    const bookingText=booking
      ? `${booking.user} · ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`
      : "현재 예약 없음";
    const purposeText=booking
      ? (booking.user==="System" ? "자동 소독" : getPurposeMeta(booking.purpose).label)
      : "사용 가능";
    body.innerHTML=
      `<div class="detail-section">`+
      `<h4>${machineId}</h4>`+
      `<p><strong>위치:</strong> ${site ? site.name : "-"} / ${room ? room.name : "-"}</p>`+
      `<p><strong>관리번호:</strong> ${getMachineMgmtNo(machineId) || "-"}</p>`+
      `<p><strong>설명:</strong> ${getMachineDesc(machineId) || "-"}</p>`+
      `<p><strong>현재 상태:</strong> ${purposeText}</p>`+
      `<p><strong>현재 예약:</strong> ${bookingText}</p>`+
      `<p><strong>다음 가능:</strong> ${availability.text}</p>`+
      `</div>`;
    return;
  }
  if(roomId){
    const room=getRoomById(roomId);
    const site=room ? getSiteById(room.siteId) : null;
    const summary=getRoomSummary(roomId);
    const nextText=summary.nextAvailable===null ? "당일 추가 가능 시간 없음" : `${formatTime(summary.nextAvailable)}부터 가능`;
    body.innerHTML=
      `<div class="detail-section">`+
      `<h4>${room ? room.name : "Room"}</h4>`+
      `<p><strong>Site:</strong> ${site ? site.name : "-"}</p>`+
      `<p><strong>장비 수:</strong> ${summary.machineCount}대</p>`+
      `<p><strong>가동 중:</strong> ${summary.running}대</p>`+
      `<p><strong>예약 예정:</strong> ${summary.upcoming}건</p>`+
      `<p><strong>다음 빈 슬롯:</strong> ${nextText}</p>`+
      `</div>`+
      `<div class="detail-machine-list">`+
      summary.machineIds.map(id=>{
        const booking=getCurrentBooking(id);
        const badge=booking ? (booking.user==="System" ? "소독" : getPurposeMeta(booking.purpose).label) : "사용 가능";
        return `<button type="button" class="detail-machine-btn ${appState.map.selectedMachineId===id?"active":""}" data-detail-machine="${id}" data-machine-id="${id}">${id}<span>${badge}</span></button>`;
      }).join("")+
      `</div>`;
    return;
  }
  if(appState.map.selectedSiteId){
    const site=getSiteById(appState.map.selectedSiteId);
    const siteRooms=getRoomsBySite(appState.map.selectedSiteId);
    const machineCount=siteRooms.reduce((sum,room)=>sum+getMachinesByRoomId(room.id).length,0);
    const runningCount=siteRooms.reduce((sum,room)=>sum+getMachinesByRoomId(room.id).filter(id=>isMachineRunning(id)).length,0);
    body.innerHTML=
      `<div class="detail-section">`+
      `<h4>${site ? site.name : "Site"}</h4>`+
      `<p><strong>Room 수:</strong> ${siteRooms.length}개</p>`+
      `<p><strong>장비 수:</strong> ${machineCount}대</p>`+
      `<p><strong>가동 중:</strong> ${runningCount}대</p>`+
      `<p><strong>안내:</strong> 좌측에서 Room을 열어 장비를 선택하세요.</p>`+
      `</div>`;
    return;
  }
  body.innerHTML='<p class="detail-empty">좌측 트리에서 Site/Room 또는 장비를 선택하세요.</p>';
}

function showTooltip(event,id,booking){
  const tooltip=document.getElementById("map-tooltip");
  const wrapper=document.getElementById("map-wrapper");
  const rect=wrapper.getBoundingClientRect();
  tooltip.style.display="block";
  tooltip.style.left=`${event.clientX-rect.left+14}px`;
  tooltip.style.top=`${event.clientY-rect.top+14}px`;
  tooltip.textContent=booking?`${id}: ${booking.user} · ${booking.status==="pending"?"승인 대기":getPurposeMeta(booking.purpose).label}`:`${id}: 사용 가능`;
}
function hideTooltip(){document.getElementById("map-tooltip").style.display="none";}
function getBookingTooltipText(booking){
  if(!booking) return "";
  return `예약자: ${booking.user}\n사용시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`;
}

function isMachineBusyAt(id,date,hour){
  return getBookingsForDate(id,date).some(booking=>booking.start<=hour && hour<(booking.start+booking.duration));
}

function formatWaitText(diffHour){
  const rounded=Math.max(0,Math.round(diffHour*2)/2);
  if(rounded===0) return "지금";
  const minutes=Math.round(rounded*60);
  if(minutes<60) return `${minutes}분 후`;
  const h=Math.floor(minutes/60);
  const m=minutes%60;
  if(m===0) return `${h}시간 후`;
  return `${h}시간 ${m}분 후`;
}

function getMachineAvailabilityHint(id,date,referenceHour){
  const hour=clampHour(referenceHour);
  if(!isMachineBusyAt(id,date,hour)){
    if(date===todayISO()) return { busy:false, text:"지금 사용 가능" };
    return { busy:false, text:`${formatTime(hour)}부터 사용 가능` };
  }
  const nextStart=findFirstAvailableStart(id,date,hour+0.5);
  if(nextStart===null){
    return { busy:true, text:"당일 추가 사용 가능 시간이 없습니다." };
  }
  const wait=Math.max(0,nextStart-hour);
  return { busy:true, text:`${formatTime(nextStart)}부터 가능 (${formatWaitText(wait)})` };
}

function createTimelineIndicator(type){
  const indicator=document.createElement("div");
  indicator.className=`time-indicator ${type}`;
  const label=document.createElement("span");
  label.className="time-indicator-label";
  indicator.appendChild(label);
  return indicator;
}

function createTimelineShade(type){
  const shade=document.createElement("div");
  shade.className=`timeline-shade ${type}`;
  return shade;
}

function getTimelineTrackMetrics(container){
  if(!container) return null;
  const firstTrack=container.querySelector(".tl-track");
  if(!firstTrack) return null;
  const start=firstTrack.offsetLeft;
  const width=firstTrack.clientWidth;
  return { start, width, end: start + width };
}

function setTimelineIndicatorPosition(container,selector,hour){
  if(!container) return;
  const indicator=container.querySelector(selector);
  const metrics=getTimelineTrackMetrics(container);
  if(!indicator||!metrics) return;
  const ratio=(clampHour(hour)-9)/9;
  const left=metrics.start+(metrics.width*ratio);
  indicator.style.left=`${left}px`;
}

function updateTimelineShading(container){
  if(!container) return;
  const metrics=getTimelineTrackMetrics(container);
  const pastShade=container.querySelector(".timeline-shade.past");
  if(!metrics||!pastShade) return;
  const ratio=(getNowHour()-9)/9;
  const splitX=metrics.start+(metrics.width*ratio);
  pastShade.style.left=`${metrics.start}px`;
  pastShade.style.width=`${Math.max(0,splitX-metrics.start)}px`;
}

function resolveTimelineLabelCollisions(container){
  if(!container) return;
  const indicators=Array.from(container.querySelectorAll(".time-indicator:not(.hidden)"));
  indicators.sort((a,b)=>parseFloat(a.style.left||"0")-parseFloat(b.style.left||"0"));
  const laneLastRight=[];
  indicators.forEach(indicator=>{
    const label=indicator.querySelector(".time-indicator-label");
    if(!label) return;
    const centerX=parseFloat(indicator.style.left||"0");
    const width=Math.max(42,label.offsetWidth||0);
    let lane=0;
    while(true){
      const lastRight=laneLastRight[lane];
      if(lastRight===undefined || (centerX-(width/2))>(lastRight+8)) break;
      lane+=1;
    }
    label.style.top=`${2+(lane*15)}px`;
    laneLastRight[lane]=centerX+(width/2);
  });
}

function getTimelineHourFromPointer(container,clientX){
  const metrics=getTimelineTrackMetrics(container);
  if(!metrics) return null;
  const rect=container.getBoundingClientRect();
  const x=clientX-rect.left;
  if(x<metrics.start||x>metrics.end) return null;
  const ratio=(x-metrics.start)/metrics.width;
  return clampHour(9+(ratio*9));
}

function setTimelineHoverIndicator(container,hour){
  if(!container) return;
  const hoverIndicator=container.querySelector(".time-indicator.hover");
  if(!hoverIndicator) return;
  if(hour===null){
    hoverIndicator.classList.add("hidden");
    resolveTimelineLabelCollisions(container);
    return;
  }
  hoverIndicator.classList.remove("hidden");
  setTimelineIndicatorPosition(container,".time-indicator.hover",hour);
  const label=hoverIndicator.querySelector(".time-indicator-label");
  if(label) label.textContent=`가이드 ${formatTime(hour)}`;
  resolveTimelineLabelCollisions(container);
}

function handleTimelineHoverMove(event){
  const container=event.currentTarget;
  if(!container) return;
  const hour=getTimelineHourFromPointer(container,event.clientX);
  setTimelineHoverIndicator(container,hour);
}

function handleTimelineHoverLeave(event){
  const container=event.currentTarget;
  if(!container) return;
  setTimelineHoverIndicator(container,null);
}

function handleTimelineSelectClick(event){
  const container=event.currentTarget;
  if(!container) return;
  if(event.target.closest(".tl-bar")) return;
  if(event.target.closest(".time-indicator-label")) return;
  const hour=getTimelineHourFromPointer(container,event.clientX);
  if(hour===null) return;
  updateTimeFromSlider(hour);
}

function updateTimelineIndicators(container){
  if(!container) return;
  const nowHour=getNowHour();
  const selectedHour=appState.currentHour;
  const nowIndicator=container.querySelector(".time-indicator.now");
  const selectedIndicator=container.querySelector(".time-indicator.selected");
  updateTimelineShading(container);
  if(nowIndicator){
    setTimelineIndicatorPosition(container,".time-indicator.now",nowHour);
    const nowLabel=nowIndicator.querySelector(".time-indicator-label");
    if(nowLabel) nowLabel.textContent=`현재 ${formatTime(nowHour)}`;
  }
  if(selectedIndicator){
    const showSelected=!appState.isLiveMode && Math.abs(selectedHour-nowHour)>=(1/120);
    selectedIndicator.classList.toggle("hidden",!showSelected);
    if(showSelected){
      setTimelineIndicatorPosition(container,".time-indicator.selected",selectedHour);
      const selectedLabel=selectedIndicator.querySelector(".time-indicator-label");
      if(selectedLabel) selectedLabel.textContent=`조회 ${formatTime(selectedHour)}`;
    }
  }
  resolveTimelineLabelCollisions(container);
}

function renderTimeline(container,date){
  container.innerHTML="";
  const content=document.createElement("div");
  content.className="timeline-content";
  content.appendChild(createTimelineShade("past"));
  for(const id of getTimelineMachineIds()){
    const row=document.createElement("div");row.className="timeline-row";
    row.dataset.machineId=id;
    const label=document.createElement("div");label.className="tl-label";label.textContent=id;
    const track=document.createElement("div");track.className="tl-track";
    for(let i=0;i<9;i+=1){const line=document.createElement("div");line.className="tl-track-line";line.style.left=`${(i/9)*100}%`;track.appendChild(line);} 
    for(const booking of getBookingsForDate(id,date)){
      const bar=document.createElement("div");
      const width=(booking.duration/9)*100;const left=((booking.start-9)/9)*100;
      bar.className=`tl-bar ${booking.status==="pending"?"pending":""}`.trim();
      bar.style.width=`${width}%`;bar.style.left=`${left}%`;
      bar.title=getBookingTooltipText(booking);
      bar.dataset.machineId=id;
      if(booking.status!=="pending") bar.style.background=booking.user==="System"?statusMeta.system.color:getPurposeMeta(booking.purpose).color;
      bar.textContent=booking.status==="pending"?`${booking.user} (대기)`:booking.user;
      bar.addEventListener("click",event=>{
        event.stopPropagation();
        selectMachineInMap(id,true);
      });
      track.appendChild(bar);
    }
    row.addEventListener("mouseenter",()=>{
      setMachineFocus(id,true);
      selectMachineInMap(id,false);
    });
    row.addEventListener("mouseleave",()=>setMachineFocus(null,false));
    row.addEventListener("click",event=>{
      event.stopPropagation();
      selectMachineInMap(id,true);
    });
    row.appendChild(label);row.appendChild(track);content.appendChild(row);
  }
  const selectedIndicator=createTimelineIndicator("selected");
  const nowIndicator=createTimelineIndicator("now");
  const hoverIndicator=createTimelineIndicator("hover");
  hoverIndicator.classList.add("hidden");
  content.appendChild(selectedIndicator);
  content.appendChild(nowIndicator);
  content.appendChild(hoverIndicator);
  container.appendChild(content);
  updateTimelineIndicators(container);
}

function renderStatusList(){
  const list=document.getElementById("status-list");
  if(!list) return;
  list.innerHTML="";
  const showAvailabilityHint=isWorkerMobileMode();
  const statusDate=getViewDate();
  const statusHour=appState.currentHour;
  for(const id of bscIds){
    const booking=getCurrentBooking(id);
    const meta=getStatusMeta(booking);
    const availability=showAvailabilityHint ? getMachineAvailabilityHint(id,statusDate,statusHour) : null;
    const item=document.createElement("div");item.className="status-item";item.style.borderLeftColor=meta.color;
    item.dataset.machineId=id;
    item.innerHTML=`<div class="status-icon" style="color:${meta.color}">●</div><div class="status-info"><div class="status-id">${id}</div><div class="status-text">${meta.text}</div>${availability?`<div class="status-next">${availability.text}</div>`:""}</div><div class="status-badge" style="background:${meta.color}">${meta.label}</div>`;
    item.addEventListener("mouseenter",()=>setMachineFocus(id,true));
    item.addEventListener("mouseleave",()=>setMachineFocus(null,false));
    list.appendChild(item);
  }
}

function getStatusMeta(booking){
  if(!booking) return {color:statusMeta.free.color,label:statusMeta.free.label,text:"대기 중"};
  if(booking.status==="pending") return {color:statusMeta.pending.color,label:statusMeta.pending.label,text:`${booking.user} (승인 대기)`};
  if(booking.user==="System") return {color:statusMeta.system.color,label:statusMeta.system.label,text:"시스템 소독"};
  const meta=getPurposeMeta(booking.purpose);
  return {color:meta.color,label:meta.label,text:`${booking.user} 작업 중`};
}

function renderChart(){
  const counts={free:0};
  purposeList.forEach(p=>{counts[p.key]=0;});
  for(const id of bscIds){
    const booking=getCurrentBooking(id);
    if(booking&&booking.user!=="System"){
      const key = counts[booking.purpose] !== undefined ? booking.purpose : "other";
      if(counts[key] === undefined) counts[key]=0;
      counts[key]+=1;
    } else if(!booking) counts.free+=1;
  }
  const total=bscIds.length;
  const svg=document.getElementById("donut-chart");
  const legend=document.getElementById("chart-legend");
  if(!svg || !legend) return;
  svg.innerHTML="";legend.innerHTML="";
  let startAngle=0;
  for(const key of Object.keys(counts)){
    if(counts[key]===0) continue;
    const percent=(counts[key]/total)*100;
    const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");
    circle.setAttribute("cx","21");circle.setAttribute("cy","21");circle.setAttribute("r","15.9155");
    circle.setAttribute("fill","transparent");circle.setAttribute("stroke-width","5");
    const meta = key==="free" ? statusMeta.free : getPurposeMeta(key);
    circle.setAttribute("stroke",meta.color);
    circle.setAttribute("stroke-dasharray",`${percent} ${100-percent}`);
    circle.setAttribute("stroke-dashoffset",String(25-startAngle));
    svg.appendChild(circle);
    const legendItem=document.createElement("div");legendItem.className="legend-item";
    legendItem.innerHTML=`<span class="legend-dot" style="background:${meta.color}"></span><span>${meta.label} (${counts[key]}대)</span>`;
    legend.appendChild(legendItem);
    startAngle+=percent;
  }
  const label=document.createElementNS("http://www.w3.org/2000/svg","text");
  label.setAttribute("x","50%");label.setAttribute("y","50%");label.setAttribute("text-anchor","middle");label.setAttribute("dominant-baseline","middle");
  label.setAttribute("font-size","6");label.setAttribute("font-weight","900");label.setAttribute("fill","#2c3e50");
  label.textContent=`${Math.round(((total-counts.free)/total)*100)}%`;
  svg.appendChild(label);
}

function renderScheduleFilterControls(){
  const locationSelect=document.getElementById("schedule-location-filter");
  if(locationSelect){
    const current=locationSelect.value||"all";
    const options=['<option value="all">전체 장소</option>', ...locations.map(loc=>`<option value="${loc}">${loc}</option>`)];
    locationSelect.innerHTML=options.join("");
    locationSelect.value=locations.includes(current)?current:"all";
  }
  const isCompactMobile=isMobileViewport();
  const machineSearch=document.getElementById("schedule-machine-search");
  const machineFilter=machineSearch?.closest(".schedule-filter");
  const resetBtn=document.getElementById("btn-schedule-filter-reset");
  if(machineFilter) machineFilter.hidden=isCompactMobile;
  if(resetBtn) resetBtn.hidden=isCompactMobile;
  if(machineSearch){
    machineSearch.disabled=isCompactMobile;
    if(isCompactMobile) machineSearch.value="";
  }
  const myOnly=document.getElementById("schedule-my-only");
  if(myOnly){
    const isGuest=appState.currentUser?.role==="guest";
    myOnly.disabled=isGuest;
    if(isGuest) myOnly.checked=false;
  }
}

function getScheduleFilterState(){
  return {
    location: document.getElementById("schedule-location-filter")?.value || "all",
    keyword: isMobileViewport() ? "" : (document.getElementById("schedule-machine-search")?.value || "").trim().toLowerCase(),
    mineOnly: !!document.getElementById("schedule-my-only")?.checked
  };
}

function resetScheduleFilters(){
  const locationSelect=document.getElementById("schedule-location-filter");
  const machineSearch=document.getElementById("schedule-machine-search");
  const mineOnly=document.getElementById("schedule-my-only");
  if(locationSelect) locationSelect.value="all";
  if(machineSearch) machineSearch.value="";
  if(mineOnly) mineOnly.checked=false;
  renderSchedule();
}

function getFilteredScheduleGroups(date){
  const filter=getScheduleFilterState();
  const groups=[];
  for(const loc of locations){
    if(filter.location!=="all" && filter.location!==loc) continue;
    const ids=bscIds.filter(id=>{
      if(getMachineLocation(id)!==loc) return false;
      const haystack=`${id} ${getMachineMgmtNo(id)} ${getMachineDesc(id)} ${loc}`.toLowerCase();
      if(filter.keyword && !haystack.includes(filter.keyword)) return false;
      if(filter.mineOnly){
        const hasMine=getBookingsForDate(id,date).some(booking=>isBookingMine(booking));
        if(!hasMine) return false;
      }
      return true;
    });
    if(ids.length>0) groups.push({ location: loc, ids });
  }
  return groups;
}

function getDropValidation(booking,targetMachineId,targetHour,docId){
  const canDrag=canDragBooking(booking);
  const minHour=(isWorkerUser() && booking?.date===todayISO()) ? getMinReservableHour(booking.date) : null;
  const overlap=booking ? isOverlap(targetMachineId,booking.date,targetHour,booking.duration,docId) : false;
  return validateBookingDrop({
    booking,
    canDrag,
    targetHour,
    minHour,
    overlap,
    formatTimeFn:formatTime
  });
}

function clearDropCellState(td){
  td.classList.remove("drag-hover","drag-hover-valid","drag-hover-invalid");
  td.removeAttribute("data-drag-reason");
  td.title="";
}

function findFirstAvailableStart(machineId,date,startHour){
  const begin=Math.max(9,snapToHalfHour(startHour));
  for(let h=begin; h<18; h+=0.5){
    if(!isOverlap(machineId,date,h,0.5)) return h;
  }
  return null;
}

function renderScheduleMobile(date,groups){
  const container=document.getElementById("schedule-mobile");
  if(!container) return;
  container.innerHTML="";
  if(groups.length===0){
    container.innerHTML='<div class="schedule-mobile-empty">조건에 맞는 장비가 없습니다.</div>';
    return;
  }
  for(const group of groups){
    const section=document.createElement("section");
    section.className="mobile-location-section";
    section.innerHTML=`<h4 class="mobile-location-title">${group.location} <span>${group.ids.length}대</span></h4>`;
    const list=document.createElement("div");
    list.className="mobile-machine-list";
    const referenceHour=date===todayISO() ? getNowHour() : 9;
    for(const id of group.ids){
      const bookingsForDay=getBookingsForDate(id,date).sort((a,b)=>a.start-b.start);
      const card=document.createElement("article");
      card.className="mobile-machine-card";
      const availability=getMachineAvailabilityHint(id,date,referenceHour);
      const activeBooking=bookingsForDay.find(b=>b.start<=referenceHour && referenceHour<(b.start+b.duration));
      const nextBooking=bookingsForDay.find(b=>b.start>referenceHour) || null;
      const currentText=activeBooking
        ? `${formatTime(activeBooking.start)}-${formatTime(activeBooking.start+activeBooking.duration)} · ${activeBooking.user}`
        : "현재 가동 없음";
      const nextText=nextBooking
        ? `${formatTime(nextBooking.start)} 시작 · ${nextBooking.user}`
        : "다음 예약 없음";
      const windowText=bookingsForDay.length
        ? `${formatTime(bookingsForDay[0].start)}-${formatTime(bookingsForDay[bookingsForDay.length-1].start+bookingsForDay[bookingsForDay.length-1].duration)}`
        : "예약 없음";
      card.innerHTML=`<div class="mobile-machine-head"><strong>${id}</strong><span>${getMachineMgmtNo(id)||"-"}</span></div><div class="mobile-availability ${availability.busy?"busy":"free"}">${availability.text}</div><div class="mobile-machine-brief"><span>현재</span><strong>${currentText}</strong></div><div class="mobile-machine-brief"><span>다음</span><strong>${nextText}</strong></div><div class="mobile-machine-count">오늘 예약 ${bookingsForDay.length}건 · 운영 ${windowText}</div>`;
      if(can("create")){
        const nextStart=findFirstAvailableStart(id,date,getMinReservableHour(date));
        const addBtn=document.createElement("button");
        addBtn.type="button";
        addBtn.className="mobile-add-booking";
        addBtn.textContent=nextStart===null?"예약 불가":"예약 추가";
        addBtn.disabled=nextStart===null;
        if(nextStart!==null) addBtn.addEventListener("click",()=>openBookingModal(id,nextStart));
        card.appendChild(addBtn);
      }
      list.appendChild(card);
    }
    section.appendChild(list);
    container.appendChild(section);
  }
}

function renderSchedule(){
  const tbody=document.getElementById("schedule-body");tbody.innerHTML="";
  const date=getViewDate();
  renderScheduleFilterControls();
  const groups=getFilteredScheduleGroups(date);
  if(groups.length===0){
    const tr=document.createElement("tr");
    tr.innerHTML='<td colspan="19" class="schedule-empty">조건에 맞는 장비/예약이 없습니다.</td>';
    tbody.appendChild(tr);
    renderScheduleMobile(date,groups);
    return;
  }
  for(const group of groups){
    const loc=group.location;
    const ids=group.ids;
    const locRow=document.createElement("tr");
    locRow.className="schedule-location-row";
    const locCell=document.createElement("td");
    locCell.className="schedule-location";
    locCell.colSpan=19;
    locCell.innerHTML=`<span class="schedule-location-name">${loc}</span><span class="schedule-location-count">${ids.length}대</span>`;
    locRow.appendChild(locCell);
    tbody.appendChild(locRow);
    for(const id of ids){
      const tr=document.createElement("tr");
      const nameTd=document.createElement("td");nameTd.className="col-machine";nameTd.textContent=id;tr.appendChild(nameTd);
      for(let i=0;i<18;i+=1){
        const hour=9+i*0.5;
        const booking=getBookingsForDate(id,date).find(b=>b.start===hour);
        if(booking){
          const td=document.createElement("td");td.style.padding="2px";
          const span=booking.duration/0.5;td.colSpan=span;
          const block=document.createElement("div");block.className="booking-block";
          block.title=getBookingTooltipText(booking);
          if(booking.status==="pending"){
            block.classList.add("pending");block.style.backgroundColor=statusMeta.pending.color;
            block.innerHTML=`<span>${booking.user} (대기)</span>`;
          }else if(booking.user==="System"){
            block.style.backgroundColor=statusMeta.system.color;block.innerHTML="<span>소독</span>";
          }else{
            const purposeMeta=getPurposeMeta(booking.purpose);
            block.style.backgroundColor=purposeMeta.color;
            block.innerHTML=`<span>${booking.user}</span><span class="booking-sub">${purposeMeta.label}</span><div class="resize-handle"></div>`;
          }
          if(canEditBooking(booking)){
            block.classList.add("can-edit");
            block.addEventListener("click",event=>{
              if(shouldSkipBookingClick(event)) return;
              openBookingEditModal(id,booking.docId);
            });
          }
          if(canDeleteBooking()){
            const delBtn=document.createElement("button");
            delBtn.type="button";
            delBtn.className="booking-delete";
            delBtn.textContent="삭제";
            delBtn.addEventListener("click",(e)=>{
              e.stopPropagation();
              openDeleteModal(id, booking.docId);
            });
            block.appendChild(delBtn);
          }
          if(canDragBooking(booking)){
            block.draggable=true;
            block.classList.add("can-drag");
            block.addEventListener("dragstart",e=>{
              if(appState.isResizing || appState.resizeIntentLocked){
                e.preventDefault();
                return;
              }
              handleDragStart(e,id,booking.docId);
            });
            block.addEventListener("dragend",handleDragEnd);
            const handle=block.querySelector(".resize-handle");
            if(handle && canResizeBooking(booking)){
              block.classList.add("resizable");
              handle.addEventListener("mousedown",e=>handleResizeStart(e,id,booking.docId,booking.duration,block));
            }
            block.addEventListener("mousedown",e=>{
              if(e.target?.closest(".booking-delete") || e.target?.closest(".resize-handle")) return;
              if(!isResizeIntentTarget(e,block,booking)) return;
              handleResizeStart(e,id,booking.docId,booking.duration,block);
            });
          }else{
            block.style.cursor="default";
            const handle=block.querySelector(".resize-handle");if(handle) handle.style.display="none";
          }
          td.appendChild(block);tr.appendChild(td);i+=span-1;continue;
        }
        const td=document.createElement("td");
        if(canUseScheduleDrop()){
          td.addEventListener("dragover",e=>{
            e.preventDefault();
            td.classList.add("drag-hover");
            const payload=appState.dragPayload;
            if(!payload?.booking){
              clearDropCellState(td);
              return;
            }
            const validation=getDropValidation(payload.booking,id,hour,payload.docId);
            td.classList.toggle("drag-hover-valid",validation.ok);
            td.classList.toggle("drag-hover-invalid",!validation.ok);
            td.setAttribute("data-drag-reason",validation.reason);
            td.title=validation.reason;
          });
          td.addEventListener("dragleave",()=>clearDropCellState(td));
          td.addEventListener("drop",e=>{
            clearDropCellState(td);
            handleDrop(e,id,hour);
          });
        }
        const empty=document.createElement("div");empty.className="empty-slot";
        if(can("create")){
          empty.addEventListener("click",()=>openBookingModal(id,hour));
        }else{
          empty.classList.add("disabled");
        }
        td.appendChild(empty);tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  renderScheduleMobile(date,groups);
}

function handleDragStart(e,machineId,docId){
  if(appState.isResizing || appState.resizeIntentLocked){
    e.preventDefault();
    return;
  }
  const booking=findBookingByDocId(machineId,docId);
  if(!canDragBooking(booking)){
    e.preventDefault();
    return;
  }
  appState.suppressBookingClickUntil=Date.now()+RESIZE_CLICK_GUARD_MS;
  appState.dragPayload={ machineId, docId, booking };
  e.dataTransfer.setData("text", JSON.stringify({machineId,docId}));
  e.dataTransfer.effectAllowed="move";
  e.target.classList.add("dragging");
  document.body.classList.add("is-dragging");
}

function handleDragEnd(e){
  if(e?.target) e.target.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  appState.dragPayload=null;
  appState.resizeIntentLocked=false;
  document.querySelectorAll(".schedule-table td.drag-hover, .schedule-table td.drag-hover-valid, .schedule-table td.drag-hover-invalid").forEach(el=>clearDropCellState(el));
}

function shouldSkipBookingClick(event){
  if(appState.isResizing || appState.resizeIntentLocked) return true;
  if(Date.now()<appState.suppressBookingClickUntil) return true;
  const target=event?.target;
  if(target?.closest(".booking-delete")) return true;
  if(target?.closest(".resize-handle")) return true;
  return false;
}

async function handleDrop(e,targetMachineId,targetHour){
  e.preventDefault();
  if(!canUseScheduleDrop()) return;
  try{
    const payloadRaw=e.dataTransfer.getData("text");
    if(!payloadRaw){
      showToast("드래그 정보가 비어 있습니다.","warn");
      return;
    }
    let payload;
    try{
      payload=JSON.parse(payloadRaw);
    }catch(parseError){
      reportAsyncError("handleDrop:parse", parseError, "드래그 정보를 읽지 못했습니다.");
      return;
    }
    if(!payload || typeof payload.machineId!=="string" || typeof payload.docId!=="string"){
      showToast("유효하지 않은 드래그 데이터입니다.","warn");
      return;
    }
    const sourceMachineId=payload.machineId;
    const docId=payload.docId;
    const booking=findBookingByDocId(sourceMachineId,docId);
    const validation=getDropValidation(booking,targetMachineId,targetHour,docId);
    if(!validation.ok){
      showToast(validation.reason,"warn");
      return;
    }
    const updates={start: targetHour};
    if(targetMachineId!==sourceMachineId) updates.machineId=targetMachineId;
    await updateBookingDoc(docId,updates);
    const movedMachine = targetMachineId!==sourceMachineId;
    showToast(movedMachine ? "예약 장비/시간을 변경했습니다." : "예약 시간을 변경했습니다.","success");
  }catch(error){
    reportAsyncError("handleDrop", error, "예약 이동에 실패했습니다.");
  }
}

function getResizeValidation(booking,machineId,docId,newDuration){
  const overlap=booking ? isOverlap(machineId,booking.date,booking.start,newDuration,docId) : false;
  return validateBookingResize({
    booking,
    newDuration,
    overlap
  });
}

function clearResizePreview(){
  const block=appState.resizeTarget?.blockEl || null;
  if(block){
    block.style.width="";
    block.classList.remove("resizing","resize-invalid");
    block.removeAttribute("data-resize-label");
  }
}

function handleResizeMove(event){
  if(!appState.isResizing||!appState.resizeTarget) return;
  const {id,docId}=appState.resizeTarget;
  const booking=findBookingByDocId(id,docId);
  const block=appState.resizeTarget.blockEl;
  if(!booking || !block){
    appState.resizeValidationOk=false;
    return;
  }
  const slotWidth=Math.max(8,appState.resizeSlotWidth||8);
  const moved=event.clientX-appState.resizeStartX;
  appState.resizeMovedPx=Math.max(appState.resizeMovedPx,Math.abs(moved));
  const rawWidth=Math.max(
    appState.resizeMinWidthPx||slotWidth,
    Math.min(appState.resizeMaxWidthPx||appState.resizeOriginWidthPx, appState.resizeOriginWidthPx + moved)
  );
  const rawDuration=(rawWidth/slotWidth)*0.5;
  const snapDuration=snapToHalfHour(rawDuration);
  const validation=getResizeValidation(booking,id,docId,snapDuration);
  appState.resizePreviewDuration=snapDuration;
  appState.resizeValidationOk=validation.ok;
  block.style.width=`${rawWidth.toFixed(1)}px`;
  block.classList.toggle("resize-invalid",!validation.ok);
  block.classList.add("resizing");
  const endText=formatTime(booking.start+snapDuration);
  const durationText=formatDurationText(snapDuration);
  block.setAttribute("data-resize-label",`${endText} · ${durationText}${validation.ok?"":" (불가)"}`);
}

function handleResizeStart(event,id,docId,duration,sourceBlock){
  const booking=findBookingByDocId(id,docId);
  if(!canResizeBooking(booking)) return;
  if(event.button!==0) return;
  const block=(sourceBlock && sourceBlock.classList?.contains("booking-block"))
    ? sourceBlock
    : (event.currentTarget?.closest(".booking-block") || null);
  if(!block) return;
  appState.suppressBookingClickUntil=Date.now()+RESIZE_CLICK_GUARD_MS;
  appState.resizeIntentLocked=true;
  event.stopPropagation();
  event.preventDefault();
  appState.isResizing=true;
  appState.resizeStartX=event.clientX;
  appState.resizeOriginDuration=duration;
  appState.resizeTarget={id,docId,blockEl:block};
  appState.resizeOriginWidthPx=Math.max(1,block.getBoundingClientRect().width);
  const slots=Math.max(1,duration/0.5);
  appState.resizeSlotWidth=appState.resizeOriginWidthPx/slots;
  appState.resizeMinWidthPx=appState.resizeSlotWidth;
  appState.resizeMaxWidthPx=appState.resizeSlotWidth*((18-booking.start)/0.5);
  appState.resizeMovedPx=0;
  appState.resizePreviewDuration=duration;
  appState.resizeValidationOk=true;
  document.body.style.cursor="col-resize";
  document.body.style.userSelect="none";
  document.body.classList.add("is-resizing");
  block.classList.add("resizing");
  block.setAttribute("data-resize-label",`${formatTime(booking.start+duration)} · ${formatDurationText(duration)}`);
}

async function handleResizeEnd(event){
  if(!appState.isResizing||!appState.resizeTarget) return;
  appState.isResizing=false;
  document.body.style.cursor="default";
  document.body.style.userSelect="";
  document.body.classList.remove("is-resizing");
  try{
    const {id,docId}=appState.resizeTarget;
    const booking=findBookingByDocId(id,docId);
    if(!booking) return;
    if(!canResizeBooking(booking)) return;
    if(appState.resizeMovedPx<RESIZE_MIN_COMMIT_PX) return;
    const newDuration=snapToHalfHour(appState.resizePreviewDuration||appState.resizeOriginDuration);
    if(newDuration===appState.resizeOriginDuration) return;
    const validation=getResizeValidation(booking,id,docId,newDuration);
    if(!validation.ok){
      showToast(validation.reason,"warn");
      return;
    }
    await updateBookingDoc(docId,{duration:newDuration});
    showToast("예약 시간을 조정했습니다.","success");
  }catch(error){
    reportAsyncError("handleResizeEnd", error, "예약 시간 조정에 실패했습니다.");
  }finally{
    clearResizePreview();
    appState.resizeTarget=null;
    appState.resizeSlotWidth=0;
    appState.resizeOriginWidthPx=0;
    appState.resizeMinWidthPx=0;
    appState.resizeMaxWidthPx=0;
    appState.resizeMovedPx=0;
    appState.resizePreviewDuration=0;
    appState.resizeValidationOk=true;
    setTimeout(()=>{ appState.resizeIntentLocked=false; },80);
  }
}

function printReport(dateOverride){
  if(!can("print")){
    alert("권한이 없습니다.");
    return;
  }
  const dateInput=document.getElementById("report-date");
  const date=dateOverride || ((dateInput && dateInput.value) ? dateInput.value : getViewDate());
  const rows=[];
  for(const id of bscIds){
    for(const booking of getBookingsForDate(id,date)){
      rows.push({id,...booking});
    }
  }
  rows.sort((a,b)=>a.id.localeCompare(b.id)||a.start-b.start);
  const now=new Date();
  const reportId=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2,10)).toUpperCase();
  const tableRows=rows.length?rows.map(b=>{
    const purpose=b.user==="System"?"자동 소독":getPurposeMeta(b.purpose).label;
    const status=b.status==="pending"?"승인 대기":"확정";
    return `<tr><td>${b.id}</td><td>${b.user}</td><td>${purpose}</td><td>${status}</td><td>${b.date}</td><td>${formatTime(b.start)}</td><td>${formatTime(b.start+b.duration)}</td></tr>`;
  }).join(""):'<tr><td colspan="7">해당 날짜에 예약이 없습니다.</td></tr>';
  const html=`<!doctype html><html lang="ko"><head><meta charset="UTF-8" /><title>장비 일일 운영 리포트</title><style>body{font-family:"Malgun Gothic",sans-serif;padding:24px;color:#222}h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}.meta{text-align:right;font-size:12px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #999;padding:8px;text-align:center}th{background:#f0f0f0}.footer{margin-top:40px;display:flex;justify-content:space-between}.sign{width:45%;border-bottom:1px solid #ccc;height:36px;margin-top:30px}</style></head><body><h1>장비 일일 운영 리포트</h1><div class="meta">기준 날짜: ${date}<br />생성 시각: ${now.toLocaleString()}<br />리포트 ID: ${reportId}<br />출력자: ${appState.currentUser.name}</div><table><thead><tr><th>장비</th><th>작업자</th><th>목적</th><th>상태</th><th>날짜</th><th>시작</th><th>종료</th></tr></thead><tbody>${tableRows}</tbody></table><div class="footer"><div style="width:45%"><strong>수행자</strong><div class="sign"></div></div><div style="width:45%"><strong>검토자</strong><div class="sign"></div></div></div><script>window.onload=()=>window.print();<\/script></body></html>`;
  const win=window.open("","_blank","width=980,height=820");
  if(!win) return;
  win.document.write(html);
  win.document.close();
}
function getDayBookings(date){
  const rows=[];
  for(const id of bscIds){
    for(const booking of getBookingsForDate(id,date)){
      rows.push({ id, ...booking });
    }
  }
  return rows;
}

function computeDaySummary(date){
  const dayBookings=getDayBookings(date).filter(b=>b.user!=="System");
  const sorted=[...dayBookings].sort((a,b)=>a.start-b.start);
  const total=dayBookings.length;
  const pending=dayBookings.filter(b=>b.status==="pending").length;
  const usedSlots=dayBookings.reduce((sum,b)=>sum+(b.duration/0.5),0);
  const totalSlots=bscIds.length*18;
  const utilization=Math.min(100,Math.round((usedSlots/totalSlots)*100));
  const slotUsage=[];
  for(let h=9;h<18;h+=1){
    const count=dayBookings.filter(b=>b.start<(h+1)&&(b.start+b.duration)>h).length;
    slotUsage.push({ h, count });
  }
  const peak=slotUsage.reduce((best,item)=>item.count>best.count?item:best,{h:9,count:0});
  const peakLabel=peak.count>0 ? `${formatTime(peak.h)}-${formatTime(peak.h+1)}` : "없음";
  const utilClass=utilization>75?"util-high":utilization>40?"util-mid":"util-low";
  const firstStart=sorted.length ? sorted[0].start : null;
  const lastEnd=sorted.length ? Math.max(...sorted.map(item=>item.start+item.duration)) : null;
  return { total, pending, utilization, peakLabel, utilClass, firstStart, lastEnd };
}

function renderCalendarMobile(dayEntries){
  const container=document.getElementById("calendar-mobile");
  if(!container) return;
  container.innerHTML="";
  const isCompactWorker=isWorkerMobileMode();
  const mobileEntries=isCompactWorker
    ? dayEntries.filter(entry=>entry.isToday || entry.summary.total>0)
    : dayEntries;
  if(mobileEntries.length===0){
    container.innerHTML='<div class="calendar-mobile-empty">표시할 날짜가 없습니다.</div>';
    return;
  }
  for(const entry of mobileEntries){
    const { dateKey, summary, isToday } = entry;
    const item=document.createElement("button");
    item.type="button";
    item.className=`calendar-mobile-item ${isToday?"today":""}`.trim();
    const rangeText=(summary.firstStart===null || summary.lastEnd===null)
      ? "예약 없음"
      : `${formatTime(summary.firstStart)}-${formatTime(summary.lastEnd)}`;
    const utilText=isCompactWorker ? "" : `<span>가동률 ${summary.utilization}%</span>`;
    const pendingText=summary.pending>0 ? `<span class="pending-text">대기 ${summary.pending}건</span>` : "";
    item.innerHTML=`<div class="calendar-mobile-head"><strong>${dateKey.replace(/-/g,". ")}</strong><span class="calendar-mobile-count">예약 ${summary.total}건</span></div><div class="calendar-mobile-meta"><span>운영 시간대 ${rangeText}</span>${utilText}${pendingText}</div>`;
    item.addEventListener("click",()=>openDayModal(dateKey));
    container.appendChild(item);
  }
}

function renderCalendar(){
  const grid=document.getElementById("calendar-grid");
  const mobile=document.getElementById("calendar-mobile");
  const title=document.querySelector(".cal-title");
  title.textContent=`${appState.currentYear}. ${String(appState.currentMonth).padStart(2,"0")}`;
  grid.innerHTML="";
  if(mobile) mobile.innerHTML="";
  const headers=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  headers.forEach((h,idx)=>{const div=document.createElement("div");div.className="cal-header-cell";div.textContent=h;if(idx===0)div.style.color="#e74c3c";if(idx===6)div.style.color="#3498db";grid.appendChild(div);});
  const firstDay=new Date(appState.currentYear,appState.currentMonth-1,1).getDay();
  const daysInMonth=new Date(appState.currentYear,appState.currentMonth,0).getDate();
  for(let i=0;i<firstDay;i+=1){
    const empty=document.createElement("div");
    empty.className="cal-day-cell empty";
    grid.appendChild(empty);
  }
  const today=new Date();
  const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const dayEntries=[];
  for(let d=1;d<=daysInMonth;d+=1){
    const key=`${appState.currentYear}-${String(appState.currentMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cell=document.createElement("button");cell.type="button";cell.className="cal-day-cell";
    const summary=computeDaySummary(key);
    const isToday=key===todayKey;
    if(isToday) cell.classList.add("today");
    cell.innerHTML=`<div class="cal-day-head"><span class="cal-day-num">${d}</span>${summary.pending>0?'<span class="cal-pending-dot" title="승인 대기 예약 있음"></span>':''}</div><div class="cal-day-badges"><span class="cal-badge">예약 ${summary.total}건</span><span class="cal-badge ${summary.pending>0?"pending":""}">대기 ${summary.pending}건</span><span class="cal-badge">피크 ${summary.peakLabel}</span></div><div class="util-indicator"><span class="util-value ${summary.utilClass}">${summary.utilization}%</span><div class="util-bar-bg"><div class="util-bar-fill ${summary.utilClass}" style="width:${summary.utilization}%"></div></div></div>`;
    cell.addEventListener("click",()=>openDayModal(key));
    grid.appendChild(cell);
    dayEntries.push({ dateKey:key, day:d, summary, isToday });
  }
  renderCalendarMobile(dayEntries);
}

function computeUtilizationForDay(date){
  let usedSlots=0;const totalSlots=bscIds.length*18;
  for(const id of bscIds){usedSlots+=getBookingsForDate(id,date).reduce((sum,b)=>sum+b.duration/0.5,0);} 
  return Math.min(100,Math.round((usedSlots/totalSlots)*100));
}

function openDayModal(date){
  appState.dayModalDate=date;
  document.getElementById("day-modal").style.display="flex";
  document.getElementById("day-modal-title").textContent=`${date.replace(/-/g,". ")} 상세 일정`;
  const printBtn=document.querySelector('[data-day-action="print"]');
  if(printBtn) printBtn.hidden=!can("print");
  const reportDate=document.getElementById("report-date");
  if(reportDate) reportDate.value=date;
  renderTimeline(document.getElementById("day-timeline"),date);
}

function applyDateContext(date){
  if(!date) return;
  appState.currentDate=date;
  const parsed=new Date(date);
  if(!Number.isNaN(parsed.getTime())){
    appState.currentYear=parsed.getFullYear();
    appState.currentMonth=parsed.getMonth()+1;
  }
  initStartTimes();
  subscribeBookings();
  renderAll();
}

function handleDayAction(action){
  const date=appState.dayModalDate;
  if(!date) return;
  if(action==="reservation"){
    applyDateContext(date);
    switchView("reservation");
    closeModal("day-modal");
    showToast("예약 관리 화면으로 이동했습니다.","info");
    return;
  }
  if(action==="print"){
    if(!can("print")) return;
    printReport(date);
  }
}

function getManualSections(includeInactive=false){
  return [...manualSections]
    .filter(section=>section.id!=="manual-login")
    .filter(section=>includeInactive || section.active!==false)
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0) || (a.title||"").localeCompare(b.title||"","ko"));
}

function renderManualAdmin(){
  renderManualPane("manual-toc","manual-content",true);
  renderManualSectionTable();
}

function renderManualPublic(){
  renderManualPane("manual-public-toc","manual-public-content",false);
}

function renderManualPane(tocId, contentId, isAdminView=false){
  renderManualToc(tocId, contentId);
  renderManualViewer(contentId, isAdminView);
}

function renderManualToc(tocId="manual-toc", contentId="manual-content"){
  const container=document.getElementById(tocId);
  if(!container) return;
  container.innerHTML="";
  const sections=getManualSections();
  if(!sections.length){
    const empty=document.createElement("div");
    empty.className="manual-empty";
    empty.textContent="노출 중인 메뉴얼 섹션이 없습니다.";
    container.appendChild(empty);
    return;
  }
  sections.forEach(section=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="manual-toc-btn";
    btn.dataset.manualJump=section.id;
    btn.dataset.manualContentId=contentId;
    btn.textContent=section.title;
    container.appendChild(btn);
  });
}

function renderManualViewer(contentId="manual-content", isAdminView=false){
  const container=document.getElementById(contentId);
  if(!container) return;
  container.innerHTML="";
  const sections=getManualSections();
  if(!sections.length){
    const empty=document.createElement("div");
    empty.className="manual-empty manual-content-empty";
    empty.textContent=isAdminView
      ? "메뉴얼 콘텐츠가 없습니다. 관리자 화면에서 섹션을 추가하세요."
      : "현재 열람 가능한 메뉴얼이 없습니다.";
    container.appendChild(empty);
    return;
  }
  sections.forEach(section=>{
    const article=document.createElement("article");
    article.className="manual-section-card";
    article.id=`${contentId}-view-${section.id}`;

    const title=document.createElement("h4");
    title.className="manual-section-title";
    title.textContent=section.title;
    article.appendChild(title);

    const body=document.createElement("div");
    body.className="manual-body";
    body.textContent=section.body || "내용 없음";
    article.appendChild(body);

    if(section.imageUrl){
      const figure=document.createElement("figure");
      figure.className="manual-figure";
      const img=document.createElement("img");
      img.className="manual-image";
      img.src=section.imageUrl;
      img.alt=section.imageCaption || section.title;
      img.loading="lazy";
      figure.appendChild(img);
      if(section.imageCaption){
        const caption=document.createElement("figcaption");
        caption.className="manual-caption";
        caption.textContent=section.imageCaption;
        figure.appendChild(caption);
      }
      article.appendChild(figure);
    }

    container.appendChild(article);
  });
}

function renderManualSectionTable(){
  const tbody=document.getElementById("manual-section-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  if(!isAdminUser()) return;
  const sections=getManualSections(true);
  if(!sections.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=5;
    td.className="table-empty";
    td.textContent="등록된 메뉴얼 섹션이 없습니다.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  sections.forEach(section=>{
    const tr=document.createElement("tr");
    const values=[
      String(section.order || 0),
      section.title,
      section.imageUrl ? "연결됨" : "없음",
      section.active!==false ? "노출" : "숨김"
    ];
    values.forEach(value=>{
      const td=document.createElement("td");
      td.textContent=value;
      tr.appendChild(td);
    });
    const actionTd=document.createElement("td");
    const editBtn=document.createElement("button");
    editBtn.type="button";
    editBtn.className="btn-edit";
    editBtn.dataset.editManualSection=section.id;
    editBtn.textContent="수정";
    const delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="btn-del";
    delBtn.dataset.delManualSection=section.id;
    delBtn.textContent="삭제";
    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

function jumpToManualSection(sectionId, contentId="manual-content"){
  const target=document.getElementById(`${contentId}-view-${sectionId}`);
  if(!target) return;
  target.scrollIntoView({ behavior:"smooth", block:"start" });
}

function openManualSectionModal(mode,sectionId=""){
  if(!isAdminUser()){
    showToast("관리자만 메뉴얼을 편집할 수 있습니다.","warn");
    return;
  }
  const modal=document.getElementById("manual-section-modal");
  if(!modal) return;
  const title=document.getElementById("manual-section-modal-title");
  const original=document.getElementById("manual-section-original-id");
  const titleInput=document.getElementById("manual-section-title");
  const bodyInput=document.getElementById("manual-section-body");
  const imageInput=document.getElementById("manual-section-image");
  const captionInput=document.getElementById("manual-section-caption");
  const orderInput=document.getElementById("manual-section-order");
  const activeInput=document.getElementById("manual-section-active");
  modal.style.display="flex";
  if(mode==="create"){
    if(title) title.textContent="메뉴얼 섹션 등록";
    if(original) original.value="";
    if(titleInput) titleInput.value="";
    if(bodyInput) bodyInput.value="";
    if(imageInput) imageInput.value="";
    if(captionInput) captionInput.value="";
    if(orderInput) orderInput.value=String(getManualSections(true).length+1);
    if(activeInput) activeInput.checked=true;
    return;
  }
  const section=manualSections.find(item=>item.id===sectionId);
  if(!section){
    closeModal("manual-section-modal");
    showToast("수정할 메뉴얼 섹션을 찾을 수 없습니다.","warn");
    return;
  }
  if(title) title.textContent="메뉴얼 섹션 수정";
  if(original) original.value=section.id;
  if(titleInput) titleInput.value=section.title;
  if(bodyInput) bodyInput.value=section.body || "";
  if(imageInput) imageInput.value=section.imageUrl || "";
  if(captionInput) captionInput.value=section.imageCaption || "";
  if(orderInput) orderInput.value=String(section.order || 1);
  if(activeInput) activeInput.checked=section.active!==false;
}

async function saveManualSection(){
  if(!isAdminUser()){
    showToast("관리자만 메뉴얼을 편집할 수 있습니다.","warn");
    return;
  }
  try{
    const originalId=(document.getElementById("manual-section-original-id")?.value || "").trim();
    const title=(document.getElementById("manual-section-title")?.value || "").trim();
    const body=(document.getElementById("manual-section-body")?.value || "").trim();
    const imageUrl=(document.getElementById("manual-section-image")?.value || "").trim();
    const imageCaption=(document.getElementById("manual-section-caption")?.value || "").trim();
    const order=Math.max(1,Number(document.getElementById("manual-section-order")?.value || 1));
    const active=document.getElementById("manual-section-active")?.checked ?? true;
    if(!title){ alert("제목을 입력하세요."); return; }
    if(!body){ alert("본문을 입력하세요."); return; }
    if(originalId){
      const idx=manualSections.findIndex(section=>section.id===originalId);
      if(idx<0){ alert("메뉴얼 섹션 정보를 찾을 수 없습니다."); return; }
      manualSections[idx]={ ...manualSections[idx], title, body, imageUrl, imageCaption, order, active };
    }else{
      let nextId=makeSafeId(title,"manual");
      let seed=1;
      while(manualSections.some(section=>section.id===nextId)){
        seed+=1;
        nextId=`${makeSafeId(title,"manual")}-${seed}`;
      }
      manualSections=[...manualSections,{ id:nextId, title, body, imageUrl, imageCaption, order, active }];
    }
    closeModal("manual-section-modal");
    await saveConfig();
    renderManualAdmin();
    addAdminActivity(originalId ? "메뉴얼 수정" : "메뉴얼 등록", title);
    showToast(originalId ? "메뉴얼 섹션을 수정했습니다." : "메뉴얼 섹션을 등록했습니다.","success");
  }catch(error){
    reportAsyncError("saveManualSection", error, "메뉴얼 섹션 저장에 실패했습니다.");
  }
}

async function deleteManualSection(sectionId){
  if(!isAdminUser()){
    showToast("관리자만 메뉴얼을 삭제할 수 있습니다.","warn");
    return;
  }
  const section=manualSections.find(item=>item.id===sectionId);
  if(!section) return;
  if(!confirm(`메뉴얼 섹션 [${section.title}] 을 삭제하시겠습니까?`)) return;
  try{
    manualSections=manualSections.filter(item=>item.id!==sectionId);
    await saveConfig();
    renderManualAdmin();
    addAdminActivity("메뉴얼 삭제", section.title);
    showToast("메뉴얼 섹션을 삭제했습니다.","success");
  }catch(error){
    reportAsyncError("deleteManualSection", error, "메뉴얼 섹션 삭제에 실패했습니다.");
  }
}

function renderAdmin(){
  if(!can("admin") || appState.currentView!=="admin") return;
  const usersBtn=document.querySelector('[data-admin-view="users"]');
  const machinesBtn=document.querySelector('[data-admin-view="machines"]');
  const purposesBtn=document.querySelector('[data-admin-view="purposes"]');
  const locationsBtn=document.querySelector('[data-admin-view="locations"]');
  const manualBtn=document.querySelector('[data-admin-view="manual"]');
  const locationMaintenanceBtn=document.getElementById("btn-location-maintenance");
  if(appState.currentUser.role==="supervisor"){
    usersBtn.style.display="none";
    machinesBtn.style.display="none";
    if(purposesBtn) purposesBtn.style.display="none";
    locationsBtn.style.display="none";
    if(manualBtn) manualBtn.style.display="none";
    if(locationMaintenanceBtn) locationMaintenanceBtn.hidden=true;
    switchAdminView("audit");
  }else{
    usersBtn.style.display="flex";
    machinesBtn.style.display="flex";
    if(purposesBtn) purposesBtn.style.display="flex";
    locationsBtn.style.display="flex";
    if(manualBtn) manualBtn.style.display="flex";
    if(locationMaintenanceBtn) locationMaintenanceBtn.hidden=!isAdminUser();
  }
  renderAdminToolbar(getActiveAdminView());
  refreshUsersFromDb();
  renderSiteTable();
  renderRoomSiteFilterOptions();
  renderRoomTable();
  renderMachineTable();
  renderLocationMaintenanceTable();
  renderManualAdmin();
  renderPurposeTable();
  refreshAuditHistory();
  renderAdminActivity();
  renderStats();
  const reportDate=document.getElementById("report-date");
  if(reportDate && !reportDate.value){
    reportDate.value=getViewDate();
  }
}

async function refreshUsersFromDb(force=false){
  if(!can("admin")) return;
  const now=Date.now();
  if(!force && users.length && (now-usersFetchedAt)<30000){
    renderUserTable();
    return;
  }
  if(usersFetchPromise && !force){
    try{
      await usersFetchPromise;
      renderUserTable();
    }catch(error){
      reportAsyncError("refreshUsersFromDb", error, "사용자 목록을 불러오지 못했습니다.");
    }
    return;
  }
  usersFetchPromise=(async ()=>{
    const snap = await getDocs(collection(db,"users"));
    users = snap.docs.map(docSnap=>({uid: docSnap.id, ...docSnap.data()}));
    usersFetchedAt=Date.now();
  })();
  try{
    await usersFetchPromise;
    renderUserTable();
  }catch(error){
    reportAsyncError("refreshUsersFromDb", error, "사용자 목록을 불러오지 못했습니다.");
  }finally{
    usersFetchPromise=null;
  }
}

async function approveUser(uid){
  try{
    await updateDoc(doc(db,"users",uid),{approved:true});
    await refreshUsersFromDb(true);
    addAdminActivity("계정 승인", `uid: ${uid}`);
  }catch(error){
    reportAsyncError("approveUser", error, "계정 승인에 실패했습니다.");
  }
}
function renderUserTable(){
  const tbody=document.getElementById("user-table-body");
  tbody.innerHTML="";
  const filter=getAdminFilterState("users");
  const query=filter.query.toLowerCase();
  let rows=[...users];
  if(query){
    rows=rows.filter(user=>{
      const haystack=`${user.name||""} ${user.id||""} ${user.role||""}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if(filter.status==="approved") rows=rows.filter(user=>!!user.approved);
  if(filter.status==="pending") rows=rows.filter(user=>!user.approved);
  if(filter.status==="role-admin") rows=rows.filter(user=>user.role==="admin");
  if(filter.status==="role-supervisor") rows=rows.filter(user=>user.role==="supervisor");
  if(filter.status==="role-worker") rows=rows.filter(user=>user.role==="worker");
  if(filter.sort==="name-asc") rows.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  if(filter.sort==="name-desc") rows.sort((a,b)=>(b.name||"").localeCompare(a.name||""));
  for(const user of rows){
    const tr=document.createElement("tr");
    const canDelete=appState.currentUser&&user.id!==appState.currentUser.id;
    const statusLabel=user.approved?"\uC2B9\uC778\uB428":"\uC2B9\uC778\uB300\uAE30";
    const statusColor=user.approved?"#2ecc71":"#f39c12";
    const approveBtn = user.approved ? "" : `<button class="btn-edit" data-approve-user="${user.uid}">\uC2B9\uC778</button>`;
    tr.innerHTML=`<td>${user.name}</td><td>${user.id}</td><td><span class="status-badge role-${user.role}">${user.role.toUpperCase()}</span></td><td><span style="color:${statusColor};font-weight:900">● ${statusLabel}</span></td><td>${approveBtn}<button class="btn-edit" data-edit-user="${user.uid}">\uC218\uC815</button>${canDelete?`<button class="btn-del" data-del-user="${user.uid}">\uC0AD\uC81C</button>`:""}</td>`;
    tbody.appendChild(tr);
  }
}

function renderAuditHistory(){
  const tbody=document.getElementById("audit-history-body");
  if(!tbody) return;
  renderAuditSummary(auditHistoryRows);
  const rows=getFilteredAuditRows();
  if(rows.length===0){
    tbody.innerHTML='<tr><td colspan="6">조회된 운영 이력이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML=rows.map(row=>
    `<tr>
      <td>${row.machineId}</td>
      <td>${row.user}</td>
      <td>${row.purposeLabel}</td>
      <td><span class="status-badge ${mapStatusClass(row.status)}">${row.statusLabel}</span></td>
      <td>${formatTime(row.start)} - ${formatTime(row.start+row.duration)}</td>
      <td>${row.reason || "-"}</td>
    </tr>`
  ).join("");
}

function getFilteredAuditRows(){
  const filter=getAdminFilterState("audit");
  const query=filter.query.toLowerCase();
  let rows=[...auditHistoryRows];
  if(query){
    rows=rows.filter(row=>{
      const haystack=`${row.machineId} ${row.user} ${row.purposeLabel} ${row.reason} ${row.statusLabel}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if(filter.status!=="all"){
    rows=rows.filter(row=>row.status===filter.status);
  }
  if(filter.sort==="time-desc"){
    rows.sort((a,b)=>b.start-a.start);
  }else if(filter.sort==="user-asc"){
    rows.sort((a,b)=>a.user.localeCompare(b.user));
  }else if(filter.sort==="machine-asc"){
    rows.sort((a,b)=>a.machineId.localeCompare(b.machineId)||a.start-b.start);
  }else{
    rows.sort((a,b)=>a.start-b.start);
  }
  return rows;
}

function renderAuditSummary(rows){
  const container=document.getElementById("audit-summary");
  if(!container) return;
  const safeRows=Array.isArray(rows) ? rows : [];
  const total=safeRows.length;
  const confirmed=safeRows.filter(row=>row.status==="confirmed").length;
  const deleted=safeRows.filter(row=>row.status==="deleted").length;
  const rejected=safeRows.filter(row=>row.status==="rejected").length;
  container.innerHTML=
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#3498db"></span>전체 ${total}건</span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#2ecc71"></span>확정 ${confirmed}건</span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#e74c3c"></span>삭제 ${deleted}건</span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#9b59b6"></span>반려 ${rejected}건</span>`;
}

function escapeCsvCell(value){
  const text=String(value ?? "").replace(/\r?\n/g," ");
  return `"${text.replace(/"/g,'""')}"`;
}

function downloadFile(filename, content, mimeType){
  const blob=new Blob([content], { type: mimeType });
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

async function exportAuditHistoryCsv(){
  if(!can("admin")) return;
  const date=getReportDateValue();
  if(auditHistoryDate!==date){
    await refreshAuditHistory(true);
  }
  const rows=[...auditHistoryRows].sort((a,b)=>a.machineId.localeCompare(b.machineId)||a.start-b.start);
  if(rows.length===0){
    showToast("백업할 운영 이력이 없습니다.","warn");
    return;
  }
  const headers=["날짜","장비","작업자","목적","상태","시작","종료","사유"];
  const body=rows.map(row=>[
    date,
    row.machineId,
    row.user,
    row.purposeLabel,
    row.statusLabel,
    formatTime(row.start),
    formatTime(row.start+row.duration),
    row.reason || "-"
  ].map(escapeCsvCell).join(","));
  const csv="\ufeff"+[headers.map(escapeCsvCell).join(","), ...body].join("\r\n");
  downloadFile(`audit-history-${date}.csv`, csv, "text/csv;charset=utf-8");
  showToast("운영 이력 CSV 백업을 저장했습니다.","success");
  addAdminActivity("운영 이력 백업", `${date} ${rows.length}건`);
}

function exportAdminActivityJson(){
  if(!can("admin")) return;
  const rows=readAdminActivity();
  if(rows.length===0){
    showToast("백업할 관리자 작업 이력이 없습니다.","warn");
    return;
  }
  const payload={
    exportedAt:new Date().toISOString(),
    exportedBy:appState.currentUser?.id || appState.currentUser?.name || "admin",
    itemCount:rows.length,
    items:rows
  };
  const json=JSON.stringify(payload, null, 2);
  downloadFile(`admin-activity-${todayISO()}.json`, json, "application/json;charset=utf-8");
  showToast("작업 이력 JSON 백업을 저장했습니다.","success");
  addAdminActivity("작업 이력 백업", `${rows.length}건`);
}

async function refreshAuditHistory(force=false){
  if(!can("admin")) return;
  const date=getReportDateValue();
  if(!force && auditHistoryDate===date){
    renderAuditHistory();
    return;
  }
  if(auditHistoryLoading) return;
  auditHistoryLoading=true;
  auditHistoryRows=[];
  renderAuditSummary(auditHistoryRows);
  const tbody=document.getElementById("audit-history-body");
  if(tbody) tbody.innerHTML='<tr><td colspan="6">운영 이력을 불러오는 중...</td></tr>';
  try{
    const q=query(collection(db,"bookings"), where("date","==",date));
    const snap=await getDocs(q);
    const rows=snap.docs.map(docSnap=>{
      const data=docSnap.data();
      const status=data.status || "confirmed";
      const reason=status==="deleted"
        ? (data.deleteReason || "")
        : status==="rejected"
          ? (data.rejectReason || "")
          : "";
      return {
        docId:docSnap.id,
        machineId:data.machineId || "-",
        user:data.user || "-",
        purposeLabel:data.user==="System" ? "자동 소독" : getPurposeMeta(data.purpose).label,
        status,
        statusLabel:mapStatusLabel(status),
        start:Number(data.start||0),
        duration:Number(data.duration||0),
        reason
      };
    });
    auditHistoryRows=rows;
    auditHistoryDate=date;
    renderAuditHistory();
  }catch(error){
    reportAsyncError("refreshAuditHistory", error, "운영 이력을 불러오지 못했습니다.");
    if(tbody) tbody.innerHTML='<tr><td colspan="6">운영 이력을 불러오지 못했습니다.</td></tr>';
  }finally{
    auditHistoryLoading=false;
  }
}

function renderStats(){
  const monthKey=`${appState.statsYear}-${String(appState.statsMonth).padStart(2,"0")}`;
  const monthLabel=`${appState.statsYear}. ${String(appState.statsMonth).padStart(2,"0")}`;
  const monthDays=new Date(appState.statsYear, appState.statsMonth, 0).getDate();
  const rows=[];
  const machineHours={};
  const locationStats=Object.fromEntries(locations.map(loc=>[loc,{count:0,hours:0,machines:0}]));
  const purposeHours=Object.fromEntries(purposeList.map(p=>[p.key,0]));
  let totalHours=0;

  for(const id of bscIds){
    machineHours[id]=0;
    const loc=getMachineLocation(id);
    if(!locationStats[loc]) locationStats[loc]={count:0,hours:0,machines:0};
    locationStats[loc].machines+=1;
    for(const booking of bookings[id]){
      if(!booking.date.startsWith(monthKey)) continue;
      rows.push({ id, ...booking });
      totalHours+=booking.duration;
      machineHours[id]+=booking.duration;
      locationStats[loc].count+=1;
      locationStats[loc].hours+=booking.duration;
      if(purposeHours[booking.purpose]===undefined) purposeHours[booking.purpose]=0;
      purposeHours[booking.purpose]+=booking.duration;
    }
  }

  const totalCount=rows.length;
  const capacityHours=bscIds.length*monthDays*9;
  const utilization=capacityHours>0 ? (totalHours/capacityHours)*100 : 0;
  const avgDuration=totalCount>0 ? totalHours/totalCount : 0;

  const processHours=purposeHours.process||0;
  const maintHours=purposeHours.maint||0;
  const cleanHours=purposeHours.clean||0;

  const processEl=document.getElementById("stat-process");
  const maintEl=document.getElementById("stat-maint");
  const cleanEl=document.getElementById("stat-clean");
  if(processEl) processEl.textContent=`${processHours.toFixed(1)} h`;
  if(maintEl) maintEl.textContent=`${maintHours.toFixed(1)} h`;
  if(cleanEl) cleanEl.textContent=`${cleanHours.toFixed(1)} h`;

  const monthLabelEl=document.getElementById("stats-month-label");
  if(monthLabelEl) monthLabelEl.textContent=monthLabel;
  const capacityNote=document.getElementById("stats-capacity-note");
  if(capacityNote){
    capacityNote.textContent=`가동률 기준 용량: ${bscIds.length}대 × ${monthDays}일 × 9시간 = ${capacityHours.toFixed(1)}시간`;
  }

  const kpiList=document.getElementById("stats-kpi-list");
  if(kpiList){
    kpiList.innerHTML=
      `<div class="stats-kpi-item"><span class="stats-kpi-label">총 예약 건수</span><span class="stats-kpi-value">${totalCount}건</span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">총 사용 시간</span><span class="stats-kpi-value">${totalHours.toFixed(1)}h</span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">평균 예약 시간</span><span class="stats-kpi-value">${avgDuration.toFixed(2)}h</span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">설비 가동률</span><span class="stats-kpi-value">${utilization.toFixed(1)}%</span></div>`;
  }

  const purposeBars=document.getElementById("stats-purpose-bars");
  if(purposeBars){
    const purposeRows=purposeList.map(p=>{
      const hours=purposeHours[p.key]||0;
      const percent=totalHours>0?(hours/totalHours)*100:0;
      const meta=getPurposeMeta(p.key);
      return { label:meta.label, hours, percent, color:meta.color };
    }).sort((a,b)=>b.hours-a.hours);
    if(!purposeRows.some(row=>row.hours>0)){
      purposeBars.innerHTML='<div class="stats-empty">선택 월 예약 데이터가 없습니다.</div>';
    }else{
      purposeBars.innerHTML=purposeRows.filter(row=>row.hours>0).map(row=>
        `<div class="stats-purpose-row">
          <span class="stats-purpose-name">${row.label}</span>
          <div class="stats-purpose-track"><span class="stats-purpose-fill" style="width:${row.percent.toFixed(1)}%;background:${row.color};"></span></div>
          <span class="stats-purpose-meta">${row.hours.toFixed(1)}h (${row.percent.toFixed(1)}%)</span>
        </div>`
      ).join("");
    }
  }

  const locationBody=document.getElementById("stats-location-body");
  if(locationBody){
    const locRows=Object.entries(locationStats)
      .map(([loc,val])=>({ loc, ...val }))
      .sort((a,b)=>b.hours-a.hours || b.count-a.count || a.loc.localeCompare(b.loc));
    locationBody.innerHTML=locRows.map(row=>
      `<tr>
        <td>${row.loc}</td>
        <td>${row.machines}대</td>
        <td>${row.count}건</td>
        <td>${row.hours.toFixed(1)}h</td>
      </tr>`
    ).join("");
  }

  const topMachinesEl=document.getElementById("stats-top-machines");
  if(topMachinesEl){
    const topRows=Object.entries(machineHours)
      .map(([id,hours])=>({id,hours}))
      .sort((a,b)=>b.hours-a.hours||a.id.localeCompare(b.id))
      .slice(0,5)
      .filter(row=>row.hours>0);
    if(topRows.length===0){
      topMachinesEl.innerHTML='<li class="stats-empty">선택 월 예약 데이터가 없습니다.</li>';
    }else{
      topMachinesEl.innerHTML=topRows.map(row=>
        `<li><span>${row.id}</span><span class="stats-top-hours">${row.hours.toFixed(1)}h</span></li>`
      ).join("");
    }
  }
}

function getReserveWizardSteps(source){
  return source==="chronograph"
    ? ["timePurpose","location","machine","confirm"]
    : ["location","machine","timePurpose","confirm"];
}

function closeReserveWizard(){
  appState.reserveWizard=null;
  const modal=document.getElementById("mobile-reserve-modal");
  if(modal) modal.style.display="none";
}

function openReserveWizard(source="dashboard",presetTime=null){
  if(!can("create")){
    showToast("예약 권한이 없습니다.","warn");
    return;
  }
  const date=getViewDate();
  const minHour=getMinReservableHour(date);
  let baseTime=presetTime===null ? minHour : clampHour(snapToHalfHour(presetTime));
  if(date===todayISO() && baseTime<minHour) baseTime=minHour;
  const steps=getReserveWizardSteps(source);
  appState.reserveWizard={
    source,
    steps,
    stepIndex:0,
    fields:{
      date,
      time:baseTime,
      duration:0.5,
      purpose:(purposeList[0]?.key || "process"),
      location:"",
      machineId:"",
      autoClean:false
    }
  };
  const modal=document.getElementById("mobile-reserve-modal");
  if(modal) modal.style.display="flex";
  renderReserveWizardStep();
}

function renderReserveWizardStep(){
  const state=appState.reserveWizard;
  if(!state) return;
  const step=state.steps[state.stepIndex];
  const fields=state.fields;
  const body=document.getElementById("mobile-reserve-body");
  const label=document.getElementById("mobile-reserve-step-label");
  const btnBack=document.getElementById("btn-mobile-reserve-back");
  const btnNext=document.getElementById("btn-mobile-reserve-next");
  const btnSubmit=document.getElementById("btn-mobile-reserve-submit");
  if(!body || !label || !btnBack || !btnNext || !btnSubmit) return;

  btnBack.style.display=state.stepIndex===0 ? "none" : "inline-flex";
  const isConfirm=step==="confirm";
  btnNext.style.display=isConfirm ? "none" : "inline-flex";
  btnSubmit.style.display=isConfirm ? "inline-flex" : "none";

  if(step==="timePurpose"){
    label.textContent=state.source==="chronograph" ? "1/4 시간·목적 선택 (시간 자동 입력됨)" : "3/4 시간·목적 선택";
    const minHour=getMinReservableHour(fields.date);
    if(fields.time<minHour && fields.date===todayISO()) fields.time=minHour;
    const timeOptions=[];
    for(let h=9; h<18; h+=0.5){
      if(fields.date===todayISO() && h<minHour) continue;
      timeOptions.push(`<option value="${h}">${formatTime(h)}</option>`);
    }
    const durationOptions=[
      { value:0.5, label:"30분" },
      { value:1, label:"1시간" },
      { value:1.5, label:"1시간 30분" },
      { value:2, label:"2시간" },
      { value:3, label:"3시간" },
      { value:4, label:"4시간" }
    ];
    const purposeOptions=(fields.machineId ? getPurposesForMachine(fields.machineId) : purposeList);
    if(purposeOptions.length && !purposeOptions.some(p=>p.key===fields.purpose)) fields.purpose=purposeOptions[0].key;
    body.innerHTML=`<div class="mobile-field-grid">
      <div class="form-group"><label for="wizard-date">날짜</label><input id="wizard-date" type="date" value="${fields.date}" /></div>
      <div class="form-group"><label for="wizard-time">시작 시간</label><select id="wizard-time">${timeOptions.join("")}</select></div>
      <div class="form-group"><label for="wizard-duration">소요 시간</label><select id="wizard-duration">${durationOptions.map(opt=>`<option value="${opt.value}">${opt.label}</option>`).join("")}</select></div>
      <div class="form-group"><label for="wizard-purpose">목적</label><select id="wizard-purpose">${purposeOptions.map(opt=>`<option value="${opt.key}">${opt.label}</option>`).join("")}</select></div>
    </div>`;
    const dateInput=document.getElementById("wizard-date");
    const timeSel=document.getElementById("wizard-time");
    const durationSel=document.getElementById("wizard-duration");
    const purposeSel=document.getElementById("wizard-purpose");
    if(timeSel) timeSel.value=String(fields.time);
    if(durationSel) durationSel.value=String(fields.duration);
    if(purposeSel) purposeSel.value=String(fields.purpose);
    dateInput?.addEventListener("change",()=>{ fields.date=dateInput.value || todayISO(); renderReserveWizardStep(); });
    timeSel?.addEventListener("change",()=>{ fields.time=Number(timeSel.value); });
    durationSel?.addEventListener("change",()=>{ fields.duration=Number(durationSel.value); });
    purposeSel?.addEventListener("change",()=>{ fields.purpose=purposeSel.value; });
    return;
  }

  if(step==="location"){
    label.textContent=state.source==="chronograph" ? "2/4 장소 선택" : "1/4 장소 선택";
    const list=getReservableLocationsByTime(fields.date,fields.time,fields.duration);
    if(!list.length){
      body.innerHTML='<div class="mobile-warn-text">선택한 시간에 예약 가능한 장소가 없습니다. 시간을 먼저 변경해주세요.</div>';
      return;
    }
    if(!fields.location || !list.some(item=>item.location===fields.location)) fields.location=list[0].location;
    body.innerHTML=`<div class="mobile-choice-grid">${list.map(item=>`<button type="button" class="mobile-choice-btn ${fields.location===item.location?"active":""}" data-wizard-location="${item.location}">${item.location} <span style="float:right;color:#607286">${item.count}대 가능</span></button>`).join("")}</div>`;
    body.querySelectorAll("[data-wizard-location]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        fields.location=btn.dataset.wizardLocation || "";
        fields.machineId="";
        renderReserveWizardStep();
      });
    });
    return;
  }

  if(step==="machine"){
    label.textContent=state.source==="chronograph" ? "3/4 장비 선택" : "2/4 장비 선택";
    const machineList=getReservableMachinesByTime(fields.date,fields.time,fields.duration,fields.location);
    if(!machineList.length){
      body.innerHTML='<div class="mobile-warn-text">해당 시간/장소에 예약 가능한 장비가 없습니다. 이전 단계에서 다시 선택해주세요.</div>';
      return;
    }
    if(!fields.machineId || !machineList.some(item=>item.id===fields.machineId)) fields.machineId=machineList[0].id;
    body.innerHTML=`<div class="mobile-choice-grid">${machineList.map(item=>`<button type="button" class="mobile-choice-btn ${fields.machineId===item.id?"active":""}" data-wizard-machine="${item.id}">${item.id}<span style="float:right;color:#607286">${item.mgmtNo}</span></button>`).join("")}</div>`;
    body.querySelectorAll("[data-wizard-machine]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        fields.machineId=btn.dataset.wizardMachine || "";
        const allowed=getPurposesForMachine(fields.machineId);
        if(allowed.length && !allowed.some(item=>item.key===fields.purpose)) fields.purpose=allowed[0].key;
        renderReserveWizardStep();
      });
    });
    return;
  }

  label.textContent="4/4 예약 확인";
  body.innerHTML=`<div class="mobile-summary-box">
    <div>날짜: <strong>${fields.date}</strong></div>
    <div>시간: <strong>${formatTime(fields.time)} ~ ${formatTime(fields.time+fields.duration)}</strong></div>
    <div>장소: <strong>${fields.location || "-"}</strong></div>
    <div>장비: <strong>${fields.machineId || "-"}</strong></div>
    <div>목적: <strong>${getPurposeMeta(fields.purpose).label}</strong></div>
  </div>`;
}

function handleReserveWizardBack(){
  const state=appState.reserveWizard;
  if(!state) return;
  if(state.stepIndex===0) return;
  state.stepIndex-=1;
  renderReserveWizardStep();
}

function handleReserveWizardNext(){
  const state=appState.reserveWizard;
  if(!state) return;
  const step=state.steps[state.stepIndex];
  const fields=state.fields;
  if(step==="timePurpose"){
    if(!fields.date){ showToast("날짜를 선택해주세요.","warn"); return; }
    if(fields.time<9 || fields.time+fields.duration>18){ showToast("운영 시간(09:00~18:00)을 벗어났습니다.","warn"); return; }
    if(fields.date===todayISO()){
      const minHour=getMinReservableHour(fields.date);
      if(fields.time<minHour){ showToast(`오늘 예약은 ${formatTime(minHour)} 이후로 가능합니다.`,"warn"); return; }
    }
  }
  if(step==="location" && !fields.location){
    showToast("장소를 선택해주세요.","warn");
    return;
  }
  if(step==="machine" && !fields.machineId){
    showToast("장비를 선택해주세요.","warn");
    return;
  }
  if(state.stepIndex>=state.steps.length-1) return;
  state.stepIndex+=1;
  renderReserveWizardStep();
}

async function submitReserveWizard(){
  const state=appState.reserveWizard;
  if(!state) return;
  const { date, time, duration, purpose, machineId } = state.fields;
  if(!machineId){ showToast("장비를 선택해주세요.","warn"); return; }
  if(time<9 || time+duration>18){ showToast("운영 시간(09:00~18:00)을 벗어났습니다.","warn"); return; }
  if(isOverlap(machineId,date,time,duration)){
    showToast("선택 시간에 이미 예약이 있습니다. 시간을 다시 확인해주세요.","warn");
    const idx=state.steps.indexOf("timePurpose");
    if(idx>=0){ state.stepIndex=idx; renderReserveWizardStep(); }
    return;
  }
  const allowedPurposes=getPurposesForMachine(machineId);
  if(allowedPurposes.length && !allowedPurposes.some(item=>item.key===purpose)){
    showToast("선택한 목적은 해당 장비에서 사용할 수 없습니다.","warn");
    return;
  }
  try{
    await createBookingDoc({
      machineId,
      user: appState.currentUser.name,
      userId: appState.currentUser.id || appState.currentUser.name,
      createdBy: appState.currentUser.uid || null,
      date,
      start: time,
      duration,
      purpose,
      status: "confirmed",
      autoClean: false
    });
    addAdminActivity("모바일 예약 등록", `${machineId} ${date} ${formatTime(time)}-${formatTime(time+duration)}`);
    closeReserveWizard();
    appState.mobile.drawerOpen=false;
    switchView("dashboard");
    showToast("예약이 등록되었습니다.");
  }catch(error){
    reportAsyncError("submitReserveWizard", error, "모바일 예약 저장에 실패했습니다.");
  }
}

function openBookingModal(id,start){
  if(!can("create")){showToast("예약 생성 권한이 없습니다.","warn");return;}
  appState.bookingEditTarget=null;
  appState.bookingTarget={id,start};
  setBookingModalMode(false);
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${formatTime(start)} 시작`;
  document.getElementById("booking-start").value=String(start);
  document.getElementById("booking-date").value=getViewDate();
  const userInput=document.getElementById("booking-user");
  userInput.value=appState.currentUser.name;
  userInput.readOnly=false;
  document.getElementById("booking-recurring").checked=false;
  document.getElementById("booking-duration").value="1";
  renderPurposeOptions(id);
  const purposeSelect=document.getElementById("booking-purpose");
  if(purposeSelect && !purposeSelect.value){
    const options = getPurposesForMachine(id);
    if(options.length) purposeSelect.value=options[0].key;
  }
  const autoClean=document.getElementById("booking-autoclean");
  if(autoClean) autoClean.checked=false;
}

function setBookingModalMode(isEdit){
  const title=document.getElementById("booking-title");
  const saveBtn=document.getElementById("btn-save-booking");
  const recurringRow=document.getElementById("booking-recurring-row");
  const editNote=document.getElementById("booking-edit-note");
  if(title) title.textContent=isEdit ? "작업 예약 수정" : "작업 예약 등록";
  if(saveBtn) saveBtn.textContent=isEdit ? "변경 저장" : "예약 저장";
  if(recurringRow) recurringRow.hidden=isEdit;
  if(editNote) editNote.hidden=!isEdit;
}

function openBookingEditModal(id,docId){
  const booking=findBookingByDocId(id,docId);
  if(!booking || booking.user==="System"){
    showToast("수정 가능한 예약을 찾을 수 없습니다.","warn");
    return;
  }
  if(!canEditBooking(booking)){
    showToast("본인 예약만 수정할 수 있습니다.","warn");
    return;
  }
  appState.bookingTarget={id,start:booking.start};
  appState.bookingEditTarget={id,docId};
  setBookingModalMode(true);
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${booking.date} ${formatTime(booking.start)} 시작`;
  document.getElementById("booking-start").value=String(booking.start);
  document.getElementById("booking-date").value=booking.date;
  const userInput=document.getElementById("booking-user");
  userInput.value=booking.user || appState.currentUser.name;
  userInput.readOnly=!isManagerUser();
  document.getElementById("booking-recurring").checked=false;
  document.getElementById("booking-duration").value=String(booking.duration);
  renderPurposeOptions(id);
  const purposeSelect=document.getElementById("booking-purpose");
  if(purposeSelect){
    purposeSelect.value=booking.purpose;
    if(!purposeSelect.value && purposeSelect.options.length>0){
      purposeSelect.value=purposeSelect.options[0].value;
    }
  }
  const autoClean=document.getElementById("booking-autoclean");
  if(autoClean) autoClean.checked=!!booking.autoClean;
}

function closeModal(id){
  const modal=document.getElementById(id);
  if(modal) modal.style.display="none";
  if(id==="day-modal") appState.dayModalDate=null;
  if(id==="booking-modal"){
    appState.bookingEditTarget=null;
    setBookingModalMode(false);
  }
  if(id==="location-maintenance-modal"){
    appState.locationMaintenanceEdit=null;
    syncLocationMaintenanceModalMeta();
  }
}

function openDeleteModal(id, docId){
  if(!can("edit")){showToast("삭제 권한이 없습니다.","warn");return;}
  appState.deleteTarget = { id, docId };
  const reason = document.getElementById("delete-reason");
  if(reason) reason.value = "";
  const impactEl=document.getElementById("delete-impact");
  const booking=findBookingByDocId(id,docId);
  if(impactEl && booking){
    const linkedBuffer=(booking.autoClean)
      ? getBookingsForDate(id, booking.date).find(b=>b.user==="System" && b.start===booking.start+booking.duration && b.duration===0.5)
      : null;
    const linkedText=linkedBuffer ? "연동 자동소독 1건이 함께 삭제됩니다." : "연동 자동소독 삭제 없음.";
    impactEl.innerHTML=`대상: ${id} / ${booking.user}<br>시간: ${booking.date} ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}<br>영향: ${linkedText}`;
  }else if(impactEl){
    impactEl.textContent="";
  }
  document.getElementById("delete-modal").style.display = "flex";
}

async function confirmDelete(){
  const target = appState.deleteTarget;
  if(!target) return;
  try{
    const reasonEl = document.getElementById("delete-reason");
    const reason = reasonEl ? reasonEl.value.trim() : "";
    if(!reason){
      showToast("삭제 사유를 입력해주세요.","warn");
      return;
    }
    const { id, docId } = target;
    const booking = findBookingByDocId(id, docId);
    if(!booking){ closeModal("delete-modal"); return; }
    const deletedBy = appState.currentUser?.uid || "system";
    await updateDoc(doc(db,"bookings",docId),{
      status: "deleted",
      deleteReason: reason,
      deletedBy,
      deletedAt: serverTimestamp()
    });

    if(booking.autoClean){
      const bufferStart = booking.start + booking.duration;
      const buffer = getBookingsForDate(id, booking.date).find(b=>b.user==="System" && b.start===bufferStart && b.duration===0.5);
      if(buffer?.docId){
        await updateDoc(doc(db,"bookings",buffer.docId),{
          status: "deleted",
          deleteReason: "연동 예약 삭제",
          deletedBy,
          deletedAt: serverTimestamp()
        });
      }
    }
    closeModal("delete-modal");
    appState.deleteTarget = null;
    showToast("예약이 삭제되었습니다.","info");
    addAdminActivity("예약 삭제", `${id} ${booking.user} ${booking.date} ${formatTime(booking.start)}~${formatTime(booking.start+booking.duration)}`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("confirmDelete", error, "예약 삭제에 실패했습니다.");
  }
}

function findLinkedAutoCleanBooking(machineId,date,startHour){
  return getBookingsForDate(machineId,date).find(b=>b.user==="System" && b.start===startHour && b.duration===0.5);
}

async function markBookingDeleted(docId,reason){
  if(!docId) return;
  await updateDoc(doc(db,"bookings",docId),{
    status:"deleted",
    deleteReason:reason || "예약 변경으로 삭제",
    deletedBy: appState.currentUser?.uid || "system",
    deletedAt: serverTimestamp()
  });
}

async function syncAutoCleanAfterEdit(machineId,beforeBooking,afterState){
  const beforeAuto=!!beforeBooking.autoClean;
  const afterAuto=!!afterState.autoClean;
  const beforeEnd=beforeBooking.start + beforeBooking.duration;
  const afterEnd=afterState.start + afterState.duration;
  const anchorChanged=beforeBooking.date!==afterState.date || beforeEnd!==afterEnd;
  if(beforeAuto){
    const oldBuffer=findLinkedAutoCleanBooking(machineId,beforeBooking.date,beforeEnd);
    if(oldBuffer?.docId && (!afterAuto || anchorChanged)){
      await markBookingDeleted(oldBuffer.docId,"연동 예약 변경");
    }
  }
  if(afterAuto && (!beforeAuto || anchorChanged)){
    await addSystemBuffer(machineId,afterState.date,afterEnd);
  }
}

async function updateExistingBooking({ user, date, start, duration, purpose, autoClean }){
  const target=appState.bookingEditTarget;
  if(!target) return false;
  const { id, docId }=target;
  const booking=findBookingByDocId(id,docId);
  if(!booking){
    showToast("수정할 예약을 찾을 수 없습니다.","warn");
    return false;
  }
  if(!canEditBooking(booking)){
    showToast("본인 예약만 수정할 수 있습니다.","warn");
    return false;
  }
  if(isWorkerUser() && booking.date===todayISO() && booking.start<=getNowHour()){
    showToast("이미 시작된 예약은 수정할 수 없습니다.","warn");
    return false;
  }
  if(isOverlap(id,date,start,duration,docId)){
    showToast("해당 날짜/시간에 예약이 중복됩니다.","warn");
    return false;
  }
  const allowedPurposes=getPurposesForMachine(id);
  if(allowedPurposes.length && !allowedPurposes.some(p=>p.key===purpose)){
    showToast("선택한 목적은 해당 장비에 사용할 수 없습니다.","warn");
    return false;
  }
  const userId=isManagerUser() ? (booking.userId || user) : (appState.currentUser.id || appState.currentUser.name || user);
  await updateBookingDoc(docId,{
    user,
    userId,
    date,
    start,
    duration,
    purpose,
    autoClean: !!autoClean
  });
  await syncAutoCleanAfterEdit(id,booking,{date,start,duration,autoClean: !!autoClean});
  showToast("예약이 변경되었습니다.","success");
  addAdminActivity("예약 수정", `${id} ${date} ${formatTime(start)} ${formatTime(start+duration)}`);
  return true;
}

async function confirmBooking(){
  try{
    const user=document.getElementById("booking-user").value.trim();
    const date=document.getElementById("booking-date").value;
    const start=Number(document.getElementById("booking-start").value);
    const duration=Number(document.getElementById("booking-duration").value);
    const purpose=document.getElementById("booking-purpose").value;
    const recurring=document.getElementById("booking-recurring").checked;
    const autoClean=document.getElementById("booking-autoclean")?.checked || false;
    if(!user||!date){showToast("정보를 모두 입력해주세요.","warn");return;}
    if(start < 9 || start+duration>18){showToast("운영 시간(09:00~18:00)을 초과합니다.","warn");return;}
    if(isWorkerUser() && date===todayISO()){
      const minHour=getMinReservableHour(date);
      if(start<minHour){
        showToast(`오늘 예약은 ${formatTime(minHour)} 이후로만 등록할 수 있습니다.`,"warn");
        return;
      }
    }
    const allowedPurposes = getPurposesForMachine(appState.bookingTarget.id);
    if(allowedPurposes.length && !allowedPurposes.some(p=>p.key===purpose)){
      showToast("선택한 목적은 해당 장비에 사용할 수 없습니다.","warn");
      return;
    }
    if(appState.bookingEditTarget){
      const ok=await updateExistingBooking({ user, date, start, duration, purpose, autoClean });
      if(!ok) return;
      closeModal("booking-modal");
      refreshAuditHistory(true);
      return;
    }
    const status="confirmed";
    const userId=appState.currentUser.id||appState.currentUser.name||user;
    const weeks=recurring?4:1; let success=0;
    for(let i=0;i<weeks;i+=1){
      const dateObj=new Date(date);dateObj.setDate(dateObj.getDate()+i*7);
      const targetDate=dateObj.toISOString().slice(0,10);
      if(isOverlap(appState.bookingTarget.id,targetDate,start,duration)){
        if(!recurring){showToast("해당 날짜/시간에 예약이 중복됩니다.","warn");return;}
        continue;
      }
      await createBookingDoc({
        machineId: appState.bookingTarget.id,
        user,
        userId,
        createdBy: appState.currentUser.uid || null,
        date: targetDate,
        start,
        duration,
        purpose,
        status,
        autoClean
      });
      success+=1;
      if(status==="confirmed" && autoClean){
        await addSystemBuffer(appState.bookingTarget.id,targetDate,start+duration);
      }
    }
    closeModal("booking-modal");
    if(success===0){showToast("모든 반복 예약이 중복으로 인해 실패했습니다.","warn");return;}
    showToast(status==="pending"?"예약 요청이 등록되었습니다.":"예약이 확정되었습니다.");
    if(recurring) showToast(`${success}건의 반복 예약이 등록되었습니다.`,"info");
    addAdminActivity("예약 등록", `${appState.bookingTarget.id} ${date} ${formatTime(start)} ${success}건`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("confirmBooking", error, "예약 저장에 실패했습니다.");
  }
}

function isOverlap(id,date,start,duration,ignoreDocId){
  return hasBookingOverlap(getBookingsForDate(id,date),start,duration,ignoreDocId);
}
async function addSystemBuffer(id,date,bufferStart,ignoreDocId){
  if(bufferStart>=18) return;
  if(isOverlap(id,date,bufferStart,0.5,ignoreDocId)) return;
  await createBookingDoc({
    machineId: id,
    user: "System",
    userId: "system",
    createdBy: "system",
    date,
    start: bufferStart,
    duration: 0.5,
    purpose: "clean",
    status: "confirmed"
  });
}

async function deleteMachine(id){
  if(!confirm(`장비 ${id}를 삭제하시겠습니까?`)) return;
  try{
    const existing=bookings[id]||[];
    for(const booking of existing){
      if(booking.docId) await deleteBookingDoc(booking.docId);
    }
    bscIds=bscIds.filter(x=>x!==id);
    delete bookings[id];
    delete machineLocations[id];
    delete machineMgmtNos[id];
    delete machineDescs[id];
    delete machineRoomIds[id];
    await saveConfig();
    ensureBookingBuckets();
    renderAll();
    addAdminActivity("장비 삭제", id);
  }catch(error){
    reportAsyncError("deleteMachine", error, "장비 삭제에 실패했습니다.");
  }
}

function openMachineModal(mode,id){
  const modal=document.getElementById("machine-modal");
  if(!modal) return;
  modal.style.display="flex";
  const title=document.getElementById("machine-modal-title");
  const original=document.getElementById("machine-original-id");
  const input=document.getElementById("machine-id");
  const mgmtInput=document.getElementById("machine-mgmt");
  const descInput=document.getElementById("machine-desc");
  const siteSel=document.getElementById("machine-site");
  const roomSel=document.getElementById("machine-room");
  renderLocationOptions();
  if(siteSel){
    siteSel.onchange=()=>{
      renderLocationOptions();
      const selectedSite=siteSel.value;
      const roomsBySite=getRoomsBySite(selectedSite,{includeInactive:true});
      if(roomsBySite.length){
        roomSel.value=roomsBySite[0].id;
      }
    };
  }
  if(mode==="create"){
    if(title) title.textContent="장비 등록";
    if(original) original.value="";
    if(input){input.value=""; input.disabled=false;}
    if(mgmtInput) mgmtInput.value="";
    if(descInput) descInput.value="";
    if(siteSel && siteSel.options.length){
      siteSel.value=siteSel.options[0].value;
      renderLocationOptions();
    }
    return;
  }
  if(title) title.textContent="장비 수정";
  if(original) original.value=id;
  if(input){input.value=id; input.disabled=false;}
  if(mgmtInput) mgmtInput.value=getMachineMgmtNo(id);
  if(descInput) descInput.value=getMachineDesc(id);
  const room=getMachineRoom(id);
  if(siteSel && room){
    siteSel.value=room.siteId;
    renderLocationOptions();
  }
  if(roomSel && room){
    roomSel.value=room.id;
  }
}

async function saveMachine(){
  try{
    const originalId=document.getElementById("machine-original-id")?.value || "";
    const nextId=document.getElementById("machine-id")?.value.trim() || "";
    const nextMgmt=document.getElementById("machine-mgmt")?.value.trim() || "";
    const nextDesc=document.getElementById("machine-desc")?.value.trim() || "";
    const nextRoomId=document.getElementById("machine-room")?.value || "";
    const nextRoom=getRoomById(nextRoomId);
    const nextLocation=nextRoom?.name || "";
    if(!nextId){alert("장비 ID를 입력하세요.");return;}
    if(!nextRoomId || !nextRoom){alert("Room을 선택하세요.");return;}
    const isEdit=!!originalId;
    if(originalId){
      if(originalId!==nextId && bscIds.includes(nextId)){
        alert("이미 존재하는 장비 ID입니다.");
        return;
      }
      if(originalId!==nextId){
        bscIds=bscIds.map(mid=>mid===originalId?nextId:mid);
        machineLocations[nextId]=nextLocation;
        machineMgmtNos[nextId]=nextMgmt;
        machineDescs[nextId]=nextDesc;
        machineRoomIds[nextId]=nextRoomId;
        delete machineLocations[originalId];
        delete machineMgmtNos[originalId];
        delete machineDescs[originalId];
        delete machineRoomIds[originalId];
        const existing=bookings[originalId]||[];
        for(const booking of existing){
          if(booking.docId) await updateBookingDoc(booking.docId,{machineId: nextId});
        }
        delete bookings[originalId];
      }else{
        machineLocations[originalId]=nextLocation;
        machineMgmtNos[originalId]=nextMgmt;
        machineDescs[originalId]=nextDesc;
        machineRoomIds[originalId]=nextRoomId;
      }
    }else{
      if(bscIds.includes(nextId)){
        alert("이미 존재하는 장비 ID입니다.");
        return;
      }
      bscIds=[...bscIds,nextId];
      machineLocations[nextId]=nextLocation;
      machineMgmtNos[nextId]=nextMgmt;
      machineDescs[nextId]=nextDesc;
      machineRoomIds[nextId]=nextRoomId;
      bookings[nextId]=[];
    }
    closeModal("machine-modal");
    showToast("장비 목록이 갱신되었습니다.","info");
    await saveConfig();
    ensureBookingBuckets();
    renderAll();
    addAdminActivity(isEdit ? "장비 수정" : "장비 등록", nextId);
  }catch(error){
    reportAsyncError("saveMachine", error, "장비 저장에 실패했습니다.");
  }
}

function renderMachineTable(){
  const tbody=document.getElementById("machine-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  const filter=getAdminFilterState("machines");
  const query=filter.query.toLowerCase();
  let rows=bscIds.map((id,index)=>({
    id,
    index,
    count:(bookings[id]||[]).length,
    mgmt:getMachineMgmtNo(id),
    location:getMachineDisplayPath(id),
    desc:getMachineDesc(id)
  }));
  if(query){
    rows=rows.filter(row=>{
      const haystack=`${row.id} ${row.mgmt} ${row.location} ${row.desc}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if(filter.status==="booked") rows=rows.filter(row=>row.count>0);
  if(filter.status==="unbooked") rows=rows.filter(row=>row.count===0);
  if(filter.sort==="id-asc") rows.sort((a,b)=>a.id.localeCompare(b.id));
  if(filter.sort==="id-desc") rows.sort((a,b)=>b.id.localeCompare(a.id));
  if(filter.sort==="count-desc") rows.sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
  if(filter.sort==="default") rows.sort((a,b)=>a.index-b.index);
  for(const row of rows){
    const tr=document.createElement("tr");
    const descShort=row.desc.length>24?`${row.desc.slice(0,24)}...`:row.desc;
    tr.innerHTML=`<td>${row.id}</td><td>${row.mgmt}</td><td>${row.location}</td><td title="${row.desc.replace(/"/g,"&quot;")}">${descShort}</td><td>${row.count}</td><td><button class="btn-edit" data-edit-machine="${row.id}">수정</button><button class="btn-del" data-del-machine="${row.id}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

















function renderRoomSiteFilterOptions(){
  const sel=document.getElementById("room-site-filter");
  if(!sel) return;
  const current=sel.value;
  const allSites=sortByOrderThenName(sites);
  const options=['<option value="all">전체 Site</option>',...allSites.map(site=>`<option value="${site.id}">${site.name}</option>`)];
  sel.innerHTML=options.join("");
  const validValues=new Set(["all",...allSites.map(site=>site.id)]);
  sel.value=validValues.has(current) ? current : "all";
}

function renderSiteTable(){
  const tbody=document.getElementById("site-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  const filter=getAdminFilterState("locations");
  const query=filter.query.toLowerCase();
  let rows=sortByOrderThenName(sites).map(site=>({
    ...site,
    roomCount:getRoomsBySite(site.id,{includeInactive:true}).length
  }));
  if(query){
    rows=rows.filter(row=>{
      const haystack=`${row.id} ${row.name}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  for(const row of rows){
    const tr=document.createElement("tr");
    const status=row.active!==false ? "활성" : "비활성";
    tr.innerHTML=`<td>${row.id}</td><td>${row.name}</td><td>${row.roomCount}개</td><td>${status}</td><td><button class="btn-edit" data-edit-site="${row.id}">수정</button><button class="btn-del" data-del-site="${row.id}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

function renderRoomTable(){
  const tbody=document.getElementById("room-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  const filter=getAdminFilterState("locations");
  const query=filter.query.toLowerCase();
  const siteFilter=document.getElementById("room-site-filter")?.value || "all";
  let rows=sortByOrderThenName(rooms).map(room=>{
    const machineCount=getMachinesByRoomId(room.id).length;
    const site=getSiteById(room.siteId);
    return {
      ...room,
      siteName:site?.name || "-",
      machineCount
    };
  });
  if(siteFilter!=="all"){
    rows=rows.filter(row=>row.siteId===siteFilter);
  }
  if(query){
    rows=rows.filter(row=>{
      const haystack=`${row.name} ${row.siteName}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if(filter.status==="active") rows=rows.filter(row=>row.active!==false);
  if(filter.status==="inactive") rows=rows.filter(row=>row.active===false);
  if(filter.status==="used") rows=rows.filter(row=>row.machineCount>0);
  if(filter.status==="empty") rows=rows.filter(row=>row.machineCount===0);
  if(filter.sort==="site-asc") rows.sort((a,b)=>a.siteName.localeCompare(b.siteName)||a.name.localeCompare(b.name));
  if(filter.sort==="name-asc") rows.sort((a,b)=>a.name.localeCompare(b.name));
  if(filter.sort==="name-desc") rows.sort((a,b)=>b.name.localeCompare(a.name));
  if(filter.sort==="count-desc") rows.sort((a,b)=>b.machineCount-a.machineCount||a.name.localeCompare(b.name));
  for(const row of rows){
    const tr=document.createElement("tr");
    const l=row.layout || {x:0,y:0,w:0,h:0};
    const status=row.active!==false ? "활성" : "비활성";
    tr.innerHTML=`<td>${row.name}</td><td>${row.siteName}</td><td>${row.machineCount}대</td><td>${Math.round(l.x)}, ${Math.round(l.y)}, ${Math.round(l.w)}, ${Math.round(l.h)}</td><td>${status}</td><td><button class="btn-edit" data-edit-room="${row.id}">수정</button><button class="btn-del" data-del-room="${row.id}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

function openSiteModal(mode,siteId){
  const modal=document.getElementById("site-modal");
  if(!modal) return;
  modal.style.display="flex";
  const title=document.getElementById("site-modal-title");
  const original=document.getElementById("site-original-id");
  const idInput=document.getElementById("site-id");
  const nameInput=document.getElementById("site-name");
  const activeInput=document.getElementById("site-active");
  if(mode==="create"){
    if(title) title.textContent="Site 등록";
    if(original) original.value="";
    if(idInput){idInput.value=""; idInput.disabled=false;}
    if(nameInput) nameInput.value="";
    if(activeInput) activeInput.checked=true;
    return;
  }
  const site=getSiteById(siteId);
  if(!site) return;
  if(title) title.textContent="Site 수정";
  if(original) original.value=site.id;
  if(idInput){idInput.value=site.id; idInput.disabled=true;}
  if(nameInput) nameInput.value=site.name;
  if(activeInput) activeInput.checked=site.active!==false;
}

async function saveSite(){
  try{
    const originalId=document.getElementById("site-original-id")?.value || "";
    const idInput=document.getElementById("site-id");
    const nameInput=document.getElementById("site-name");
    const activeInput=document.getElementById("site-active");
    const nextId=(idInput?.value || "").trim() || makeSafeId(nameInput?.value || "site","site");
    const nextName=(nameInput?.value || "").trim();
    const nextActive=activeInput ? !!activeInput.checked : true;
    if(!nextName){alert("Site명을 입력하세요.");return;}
    const isEdit=!!originalId;
    if(!isEdit){
      if(sites.some(site=>site.id===nextId)){alert("이미 존재하는 Site ID입니다.");return;}
      sites=[...sites,{ id: nextId, name: nextName, order: sites.length+1, active: nextActive }];
    }else{
      const idx=sites.findIndex(site=>site.id===originalId);
      if(idx<0){alert("Site 정보를 찾을 수 없습니다.");return;}
      sites[idx]={...sites[idx], name: nextName, active: nextActive};
    }
    closeModal("site-modal");
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity(isEdit ? "Site 수정" : "Site 등록", `${nextId} (${nextName})`);
  }catch(error){
    reportAsyncError("saveSite", error, "Site 저장에 실패했습니다.");
  }
}

async function deleteSite(siteId){
  try{
    const site=getSiteById(siteId);
    if(!site) return;
    const childRooms=getRoomsBySite(siteId,{includeInactive:true});
    if(childRooms.length>0){
      alert("하위 Room이 있는 Site는 삭제할 수 없습니다.");
      return;
    }
    if(!confirm(`${site.name} Site를 삭제하시겠습니까?`)) return;
    sites=sites.filter(item=>item.id!==siteId);
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity("Site 삭제", `${siteId}`);
  }catch(error){
    reportAsyncError("deleteSite", error, "Site 삭제에 실패했습니다.");
  }
}

function openRoomModal(mode,roomId){
  const modal=document.getElementById("room-modal");
  if(!modal) return;
  modal.style.display="flex";
  const title=document.getElementById("room-modal-title");
  const original=document.getElementById("room-original-id");
  const nameInput=document.getElementById("room-name");
  const siteSel=document.getElementById("room-site");
  const activeInput=document.getElementById("room-active");
  if(siteSel){
    siteSel.innerHTML=sortByOrderThenName(sites).map(site=>`<option value="${site.id}">${site.name}</option>`).join("");
  }
  if(mode==="create"){
    if(title) title.textContent="Room 등록";
    if(original) original.value="";
    if(nameInput) nameInput.value="";
    if(activeInput) activeInput.checked=true;
    if(siteSel && siteSel.options.length){
      siteSel.value=appState.map.selectedSiteId || siteSel.options[0].value;
    }
    document.getElementById("room-layout-x").value="4";
    document.getElementById("room-layout-y").value="6";
    document.getElementById("room-layout-w").value="44";
    document.getElementById("room-layout-h").value="38";
    return;
  }
  const room=getRoomById(roomId);
  if(!room) return;
  if(title) title.textContent="Room 수정";
  if(original) original.value=room.id;
  if(nameInput) nameInput.value=room.name;
  if(siteSel) siteSel.value=room.siteId;
  if(activeInput) activeInput.checked=room.active!==false;
  document.getElementById("room-layout-x").value=String(Math.round(room.layout?.x ?? 0));
  document.getElementById("room-layout-y").value=String(Math.round(room.layout?.y ?? 0));
  document.getElementById("room-layout-w").value=String(Math.round(room.layout?.w ?? 30));
  document.getElementById("room-layout-h").value=String(Math.round(room.layout?.h ?? 28));
}

async function saveRoom(){
  try{
    const originalId=document.getElementById("room-original-id")?.value || "";
    const name=(document.getElementById("room-name")?.value || "").trim();
    const siteId=document.getElementById("room-site")?.value || "";
    const active=document.getElementById("room-active")?.checked ?? true;
    const layout={
      x:Number(document.getElementById("room-layout-x")?.value || 0),
      y:Number(document.getElementById("room-layout-y")?.value || 0),
      w:Number(document.getElementById("room-layout-w")?.value || 30),
      h:Number(document.getElementById("room-layout-h")?.value || 28)
    };
    if(!name){alert("Room명을 입력하세요.");return;}
    if(!getSiteById(siteId)){alert("Site를 선택하세요.");return;}
    const normalized=normalizeRoomLayout(layout,0,1);
    const isEdit=!!originalId;
    if(isEdit){
      const idx=rooms.findIndex(room=>room.id===originalId);
      if(idx<0){alert("Room 정보를 찾을 수 없습니다.");return;}
      const duplicate=rooms.some(room=>room.id!==originalId && room.name===name);
      if(duplicate){alert("동일한 Room명이 이미 존재합니다.");return;}
      rooms[idx]={...rooms[idx], name, siteId, active, layout:normalized};
      bscIds.forEach(id=>{
        if(getMachineRoomId(id)===originalId){
          machineLocations[id]=name;
        }
      });
    }else{
      const duplicate=rooms.some(room=>room.name===name);
      if(duplicate){alert("동일한 Room명이 이미 존재합니다.");return;}
      const roomId=makeSafeId(name,"room");
      rooms=[...rooms,{ id:roomId, siteId, name, order:rooms.length+1, active, layout:normalized }];
    }
    ensureSiteRoomState();
    closeModal("room-modal");
    await saveConfig();
    renderAll();
    addAdminActivity(isEdit ? "Room 수정" : "Room 등록", `${name}`);
  }catch(error){
    reportAsyncError("saveRoom", error, "Room 저장에 실패했습니다.");
  }
}

async function deleteRoom(roomId){
  try{
    const room=getRoomById(roomId);
    if(!room) return;
    const assigned=bscIds.some(id=>getMachineRoomId(id)===roomId);
    if(assigned){
      alert("장비가 배정된 Room은 삭제할 수 없습니다.");
      return;
    }
    if(!confirm(`${room.name} Room을 삭제하시겠습니까?`)) return;
    rooms=rooms.filter(item=>item.id!==roomId);
    if(appState.map.selectedRoomId===roomId){
      appState.map.selectedRoomId=null;
      appState.map.selectedMachineId=null;
    }
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity("Room 삭제", room.name);
  }catch(error){
    reportAsyncError("deleteRoom", error, "Room 삭제에 실패했습니다.");
  }
}

function renderPurposeTable(){
  const tbody=document.getElementById("purpose-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  const filter=getAdminFilterState("purposes");
  const query=filter.query.toLowerCase();
  let rows=purposeList.map(purpose=>({
    ...purpose,
    used:isPurposeUsed(purpose.key)
  }));
  if(query){
    rows=rows.filter(p=>{
      const haystack=`${p.key} ${p.label}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if(filter.status==="global") rows=rows.filter(p=>!p.machines || p.machines.length===0);
  if(filter.status==="scoped") rows=rows.filter(p=>p.machines && p.machines.length>0);
  if(filter.status==="used") rows=rows.filter(p=>p.used);
  if(filter.status==="unused") rows=rows.filter(p=>!p.used);
  if(filter.sort==="code-asc") rows.sort((a,b)=>a.key.localeCompare(b.key));
  if(filter.sort==="label-asc") rows.sort((a,b)=>a.label.localeCompare(b.label));
  for(const purpose of rows){
    const tr=document.createElement("tr");
    const scope = (!purpose.machines || purpose.machines.length === 0)
      ? "전체"
      : `${purpose.machines.length}대`;
    tr.innerHTML=`<td>${purpose.key}</td><td>${purpose.label}</td><td>${scope}</td><td><button class="btn-edit" data-edit-purpose="${purpose.key}">수정</button><button class="btn-del" data-del-purpose="${purpose.key}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

function openPurposeModal(mode,key){
  const modal=document.getElementById("purpose-modal");
  if(!modal) return;
  modal.style.display="flex";
  const title=document.getElementById("purpose-modal-title");
  const original=document.getElementById("purpose-original-key");
  const keyInput=document.getElementById("purpose-key");
  const labelInput=document.getElementById("purpose-label");
  renderPurposeMachineList();
  if(mode==="create"){
    if(title) title.textContent="가동 목적 등록";
    if(original) original.value="";
    if(keyInput){ keyInput.value=""; keyInput.disabled=false; }
    if(labelInput) labelInput.value="";
    setPurposeAll(true);
    return;
  }
  const existing=purposeList.find(p=>p.key===key);
  if(!existing) return;
  if(title) title.textContent="가동 목적 수정";
  if(original) original.value=existing.key;
  if(keyInput){ keyInput.value=existing.key; keyInput.disabled=true; }
  if(labelInput) labelInput.value=existing.label;
  if(existing.machines && existing.machines.length){
    setPurposeAll(false);
    setPurposeMachineChecks(existing.machines);
  }else{
    setPurposeAll(true);
  }
}

function renderPurposeMachineList(){
  const container=document.getElementById("purpose-machine-list");
  if(!container) return;
  container.innerHTML="";
  for(const id of bscIds){
    const label=document.createElement("label");
    label.innerHTML=`<input type="checkbox" value="${id}" />${id}`;
    container.appendChild(label);
  }
}

function setPurposeMachineChecks(ids){
  const container=document.getElementById("purpose-machine-list");
  if(!container) return;
  container.querySelectorAll("input[type='checkbox']").forEach(cb=>{
    cb.checked = ids.includes(cb.value);
  });
}

function setPurposeAll(isAll){
  const allToggle=document.getElementById("purpose-all");
  const container=document.getElementById("purpose-machine-list");
  if(allToggle) allToggle.checked = isAll;
  if(container){
    container.querySelectorAll("input[type='checkbox']").forEach(cb=>{
      cb.disabled = isAll;
      if(isAll) cb.checked = false;
    });
  }
}

function isPurposeUsed(key){
  return bscIds.some(id => (bookings[id]||[]).some(b=>b.purpose===key));
}

async function savePurpose(){
  try{
    const original=document.getElementById("purpose-original-key")?.value || "";
    const key=document.getElementById("purpose-key")?.value.trim() || "";
    const label=document.getElementById("purpose-label")?.value.trim() || "";
    const allToggle=document.getElementById("purpose-all");
    const applyAll = allToggle ? allToggle.checked : true;
    const selected = [];
    const container=document.getElementById("purpose-machine-list");
    if(container){
      container.querySelectorAll("input[type='checkbox']").forEach(cb=>{
        if(cb.checked) selected.push(cb.value);
      });
    }
    if(!key || !label){alert("코드와 표시명을 입력하세요.");return;}
    if(!applyAll && selected.length === 0){
      alert("적용할 장비를 하나 이상 선택하세요.");
      return;
    }
    if(!original){
      if(purposeList.some(p=>p.key===key)){alert("이미 존재하는 코드입니다.");return;}
      purposeList=[...purposeList,{key,label,machines: applyAll ? null : selected}];
    }else{
      const idx=purposeList.findIndex(p=>p.key===original);
      if(idx>-1) purposeList[idx]={key:original,label,machines: applyAll ? null : selected};
    }
    closeModal("purpose-modal");
    await saveConfig();
    renderAll();
    addAdminActivity(original ? "목적 수정" : "목적 등록", `${original || key} -> ${label}`);
  }catch(error){
    reportAsyncError("savePurpose", error, "가동 목적 저장에 실패했습니다.");
  }
}

async function deletePurpose(key){
  try{
    if(isPurposeUsed(key)){
      alert("해당 목적이 예약에 사용 중이어서 삭제할 수 없습니다.");
      return;
    }
    if(!confirm(`${key} 목적을 삭제하시겠습니까?`)) return;
    purposeList=purposeList.filter(p=>p.key!==key);
    await saveConfig();
    renderAll();
    addAdminActivity("목적 삭제", key);
  }catch(error){
    reportAsyncError("deletePurpose", error, "가동 목적 삭제에 실패했습니다.");
  }
}

function openUserModal(mode,uid){
  const modal=document.getElementById("user-modal");
  if(!modal) return;
  modal.style.display="flex";
  const title=document.getElementById("user-modal-title");
  const originalId=document.getElementById("user-original-id");
  const nameInput=document.getElementById("user-display-name");
  const idInput=document.getElementById("user-id");
  const roleSelect=document.getElementById("user-role");
  if(mode==="create"){
    if(title) title.textContent="계정 생성";
    if(originalId) originalId.value="";
    if(nameInput) nameInput.value="";
    if(idInput){idInput.value=""; idInput.disabled=false;}
    if(roleSelect) roleSelect.value="worker";
    return;
  }
  const user=users.find(u=>u.uid===uid);
  if(!user) return;
  if(title) title.textContent="계정 수정";
  if(originalId) originalId.value=user.uid;
  if(nameInput) nameInput.value=user.name||"";
  if(idInput){idInput.value=user.id||""; idInput.disabled=true;}
  if(roleSelect) roleSelect.value=user.role||"worker";
}

async function saveUser(){
  try{
    const uid=document.getElementById("user-original-id")?.value || "";
    const id=document.getElementById("user-id")?.value.trim() || "";
    const name=document.getElementById("user-display-name")?.value.trim() || "";
    const role=document.getElementById("user-role")?.value || "worker";
    if(!id||!name){alert("정보를 모두 입력해주세요.");return;}
    if(!uid){
      alert("회원가입은 로그인 화면에서 진행합니다.");
      closeModal("user-modal");
      return;
    }
    await updateDoc(doc(db,"users",uid),{name,role});
    closeModal("user-modal");
    await refreshUsersFromDb(true);
    addAdminActivity("사용자 수정", `${id} (${role})`);
  }catch(error){
    reportAsyncError("saveUser", error, "사용자 저장에 실패했습니다.");
  }
}

async function deleteUser(uid){
  try{
    if(!confirm("정말 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db,"users",uid));
    await refreshUsersFromDb(true);
    addAdminActivity("사용자 삭제", `uid: ${uid}`);
  }catch(error){
    reportAsyncError("deleteUser", error, "사용자 삭제에 실패했습니다.");
  }
}

function initLocationMaintenanceStartOptions(date){
  const sel=document.getElementById("location-maintenance-start");
  if(!sel) return;
  const current=Number(sel.value);
  sel.innerHTML="";
  for(let h=9;h<18;h+=0.5){
    const opt=document.createElement("option");
    opt.value=String(h);
    opt.textContent=formatTime(h);
    sel.appendChild(opt);
  }
  if(current>=9 && current<18){
    sel.value=String(current);
  }else{
    const baseHour=(date===todayISO()) ? getMinReservableHour(date) : 9;
    sel.value=String(Math.min(17.5,baseHour));
  }
}

function createLocationMaintenanceBatchId(){
  const token=(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,10));
  return `location-maint-${token}`;
}

function isLocationMaintenanceBooking(booking){
  return !!booking && booking.status!=="deleted" && (booking.locationMaintenance===true || booking.userId==="location-maintenance");
}

function normalizeLocationMaintenanceLocations(items){
  const unique=[];
  for(const raw of Array.isArray(items) ? items : []){
    const name=String(raw || "").trim();
    if(!name || unique.includes(name)) continue;
    unique.push(name);
  }
  return unique.sort((a,b)=>a.localeCompare(b,"ko"));
}

function getLocationMaintenanceLocationsForBooking(booking){
  const listed=normalizeLocationMaintenanceLocations(booking?.maintenanceLocations);
  if(listed.length) return listed;
  const fallback=getMachineLocation(booking?.machineId);
  return fallback ? [fallback] : [];
}

function buildLocationMaintenanceGroupKey(booking){
  if(booking?.maintenanceBatchId) return `batch:${booking.maintenanceBatchId}`;
  const locationsKey=getLocationMaintenanceLocationsForBooking(booking).join("|");
  return [
    "legacy",
    booking?.date || "",
    String(Number(booking?.start) || 0),
    String(Number(booking?.duration) || 0),
    booking?.user || "",
    booking?.maintenanceReason || "",
    locationsKey
  ].join("::");
}

function getLocationMaintenanceGroups(){
  const grouped=new Map();
  for(const machineId of bscIds){
    for(const booking of bookings[machineId] || []){
      if(!isLocationMaintenanceBooking(booking)) continue;
      const key=buildLocationMaintenanceGroupKey(booking);
      let group=grouped.get(key);
      if(!group){
        group={
          key,
          batchId:booking.maintenanceBatchId || null,
          date:booking.date,
          start:Number(booking.start) || 9,
          duration:Number(booking.duration) || 1,
          operator:booking.user || "시설 점검",
          reason:booking.maintenanceReason || "",
          locations:getLocationMaintenanceLocationsForBooking(booking),
          bookings:[]
        };
        grouped.set(key,group);
      }else{
        group.locations=normalizeLocationMaintenanceLocations([...group.locations,...getLocationMaintenanceLocationsForBooking(booking)]);
      }
      group.bookings.push({ machineId, docId: booking.docId, booking });
    }
  }
  return [...grouped.values()].map(group=>({
    ...group,
    locations:normalizeLocationMaintenanceLocations(group.locations),
    machineIds:group.bookings.map(item=>item.machineId).sort((a,b)=>a.localeCompare(b,undefined,{ numeric:true })),
    machineCount:group.bookings.length
  })).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.operator.localeCompare(b.operator,"ko"));
}

function getLocationMaintenanceGroup(groupKey){
  if(!groupKey) return null;
  return getLocationMaintenanceGroups().find(group=>group.key===groupKey) || null;
}

function getLocationMaintenanceTargetMachineIds(selectedLocations){
  return bscIds
    .filter(id=>selectedLocations.includes(getMachineLocation(id)))
    .sort((a,b)=>a.localeCompare(b,undefined,{ numeric:true }));
}

function syncLocationMaintenanceModalMeta(group=null){
  const title=document.getElementById("location-maintenance-title");
  const sub=document.getElementById("location-maintenance-sub");
  const saveBtn=document.getElementById("btn-save-location-maintenance");
  if(title) title.textContent=group ? "장소 유지보수 예약 수정" : "장소 유지보수 예약";
  if(sub) sub.textContent=group
    ? "기존에 등록된 장소 유지보수 예약을 일괄 수정합니다. 변경 내용은 선택한 장소 전체에 동일하게 반영됩니다."
    : "선택한 장소의 장비 전체에 동일한 유지보수 예약을 등록합니다.";
  if(saveBtn) saveBtn.textContent=group ? "변경 저장" : "예약 저장";
}

function getLocationMaintenanceSelectedLocations(){
  const allToggle=document.getElementById("location-maintenance-all");
  const list=document.getElementById("location-maintenance-list");
  if(!list) return [];
  if(allToggle?.checked) return [...locations];
  return [...list.querySelectorAll('input[type="checkbox"][data-location-maintenance]:checked')].map(input=>input.value);
}

function renderLocationMaintenanceImpact(){
  const impact=document.getElementById("location-maintenance-impact");
  if(!impact) return;
  const selected=getLocationMaintenanceSelectedLocations();
  const machineCount=getLocationMaintenanceTargetMachineIds(selected).length;
  impact.textContent=`선택 장소 ${selected.length}곳 / 대상 장비 ${machineCount}대`;
}

function renderLocationMaintenanceList(selectedLocations=null){
  const list=document.getElementById("location-maintenance-list");
  const allToggle=document.getElementById("location-maintenance-all");
  if(!list || !allToggle) return;
  const explicitSelected=selectedLocations ? new Set(normalizeLocationMaintenanceLocations(selectedLocations)) : null;
  const previousSelected=new Set(
    [...list.querySelectorAll('input[type="checkbox"][data-location-maintenance]:checked')].map(input=>input.value)
  );
  list.innerHTML=locations.map(loc=>{
    const count=getLocationMaintenanceTargetMachineIds([loc]).length;
    const sourceSet=explicitSelected || previousSelected;
    const shouldCheck=allToggle.checked || (sourceSet.size===0 ? true : sourceSet.has(loc));
    const disabled=allToggle.checked ? "disabled" : "";
    const checkedAttr=shouldCheck ? "checked" : "";
    return `<label><input type="checkbox" data-location-maintenance value="${loc}" ${checkedAttr} ${disabled} /> ${loc} (${count}대)</label>`;
  }).join("");
  renderLocationMaintenanceImpact();
}

function renderLocationMaintenanceTable(){
  const tbody=document.getElementById("location-maintenance-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  if(!isAdminUser()) return;
  const groups=getLocationMaintenanceGroups();
  if(!groups.length){
    const tr=document.createElement("tr");
    const td=document.createElement("td");
    td.colSpan=7;
    td.textContent="등록된 장소 유지보수 예약이 없습니다.";
    td.className="table-empty";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for(const group of groups){
    const tr=document.createElement("tr");
    const locationsText=group.locations.length ? `${group.locations.join(", ")} (${group.locations.length}곳)` : "-";
    const timeText=`${formatTime(group.start)} ~ ${formatTime(group.start+group.duration)} (${formatDurationText(group.duration)})`;
    const actionTd=document.createElement("td");
    const editBtn=document.createElement("button");
    editBtn.type="button";
    editBtn.className="btn-edit";
    editBtn.dataset.editLocationMaintenance=group.key;
    editBtn.textContent="수정";
    const delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="btn-del";
    delBtn.dataset.delLocationMaintenance=group.key;
    delBtn.textContent="삭제";
    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    [
      formatDateLabel(group.date),
      timeText,
      locationsText,
      group.operator,
      group.reason || "-",
      `${group.machineCount}대`
    ].forEach(value=>{
      const td=document.createElement("td");
      td.textContent=value;
      tr.appendChild(td);
    });
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
}
function openLocationMaintenanceModal(groupKey=null){
  if(!isAdminUser()){
    showToast("관리자만 장소 유지보수 예약을 등록할 수 있습니다.","warn");
    return;
  }
  const targetKey=(typeof groupKey==="string" && groupKey.trim()) ? groupKey : null;
  const group=targetKey ? getLocationMaintenanceGroup(targetKey) : null;
  if(targetKey && !group){
    showToast("수정할 장소 유지보수 예약을 찾을 수 없습니다.","warn");
    return;
  }
  const modal=document.getElementById("location-maintenance-modal");
  if(!modal) return;
  modal.style.display="flex";
  const dateInput=document.getElementById("location-maintenance-date");
  const startInput=document.getElementById("location-maintenance-start");
  const durationInput=document.getElementById("location-maintenance-duration");
  const operatorInput=document.getElementById("location-maintenance-operator");
  const reasonInput=document.getElementById("location-maintenance-reason");
  const allToggle=document.getElementById("location-maintenance-all");
  syncLocationMaintenanceModalMeta(group);
  if(group){
    appState.locationMaintenanceEdit={ key:group.key, batchId:group.batchId || null };
    if(dateInput) dateInput.value=group.date;
    initLocationMaintenanceStartOptions(group.date);
    if(startInput) startInput.value=String(group.start);
    if(durationInput) durationInput.value=String(group.duration);
    if(operatorInput) operatorInput.value=group.operator;
    if(reasonInput) reasonInput.value=group.reason;
    const normalized=normalizeLocationMaintenanceLocations(group.locations);
    if(allToggle) allToggle.checked=normalized.length>0 && normalized.length===locations.length;
    renderLocationMaintenanceList(normalized);
    return;
  }
  appState.locationMaintenanceEdit=null;
  const defaultDate=getViewDate();
  if(dateInput) dateInput.value=defaultDate;
  initLocationMaintenanceStartOptions(defaultDate);
  if(durationInput) durationInput.value="1";
  if(operatorInput) operatorInput.value="시설 점검";
  if(reasonInput) reasonInput.value="";
  if(allToggle) allToggle.checked=true;
  renderLocationMaintenanceList();
}

async function deleteLocationMaintenanceGroup(groupKey){
  if(!isAdminUser()){
    showToast("관리자만 장소 유지보수 예약을 삭제할 수 있습니다.","warn");
    return;
  }
  const group=getLocationMaintenanceGroup(groupKey);
  if(!group){
    showToast("삭제할 장소 유지보수 예약을 찾을 수 없습니다.","warn");
    return;
  }
  const summary=`${formatDateLabel(group.date)} ${formatTime(group.start)} ~ ${formatTime(group.start+group.duration)} / ${group.locations.join(", ")}`;
  if(!confirm(`선택한 장소 유지보수 예약을 삭제하시겠습니까?\n${summary}`)) return;
  try{
    for(const item of group.bookings){
      if(item.docId) await deleteBookingDoc(item.docId);
    }
    showToast(`장소 유지보수 예약을 삭제했습니다. (${group.machineCount}대)`,`success`);
    addAdminActivity("장소 유지보수 삭제", `${group.date} ${formatTime(group.start)} / ${group.locations.join(", ")} / ${group.machineCount}대`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("deleteLocationMaintenanceGroup", error, "장소 유지보수 예약 삭제에 실패했습니다.");
  }
}

async function saveLocationMaintenance(){
  if(!isAdminUser()){
    showToast("관리자만 장소 유지보수 예약을 등록할 수 있습니다.","warn");
    return;
  }
  try{
    const editing=appState.locationMaintenanceEdit ? getLocationMaintenanceGroup(appState.locationMaintenanceEdit.key) : null;
    if(appState.locationMaintenanceEdit && !editing){
      showToast("기존 장소 유지보수 예약 정보를 찾을 수 없습니다. 다시 시도해주세요.","warn");
      return;
    }
    const date=document.getElementById("location-maintenance-date")?.value || "";
    const start=Number(document.getElementById("location-maintenance-start")?.value || 0);
    const duration=Number(document.getElementById("location-maintenance-duration")?.value || 0);
    const operator=(document.getElementById("location-maintenance-operator")?.value || "").trim() || "시설 점검";
    const reason=(document.getElementById("location-maintenance-reason")?.value || "").trim();
    const selectedLocations=normalizeLocationMaintenanceLocations(getLocationMaintenanceSelectedLocations());
    if(!date){ showToast("날짜를 선택해주세요.","warn"); return; }
    if(selectedLocations.length===0){ showToast("유지보수 대상 장소를 선택해주세요.","warn"); return; }
    if(start<9 || start+duration>18){ showToast("운영 시간(09:00~18:00)을 벗어납니다.","warn"); return; }
    const targetMachineIds=getLocationMaintenanceTargetMachineIds(selectedLocations);
    if(targetMachineIds.length===0){
      showToast("선택한 장소에 등록된 장비가 없습니다.","warn");
      return;
    }
    const previousDocIdsByMachine=new Map((editing?.bookings || []).map(item=>[item.machineId,item.docId]));
    const overlapIds=targetMachineIds.filter(machineId=>isOverlap(machineId,date,start,duration,previousDocIdsByMachine.get(machineId)));
    if(overlapIds.length){
      showToast(`중복 예약 ${overlapIds.length}대가 있어 일괄 저장할 수 없습니다. 시간을 다시 확인해주세요.`,"warn");
      return;
    }
    const batchId=editing?.batchId || createLocationMaintenanceBatchId();
    const targetSet=new Set(targetMachineIds);
    for(const machineId of targetMachineIds){
      const docId=previousDocIdsByMachine.get(machineId);
      const payload={
        user: operator,
        userId: "location-maintenance",
        createdBy: appState.currentUser.uid || null,
        date,
        start,
        duration,
        purpose: "maint",
        status: "confirmed",
        autoClean: false,
        locationMaintenance: true,
        maintenanceBatchId: batchId,
        maintenanceReason: reason,
        maintenanceLocations: selectedLocations
      };
      if(docId){
        await updateBookingDoc(docId, payload);
      }else{
        await createBookingDoc({ machineId, ...payload });
      }
    }
    if(editing){
      for(const item of editing.bookings){
        if(item.docId && !targetSet.has(item.machineId)){
          await deleteBookingDoc(item.docId);
        }
      }
    }
    closeModal("location-maintenance-modal");
    const machineSummary=`${targetMachineIds.length}대 / ${selectedLocations.join(", ")}`;
    const message=editing ? "장소 유지보수 예약을 수정했습니다." : "장소 유지보수 예약을 등록했습니다.";
    showToast(`${message} (${machineSummary})`,`success`);
    addAdminActivity(editing ? "장소 유지보수 수정" : "장소 유지보수 예약", `${date} ${formatTime(start)} ${formatDurationText(duration)} / ${selectedLocations.join(", ")} / ${targetMachineIds.length}대`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("saveLocationMaintenance", error, "장소 유지보수 예약 저장에 실패했습니다.");
  }
}
function bindEvents(){
  const on=(id,evt,handler)=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener(evt,handler);
  };
  document.querySelectorAll(".role-btn").forEach(btn=>btn.addEventListener("click",()=>login(btn.dataset.role)));
  on("btn-login","click",loginWithCredentials);
  on("btn-signup","click",registerWithCredentials);
  on("btn-logout","click",logout);
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
  document.querySelectorAll("[data-date-delta]").forEach(btn=>btn.addEventListener("click",()=>updateDate(Number(btn.dataset.dateDelta))));
  on("btn-today","click",setToday);
  document.querySelectorAll("[data-month-delta]").forEach(btn=>btn.addEventListener("click",()=>changeMonth(Number(btn.dataset.monthDelta))));
  on("time-slider","input",e=>updateTimeFromSlider(e.target.value));
  on("btn-live","click",()=>resetToNow());
  on("btn-mobile-menu","click",()=>toggleMobileDrawer());
  on("btn-mobile-center-reserve","click",()=>openReserveWizard("dashboard"));
  on("btn-mobile-center-reserve-top","click",()=>openReserveWizard("dashboard"));
  on("btn-mobile-reserve-back","click",handleReserveWizardBack);
  on("btn-mobile-reserve-next","click",handleReserveWizardNext);
  on("btn-mobile-reserve-submit","click",submitReserveWizard);
  on("btn-mobile-reserve-cancel","click",closeReserveWizard);
  on("btn-save-booking","click",confirmBooking);
  on("btn-confirm-delete","click",confirmDelete);
  document.querySelectorAll("[data-close-modal]").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.closeModal)));
  document.querySelectorAll("[data-day-action]").forEach(btn=>btn.addEventListener("click",()=>handleDayAction(btn.dataset.dayAction)));
  on("btn-create-user","click",()=>refreshUsersFromDb());
  on("btn-save-user","click",saveUser);
  on("btn-create-machine","click",()=>openMachineModal("create"));
  on("btn-location-maintenance","click",()=>openLocationMaintenanceModal());
  on("btn-create-site","click",()=>openSiteModal("create"));
  on("btn-create-room","click",()=>openRoomModal("create"));
  on("btn-create-purpose","click",()=>openPurposeModal("create"));
  on("btn-create-manual-section","click",()=>openManualSectionModal("create"));
  on("btn-save-machine","click",saveMachine);
  on("btn-save-location-maintenance","click",saveLocationMaintenance);
  on("btn-save-site","click",saveSite);
  on("btn-save-room","click",saveRoom);
  on("btn-save-purpose","click",savePurpose);
  on("btn-save-manual-section","click",saveManualSection);
  on("btn-print","click",printReport);
  on("btn-stats-prev","click",()=>shiftStatsMonth(-1));
  on("btn-stats-next","click",()=>shiftStatsMonth(1));
  on("btn-stats-current","click",resetStatsMonthToCurrent);
  on("btn-export-audit-csv","click",exportAuditHistoryCsv);
  on("btn-export-activity-json","click",exportAdminActivityJson);
  on("btn-refresh-audit-history","click",()=>refreshAuditHistory(true));
  on("report-date","change",()=>{auditHistoryDate=""; refreshAuditHistory(true);});
  on("admin-search","input",applyAdminFilterInput);
  on("admin-status-filter","change",applyAdminFilterInput);
  on("admin-sort-filter","change",applyAdminFilterInput);
  on("btn-admin-filter-reset","click",resetAdminFilter);
  on("btn-admin-compact","click",()=>setAdminCompactMode(!appState.adminCompact));
  on("schedule-location-filter","change",renderSchedule);
  on("schedule-machine-search","input",renderSchedule);
  on("schedule-my-only","change",renderSchedule);
  on("btn-schedule-filter-reset","click",resetScheduleFilters);
  on("room-site-filter","change",renderRoomTable);
  on("btn-map-layout-toggle","click",toggleMapLayoutEditMode);
  on("btn-map-layout-cancel","click",cancelMapLayoutEdit);
  on("btn-map-layout-save","click",saveMapLayoutEdit);
  on("map-search","input",e=>{
    appState.map.searchText=(e.target.value || "").trim();
    renderMap();
    renderSelectionDetailPanel();
  });
  on("purpose-all","change",(e)=>setPurposeAll(e.target.checked));
  on("location-maintenance-all","change",renderLocationMaintenanceList);
  on("location-maintenance-date","change",e=>initLocationMaintenanceStartOptions(e.target.value));
  const locationMaintList=document.getElementById("location-maintenance-list");
  if(locationMaintList){
    locationMaintList.addEventListener("change",renderLocationMaintenanceImpact);
  }
  document.querySelectorAll(".side-tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>setDashboardSidePanel(btn.dataset.sidePanel));
  });
  document.querySelectorAll(".mobile-view-btn").forEach(btn=>{
    btn.addEventListener("click",()=>setDashboardMobileView(btn.dataset.mobileView));
  });
  document.querySelectorAll("[data-mobile-pane]").forEach(btn=>{
    btn.addEventListener("click",()=>setMobilePane(btn.dataset.mobilePane,true));
  });
  ["timeline-body","day-timeline"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.addEventListener("mousemove",handleTimelineHoverMove);
    el.addEventListener("mouseleave",handleTimelineHoverLeave);
    el.addEventListener("scroll",()=>updateTimelineIndicators(el));
    if(id==="timeline-body") el.addEventListener("click",handleTimelineSelectClick);
  });
  document.addEventListener("click",e=>{
    const editId=e.target.getAttribute("data-edit-user"); if(editId) openUserModal("edit",editId);
    const delId=e.target.getAttribute("data-del-user"); if(delId) deleteUser(delId);
    const approveUserId=e.target.getAttribute("data-approve-user"); if(approveUserId) approveUser(approveUserId);
    const editMachine=e.target.getAttribute("data-edit-machine"); if(editMachine) openMachineModal("edit",editMachine);
    const delMachine=e.target.getAttribute("data-del-machine"); if(delMachine) deleteMachine(delMachine);
    const editSite=e.target.getAttribute("data-edit-site"); if(editSite) openSiteModal("edit",editSite);
    const delSite=e.target.getAttribute("data-del-site"); if(delSite) deleteSite(delSite);
    const editRoom=e.target.getAttribute("data-edit-room"); if(editRoom) openRoomModal("edit",editRoom);
    const delRoom=e.target.getAttribute("data-del-room"); if(delRoom) deleteRoom(delRoom);
    const editLocationMaintenance=e.target.getAttribute("data-edit-location-maintenance"); if(editLocationMaintenance) openLocationMaintenanceModal(editLocationMaintenance);
    const delLocationMaintenance=e.target.getAttribute("data-del-location-maintenance"); if(delLocationMaintenance) deleteLocationMaintenanceGroup(delLocationMaintenance);
    const detailMachineBtn=e.target.closest("[data-detail-machine]");
    if(detailMachineBtn){
      selectMachineInMap(detailMachineBtn.getAttribute("data-detail-machine"),true);
    }
    const manualJump=e.target.closest("[data-manual-jump]"); if(manualJump) jumpToManualSection(manualJump.dataset.manualJump, manualJump.dataset.manualContentId || "manual-content");
    const editManualSection=e.target.getAttribute("data-edit-manual-section"); if(editManualSection) openManualSectionModal("edit",editManualSection);
    const delManualSection=e.target.getAttribute("data-del-manual-section"); if(delManualSection) deleteManualSection(delManualSection);
    const editPurpose=e.target.getAttribute("data-edit-purpose"); if(editPurpose) openPurposeModal("edit",editPurpose);
    const delPurpose=e.target.getAttribute("data-del-purpose"); if(delPurpose) deletePurpose(delPurpose);
    const adminView=e.target.closest(".admin-btn"); if(adminView&&adminView.dataset.adminView) switchAdminView(adminView.dataset.adminView);
    if(appState.mobile.layoutMode==="drawer" && appState.mobile.drawerOpen){
      const clickedDrawer=e.target.closest("#mobile-drawer");
      const clickedMenuBtn=e.target.closest("#btn-mobile-menu");
      if(!clickedDrawer && !clickedMenuBtn){
        appState.mobile.drawerOpen=false;
        renderMobileShell();
      }
    }
  });
  document.addEventListener("mousemove",handleResizeMove);
  document.addEventListener("mouseup",handleResizeEnd);
  document.addEventListener("mousemove",handleMapLayoutDragMove);
  document.addEventListener("mouseup",handleMapLayoutDragEnd);
  window.addEventListener("blur",()=>{
    if(appState.isResizing){
      handleResizeEnd({ clientX: appState.resizeStartX });
    }
    if(appState.map.layoutDrag){
      handleMapLayoutDragEnd();
    }else{
      appState.resizeIntentLocked=false;
    }
  });
  window.addEventListener("resize",()=>{
    appState.mobile.layoutMode=getMobileLayoutMode();
    if(appState.mobile.layoutMode==="rail") appState.mobile.drawerOpen=false;
    updateTimelineIndicators(document.getElementById("timeline-body"));
    updateTimelineIndicators(document.getElementById("day-timeline"));
    renderDashboardMobileView();
    rebuildFocusCache();
    applyMachineFocus();
    renderMobileShell();
  });
}

function boot(){
  initStartTimes();
  initTimelineHours();
  bindEvents();
  startClockTicker();
  subscribeConfig();
  const today=new Date();
  appState.currentYear=today.getFullYear();
  appState.currentMonth=today.getMonth()+1;
  ensureBookingBuckets();
  resetToNow();
  syncLiveModeUI();
  renderAll();
  initAuthListener();
  }

boot();























































































