import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { buildMobileReservationCategories, buildTimelineMachineIds, canRolePerform, canUserOperateBooking, clampHour, compareMachineIdAsc, deriveMachineCategory, formatTime, hasBookingOverlap, snapToHalfHour, sortByOrderThenName, validateBookingDrop, validateBookingResize } from "./core-utils.mjs";

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
let sites = [{ id: "site-default", name: "湲곕낯 Site", order: 1, active: true }];
let rooms = [
  { id: "room-a", siteId: "site-default", name: "Room A", order: 1, active: true, layout: { x: 4, y: 6, w: 44, h: 40 } },
  { id: "room-b", siteId: "site-default", name: "Room B", order: 2, active: true, layout: { x: 52, y: 6, w: 44, h: 40 } }
];
let machineRoomIds = {
  "A-01": "room-a", "A-02": "room-a", "A-03": "room-a", "A-04": "room-a",
  "B-01": "room-b", "B-02": "room-b", "B-03": "room-b", "B-04": "room-b"
};

const statusMeta = {
  free:{label:"?ъ슜 媛??,color:"var(--status-free)",tile:"tile-free"},
  process:{label:"怨듭젙 媛??,color:"var(--status-process)",tile:"tile-process"},
  maint:{label:"?좎?蹂댁닔",color:"var(--status-maint)",tile:"tile-maint"},
  em:{label:"?섍꼍 紐⑤땲??,color:"var(--status-em)",tile:"tile-em"},
  clean:{label:"泥?냼/?뚮룆",color:"var(--status-clean)",tile:"tile-clean"},
  other:{label:"湲고?",color:"var(--status-other)",tile:"tile-other"},
  pending:{label:"?뱀씤 ?湲?,color:"var(--status-pending)",tile:"tile-pending"},
  system:{label:"?먮룞 ?뚮룆",color:"var(--status-system)",tile:"tile-system"}
};

const defaultPurposeList = [
  { key: "process", label: "怨듭젙" },
  { key: "maint", label: "?좎?蹂댁닔" },
  { key: "em", label: "EM" },
  { key: "clean", label: "泥?냼" },
  { key: "other", label: "湲고?" }
];

let purposeList = [...defaultPurposeList];

const defaultManualSections = [
  {
    id: "manual-reservation",
    title: "?덉빟 ?깅줉 諛⑸쾿",
    body: "1. ?곷떒 硫붾돱?먯꽌 [?덉빟 愿由?濡??대룞?⑸땲??\n2. ?λ퉬, ?좎쭨, ?쒖옉 ?쒓컙, 紐⑹쟻, ?뚯슂 ?쒓컙???낅젰?⑸땲??\n3. ???踰꾪듉???뚮윭 ?덉빟???깅줉?⑸땲??\n4. 以묐났 ?쒓컙???덉쑝硫???λ릺吏 ?딆쑝誘濡??쒓컙???ㅼ떆 議곗젙?⑸땲??",
    imageUrl: "manual/reservation-step-02.png",
    imageCaption: "?덉빟 ?깅줉 ?붾㈃",
    order: 1,
    active: true
  },
  {
    id: "manual-dashboard",
    title: "??쒕낫???뺤씤 諛⑸쾿",
    body: "1. ??쒕낫?쒖뿉???꾩옱 媛???곹깭? ?ㅼ떆媛???꾨씪?몄쓣 ?뺤씤?⑸땲??\n2. ?μ냼 ?먮뒗 ?λ퉬瑜??대┃?섎㈃ ?곸꽭 ?꾪솴???뺤씤?????덉뒿?덈떎.\n3. ?쇱씠釉?ON ?곹깭?먯꽌???꾩옱 ?쒓컖 湲곗??쇰줈 ?붾㈃??媛깆떊?⑸땲??",
    imageUrl: "manual/reservation-step-03.png",
    imageCaption: "??쒕낫???뺤씤 ?붾㈃",
    order: 2,
    active: true
  },
  {
    id: "manual-notes",
    title: "?댁쁺 ?좎쓽?ы빆",
    body: "1. ?꾩옱??踰좏? ?댁쁺 ?④퀎?대?濡??붾㈃ 援ъ꽦怨??뺤콉??蹂寃쎈맆 ???덉뒿?덈떎.\n2. ?덉빟??蹂댁씠吏 ?딄굅????λ릺吏 ?딆쑝硫??꾩닔 ?낅젰媛믨낵 ?쒓컙??癒쇱? ?뺤씤?⑸땲??\n3. ?섏젙/??젣 沅뚰븳??蹂댁씠吏 ?딆쑝硫??댁쁺 愿由ъ옄?먭쾶 ?붿껌?⑸땲??",
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
  mobile:{activePane:"dashboard",layoutMode:"drawer",drawerOpen:false,canReserveNow:false,selectedReservationCategory:"all",selectedReservationSlot:null},
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
  if(min===0) return `${hour}?쒓컙`;
  if(hour===0) return `${min}遺?;
  return `${hour}?쒓컙 ${min}遺?;
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
  sites=[{ id: siteId, name: "湲곕낯 Site", order: 1, active: true }];
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
    showToast("?μ냼 ?곗씠?곌? Site/Room 援ъ“濡??먮룞 蹂?섎릺?덉뒿?덈떎.","info");
  }
}
function ensureSiteRoomState(){
  if(!Array.isArray(sites) || sites.length===0){
    sites=[{ id: "site-default", name: "湲곕낯 Site", order: 1, active: true }];
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
    warning.textContent=hasIssue ? "Room ?곸뿭??寃뱀묩?덈떎. 寃뱀묠 ?댁냼 ????ν븯?몄슂." : "";
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
    showToast("Room ?곸뿭??寃뱀퀜 ??ν븷 ???놁뒿?덈떎.","warn");
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
    showToast("Room 諛곗튂 醫뚰몴瑜???ν뻽?듬땲??","success");
    addAdminActivity("Room 諛곗튂 ???, `${formatDateLabel(getViewDate())} / ${getSiteById(selectedSiteId)?.name || "-"}`);
  }catch(error){
    reportAsyncError("saveMapLayoutEdit", error, "Room 諛곗튂 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
    sel.innerHTML = '<option value="" disabled>?좏깮 媛?ν븳 紐⑹쟻???놁뒿?덈떎</option>';
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
    roomSel.innerHTML='<option value="">Room ?놁쓬</option>';
    return;
  }
  const siteId=siteOptions.some(site=>site.id===currentSite) ? currentSite : siteOptions[0].id;
  siteSel.value=siteId;
  const currentRoom=roomSel.value;
  const roomOptions=getRoomsBySite(siteId,{includeInactive:true});
  roomSel.innerHTML=roomOptions.map(room=>`<option value="${room.id}">${room.name}</option>`).join("");
  if(!roomOptions.length){
    roomSel.innerHTML='<option value="">Room ?놁쓬</option>';
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
    sites = [{ id: "site-default", name: "湲곕낯 Site", order: 1, active: true }];
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
  sites=[{ id: "site-default", name: "湲곕낯 Site", order: 1, active: true }];
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
  }, ()=>showToast("?ㅼ젙 ?숆린?붿뿉 ?ㅽ뙣?덉뒿?덈떎.","warn"));
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
    reportAsyncError("ensureConfigDoc", error, "?ㅼ젙 珥덇린?붿뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function saveConfig(){
  if(!can("admin")) return;
  try{
    await setDoc(configRef, buildConfigPayload(), { merge: true });
  }catch(error){
    reportAsyncError("saveConfig", error, "?ㅼ젙 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
  }, ()=> showToast("?덉빟 ?숆린?붿뿉 ?ㅽ뙣?덉뒿?덈떎.","warn"));
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

function typeIcon(type){if(type==="success") return "??; if(type==="warn") return "?좑툘"; return "?뱄툘";}
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
    showToast("?ㅽ듃?뚰겕 ?곹깭媛 遺덉븞?뺥빀?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.","warn");
    return;
  }
  showToast(fallbackMessage || "?붿껌 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.","warn");
}

function getReportDateValue(){
  const reportDate=document.getElementById("report-date");
  return (reportDate && reportDate.value) ? reportDate.value : getViewDate();
}

function mapStatusLabel(status){
  if(status==="deleted") return "??젣";
  if(status==="rejected") return "諛섎젮";
  if(status==="pending") return "?湲?;
  return "?뺤젙";
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
    container.innerHTML='<div class="activity-empty">理쒓렐 湲곕줉???놁뒿?덈떎.</div>';
    return;
  }
  container.innerHTML=rows.slice(0,20).map(row=>{
    const detail=row.detail ? `<span>${row.detail}</span>` : "";
    return `<div class="activity-item"><strong>${row.action}</strong>${detail}<span>${formatActivityTime(row.timestamp)} 쨌 ${row.actor}</span></div>`;
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
    alert("?곕え 怨꾩젙???뺤씤?댁＜?몄슂.");
    return;
  }
  try{
    await signInWithEmailAndPassword(auth,demo.email,demo.password);
  }catch(e){
    alert("?곕え 怨꾩젙 濡쒓렇?몄뿉 ?ㅽ뙣?덉뒿?덈떎. 愿由ъ옄?먭쾶 臾몄쓽?섏꽭??");
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
  if(logoutBtn) logoutBtn.textContent=appState.currentUser.role==="guest" ? "濡쒓렇?? : "濡쒓렇?꾩썐";
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
  applyHeaderSession({id:"guest", name:"寃뚯뒪??, role:"guest"});
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
        alert("怨꾩젙 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.");
        window.location.replace("index.html");
        return;
      }
      const data = snap.data();
      if(!data.approved){
        await signOut(auth);
        alert("?뱀씤 ?湲?以묒엯?덈떎.");
        window.location.replace("index.html");
        return;
      }
      const role = String(data.role||"worker").trim().toLowerCase();
      await applySession({uid:user.uid, id:data.id||user.email, name:data.name||user.email, role});
    }catch(error){
      reportAsyncError("initAuthListener", error, "濡쒓렇???몄뀡 ?뺤씤???ㅽ뙣?덉뒿?덈떎.");
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
  if(view==="admin"&&!can("admin")){alert("?묎렐 沅뚰븳???놁뒿?덈떎.");return;}
  if(view==="manual"&&!canReadManual()){alert("?묎렐 沅뚰븳???놁뒿?덈떎.");return;}
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
function getMachineIdsForCategory(category="all"){
  if(category==="all") return [...bscIds];
  return bscIds.filter(id=>deriveMachineCategory(id)===category);
}

function getMobileReservationCategories(){
  return buildMobileReservationCategories(bscIds);
}

function getCurrentHalfHourSlot(nowHour=getNowHour()){
  return Math.max(9,Math.min(17.5,Math.floor(Math.min(17.999,nowHour)*2)/2));
}

function getChronographSlotEntries(date,slotStart,machineIds=bscIds){
  const slotEnd=slotStart+0.5;
  return machineIds.map(id=>{
    const booking=getBookingsForDate(id,date).find(b=>b.start<slotEnd && slotStart<(b.start+b.duration));
    if(!booking) return null;
    let purposeKey="other";
    let purposeLabel=statusMeta.other.label;
    if(booking.status==="pending"){
      purposeKey="pending";
      purposeLabel=statusMeta.pending.label;
    }else if(booking.user==="System"){
      purposeKey="system";
      purposeLabel=statusMeta.system.label;
    }else{
      purposeKey=statusMeta[booking.purpose] ? booking.purpose : "other";
      purposeLabel=getPurposeMeta(purposeKey).label;
    }
    return { id, booking, purposeKey, purposeLabel };
  }).filter(Boolean).sort((a,b)=>compareMachineIdAsc(a.id,b.id));
}

function getDefaultMobileReservationSlot(date,machineIds){
  const slotStarts=Array.from({ length:18 },(_,index)=>9+index*0.5);
  if(date===todayISO()) return getCurrentHalfHourSlot();
  const firstBusy=slotStarts.find(slotStart=>getChronographSlotEntries(date,slotStart,machineIds).length>0);
  return firstBusy ?? 9;
}

function getReservableLocationsByTime(date,time,duration=0.5,categoryFilter="all"){
  const categoryMachineIds=new Set(getMachineIdsForCategory(categoryFilter));
  return locations.map(loc=>{
    const count=bscIds.filter(id=>
      categoryMachineIds.has(id) &&
      getMachineLocation(id)===loc &&
      !isOverlap(id,date,time,duration)
    ).length;
    return { location:loc, count };
  }).filter(item=>item.count>0).sort((a,b)=>b.count-a.count||a.location.localeCompare(b.location));
}

function getReservableMachinesByTime(date,time,duration,location,categoryFilter="all"){
  const categoryMachineIds=new Set(getMachineIdsForCategory(categoryFilter));
  return bscIds
    .filter(id=>categoryMachineIds.has(id) && getMachineLocation(id)===location && !isOverlap(id,date,time,duration))
    .map(id=>({ id, mgmtNo:getMachineMgmtNo(id) || "-" }));
}

function computeSlotStateForChronograph(date,slotStart,machineIds=bscIds){
  const purposeCounts={ process:0, maint:0, em:0, clean:0, other:0, pending:0, system:0 };
  const entries=getChronographSlotEntries(date,slotStart,machineIds);
  if(entries.length===0){
    return { key:"free", color:statusMeta.free.color, label:statusMeta.free.label, count:0 };
  }
  entries.forEach(entry=>{
    const key=purposeCounts[entry.purposeKey]!==undefined ? entry.purposeKey : "other";
    purposeCounts[key]+=1;
  });
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
    return { key:bestKey, color:statusMeta.pending.color, label:statusMeta.pending.label, count:entries.length };
  }
  if(bestKey==="system"){
    return { key:bestKey, color:statusMeta.system.color, label:statusMeta.system.label, count:entries.length };
  }
  const meta=getPurposeMeta(bestKey);
  return { key:bestKey, color:meta.color, label:meta.label, count:entries.length };
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
  if(metric) metric.textContent=`媛?숇쪧 ${percent}%`;

  const canReserve=can("create") && hasAnyReservableSlot(getViewDate(),0.5);
  appState.mobile.canReserveNow=canReserve;
  const reserveState=!can("create") ? "readonly" : (canReserve ? "available" : "unavailable");
  const reserveLabel=reserveState==="available" ? "?덉빟 媛?? : (reserveState==="unavailable" ? "?덉빟 遺덇??? : "?쎄린 ?꾩슜");
  const reserveIcon=reserveState==="available" ? "?? : (reserveState==="unavailable" ? "!" : "??);
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
    topBtn.textContent=reserveState==="available" ? "?덉빟" : (reserveState==="unavailable" ? "遺덇?" : "?쎄린");
    topBtn.disabled=!canReserve;
    topBtn.title=reserveLabel;
    topBtn.setAttribute("aria-label",reserveLabel);
  }
}

function renderMobileReservationCategoryFilter(categories){
  const container=document.getElementById("mobile-category-filter");
  if(!container) return;
  const selected=appState.mobile.selectedReservationCategory || "all";
  container.innerHTML=categories.map(item=>`<button type="button" class="mobile-category-chip ${selected===item.key?"active":""}" data-mobile-category="${item.key}">${item.label}</button>`).join("");
  container.querySelectorAll("[data-mobile-category]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const nextCategory=btn.dataset.mobileCategory || "all";
      appState.mobile.selectedReservationCategory=nextCategory;
      appState.mobile.selectedReservationSlot=getDefaultMobileReservationSlot(getViewDate(),getMachineIdsForCategory(nextCategory));
      renderMobileChronograph270();
    });
  });
}

function renderMobileReservationSlotDetail(date,machineIds){
  const container=document.getElementById("mobile-chrono-detail");
  if(!container) return;
  const slotStart=appState.mobile.selectedReservationSlot;
  const category=appState.mobile.selectedReservationCategory || "all";
  const categoryLabel=category==="all" ? "?꾩껜" : category;
  if(typeof slotStart!=="number"){
    container.innerHTML=`<div class="mobile-reservation-detail-title">?좏깮???쒓컙? ?놁쓬</div><div class="mobile-reservation-detail-empty">${categoryLabel} ?λ퉬 湲곗? 媛???뺣낫媛 ?놁뒿?덈떎.</div>`;
    return;
  }
  const entries=getChronographSlotEntries(date,slotStart,machineIds);
  const title=`${formatTime(slotStart)}~${formatTime(slotStart+0.5)}`;
  if(!entries.length){
    container.innerHTML=`<div class="mobile-reservation-detail-title">${title}</div><div class="mobile-reservation-detail-empty">${categoryLabel} ?λ퉬 湲곗? ?대떦 ?쒓컙? 媛???λ퉬媛 ?놁뒿?덈떎.</div>`;
    return;
  }
  container.innerHTML=`<div class="mobile-reservation-detail-title">${title}</div><div class="mobile-reservation-detail-sub">${categoryLabel} ?λ퉬 ${entries.length}? 媛??以?/div><div class="mobile-reservation-detail-list">${entries.map(entry=>`<div class="mobile-reservation-detail-item"><strong>${entry.id}</strong><span>${entry.purposeLabel} 쨌 ${entry.booking.user}</span></div>`).join("")}</div>`;
}

function renderMobileChronograph270(){
  const svg=document.getElementById("mobile-chrono");
  if(!svg) return;
  svg.innerHTML="";
  const date=getViewDate();
  const categories=getMobileReservationCategories();
  if(!categories.some(item=>item.key===appState.mobile.selectedReservationCategory)){
    appState.mobile.selectedReservationCategory="all";
  }
  renderMobileReservationCategoryFilter(categories);
  const selectedCategory=appState.mobile.selectedReservationCategory || "all";
  const machineIds=getMachineIdsForCategory(selectedCategory);
  if(typeof appState.mobile.selectedReservationSlot!=="number"){
    appState.mobile.selectedReservationSlot=getDefaultMobileReservationSlot(date,machineIds);
  }
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
    const slotState=computeSlotStateForChronograph(date,slotStart,machineIds);
    const isSelected=appState.mobile.selectedReservationSlot===slotStart;
    if(isSelected){
      const halo=createSvgNode("path",{
        d:describeArcPath(cx,cy,radius,segStart,segEnd),
        fill:"none",
        stroke:"#243748",
        "stroke-width":"22",
        "stroke-linecap":"round",
        opacity:"0.16"
      });
      svg.appendChild(halo);
    }
    const path=createSvgNode("path",{
      d:describeArcPath(cx,cy,radius,segStart,segEnd),
      fill:"none",
      stroke:slotState.color,
      "stroke-width":isSelected ? "20" : "18",
      "stroke-linecap":"round",
      class:`mobile-chrono-hit ${isSelected?"is-selected":""}`.trim()
    });
    path.addEventListener("click",()=>{
      appState.mobile.selectedReservationSlot=slotStart;
      renderMobileChronograph270();
    });
    path.setAttribute("title",`${formatTime(slotStart)}~${formatTime(slotStart+0.5)} 쨌 ${slotState.label}`);
    svg.appendChild(path);
  }

  const categoryLabel=createSvgNode("text",{ x:cx, y:cy-4, "text-anchor":"middle", class:"mobile-chrono-center-label" });
  categoryLabel.textContent=selectedCategory==="all" ? "?꾩껜" : selectedCategory;
  svg.appendChild(categoryLabel);

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
    const label=createSvgNode("text",{ x:cx, y:cy+12, "text-anchor":"middle", class:"mobile-chrono-now-label" });
    label.textContent=`?꾩옱 ${formatTime(nowHour)}`;
    svg.appendChild(label);
  }

  renderMobileReservationSlotDetail(date,machineIds);
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
  if(title) title.textContent=appState.mobile.activePane==="reservation" ? "?덉빟 愿由? : "??쒕낫??;

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
      placeholder:"?대쫫/?꾩씠??沅뚰븳 寃??,
      statuses:[
        {value:"all",label:"?곹깭 ?꾩껜"},
        {value:"approved",label:"?뱀씤??},
        {value:"pending",label:"?뱀씤?湲?},
        {value:"role-admin",label:"愿由ъ옄"},
        {value:"role-supervisor",label:"媛먮룆??},
        {value:"role-worker",label:"?묒뾽??}
      ],
      sorts:[
        {value:"default",label:"湲곕낯??},
        {value:"name-asc",label:"?대쫫 ?ㅻ쫫李⑥닚"},
        {value:"name-desc",label:"?대쫫 ?대┝李⑥닚"}
      ]
    },
    machines:{
      placeholder:"?λ퉬ID/愿由щ쾲???μ냼/?ㅻ챸 寃??,
      statuses:[
        {value:"all",label:"?곹깭 ?꾩껜"},
        {value:"booked",label:"?덉빟 ?덉쓬"},
        {value:"unbooked",label:"?덉빟 ?놁쓬"}
      ],
      sorts:[
        {value:"default",label:"湲곕낯??},
        {value:"id-asc",label:"ID ?ㅻ쫫李⑥닚"},
        {value:"id-desc",label:"ID ?대┝李⑥닚"},
        {value:"count-desc",label:"?덉빟 ??留롮???}
      ]
    },
    locations:{
      placeholder:"Site/Room 寃??,
      statuses:[
        {value:"all",label:"?곹깭 ?꾩껜"},
        {value:"active",label:"?쒖꽦 Room"},
        {value:"inactive",label:"鍮꾪솢??Room"},
        {value:"used",label:"?λ퉬 諛곗젙??},
        {value:"empty",label:"?λ퉬 ?놁쓬"}
      ],
      sorts:[
        {value:"default",label:"湲곕낯??},
        {value:"site-asc",label:"Site ?ㅻ쫫李⑥닚"},
        {value:"name-asc",label:"Room ?ㅻ쫫李⑥닚"},
        {value:"name-desc",label:"Room ?대┝李⑥닚"},
        {value:"count-desc",label:"?λ퉬 ??留롮???}
      ]
    },
    purposes:{
      placeholder:"紐⑹쟻 肄붾뱶/?쒖떆紐?寃??,
      statuses:[
        {value:"all",label:"?곹깭 ?꾩껜"},
        {value:"global",label:"?꾩껜 ?곸슜"},
        {value:"scoped",label:"?λ퉬 吏??},
        {value:"used",label:"?덉빟 ?ъ슜以?},
        {value:"unused",label:"誘몄궗??}
      ],
      sorts:[
        {value:"default",label:"湲곕낯??},
        {value:"code-asc",label:"肄붾뱶 ?ㅻ쫫李⑥닚"},
        {value:"label-asc",label:"?쒖떆紐??ㅻ쫫李⑥닚"}
      ]
    },
    audit:{
      placeholder:"?λ퉬/?묒뾽??紐⑹쟻/?ъ쑀 寃??,
      statuses:[
        {value:"all",label:"?꾩껜"},
        {value:"confirmed",label:"?뺤젙"},
        {value:"deleted",label:"??젣"},
        {value:"rejected",label:"諛섎젮"}
      ],
      sorts:[
        {value:"default",label:"?쒓컙 ?ㅻ쫫李⑥닚"},
        {value:"time-desc",label:"?쒓컙 ?대┝李⑥닚"},
        {value:"user-asc",label:"?묒뾽???ㅻ쫫李⑥닚"},
        {value:"machine-asc",label:"?λ퉬 ?ㅻ쫫李⑥닚"}
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
    compactBtn.textContent=appState.adminCompact ? "湲곕낯 媛꾧꺽" : "??媛꾧꺽 異뺤냼";
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
  appState.mobile.selectedReservationSlot=null;
  initStartTimes();
  subscribeBookings();
  renderAll();
}

function setToday(){
  appState.currentDate=todayISO();
  const today=new Date();
  appState.currentYear=today.getFullYear();
  appState.currentMonth=today.getMonth()+1;
  appState.mobile.selectedReservationSlot=null;
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
    liveBtn.textContent="?쇱씠釉?ON";
    liveBtn.classList.add("active");
    liveBtn.disabled=true;
  }else{
    liveBtn.textContent="?쇱씠釉?蹂듦?";
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
    `<div class="summary-item"><div class="summary-label">?꾩껜 ?λ퉬</div><div class="summary-value">${stats.total}</div><div class="summary-sub">?깅줉 ?λ퉬 ??/div></div>`+
    `<div class="summary-item"><div class="summary-label">媛?숈쨷</div><div class="summary-value">${stats.running}</div><div class="summary-sub">?꾩옱 ?쒓컖 湲곗?</div></div>`+
    `<div class="summary-item"><div class="summary-label">媛?숇쪧</div><div class="summary-value">${stats.utilization}%</div><div class="summary-sub">${stats.running}/${stats.total}?</div></div>`+
    `<div class="summary-item"><div class="summary-label">?덉빟 ?덉젙</div><div class="summary-value">${stats.upcoming}</div><div class="summary-sub">${formatDateLabel(getViewDate())}</div></div>`;
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
  const modeLabel=appState.isLiveMode ? "?쇱씠釉? : "議고쉶";
  document.getElementById("timeline-date-label").textContent=`${label} 쨌 ${modeLabel} ${formatTime(appState.currentHour)}`;
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
  const prefix=appState.isLiveMode ? "?꾩옱 ?쒓컖" : "議고쉶 ?쒓컖";
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
    tree.innerHTML='<p class="map-empty-text">?쒖꽦 Site媛 ?놁뒿?덈떎.</p>';
    canvas.innerHTML='<p class="map-empty-text">?쒖떆??Room???놁뒿?덈떎.</p>';
    if(titleEl) titleEl.textContent="Room 諛곗튂";
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
    editBtn.textContent=appState.map.layoutEditMode ? "?몄쭛 醫낅즺" : "諛곗튂 ?몄쭛";
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
      `<span class="tree-node-main"><span class="tree-node-toggle">${siteExpanded?"??:"??}</span><span class="tree-node-label">${site.name}</span></span>`+
      `<span class="tree-node-meta">${siteMachineTotal}?</span>`;
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
          `<span class="tree-node-main"><span class="tree-node-toggle">${roomExpanded?"??:"??}</span><span class="tree-node-label">${room.name}</span></span>`+
          `<span class="tree-node-meta">${machineIds.length}? / 媛??${runningCount}?</span>`;
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
            const statusLabel=booking ? (booking.user==="System" ? "?뚮룆" : getPurposeMeta(booking.purpose).label) : "?ъ슜 媛??;
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
            empty.textContent="?쒖떆???λ퉬媛 ?놁뒿?덈떎.";
            machineList.appendChild(empty);
          }
          roomList.appendChild(machineList);
        }
      }
      if(!roomList.childElementCount){
        const empty=document.createElement("p");
        empty.className="map-empty-text";
        empty.textContent="議곌굔??留욌뒗 Room???놁뒿?덈떎.";
        roomList.appendChild(empty);
      }
      siteBlock.appendChild(roomList);
    }
    tree.appendChild(siteBlock);
  }
  if(!tree.childElementCount){
    tree.innerHTML='<p class="map-empty-text">寃??議곌굔??留욌뒗 Site/Room???놁뒿?덈떎.</p>';
  }

  canvas.innerHTML="";
  if(titleEl) titleEl.textContent=selectedSite.name;
  if(subtitleEl){
    const totalRooms=getRoomsBySite(selectedSite.id).length;
    subtitleEl.textContent=appState.map.layoutEditMode ? `Room ${totalRooms}媛?쨌 諛곗튂 ?몄쭛以? : `Room ${totalRooms}媛?;
  }
  const visibleRooms=getRoomsBySite(selectedSite.id).filter(room=>{
    const ids=getMachinesByRoomId(room.id);
    const matched=getMatchedRoomMachineIds(room,ids,query,selectedSite);
    if(!query) return true;
    if(String(room.name).toLowerCase().includes(query) || String(selectedSite.name).toLowerCase().includes(query)) return true;
    return matched.length>0;
  });
  if(!visibleRooms.length){
    canvas.innerHTML='<p class="map-empty-text">寃??議곌굔??留욌뒗 Room???놁뒿?덈떎.</p>';
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
    box.innerHTML=`<header><strong>${room.name}</strong><span>${machineIds.length}? / 媛??${runningCount}?</span></header>`;
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
        button.title=getBookingTooltipText(booking) || `${id}: ?ъ슜 媛??;
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
      empty.textContent=revealMachines ? "?쒖떆???λ퉬 ?놁쓬" : "Room ?대┃ ???λ퉬 ?쒖떆";
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
      handle.setAttribute("aria-label","Room ?ш린 議곗젅");
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
  if(booking.status==="pending") return {tile:statusMeta.pending.tile,labelText:`${statusMeta.pending.label} 쨌 ${booking.user}`};
  if(booking.user==="System") return {tile:statusMeta.system.tile,labelText:statusMeta.system.label};
  const meta=getPurposeMeta(booking.purpose);
  return {tile:meta.tile,labelText:`${meta.label} 쨌 ${booking.user}`};
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
      ? `${booking.user} 쨌 ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`
      : "?꾩옱 ?덉빟 ?놁쓬";
    const purposeText=booking
      ? (booking.user==="System" ? "?먮룞 ?뚮룆" : getPurposeMeta(booking.purpose).label)
      : "?ъ슜 媛??;
    body.innerHTML=
      `<div class="detail-section">`+
      `<h4>${machineId}</h4>`+
      `<p><strong>?꾩튂:</strong> ${site ? site.name : "-"} / ${room ? room.name : "-"}</p>`+
      `<p><strong>愿由щ쾲??</strong> ${getMachineMgmtNo(machineId) || "-"}</p>`+
      `<p><strong>?ㅻ챸:</strong> ${getMachineDesc(machineId) || "-"}</p>`+
      `<p><strong>?꾩옱 ?곹깭:</strong> ${purposeText}</p>`+
      `<p><strong>?꾩옱 ?덉빟:</strong> ${bookingText}</p>`+
      `<p><strong>?ㅼ쓬 媛??</strong> ${availability.text}</p>`+
      `</div>`;
    return;
  }
  if(roomId){
    const room=getRoomById(roomId);
    const site=room ? getSiteById(room.siteId) : null;
    const summary=getRoomSummary(roomId);
    const nextText=summary.nextAvailable===null ? "?뱀씪 異붽? 媛???쒓컙 ?놁쓬" : `${formatTime(summary.nextAvailable)}遺??媛??;
    body.innerHTML=
      `<div class="detail-section">`+
      `<h4>${room ? room.name : "Room"}</h4>`+
      `<p><strong>Site:</strong> ${site ? site.name : "-"}</p>`+
      `<p><strong>?λ퉬 ??</strong> ${summary.machineCount}?</p>`+
      `<p><strong>媛??以?</strong> ${summary.running}?</p>`+
      `<p><strong>?덉빟 ?덉젙:</strong> ${summary.upcoming}嫄?/p>`+
      `<p><strong>?ㅼ쓬 鍮??щ’:</strong> ${nextText}</p>`+
      `</div>`+
      `<div class="detail-machine-list">`+
      summary.machineIds.map(id=>{
        const booking=getCurrentBooking(id);
        const badge=booking ? (booking.user==="System" ? "?뚮룆" : getPurposeMeta(booking.purpose).label) : "?ъ슜 媛??;
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
      `<p><strong>Room ??</strong> ${siteRooms.length}媛?/p>`+
      `<p><strong>?λ퉬 ??</strong> ${machineCount}?</p>`+
      `<p><strong>媛??以?</strong> ${runningCount}?</p>`+
      `<p><strong>?덈궡:</strong> 醫뚯륫?먯꽌 Room???댁뼱 ?λ퉬瑜??좏깮?섏꽭??</p>`+
      `</div>`;
    return;
  }
  body.innerHTML='<p class="detail-empty">醫뚯륫 ?몃━?먯꽌 Site/Room ?먮뒗 ?λ퉬瑜??좏깮?섏꽭??</p>';
}

function showTooltip(event,id,booking){
  const tooltip=document.getElementById("map-tooltip");
  const wrapper=document.getElementById("map-wrapper");
  const rect=wrapper.getBoundingClientRect();
  tooltip.style.display="block";
  tooltip.style.left=`${event.clientX-rect.left+14}px`;
  tooltip.style.top=`${event.clientY-rect.top+14}px`;
  tooltip.textContent=booking?`${id}: ${booking.user} 쨌 ${booking.status==="pending"?"?뱀씤 ?湲?:getPurposeMeta(booking.purpose).label}`:`${id}: ?ъ슜 媛??;
}
function hideTooltip(){document.getElementById("map-tooltip").style.display="none";}
function getBookingTooltipText(booking){
  if(!booking) return "";
  return `?덉빟?? ${booking.user}\n?ъ슜?쒓컙: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`;
}

function isMachineBusyAt(id,date,hour){
  return getBookingsForDate(id,date).some(booking=>booking.start<=hour && hour<(booking.start+booking.duration));
}

function formatWaitText(diffHour){
  const rounded=Math.max(0,Math.round(diffHour*2)/2);
  if(rounded===0) return "吏湲?;
  const minutes=Math.round(rounded*60);
  if(minutes<60) return `${minutes}遺???;
  const h=Math.floor(minutes/60);
  const m=minutes%60;
  if(m===0) return `${h}?쒓컙 ??;
  return `${h}?쒓컙 ${m}遺???;
}

function getMachineAvailabilityHint(id,date,referenceHour){
  const hour=clampHour(referenceHour);
  if(!isMachineBusyAt(id,date,hour)){
    if(date===todayISO()) return { busy:false, text:"吏湲??ъ슜 媛?? };
    return { busy:false, text:`${formatTime(hour)}遺???ъ슜 媛?? };
  }
  const nextStart=findFirstAvailableStart(id,date,hour+0.5);
  if(nextStart===null){
    return { busy:true, text:"?뱀씪 異붽? ?ъ슜 媛???쒓컙???놁뒿?덈떎." };
  }
  const wait=Math.max(0,nextStart-hour);
  return { busy:true, text:`${formatTime(nextStart)}遺??媛??(${formatWaitText(wait)})` };
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
  if(label) label.textContent=`媛?대뱶 ${formatTime(hour)}`;
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
    if(nowLabel) nowLabel.textContent=`?꾩옱 ${formatTime(nowHour)}`;
  }
  if(selectedIndicator){
    const showSelected=!appState.isLiveMode && Math.abs(selectedHour-nowHour)>=(1/120);
    selectedIndicator.classList.toggle("hidden",!showSelected);
    if(showSelected){
      setTimelineIndicatorPosition(container,".time-indicator.selected",selectedHour);
      const selectedLabel=selectedIndicator.querySelector(".time-indicator-label");
      if(selectedLabel) selectedLabel.textContent=`議고쉶 ${formatTime(selectedHour)}`;
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
      bar.textContent=booking.status==="pending"?`${booking.user} (?湲?`:booking.user;
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
    item.innerHTML=`<div class="status-icon" style="color:${meta.color}">??/div><div class="status-info"><div class="status-id">${id}</div><div class="status-text">${meta.text}</div>${availability?`<div class="status-next">${availability.text}</div>`:""}</div><div class="status-badge" style="background:${meta.color}">${meta.label}</div>`;
    item.addEventListener("mouseenter",()=>setMachineFocus(id,true));
    item.addEventListener("mouseleave",()=>setMachineFocus(null,false));
    list.appendChild(item);
  }
}

function getStatusMeta(booking){
  if(!booking) return {color:statusMeta.free.color,label:statusMeta.free.label,text:"?湲?以?};
  if(booking.status==="pending") return {color:statusMeta.pending.color,label:statusMeta.pending.label,text:`${booking.user} (?뱀씤 ?湲?`};
  if(booking.user==="System") return {color:statusMeta.system.color,label:statusMeta.system.label,text:"?쒖뒪???뚮룆"};
  const meta=getPurposeMeta(booking.purpose);
  return {color:meta.color,label:meta.label,text:`${booking.user} ?묒뾽 以?};
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
    legendItem.innerHTML=`<span class="legend-dot" style="background:${meta.color}"></span><span>${meta.label} (${counts[key]}?)</span>`;
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
    const options=['<option value="all">?꾩껜 ?μ냼</option>', ...locations.map(loc=>`<option value="${loc}">${loc}</option>`)];
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
    container.innerHTML='<div class="schedule-mobile-empty">議곌굔??留욌뒗 ?λ퉬媛 ?놁뒿?덈떎.</div>';
    return;
  }
  for(const group of groups){
    const section=document.createElement("section");
    section.className="mobile-location-section";
    section.innerHTML=`<h4 class="mobile-location-title">${group.location} <span>${group.ids.length}?</span></h4>`;
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
        ? `${formatTime(activeBooking.start)}-${formatTime(activeBooking.start+activeBooking.duration)} 쨌 ${activeBooking.user}`
        : "?꾩옱 媛???놁쓬";
      const nextText=nextBooking
        ? `${formatTime(nextBooking.start)} ?쒖옉 쨌 ${nextBooking.user}`
        : "?ㅼ쓬 ?덉빟 ?놁쓬";
      const windowText=bookingsForDay.length
        ? `${formatTime(bookingsForDay[0].start)}-${formatTime(bookingsForDay[bookingsForDay.length-1].start+bookingsForDay[bookingsForDay.length-1].duration)}`
        : "?덉빟 ?놁쓬";
      card.innerHTML=`<div class="mobile-machine-head"><strong>${id}</strong><span>${getMachineMgmtNo(id)||"-"}</span></div><div class="mobile-availability ${availability.busy?"busy":"free"}">${availability.text}</div><div class="mobile-machine-brief"><span>?꾩옱</span><strong>${currentText}</strong></div><div class="mobile-machine-brief"><span>?ㅼ쓬</span><strong>${nextText}</strong></div><div class="mobile-machine-count">?ㅻ뒛 ?덉빟 ${bookingsForDay.length}嫄?쨌 ?댁쁺 ${windowText}</div>`;
      if(can("create")){
        const nextStart=findFirstAvailableStart(id,date,getMinReservableHour(date));
        const addBtn=document.createElement("button");
        addBtn.type="button";
        addBtn.className="mobile-add-booking";
        addBtn.textContent=nextStart===null?"?덉빟 遺덇?":"?덉빟 異붽?";
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
    tr.innerHTML='<td colspan="19" class="schedule-empty">議곌굔??留욌뒗 ?λ퉬/?덉빟???놁뒿?덈떎.</td>';
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
    locCell.innerHTML=`<span class="schedule-location-name">${loc}</span><span class="schedule-location-count">${ids.length}?</span>`;
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
            block.innerHTML=`<span>${booking.user} (?湲?</span>`;
          }else if(booking.user==="System"){
            block.style.backgroundColor=statusMeta.system.color;block.innerHTML="<span>?뚮룆</span>";
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
            delBtn.textContent="??젣";
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
      showToast("?쒕옒洹??뺣낫媛 鍮꾩뼱 ?덉뒿?덈떎.","warn");
      return;
    }
    let payload;
    try{
      payload=JSON.parse(payloadRaw);
    }catch(parseError){
      reportAsyncError("handleDrop:parse", parseError, "?쒕옒洹??뺣낫瑜??쎌? 紐삵뻽?듬땲??");
      return;
    }
    if(!payload || typeof payload.machineId!=="string" || typeof payload.docId!=="string"){
      showToast("?좏슚?섏? ?딆? ?쒕옒洹??곗씠?곗엯?덈떎.","warn");
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
    showToast(movedMachine ? "?덉빟 ?λ퉬/?쒓컙??蹂寃쏀뻽?듬땲??" : "?덉빟 ?쒓컙??蹂寃쏀뻽?듬땲??","success");
  }catch(error){
    reportAsyncError("handleDrop", error, "?덉빟 ?대룞???ㅽ뙣?덉뒿?덈떎.");
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
  block.setAttribute("data-resize-label",`${endText} 쨌 ${durationText}${validation.ok?"":" (遺덇?)"}`);
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
  block.setAttribute("data-resize-label",`${formatTime(booking.start+duration)} 쨌 ${formatDurationText(duration)}`);
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
    showToast("?덉빟 ?쒓컙??議곗젙?덉뒿?덈떎.","success");
  }catch(error){
    reportAsyncError("handleResizeEnd", error, "?덉빟 ?쒓컙 議곗젙???ㅽ뙣?덉뒿?덈떎.");
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
    alert("沅뚰븳???놁뒿?덈떎.");
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
    const purpose=b.user==="System"?"?먮룞 ?뚮룆":getPurposeMeta(b.purpose).label;
    const status=b.status==="pending"?"?뱀씤 ?湲?:"?뺤젙";
    return `<tr><td>${b.id}</td><td>${b.user}</td><td>${purpose}</td><td>${status}</td><td>${b.date}</td><td>${formatTime(b.start)}</td><td>${formatTime(b.start+b.duration)}</td></tr>`;
  }).join(""):'<tr><td colspan="7">?대떦 ?좎쭨???덉빟???놁뒿?덈떎.</td></tr>';
  const html=`<!doctype html><html lang="ko"><head><meta charset="UTF-8" /><title>?λ퉬 ?쇱씪 ?댁쁺 由ы룷??/title><style>body{font-family:"Malgun Gothic",sans-serif;padding:24px;color:#222}h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}.meta{text-align:right;font-size:12px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #999;padding:8px;text-align:center}th{background:#f0f0f0}.footer{margin-top:40px;display:flex;justify-content:space-between}.sign{width:45%;border-bottom:1px solid #ccc;height:36px;margin-top:30px}</style></head><body><h1>?λ퉬 ?쇱씪 ?댁쁺 由ы룷??/h1><div class="meta">湲곗? ?좎쭨: ${date}<br />?앹꽦 ?쒓컖: ${now.toLocaleString()}<br />由ы룷??ID: ${reportId}<br />異쒕젰?? ${appState.currentUser.name}</div><table><thead><tr><th>?λ퉬</th><th>?묒뾽??/th><th>紐⑹쟻</th><th>?곹깭</th><th>?좎쭨</th><th>?쒖옉</th><th>醫낅즺</th></tr></thead><tbody>${tableRows}</tbody></table><div class="footer"><div style="width:45%"><strong>?섑뻾??/strong><div class="sign"></div></div><div style="width:45%"><strong>寃?좎옄</strong><div class="sign"></div></div></div><script>window.onload=()=>window.print();<\/script></body></html>`;
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
  const peakLabel=peak.count>0 ? `${formatTime(peak.h)}-${formatTime(peak.h+1)}` : "?놁쓬";
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
    container.innerHTML='<div class="calendar-mobile-empty">?쒖떆???좎쭨媛 ?놁뒿?덈떎.</div>';
    return;
  }
  for(const entry of mobileEntries){
    const { dateKey, summary, isToday } = entry;
    const item=document.createElement("button");
    item.type="button";
    item.className=`calendar-mobile-item ${isToday?"today":""}`.trim();
    const rangeText=(summary.firstStart===null || summary.lastEnd===null)
      ? "?덉빟 ?놁쓬"
      : `${formatTime(summary.firstStart)}-${formatTime(summary.lastEnd)}`;
    const utilText=isCompactWorker ? "" : `<span>媛?숇쪧 ${summary.utilization}%</span>`;
    const pendingText=summary.pending>0 ? `<span class="pending-text">?湲?${summary.pending}嫄?/span>` : "";
    item.innerHTML=`<div class="calendar-mobile-head"><strong>${dateKey.replace(/-/g,". ")}</strong><span class="calendar-mobile-count">?덉빟 ${summary.total}嫄?/span></div><div class="calendar-mobile-meta"><span>?댁쁺 ?쒓컙? ${rangeText}</span>${utilText}${pendingText}</div>`;
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
    cell.innerHTML=`<div class="cal-day-head"><span class="cal-day-num">${d}</span>${summary.pending>0?'<span class="cal-pending-dot" title="?뱀씤 ?湲??덉빟 ?덉쓬"></span>':''}</div><div class="cal-day-badges"><span class="cal-badge">?덉빟 ${summary.total}嫄?/span><span class="cal-badge ${summary.pending>0?"pending":""}">?湲?${summary.pending}嫄?/span><span class="cal-badge">?쇳겕 ${summary.peakLabel}</span></div><div class="util-indicator"><span class="util-value ${summary.utilClass}">${summary.utilization}%</span><div class="util-bar-bg"><div class="util-bar-fill ${summary.utilClass}" style="width:${summary.utilization}%"></div></div></div>`;
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
  document.getElementById("day-modal-title").textContent=`${date.replace(/-/g,". ")} ?곸꽭 ?쇱젙`;
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
    showToast("?덉빟 愿由??붾㈃?쇰줈 ?대룞?덉뒿?덈떎.","info");
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
    empty.textContent="?몄텧 以묒씤 硫붾돱???뱀뀡???놁뒿?덈떎.";
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
      ? "硫붾돱??肄섑뀗痢좉? ?놁뒿?덈떎. 愿由ъ옄 ?붾㈃?먯꽌 ?뱀뀡??異붽??섏꽭??"
      : "?꾩옱 ?대엺 媛?ν븳 硫붾돱?쇱씠 ?놁뒿?덈떎.";
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
    body.textContent=section.body || "?댁슜 ?놁쓬";
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
    td.textContent="?깅줉??硫붾돱???뱀뀡???놁뒿?덈떎.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  sections.forEach(section=>{
    const tr=document.createElement("tr");
    const values=[
      String(section.order || 0),
      section.title,
      section.imageUrl ? "?곌껐?? : "?놁쓬",
      section.active!==false ? "?몄텧" : "?④?"
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
    editBtn.textContent="?섏젙";
    const delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="btn-del";
    delBtn.dataset.delManualSection=section.id;
    delBtn.textContent="??젣";
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
    showToast("愿由ъ옄留?硫붾돱?쇱쓣 ?몄쭛?????덉뒿?덈떎.","warn");
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
    if(title) title.textContent="硫붾돱???뱀뀡 ?깅줉";
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
    showToast("?섏젙??硫붾돱???뱀뀡??李얠쓣 ???놁뒿?덈떎.","warn");
    return;
  }
  if(title) title.textContent="硫붾돱???뱀뀡 ?섏젙";
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
    showToast("愿由ъ옄留?硫붾돱?쇱쓣 ?몄쭛?????덉뒿?덈떎.","warn");
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
    if(!title){ alert("?쒕ぉ???낅젰?섏꽭??"); return; }
    if(!body){ alert("蹂몃Ц???낅젰?섏꽭??"); return; }
    if(originalId){
      const idx=manualSections.findIndex(section=>section.id===originalId);
      if(idx<0){ alert("硫붾돱???뱀뀡 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎."); return; }
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
    addAdminActivity(originalId ? "硫붾돱???섏젙" : "硫붾돱???깅줉", title);
    showToast(originalId ? "硫붾돱???뱀뀡???섏젙?덉뒿?덈떎." : "硫붾돱???뱀뀡???깅줉?덉뒿?덈떎.","success");
  }catch(error){
    reportAsyncError("saveManualSection", error, "硫붾돱???뱀뀡 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function deleteManualSection(sectionId){
  if(!isAdminUser()){
    showToast("愿由ъ옄留?硫붾돱?쇱쓣 ??젣?????덉뒿?덈떎.","warn");
    return;
  }
  const section=manualSections.find(item=>item.id===sectionId);
  if(!section) return;
  if(!confirm(`硫붾돱???뱀뀡 [${section.title}] ????젣?섏떆寃좎뒿?덇퉴?`)) return;
  try{
    manualSections=manualSections.filter(item=>item.id!==sectionId);
    await saveConfig();
    renderManualAdmin();
    addAdminActivity("硫붾돱????젣", section.title);
    showToast("硫붾돱???뱀뀡????젣?덉뒿?덈떎.","success");
  }catch(error){
    reportAsyncError("deleteManualSection", error, "硫붾돱???뱀뀡 ??젣???ㅽ뙣?덉뒿?덈떎.");
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
      reportAsyncError("refreshUsersFromDb", error, "?ъ슜??紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
    reportAsyncError("refreshUsersFromDb", error, "?ъ슜??紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
  }finally{
    usersFetchPromise=null;
  }
}

async function approveUser(uid){
  try{
    await updateDoc(doc(db,"users",uid),{approved:true});
    await refreshUsersFromDb(true);
    addAdminActivity("怨꾩젙 ?뱀씤", `uid: ${uid}`);
  }catch(error){
    reportAsyncError("approveUser", error, "怨꾩젙 ?뱀씤???ㅽ뙣?덉뒿?덈떎.");
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
    tr.innerHTML=`<td>${user.name}</td><td>${user.id}</td><td><span class="status-badge role-${user.role}">${user.role.toUpperCase()}</span></td><td><span style="color:${statusColor};font-weight:900">??${statusLabel}</span></td><td>${approveBtn}<button class="btn-edit" data-edit-user="${user.uid}">\uC218\uC815</button>${canDelete?`<button class="btn-del" data-del-user="${user.uid}">\uC0AD\uC81C</button>`:""}</td>`;
    tbody.appendChild(tr);
  }
}

function renderAuditHistory(){
  const tbody=document.getElementById("audit-history-body");
  if(!tbody) return;
  renderAuditSummary(auditHistoryRows);
  const rows=getFilteredAuditRows();
  if(rows.length===0){
    tbody.innerHTML='<tr><td colspan="6">議고쉶???댁쁺 ?대젰???놁뒿?덈떎.</td></tr>';
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
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#3498db"></span>?꾩껜 ${total}嫄?/span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#2ecc71"></span>?뺤젙 ${confirmed}嫄?/span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#e74c3c"></span>??젣 ${deleted}嫄?/span>`+
    `<span class="audit-summary-chip"><span class="audit-summary-dot" style="background:#9b59b6"></span>諛섎젮 ${rejected}嫄?/span>`;
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
    showToast("諛깆뾽???댁쁺 ?대젰???놁뒿?덈떎.","warn");
    return;
  }
  const headers=["?좎쭨","?λ퉬","?묒뾽??,"紐⑹쟻","?곹깭","?쒖옉","醫낅즺","?ъ쑀"];
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
  showToast("?댁쁺 ?대젰 CSV 諛깆뾽????ν뻽?듬땲??","success");
  addAdminActivity("?댁쁺 ?대젰 諛깆뾽", `${date} ${rows.length}嫄?);
}

function exportAdminActivityJson(){
  if(!can("admin")) return;
  const rows=readAdminActivity();
  if(rows.length===0){
    showToast("諛깆뾽??愿由ъ옄 ?묒뾽 ?대젰???놁뒿?덈떎.","warn");
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
  showToast("?묒뾽 ?대젰 JSON 諛깆뾽????ν뻽?듬땲??","success");
  addAdminActivity("?묒뾽 ?대젰 諛깆뾽", `${rows.length}嫄?);
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
  if(tbody) tbody.innerHTML='<tr><td colspan="6">?댁쁺 ?대젰??遺덈윭?ㅻ뒗 以?..</td></tr>';
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
        purposeLabel:data.user==="System" ? "?먮룞 ?뚮룆" : getPurposeMeta(data.purpose).label,
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
    reportAsyncError("refreshAuditHistory", error, "?댁쁺 ?대젰??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
    if(tbody) tbody.innerHTML='<tr><td colspan="6">?댁쁺 ?대젰??遺덈윭?ㅼ? 紐삵뻽?듬땲??</td></tr>';
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
    capacityNote.textContent=`媛?숇쪧 湲곗? ?⑸웾: ${bscIds.length}? 횞 ${monthDays}??횞 9?쒓컙 = ${capacityHours.toFixed(1)}?쒓컙`;
  }

  const kpiList=document.getElementById("stats-kpi-list");
  if(kpiList){
    kpiList.innerHTML=
      `<div class="stats-kpi-item"><span class="stats-kpi-label">珥??덉빟 嫄댁닔</span><span class="stats-kpi-value">${totalCount}嫄?/span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">珥??ъ슜 ?쒓컙</span><span class="stats-kpi-value">${totalHours.toFixed(1)}h</span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">?됯퇏 ?덉빟 ?쒓컙</span><span class="stats-kpi-value">${avgDuration.toFixed(2)}h</span></div>`+
      `<div class="stats-kpi-item"><span class="stats-kpi-label">?ㅻ퉬 媛?숇쪧</span><span class="stats-kpi-value">${utilization.toFixed(1)}%</span></div>`;
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
      purposeBars.innerHTML='<div class="stats-empty">?좏깮 ???덉빟 ?곗씠?곌? ?놁뒿?덈떎.</div>';
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
        <td>${row.machines}?</td>
        <td>${row.count}嫄?/td>
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
      topMachinesEl.innerHTML='<li class="stats-empty">?좏깮 ???덉빟 ?곗씠?곌? ?놁뒿?덈떎.</li>';
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

function handleMobileReserveTrigger(){
  if(appState.mobile.activePane==="reservation"){
    const presetTime=typeof appState.mobile.selectedReservationSlot==="number" ? appState.mobile.selectedReservationSlot : null;
    const categoryFilter=appState.mobile.selectedReservationCategory || "all";
    openReserveWizard("chronograph",presetTime,categoryFilter);
    return;
  }
  openReserveWizard("dashboard");
}

function openReserveWizard(source="dashboard",presetTime=null,categoryFilter="all"){
  if(!can("create")){
    showToast("?덉빟 沅뚰븳???놁뒿?덈떎.","warn");
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
    categoryFilter,
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
    label.textContent=state.source==="chronograph" ? "1/4 ?쒓컙쨌紐⑹쟻 ?좏깮 (?쒓컙 ?먮룞 ?낅젰??" : "3/4 ?쒓컙쨌紐⑹쟻 ?좏깮";
    const minHour=getMinReservableHour(fields.date);
    if(fields.time<minHour && fields.date===todayISO()) fields.time=minHour;
    const timeOptions=[];
    for(let h=9; h<18; h+=0.5){
      if(fields.date===todayISO() && h<minHour) continue;
      timeOptions.push(`<option value="${h}">${formatTime(h)}</option>`);
    }
    const durationOptions=[
      { value:0.5, label:"30遺? },
      { value:1, label:"1?쒓컙" },
      { value:1.5, label:"1?쒓컙 30遺? },
      { value:2, label:"2?쒓컙" },
      { value:3, label:"3?쒓컙" },
      { value:4, label:"4?쒓컙" }
    ];
    const purposeOptions=(fields.machineId ? getPurposesForMachine(fields.machineId) : purposeList);
    if(purposeOptions.length && !purposeOptions.some(p=>p.key===fields.purpose)) fields.purpose=purposeOptions[0].key;
    body.innerHTML=`<div class="mobile-field-grid">
      <div class="form-group"><label for="wizard-date">?좎쭨</label><input id="wizard-date" type="date" value="${fields.date}" /></div>
      <div class="form-group"><label for="wizard-time">?쒖옉 ?쒓컙</label><select id="wizard-time">${timeOptions.join("")}</select></div>
      <div class="form-group"><label for="wizard-duration">?뚯슂 ?쒓컙</label><select id="wizard-duration">${durationOptions.map(opt=>`<option value="${opt.value}">${opt.label}</option>`).join("")}</select></div>
      <div class="form-group"><label for="wizard-purpose">紐⑹쟻</label><select id="wizard-purpose">${purposeOptions.map(opt=>`<option value="${opt.key}">${opt.label}</option>`).join("")}</select></div>
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
    label.textContent=state.source==="chronograph" ? "2/4 ?μ냼 ?좏깮" : "1/4 ?μ냼 ?좏깮";
    const list=getReservableLocationsByTime(fields.date,fields.time,fields.duration,state.categoryFilter || "all");
    if(!list.length){
      body.innerHTML='<div class="mobile-warn-text">?좏깮???쒓컙???덉빟 媛?ν븳 ?μ냼媛 ?놁뒿?덈떎. ?쒓컙??癒쇱? 蹂寃쏀빐二쇱꽭??</div>';
      return;
    }
    if(!fields.location || !list.some(item=>item.location===fields.location)) fields.location=list[0].location;
    body.innerHTML=`<div class="mobile-choice-grid">${list.map(item=>`<button type="button" class="mobile-choice-btn ${fields.location===item.location?"active":""}" data-wizard-location="${item.location}">${item.location} <span style="float:right;color:#607286">${item.count}? 媛??/span></button>`).join("")}</div>`;
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
    label.textContent=state.source==="chronograph" ? "3/4 ?λ퉬 ?좏깮" : "2/4 ?λ퉬 ?좏깮";
    const machineList=getReservableMachinesByTime(fields.date,fields.time,fields.duration,fields.location,state.categoryFilter || "all");
    if(!machineList.length){
      body.innerHTML='<div class="mobile-warn-text">?대떦 ?쒓컙/?μ냼???덉빟 媛?ν븳 ?λ퉬媛 ?놁뒿?덈떎. ?댁쟾 ?④퀎?먯꽌 ?ㅼ떆 ?좏깮?댁＜?몄슂.</div>';
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

  label.textContent="4/4 ?덉빟 ?뺤씤";
  body.innerHTML=`<div class="mobile-summary-box">
    <div>?좎쭨: <strong>${fields.date}</strong></div>
    <div>?쒓컙: <strong>${formatTime(fields.time)} ~ ${formatTime(fields.time+fields.duration)}</strong></div>
    <div>?μ냼: <strong>${fields.location || "-"}</strong></div>
    <div>?λ퉬: <strong>${fields.machineId || "-"}</strong></div>
    <div>紐⑹쟻: <strong>${getPurposeMeta(fields.purpose).label}</strong></div>
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
    if(!fields.date){ showToast("?좎쭨瑜??좏깮?댁＜?몄슂.","warn"); return; }
    if(fields.time<9 || fields.time+fields.duration>18){ showToast("?댁쁺 ?쒓컙(09:00~18:00)??踰쀬뼱?ъ뒿?덈떎.","warn"); return; }
    if(fields.date===todayISO()){
      const minHour=getMinReservableHour(fields.date);
      if(fields.time<minHour){ showToast(`?ㅻ뒛 ?덉빟? ${formatTime(minHour)} ?댄썑濡?媛?ν빀?덈떎.`,"warn"); return; }
    }
  }
  if(step==="location" && !fields.location){
    showToast("?μ냼瑜??좏깮?댁＜?몄슂.","warn");
    return;
  }
  if(step==="machine" && !fields.machineId){
    showToast("?λ퉬瑜??좏깮?댁＜?몄슂.","warn");
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
  if(!machineId){ showToast("?λ퉬瑜??좏깮?댁＜?몄슂.","warn"); return; }
  if(time<9 || time+duration>18){ showToast("?댁쁺 ?쒓컙(09:00~18:00)??踰쀬뼱?ъ뒿?덈떎.","warn"); return; }
  if(isOverlap(machineId,date,time,duration)){
    showToast("?좏깮 ?쒓컙???대? ?덉빟???덉뒿?덈떎. ?쒓컙???ㅼ떆 ?뺤씤?댁＜?몄슂.","warn");
    const idx=state.steps.indexOf("timePurpose");
    if(idx>=0){ state.stepIndex=idx; renderReserveWizardStep(); }
    return;
  }
  const allowedPurposes=getPurposesForMachine(machineId);
  if(allowedPurposes.length && !allowedPurposes.some(item=>item.key===purpose)){
    showToast("?좏깮??紐⑹쟻? ?대떦 ?λ퉬?먯꽌 ?ъ슜?????놁뒿?덈떎.","warn");
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
    addAdminActivity("紐⑤컮???덉빟 ?깅줉", `${machineId} ${date} ${formatTime(time)}-${formatTime(time+duration)}`);
    closeReserveWizard();
    appState.mobile.drawerOpen=false;
    switchView("dashboard");
    showToast("?덉빟???깅줉?섏뿀?듬땲??");
  }catch(error){
    reportAsyncError("submitReserveWizard", error, "紐⑤컮???덉빟 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

function openBookingModal(id,start){
  if(!can("create")){showToast("?덉빟 ?앹꽦 沅뚰븳???놁뒿?덈떎.","warn");return;}
  appState.bookingEditTarget=null;
  appState.bookingTarget={id,start};
  setBookingModalMode(false);
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${formatTime(start)} ?쒖옉`;
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
  if(title) title.textContent=isEdit ? "?묒뾽 ?덉빟 ?섏젙" : "?묒뾽 ?덉빟 ?깅줉";
  if(saveBtn) saveBtn.textContent=isEdit ? "蹂寃???? : "?덉빟 ???;
  if(recurringRow) recurringRow.hidden=isEdit;
  if(editNote) editNote.hidden=!isEdit;
}

function openBookingEditModal(id,docId){
  const booking=findBookingByDocId(id,docId);
  if(!booking || booking.user==="System"){
    showToast("?섏젙 媛?ν븳 ?덉빟??李얠쓣 ???놁뒿?덈떎.","warn");
    return;
  }
  if(!canEditBooking(booking)){
    showToast("蹂몄씤 ?덉빟留??섏젙?????덉뒿?덈떎.","warn");
    return;
  }
  appState.bookingTarget={id,start:booking.start};
  appState.bookingEditTarget={id,docId};
  setBookingModalMode(true);
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${booking.date} ${formatTime(booking.start)} ?쒖옉`;
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
  if(!can("edit")){showToast("??젣 沅뚰븳???놁뒿?덈떎.","warn");return;}
  appState.deleteTarget = { id, docId };
  const reason = document.getElementById("delete-reason");
  if(reason) reason.value = "";
  const impactEl=document.getElementById("delete-impact");
  const booking=findBookingByDocId(id,docId);
  if(impactEl && booking){
    const linkedBuffer=(booking.autoClean)
      ? getBookingsForDate(id, booking.date).find(b=>b.user==="System" && b.start===booking.start+booking.duration && b.duration===0.5)
      : null;
    const linkedText=linkedBuffer ? "?곕룞 ?먮룞?뚮룆 1嫄댁씠 ?④퍡 ??젣?⑸땲??" : "?곕룞 ?먮룞?뚮룆 ??젣 ?놁쓬.";
    impactEl.innerHTML=`??? ${id} / ${booking.user}<br>?쒓컙: ${booking.date} ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}<br>?곹뼢: ${linkedText}`;
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
      showToast("??젣 ?ъ쑀瑜??낅젰?댁＜?몄슂.","warn");
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
          deleteReason: "?곕룞 ?덉빟 ??젣",
          deletedBy,
          deletedAt: serverTimestamp()
        });
      }
    }
    closeModal("delete-modal");
    appState.deleteTarget = null;
    showToast("?덉빟????젣?섏뿀?듬땲??","info");
    addAdminActivity("?덉빟 ??젣", `${id} ${booking.user} ${booking.date} ${formatTime(booking.start)}~${formatTime(booking.start+booking.duration)}`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("confirmDelete", error, "?덉빟 ??젣???ㅽ뙣?덉뒿?덈떎.");
  }
}

function findLinkedAutoCleanBooking(machineId,date,startHour){
  return getBookingsForDate(machineId,date).find(b=>b.user==="System" && b.start===startHour && b.duration===0.5);
}

async function markBookingDeleted(docId,reason){
  if(!docId) return;
  await updateDoc(doc(db,"bookings",docId),{
    status:"deleted",
    deleteReason:reason || "?덉빟 蹂寃쎌쑝濡???젣",
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
      await markBookingDeleted(oldBuffer.docId,"?곕룞 ?덉빟 蹂寃?);
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
    showToast("?섏젙???덉빟??李얠쓣 ???놁뒿?덈떎.","warn");
    return false;
  }
  if(!canEditBooking(booking)){
    showToast("蹂몄씤 ?덉빟留??섏젙?????덉뒿?덈떎.","warn");
    return false;
  }
  if(isWorkerUser() && booking.date===todayISO() && booking.start<=getNowHour()){
    showToast("?대? ?쒖옉???덉빟? ?섏젙?????놁뒿?덈떎.","warn");
    return false;
  }
  if(isOverlap(id,date,start,duration,docId)){
    showToast("?대떦 ?좎쭨/?쒓컙???덉빟??以묐났?⑸땲??","warn");
    return false;
  }
  const allowedPurposes=getPurposesForMachine(id);
  if(allowedPurposes.length && !allowedPurposes.some(p=>p.key===purpose)){
    showToast("?좏깮??紐⑹쟻? ?대떦 ?λ퉬???ъ슜?????놁뒿?덈떎.","warn");
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
  showToast("?덉빟??蹂寃쎈릺?덉뒿?덈떎.","success");
  addAdminActivity("?덉빟 ?섏젙", `${id} ${date} ${formatTime(start)} ${formatTime(start+duration)}`);
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
    if(!user||!date){showToast("?뺣낫瑜?紐⑤몢 ?낅젰?댁＜?몄슂.","warn");return;}
    if(start < 9 || start+duration>18){showToast("?댁쁺 ?쒓컙(09:00~18:00)??珥덇낵?⑸땲??","warn");return;}
    if(isWorkerUser() && date===todayISO()){
      const minHour=getMinReservableHour(date);
      if(start<minHour){
        showToast(`?ㅻ뒛 ?덉빟? ${formatTime(minHour)} ?댄썑濡쒕쭔 ?깅줉?????덉뒿?덈떎.`,"warn");
        return;
      }
    }
    const allowedPurposes = getPurposesForMachine(appState.bookingTarget.id);
    if(allowedPurposes.length && !allowedPurposes.some(p=>p.key===purpose)){
      showToast("?좏깮??紐⑹쟻? ?대떦 ?λ퉬???ъ슜?????놁뒿?덈떎.","warn");
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
        if(!recurring){showToast("?대떦 ?좎쭨/?쒓컙???덉빟??以묐났?⑸땲??","warn");return;}
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
    if(success===0){showToast("紐⑤뱺 諛섎났 ?덉빟??以묐났?쇰줈 ?명빐 ?ㅽ뙣?덉뒿?덈떎.","warn");return;}
    showToast(status==="pending"?"?덉빟 ?붿껌???깅줉?섏뿀?듬땲??":"?덉빟???뺤젙?섏뿀?듬땲??");
    if(recurring) showToast(`${success}嫄댁쓽 諛섎났 ?덉빟???깅줉?섏뿀?듬땲??`,"info");
    addAdminActivity("?덉빟 ?깅줉", `${appState.bookingTarget.id} ${date} ${formatTime(start)} ${success}嫄?);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("confirmBooking", error, "?덉빟 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
  if(!confirm(`?λ퉬 ${id}瑜???젣?섏떆寃좎뒿?덇퉴?`)) return;
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
    addAdminActivity("?λ퉬 ??젣", id);
  }catch(error){
    reportAsyncError("deleteMachine", error, "?λ퉬 ??젣???ㅽ뙣?덉뒿?덈떎.");
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
    if(title) title.textContent="?λ퉬 ?깅줉";
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
  if(title) title.textContent="?λ퉬 ?섏젙";
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
    if(!nextId){alert("?λ퉬 ID瑜??낅젰?섏꽭??");return;}
    if(!nextRoomId || !nextRoom){alert("Room???좏깮?섏꽭??");return;}
    const isEdit=!!originalId;
    if(originalId){
      if(originalId!==nextId && bscIds.includes(nextId)){
        alert("?대? 議댁옱?섎뒗 ?λ퉬 ID?낅땲??");
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
        alert("?대? 議댁옱?섎뒗 ?λ퉬 ID?낅땲??");
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
    showToast("?λ퉬 紐⑸줉??媛깆떊?섏뿀?듬땲??","info");
    await saveConfig();
    ensureBookingBuckets();
    renderAll();
    addAdminActivity(isEdit ? "?λ퉬 ?섏젙" : "?λ퉬 ?깅줉", nextId);
  }catch(error){
    reportAsyncError("saveMachine", error, "?λ퉬 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
    tr.innerHTML=`<td>${row.id}</td><td>${row.mgmt}</td><td>${row.location}</td><td title="${row.desc.replace(/"/g,"&quot;")}">${descShort}</td><td>${row.count}</td><td><button class="btn-edit" data-edit-machine="${row.id}">?섏젙</button><button class="btn-del" data-del-machine="${row.id}">??젣</button></td>`;
    tbody.appendChild(tr);
  }
}

















function renderRoomSiteFilterOptions(){
  const sel=document.getElementById("room-site-filter");
  if(!sel) return;
  const current=sel.value;
  const allSites=sortByOrderThenName(sites);
  const options=['<option value="all">?꾩껜 Site</option>',...allSites.map(site=>`<option value="${site.id}">${site.name}</option>`)];
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
    const status=row.active!==false ? "?쒖꽦" : "鍮꾪솢??;
    tr.innerHTML=`<td>${row.id}</td><td>${row.name}</td><td>${row.roomCount}媛?/td><td>${status}</td><td><button class="btn-edit" data-edit-site="${row.id}">?섏젙</button><button class="btn-del" data-del-site="${row.id}">??젣</button></td>`;
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
    const status=row.active!==false ? "?쒖꽦" : "鍮꾪솢??;
    tr.innerHTML=`<td>${row.name}</td><td>${row.siteName}</td><td>${row.machineCount}?</td><td>${Math.round(l.x)}, ${Math.round(l.y)}, ${Math.round(l.w)}, ${Math.round(l.h)}</td><td>${status}</td><td><button class="btn-edit" data-edit-room="${row.id}">?섏젙</button><button class="btn-del" data-del-room="${row.id}">??젣</button></td>`;
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
    if(title) title.textContent="Site ?깅줉";
    if(original) original.value="";
    if(idInput){idInput.value=""; idInput.disabled=false;}
    if(nameInput) nameInput.value="";
    if(activeInput) activeInput.checked=true;
    return;
  }
  const site=getSiteById(siteId);
  if(!site) return;
  if(title) title.textContent="Site ?섏젙";
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
    if(!nextName){alert("Site紐낆쓣 ?낅젰?섏꽭??");return;}
    const isEdit=!!originalId;
    if(!isEdit){
      if(sites.some(site=>site.id===nextId)){alert("?대? 議댁옱?섎뒗 Site ID?낅땲??");return;}
      sites=[...sites,{ id: nextId, name: nextName, order: sites.length+1, active: nextActive }];
    }else{
      const idx=sites.findIndex(site=>site.id===originalId);
      if(idx<0){alert("Site ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.");return;}
      sites[idx]={...sites[idx], name: nextName, active: nextActive};
    }
    closeModal("site-modal");
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity(isEdit ? "Site ?섏젙" : "Site ?깅줉", `${nextId} (${nextName})`);
  }catch(error){
    reportAsyncError("saveSite", error, "Site ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function deleteSite(siteId){
  try{
    const site=getSiteById(siteId);
    if(!site) return;
    const childRooms=getRoomsBySite(siteId,{includeInactive:true});
    if(childRooms.length>0){
      alert("?섏쐞 Room???덈뒗 Site????젣?????놁뒿?덈떎.");
      return;
    }
    if(!confirm(`${site.name} Site瑜???젣?섏떆寃좎뒿?덇퉴?`)) return;
    sites=sites.filter(item=>item.id!==siteId);
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity("Site ??젣", `${siteId}`);
  }catch(error){
    reportAsyncError("deleteSite", error, "Site ??젣???ㅽ뙣?덉뒿?덈떎.");
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
    if(title) title.textContent="Room ?깅줉";
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
  if(title) title.textContent="Room ?섏젙";
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
    if(!name){alert("Room紐낆쓣 ?낅젰?섏꽭??");return;}
    if(!getSiteById(siteId)){alert("Site瑜??좏깮?섏꽭??");return;}
    const normalized=normalizeRoomLayout(layout,0,1);
    const isEdit=!!originalId;
    if(isEdit){
      const idx=rooms.findIndex(room=>room.id===originalId);
      if(idx<0){alert("Room ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.");return;}
      const duplicate=rooms.some(room=>room.id!==originalId && room.name===name);
      if(duplicate){alert("?숈씪??Room紐낆씠 ?대? 議댁옱?⑸땲??");return;}
      rooms[idx]={...rooms[idx], name, siteId, active, layout:normalized};
      bscIds.forEach(id=>{
        if(getMachineRoomId(id)===originalId){
          machineLocations[id]=name;
        }
      });
    }else{
      const duplicate=rooms.some(room=>room.name===name);
      if(duplicate){alert("?숈씪??Room紐낆씠 ?대? 議댁옱?⑸땲??");return;}
      const roomId=makeSafeId(name,"room");
      rooms=[...rooms,{ id:roomId, siteId, name, order:rooms.length+1, active, layout:normalized }];
    }
    ensureSiteRoomState();
    closeModal("room-modal");
    await saveConfig();
    renderAll();
    addAdminActivity(isEdit ? "Room ?섏젙" : "Room ?깅줉", `${name}`);
  }catch(error){
    reportAsyncError("saveRoom", error, "Room ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function deleteRoom(roomId){
  try{
    const room=getRoomById(roomId);
    if(!room) return;
    const assigned=bscIds.some(id=>getMachineRoomId(id)===roomId);
    if(assigned){
      alert("?λ퉬媛 諛곗젙??Room? ??젣?????놁뒿?덈떎.");
      return;
    }
    if(!confirm(`${room.name} Room????젣?섏떆寃좎뒿?덇퉴?`)) return;
    rooms=rooms.filter(item=>item.id!==roomId);
    if(appState.map.selectedRoomId===roomId){
      appState.map.selectedRoomId=null;
      appState.map.selectedMachineId=null;
    }
    ensureSiteRoomState();
    await saveConfig();
    renderAll();
    addAdminActivity("Room ??젣", room.name);
  }catch(error){
    reportAsyncError("deleteRoom", error, "Room ??젣???ㅽ뙣?덉뒿?덈떎.");
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
      ? "?꾩껜"
      : `${purpose.machines.length}?`;
    tr.innerHTML=`<td>${purpose.key}</td><td>${purpose.label}</td><td>${scope}</td><td><button class="btn-edit" data-edit-purpose="${purpose.key}">?섏젙</button><button class="btn-del" data-del-purpose="${purpose.key}">??젣</button></td>`;
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
    if(title) title.textContent="媛??紐⑹쟻 ?깅줉";
    if(original) original.value="";
    if(keyInput){ keyInput.value=""; keyInput.disabled=false; }
    if(labelInput) labelInput.value="";
    setPurposeAll(true);
    return;
  }
  const existing=purposeList.find(p=>p.key===key);
  if(!existing) return;
  if(title) title.textContent="媛??紐⑹쟻 ?섏젙";
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
    if(!key || !label){alert("肄붾뱶? ?쒖떆紐낆쓣 ?낅젰?섏꽭??");return;}
    if(!applyAll && selected.length === 0){
      alert("?곸슜???λ퉬瑜??섎굹 ?댁긽 ?좏깮?섏꽭??");
      return;
    }
    if(!original){
      if(purposeList.some(p=>p.key===key)){alert("?대? 議댁옱?섎뒗 肄붾뱶?낅땲??");return;}
      purposeList=[...purposeList,{key,label,machines: applyAll ? null : selected}];
    }else{
      const idx=purposeList.findIndex(p=>p.key===original);
      if(idx>-1) purposeList[idx]={key:original,label,machines: applyAll ? null : selected};
    }
    closeModal("purpose-modal");
    await saveConfig();
    renderAll();
    addAdminActivity(original ? "紐⑹쟻 ?섏젙" : "紐⑹쟻 ?깅줉", `${original || key} -> ${label}`);
  }catch(error){
    reportAsyncError("savePurpose", error, "媛??紐⑹쟻 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function deletePurpose(key){
  try{
    if(isPurposeUsed(key)){
      alert("?대떦 紐⑹쟻???덉빟???ъ슜 以묒씠?댁꽌 ??젣?????놁뒿?덈떎.");
      return;
    }
    if(!confirm(`${key} 紐⑹쟻????젣?섏떆寃좎뒿?덇퉴?`)) return;
    purposeList=purposeList.filter(p=>p.key!==key);
    await saveConfig();
    renderAll();
    addAdminActivity("紐⑹쟻 ??젣", key);
  }catch(error){
    reportAsyncError("deletePurpose", error, "媛??紐⑹쟻 ??젣???ㅽ뙣?덉뒿?덈떎.");
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
    if(title) title.textContent="怨꾩젙 ?앹꽦";
    if(originalId) originalId.value="";
    if(nameInput) nameInput.value="";
    if(idInput){idInput.value=""; idInput.disabled=false;}
    if(roleSelect) roleSelect.value="worker";
    return;
  }
  const user=users.find(u=>u.uid===uid);
  if(!user) return;
  if(title) title.textContent="怨꾩젙 ?섏젙";
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
    if(!id||!name){alert("?뺣낫瑜?紐⑤몢 ?낅젰?댁＜?몄슂.");return;}
    if(!uid){
      alert("?뚯썝媛?낆? 濡쒓렇???붾㈃?먯꽌 吏꾪뻾?⑸땲??");
      closeModal("user-modal");
      return;
    }
    await updateDoc(doc(db,"users",uid),{name,role});
    closeModal("user-modal");
    await refreshUsersFromDb(true);
    addAdminActivity("?ъ슜???섏젙", `${id} (${role})`);
  }catch(error){
    reportAsyncError("saveUser", error, "?ъ슜????μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
  }
}

async function deleteUser(uid){
  try{
    if(!confirm("?뺣쭚 ??젣?섏떆寃좎뒿?덇퉴?")) return;
    await deleteDoc(doc(db,"users",uid));
    await refreshUsersFromDb(true);
    addAdminActivity("?ъ슜????젣", `uid: ${uid}`);
  }catch(error){
    reportAsyncError("deleteUser", error, "?ъ슜????젣???ㅽ뙣?덉뒿?덈떎.");
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
          operator:booking.user || "?쒖꽕 ?먭?",
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
  if(title) title.textContent=group ? "?μ냼 ?좎?蹂댁닔 ?덉빟 ?섏젙" : "?μ냼 ?좎?蹂댁닔 ?덉빟";
  if(sub) sub.textContent=group
    ? "湲곗〈???깅줉???μ냼 ?좎?蹂댁닔 ?덉빟???쇨큵 ?섏젙?⑸땲?? 蹂寃??댁슜? ?좏깮???μ냼 ?꾩껜???숈씪?섍쾶 諛섏쁺?⑸땲??"
    : "?좏깮???μ냼???λ퉬 ?꾩껜???숈씪???좎?蹂댁닔 ?덉빟???깅줉?⑸땲??";
  if(saveBtn) saveBtn.textContent=group ? "蹂寃???? : "?덉빟 ???;
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
  impact.textContent=`?좏깮 ?μ냼 ${selected.length}怨?/ ????λ퉬 ${machineCount}?`;
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
    return `<label><input type="checkbox" data-location-maintenance value="${loc}" ${checkedAttr} ${disabled} /> ${loc} (${count}?)</label>`;
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
    td.textContent="?깅줉???μ냼 ?좎?蹂댁닔 ?덉빟???놁뒿?덈떎.";
    td.className="table-empty";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for(const group of groups){
    const tr=document.createElement("tr");
    const locationsText=group.locations.length ? `${group.locations.join(", ")} (${group.locations.length}怨?` : "-";
    const timeText=`${formatTime(group.start)} ~ ${formatTime(group.start+group.duration)} (${formatDurationText(group.duration)})`;
    const actionTd=document.createElement("td");
    const editBtn=document.createElement("button");
    editBtn.type="button";
    editBtn.className="btn-edit";
    editBtn.dataset.editLocationMaintenance=group.key;
    editBtn.textContent="?섏젙";
    const delBtn=document.createElement("button");
    delBtn.type="button";
    delBtn.className="btn-del";
    delBtn.dataset.delLocationMaintenance=group.key;
    delBtn.textContent="??젣";
    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    [
      formatDateLabel(group.date),
      timeText,
      locationsText,
      group.operator,
      group.reason || "-",
      `${group.machineCount}?`
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
    showToast("愿由ъ옄留??μ냼 ?좎?蹂댁닔 ?덉빟???깅줉?????덉뒿?덈떎.","warn");
    return;
  }
  const targetKey=(typeof groupKey==="string" && groupKey.trim()) ? groupKey : null;
  const group=targetKey ? getLocationMaintenanceGroup(targetKey) : null;
  if(targetKey && !group){
    showToast("?섏젙???μ냼 ?좎?蹂댁닔 ?덉빟??李얠쓣 ???놁뒿?덈떎.","warn");
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
  if(operatorInput) operatorInput.value="?쒖꽕 ?먭?";
  if(reasonInput) reasonInput.value="";
  if(allToggle) allToggle.checked=true;
  renderLocationMaintenanceList();
}

async function deleteLocationMaintenanceGroup(groupKey){
  if(!isAdminUser()){
    showToast("愿由ъ옄留??μ냼 ?좎?蹂댁닔 ?덉빟????젣?????덉뒿?덈떎.","warn");
    return;
  }
  const group=getLocationMaintenanceGroup(groupKey);
  if(!group){
    showToast("??젣???μ냼 ?좎?蹂댁닔 ?덉빟??李얠쓣 ???놁뒿?덈떎.","warn");
    return;
  }
  const summary=`${formatDateLabel(group.date)} ${formatTime(group.start)} ~ ${formatTime(group.start+group.duration)} / ${group.locations.join(", ")}`;
  if(!confirm(`?좏깮???μ냼 ?좎?蹂댁닔 ?덉빟????젣?섏떆寃좎뒿?덇퉴?\n${summary}`)) return;
  try{
    for(const item of group.bookings){
      if(item.docId) await deleteBookingDoc(item.docId);
    }
    showToast(`?μ냼 ?좎?蹂댁닔 ?덉빟????젣?덉뒿?덈떎. (${group.machineCount}?)`,`success`);
    addAdminActivity("?μ냼 ?좎?蹂댁닔 ??젣", `${group.date} ${formatTime(group.start)} / ${group.locations.join(", ")} / ${group.machineCount}?`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("deleteLocationMaintenanceGroup", error, "?μ냼 ?좎?蹂댁닔 ?덉빟 ??젣???ㅽ뙣?덉뒿?덈떎.");
  }
}

async function saveLocationMaintenance(){
  if(!isAdminUser()){
    showToast("愿由ъ옄留??μ냼 ?좎?蹂댁닔 ?덉빟???깅줉?????덉뒿?덈떎.","warn");
    return;
  }
  try{
    const editing=appState.locationMaintenanceEdit ? getLocationMaintenanceGroup(appState.locationMaintenanceEdit.key) : null;
    if(appState.locationMaintenanceEdit && !editing){
      showToast("湲곗〈 ?μ냼 ?좎?蹂댁닔 ?덉빟 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂.","warn");
      return;
    }
    const date=document.getElementById("location-maintenance-date")?.value || "";
    const start=Number(document.getElementById("location-maintenance-start")?.value || 0);
    const duration=Number(document.getElementById("location-maintenance-duration")?.value || 0);
    const operator=(document.getElementById("location-maintenance-operator")?.value || "").trim() || "?쒖꽕 ?먭?";
    const reason=(document.getElementById("location-maintenance-reason")?.value || "").trim();
    const selectedLocations=normalizeLocationMaintenanceLocations(getLocationMaintenanceSelectedLocations());
    if(!date){ showToast("?좎쭨瑜??좏깮?댁＜?몄슂.","warn"); return; }
    if(selectedLocations.length===0){ showToast("?좎?蹂댁닔 ????μ냼瑜??좏깮?댁＜?몄슂.","warn"); return; }
    if(start<9 || start+duration>18){ showToast("?댁쁺 ?쒓컙(09:00~18:00)??踰쀬뼱?⑸땲??","warn"); return; }
    const targetMachineIds=getLocationMaintenanceTargetMachineIds(selectedLocations);
    if(targetMachineIds.length===0){
      showToast("?좏깮???μ냼???깅줉???λ퉬媛 ?놁뒿?덈떎.","warn");
      return;
    }
    const previousDocIdsByMachine=new Map((editing?.bookings || []).map(item=>[item.machineId,item.docId]));
    const overlapIds=targetMachineIds.filter(machineId=>isOverlap(machineId,date,start,duration,previousDocIdsByMachine.get(machineId)));
    if(overlapIds.length){
      showToast(`以묐났 ?덉빟 ${overlapIds.length}?媛 ?덉뼱 ?쇨큵 ??ν븷 ???놁뒿?덈떎. ?쒓컙???ㅼ떆 ?뺤씤?댁＜?몄슂.`,"warn");
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
    const machineSummary=`${targetMachineIds.length}? / ${selectedLocations.join(", ")}`;
    const message=editing ? "?μ냼 ?좎?蹂댁닔 ?덉빟???섏젙?덉뒿?덈떎." : "?μ냼 ?좎?蹂댁닔 ?덉빟???깅줉?덉뒿?덈떎.";
    showToast(`${message} (${machineSummary})`,`success`);
    addAdminActivity(editing ? "?μ냼 ?좎?蹂댁닔 ?섏젙" : "?μ냼 ?좎?蹂댁닔 ?덉빟", `${date} ${formatTime(start)} ${formatDurationText(duration)} / ${selectedLocations.join(", ")} / ${targetMachineIds.length}?`);
    refreshAuditHistory(true);
  }catch(error){
    reportAsyncError("saveLocationMaintenance", error, "?μ냼 ?좎?蹂댁닔 ?덉빟 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
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
  on("btn-mobile-center-reserve","click",handleMobileReserveTrigger);
  on("btn-mobile-center-reserve-top","click",handleMobileReserveTrigger);
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
