import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const appState = {
  currentUser:null,currentView:"dashboard",currentHour:9,
  currentDate:todayISO(),currentYear:new Date().getFullYear(),
  currentMonth:new Date().getMonth()+1,dragPayload:null,
  isResizing:false,resizeStartX:0,resizeOriginDuration:0,resizeTarget:null,
  bookingTarget:{id:null,start:9},approvalTarget:null,deleteTarget:null,
  isLiveMode:true,dayModalDate:null,dashboardSidePanel:"status",
  focusMachineId:null,mobileDashboardView:"summary"
};

let users = [];
const demoAccounts = {
  worker: { email: "demo-worker@reservation.local", password: "demo1234" }
};

const bookings = Object.fromEntries(bscIds.map(id=>[id,[]]));
let bookingsUnsub = null;
let configUnsub = null;
let clockTicker = null;
const configState = { loaded: false, exists: false };
let bookingsQueryKey = "";
let usersFetchedAt = 0;
let usersFetchPromise = null;



function todayISO(){return new Date().toISOString().slice(0,10);} 
function formatTime(val){
  const totalMinutes=Math.max(0,Math.round((Number(val)||0)*60));
  const h=Math.floor(totalMinutes/60);
  const m=totalMinutes%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function formatDateLabel(iso){return iso.replace(/-/g,". ");}
function clampHour(val){if(val<9) return 9; if(val>18) return 18; return val;}
function snapToHalfHour(val){return Math.round((Number(val)||0)*2)/2;}
function getNowHour(){
  const now=new Date();
  return clampHour(now.getHours()+now.getMinutes()/60+now.getSeconds()/3600);
}
function getViewDate(){return appState.currentDate;}
function getMachineLocation(id){return machineLocations[id]||locations[0];}
function getMachineMgmtNo(id){return machineMgmtNos[id]||"";}
function getMachineDesc(id){return machineDescs[id]||"";}
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
  const sel=document.getElementById("machine-location");
  if(!sel) return;
  const current=sel.value;
  sel.innerHTML=locations.map(loc=>`<option value="${loc}">${loc}</option>`).join("");
  if(current && locations.includes(current)) sel.value=current;
}
function ensureBookingBuckets(){
  for(const id of bscIds){if(!bookings[id]) bookings[id]=[];}
  for(const key of Object.keys(bookings)){if(!bscIds.includes(key)) delete bookings[key];}
}

function buildMachinesMap(){
  const map = {};
  for(const id of bscIds){
    map[id] = {
      location: getMachineLocation(id),
      mgmtNo: getMachineMgmtNo(id),
      desc: getMachineDesc(id)
    };
  }
  return map;
}

function buildConfigPayload(){
  return {
    locations: [...locations],
    machines: buildMachinesMap(),
    machineOrder: [...bscIds],
    purposes: purposeList.map(p=>({
      key: p.key,
      label: p.label,
      machines: Array.isArray(p.machines) ? p.machines : null
    })),
    updatedAt: serverTimestamp()
  };
}

function applyConfigData(data){
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
  if(data.machines && typeof data.machines === "object"){
    const order = Array.isArray(data.machineOrder) ? data.machineOrder : Object.keys(data.machines);
    const nextIds = order.filter(id=>data.machines[id]);
    bscIds = nextIds.length ? nextIds : Object.keys(data.machines);
    const nextLocations = {};
    const nextMgmt = {};
    const nextDescs = {};
    for(const id of bscIds){
      const entry = data.machines[id] || {};
      nextLocations[id] = entry.location || locations[0];
      nextMgmt[id] = entry.mgmtNo || "";
      nextDescs[id] = entry.desc || "";
    }
    machineLocations = nextLocations;
    machineMgmtNos = nextMgmt;
    machineDescs = nextDescs;
  }
  configState.loaded = true;
  configState.exists = true;
  ensureBookingBuckets();
  renderAll();
}

function handleConfigMissing(){
  configState.loaded = true;
  configState.exists = false;
  purposeList = [...defaultPurposeList];
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
  if(configState.loaded && configState.exists) return;
  try{
    const snap = await getDoc(configRef);
    if(!snap.exists()){
      await setDoc(configRef, buildConfigPayload());
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
  const startBase = new Date(Math.min(safeCurrent.getTime(), monthStart.getTime()));
  const endBase = new Date(Math.max(safeCurrent.getTime(), monthEnd.getTime()));
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
    renderPendingList();
    renderStats();
    renderMachineTable();
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
  const user=appState.currentUser;
  if(!user) return false;
  if(user.role==="guest") return false;
  const isManager=user.role==="admin"||user.role==="supervisor";
  if(action==="create") return true;
  if(action==="edit"||action==="approve"||action==="admin"||action==="print") return isManager;
  return false;
}

function isManagerUser(user=appState.currentUser){
  return !!user && (user.role==="admin" || user.role==="supervisor");
}

function isWorkerUser(user=appState.currentUser){
  return !!user && user.role==="worker";
}

function canDragBooking(booking){
  const user=appState.currentUser;
  if(!user || !booking) return false;
  if(user.role==="guest") return false;
  if(booking.user==="System") return false;
  if(isManagerUser(user)) return true;
  if(!isWorkerUser(user)) return false;
  if(booking.createdBy && user.uid && booking.createdBy===user.uid) return true;
  if(booking.userId && user.id && booking.userId===user.id) return true;
  if(booking.user && user.name && booking.user===user.name) return true;
  return false;
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
  if(view==="admin"&&!can("admin")){alert("접근 권한이 없습니다.");return;}
  appState.currentView=view;
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===view));
  document.querySelectorAll(".view-section").forEach(sec=>sec.classList.toggle("active",sec.id===`view-${view}`));
  if(view==="calendar") renderCalendar();
  if(view==="admin") renderAdmin();
  if(view==="dashboard") renderDashboardMobileView();
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

function renderDashboardMobileView(){
  const section=document.getElementById("view-dashboard");
  if(!section) return;
  const isMobile=isMobileViewport();
  section.classList.remove("mobile-view-summary","mobile-view-map","mobile-view-timeline");
  if(isMobile){
    section.classList.add(`mobile-view-${appState.mobileDashboardView}`);
  }
  document.querySelectorAll(".mobile-view-btn").forEach(btn=>{
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
  const section=document.getElementById("view-dashboard");
  if(!section) return;
  const focusId=appState.focusMachineId;
  const targets=section.querySelectorAll("[data-machine-id]");
  section.classList.toggle("focus-active",!!focusId);
  targets.forEach(node=>{
    const match=node.dataset.machineId===focusId;
    node.classList.toggle("is-focused",!!focusId && match);
    node.classList.toggle("is-dimmed",!!focusId && !match);
  });
}

function setMachineFocus(machineId){
  appState.focusMachineId=machineId||null;
  applyMachineFocus();
}

function switchAdminView(view){
  document.querySelectorAll(".admin-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.adminView===view));
  document.querySelectorAll(".admin-section").forEach(sec=>sec.classList.toggle("active",sec.id===`admin-${view}`));
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
      return;
    }
    updateTimelineIndicators(document.getElementById("timeline-body"));
    updateTimelineIndicators(document.getElementById("day-timeline"));
  },10000);
}

function renderAll(){
  renderLocationOptions();
  renderPurposeOptions(appState.bookingTarget?.id);
  renderDateLabels();
  renderDashboard();
  renderSchedule();
  renderCalendar();
  renderAdmin();
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
  const issues=getPendingBookings(date).length;
  return {
    total:bscIds.length,
    running,
    upcoming,
    issues
  };
}

function renderDashboardSummary(){
  const container=document.getElementById("dashboard-summary");
  if(!container) return;
  const stats=getDashboardSummaryStats();
  container.innerHTML=
    `<div class="summary-item"><div class="summary-label">전체 장비</div><div class="summary-value">${stats.total}</div><div class="summary-sub">등록 장비 수</div></div>`+
    `<div class="summary-item"><div class="summary-label">가동중</div><div class="summary-value">${stats.running}</div><div class="summary-sub">현재 시각 기준</div></div>`+
    `<div class="summary-item"><div class="summary-label">예약 예정</div><div class="summary-value">${stats.upcoming}</div><div class="summary-sub">${formatDateLabel(getViewDate())}</div></div>`+
    `<div class="summary-item"><div class="summary-label">이슈</div><div class="summary-value">${stats.issues}</div><div class="summary-sub">승인 대기 건수</div></div>`;
}

function renderDashboardLegend(){
  const container=document.getElementById("dashboard-legend");
  if(!container) return;
  const items=[];
  items.push({key:"free", label:statusMeta.free.label, color:statusMeta.free.color});
  purposeList.forEach(p=>{
    const meta=getPurposeMeta(p.key);
    items.push({key:p.key, label:meta.label, color:meta.color});
  });
  items.push({key:"pending", label:statusMeta.pending.label, color:statusMeta.pending.color});
  items.push({key:"system", label:statusMeta.system.label, color:statusMeta.system.color});
  const seen=new Set();
  container.innerHTML=items
    .filter(item=>{
      if(seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .map(item=>`<span class="legend-chip"><span class="legend-swatch" style="background:${item.color}"></span>${item.label}</span>`)
    .join("");
}

function renderDateLabels(){
  const label=formatDateLabel(getViewDate());
  document.getElementById("reservation-date-label").textContent=label;
  const modeLabel=appState.isLiveMode ? "라이브" : "조회";
  document.getElementById("timeline-date-label").textContent=`${label} · ${modeLabel} ${formatTime(appState.currentHour)}`;
  document.getElementById("chart-date-label").textContent=label;
  document.getElementById("status-date-label").textContent=label;
}

function renderDashboard(){
  renderDashboardSummary();
  renderDashboardLegend();
  renderDashboardSidePanel();
  renderDashboardMobileView();
  renderTimeLabels();
  renderMap();
  renderTimeline(document.getElementById("timeline-body"),getViewDate());
  renderStatusList();
  renderChart();
  applyMachineFocus();
}

function renderTimeLabels(){
  const time=formatTime(appState.currentHour);
  const prefix=appState.isLiveMode ? "현재 시각" : "조회 시각";
  document.getElementById("map-time-label").textContent=`${prefix}: ${time}`;
  document.getElementById("time-slider-label").textContent=time;
  syncLiveModeUI();
}
function renderMap(){
  const grid=document.getElementById("map-grid");
  grid.innerHTML="";
  for(const loc of locations){
    const ids=bscIds.filter(id=>getMachineLocation(id)===loc);
    if(ids.length===0) continue;
    const group=document.createElement("section");
    group.className="location-group";
    const title=document.createElement("h4");
    title.className="location-title";
    title.textContent=loc;
    const locGrid=document.createElement("div");
    locGrid.className="location-grid";
    for(const id of ids){
      const booking=getCurrentBooking(id);
      const meta=getTileMeta(booking);
      const tile=document.createElement("button");
      tile.type="button";
      tile.className=`machine-tile ${meta.tile}`;
      tile.dataset.machineId=id;
      const timeText=booking?`${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`:"예약 없음";
      tile.innerHTML=`<div class="machine-id">${id}</div><div class="machine-meta">${meta.labelText}</div><div class="machine-time">${timeText}</div>`;
      tile.addEventListener("click",()=>handleTileClick(id));
      tile.addEventListener("mouseenter",()=>setMachineFocus(id));
      tile.addEventListener("mouseleave",()=>setMachineFocus(null));
      tile.addEventListener("mousemove",e=>showTooltip(e,id,booking));
      tile.addEventListener("mouseleave",hideTooltip);
      locGrid.appendChild(tile);
    }
    group.appendChild(title);
    group.appendChild(locGrid);
    grid.appendChild(group);
  }
}

function getTileMeta(booking){
  if(!booking) return {tile:statusMeta.free.tile,labelText:statusMeta.free.label};
  if(booking.status==="pending") return {tile:statusMeta.pending.tile,labelText:`${statusMeta.pending.label} · ${booking.user}`};
  if(booking.user==="System") return {tile:statusMeta.system.tile,labelText:statusMeta.system.label};
  const meta=getPurposeMeta(booking.purpose);
  return {tile:meta.tile,labelText:`${meta.label} · ${booking.user}`};
}

function handleTileClick(id){
  const booking=getCurrentBooking(id);
  if(!booking){alert(`[${id}] 현재 사용 가능합니다.\n\n예약 신청은 '예약 관리' 탭에서 진행하세요.`);return;}
  if(booking.status==="pending"){
    alert(`[승인 대기]\n신청자: ${booking.user}\n시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}\n\n승인은 '관리 > 승인 및 보고'에서 가능합니다.`);
    return;
  }
  const purpose=booking.user==="System"?"자동 소독":getPurposeMeta(booking.purpose).label;
  alert(`[예약 정보]\n작업자: ${booking.user}\n목적: ${purpose}\n시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`);
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
  const futureShade=container.querySelector(".timeline-shade.future");
  if(!metrics||!pastShade||!futureShade) return;
  const ratio=(getNowHour()-9)/9;
  const splitX=metrics.start+(metrics.width*ratio);
  pastShade.style.left=`${metrics.start}px`;
  pastShade.style.width=`${Math.max(0,splitX-metrics.start)}px`;
  futureShade.style.left=`${splitX}px`;
  futureShade.style.width=`${Math.max(0,metrics.end-splitX)}px`;
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
  container.appendChild(createTimelineShade("past"));
  container.appendChild(createTimelineShade("future"));
  for(const id of bscIds){
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
      track.appendChild(bar);
    }
    row.addEventListener("mouseenter",()=>setMachineFocus(id));
    row.addEventListener("mouseleave",()=>setMachineFocus(null));
    row.appendChild(label);row.appendChild(track);container.appendChild(row);
  }
  const selectedIndicator=createTimelineIndicator("selected");
  const nowIndicator=createTimelineIndicator("now");
  const hoverIndicator=createTimelineIndicator("hover");
  hoverIndicator.classList.add("hidden");
  container.appendChild(selectedIndicator);
  container.appendChild(nowIndicator);
  container.appendChild(hoverIndicator);
  updateTimelineIndicators(container);
}
function renderStatusList(){
  const list=document.getElementById("status-list");list.innerHTML="";
  for(const id of bscIds){
    const booking=getCurrentBooking(id);
    const meta=getStatusMeta(booking);
    const item=document.createElement("div");item.className="status-item";item.style.borderLeftColor=meta.color;
    item.dataset.machineId=id;
    item.innerHTML=`<div class="status-icon" style="color:${meta.color}">●</div><div class="status-info"><div class="status-id">${id}</div><div class="status-text">${meta.text}</div></div><div class="status-badge" style="background:${meta.color}">${meta.label}</div>`;
    item.addEventListener("mouseenter",()=>setMachineFocus(id));
    item.addEventListener("mouseleave",()=>setMachineFocus(null));
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
    keyword: (document.getElementById("schedule-machine-search")?.value || "").trim().toLowerCase(),
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
  if(!booking) return { ok:false, reason:"예약 정보를 찾을 수 없습니다." };
  if(!canDragBooking(booking)) return { ok:false, reason:"본인 예약만 이동할 수 있습니다." };
  if(targetHour<9 || targetHour+booking.duration>18){
    return { ok:false, reason:"운영 시간(09:00~18:00)을 벗어납니다." };
  }
  if(isWorkerUser() && booking.date===todayISO()){
    const minHour=getMinReservableHour(booking.date);
    if(targetHour<minHour){
      return { ok:false, reason:`오늘 예약은 ${formatTime(minHour)} 이후로만 이동할 수 있습니다.` };
    }
  }
  if(isOverlap(targetMachineId,booking.date,targetHour,booking.duration,docId)){
    return { ok:false, reason:"다른 예약과 시간이 겹칩니다." };
  }
  return { ok:true, reason:"이 위치로 이동 가능합니다." };
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
    for(const id of group.ids){
      const bookingsForDay=getBookingsForDate(id,date).sort((a,b)=>a.start-b.start);
      const card=document.createElement("article");
      card.className="mobile-machine-card";
      const bookingRows=bookingsForDay.length
        ? bookingsForDay.map(b=>{
            const purpose=b.user==="System"?"소독":getPurposeMeta(b.purpose).label;
            return `<div class="mobile-booking-row"><span>${formatTime(b.start)}-${formatTime(b.start+b.duration)}</span><strong>${b.user}</strong><em>${purpose}</em></div>`;
          }).join("")
        : '<div class="mobile-booking-empty">예약 없음</div>';
      card.innerHTML=`<div class="mobile-machine-head"><strong>${id}</strong><span>${getMachineMgmtNo(id)||"-"}</span></div><div class="mobile-booking-list">${bookingRows}</div>`;
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
            block.addEventListener("click",()=>openApprovalModal(id,booking.docId));
          }else if(booking.user==="System"){
            block.style.backgroundColor=statusMeta.system.color;block.innerHTML="<span>소독</span>";
          }else{
            const purposeMeta=getPurposeMeta(booking.purpose);
            block.style.backgroundColor=purposeMeta.color;
            block.innerHTML=`<span>${booking.user}</span><span class="booking-sub">${purposeMeta.label}</span><div class="resize-handle"></div>`;
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
            block.addEventListener("dragstart",e=>handleDragStart(e,id,booking.docId));
            block.addEventListener("dragend",handleDragEnd);
            const handle=block.querySelector(".resize-handle");
            if(handle && can("edit")) handle.addEventListener("mousedown",e=>handleResizeStart(e,id,booking.docId,booking.duration));
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
  const booking=findBookingByDocId(machineId,docId);
  if(!canDragBooking(booking)){
    e.preventDefault();
    return;
  }
  appState.dragPayload={ machineId, docId, booking };
  e.dataTransfer.setData("text", JSON.stringify({machineId,docId}));
  e.target.classList.add("dragging");
  document.body.classList.add("is-dragging");
}

function handleDragEnd(e){
  if(e?.target) e.target.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  appState.dragPayload=null;
  document.querySelectorAll(".schedule-table td.drag-hover, .schedule-table td.drag-hover-valid, .schedule-table td.drag-hover-invalid").forEach(el=>clearDropCellState(el));
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

function handleResizeStart(event,id,docId,duration){
  if(!can("edit")) return;
  event.stopPropagation();
  appState.isResizing=true;
  appState.resizeStartX=event.clientX;
  appState.resizeOriginDuration=duration;
  appState.resizeTarget={id,docId};
  document.body.style.cursor="col-resize";
}

async function handleResizeEnd(event){
  if(!appState.isResizing||!appState.resizeTarget) return;
  appState.isResizing=false;
  document.body.style.cursor="default";
  try{
    const cell=document.querySelector(".schedule-table td");
    const cellWidth=cell?cell.offsetWidth:40;
    const diff=Math.round((event.clientX-appState.resizeStartX)/cellWidth)*0.5;
    if(diff===0) return;
    const {id,docId}=appState.resizeTarget;
    const booking=findBookingByDocId(id,docId);
    if(!booking) return;
    const newDuration=appState.resizeOriginDuration+diff;
    if(newDuration<0.5||booking.start+newDuration>18){
      showToast("운영 시간 범위를 벗어나 변경할 수 없습니다.","warn");
      return;
    }
    if(isOverlap(id,booking.date,booking.start,newDuration,docId)){
      showToast("다른 예약과 시간이 겹칩니다.","warn");
      return;
    }
    await updateBookingDoc(docId,{duration:newDuration});
    showToast("예약 시간을 조정했습니다.","success");
  }catch(error){
    reportAsyncError("handleResizeEnd", error, "예약 시간 조정에 실패했습니다.");
  }finally{
    appState.resizeTarget=null;
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
  return { total, pending, utilization, peakLabel, utilClass };
}

function renderCalendarMobile(dayEntries){
  const container=document.getElementById("calendar-mobile");
  if(!container) return;
  container.innerHTML="";
  if(dayEntries.length===0){
    container.innerHTML='<div class="calendar-mobile-empty">표시할 날짜가 없습니다.</div>';
    return;
  }
  for(const entry of dayEntries){
    const { dateKey, day, summary, isToday } = entry;
    const item=document.createElement("button");
    item.type="button";
    item.className=`calendar-mobile-item ${isToday?"today":""}`.trim();
    item.innerHTML=`<div class="calendar-mobile-head"><strong>${dateKey.replace(/-/g,". ")}</strong><span class="util-value ${summary.utilClass}">${summary.utilization}%</span></div><div class="calendar-mobile-meta"><span>예약 ${summary.total}건</span><span class="${summary.pending>0?"pending-text":""}">대기 ${summary.pending}건</span><span>피크 ${summary.peakLabel}</span></div>`;
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
  if(action==="apply-date"){
    applyDateContext(date);
    showToast(`${date.replace(/-/g,". ")} 기준으로 적용했습니다.`,"info");
    return;
  }
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

function renderAdmin(){
  if(!can("admin") || appState.currentView!=="admin") return;
  const usersBtn=document.querySelector('[data-admin-view="users"]');
  const machinesBtn=document.querySelector('[data-admin-view="machines"]');
  const purposesBtn=document.querySelector('[data-admin-view="purposes"]');
  const locationsBtn=document.querySelector('[data-admin-view="locations"]');
  if(appState.currentUser.role==="supervisor"){
    usersBtn.style.display="none";
    machinesBtn.style.display="none";
    if(purposesBtn) purposesBtn.style.display="none";
    locationsBtn.style.display="none";
    switchAdminView("audit");
  }else{
    usersBtn.style.display="flex";
    machinesBtn.style.display="flex";
    if(purposesBtn) purposesBtn.style.display="flex";
    locationsBtn.style.display="flex";
  }
  refreshUsersFromDb();
  renderLocationTable();
  renderMachineTable();
  renderPurposeTable();
  renderPendingList();
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
  }catch(error){
    reportAsyncError("approveUser", error, "계정 승인에 실패했습니다.");
  }
}
function renderUserTable(){
  const tbody=document.getElementById("user-table-body");
  tbody.innerHTML="";
  for(const user of users){
    const tr=document.createElement("tr");
    const canDelete=appState.currentUser&&user.id!==appState.currentUser.id;
    const statusLabel=user.approved?"\uC2B9\uC778\uB428":"\uC2B9\uC778\uB300\uAE30";
    const statusColor=user.approved?"#2ecc71":"#f39c12";
    const approveBtn = user.approved ? "" : `<button class="btn-edit" data-approve-user="${user.uid}">\uC2B9\uC778</button>`;
    tr.innerHTML=`<td>${user.name}</td><td>${user.id}</td><td><span class="status-badge role-${user.role}">${user.role.toUpperCase()}</span></td><td><span style="color:${statusColor};font-weight:900">● ${statusLabel}</span></td><td>${approveBtn}<button class="btn-edit" data-edit-user="${user.uid}">\uC218\uC815</button>${canDelete?`<button class="btn-del" data-del-user="${user.uid}">\uC0AD\uC81C</button>`:""}</td>`;
    tbody.appendChild(tr);
  }
}

function renderPendingList(){
  const list=document.getElementById("pending-list");list.innerHTML="";
  const pending=getPendingBookings();
  if(pending.length===0){const empty=document.createElement("div");empty.className="pending-item";empty.innerHTML='<strong>승인 대기 없음</strong><span class="pending-meta">현재 날짜에 대기 중인 요청이 없습니다.</span>';list.appendChild(empty);return;}
  for(const item of pending){
    const {id,docId,booking}=item;
    const div=document.createElement("div");div.className="pending-item";
    div.innerHTML=`<strong>${id} · ${booking.user}</strong><div class="pending-meta">${booking.date} · ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}</div><div class="pending-meta">목적: ${getPurposeMeta(booking.purpose).label}</div><div class="pending-actions"><button class="btn-edit" data-approve-id="${id}" data-approve-doc="${docId}">승인</button><button class="btn-del" data-reject-id="${id}" data-reject-doc="${docId}">반려</button></div>`;
    list.appendChild(div);
  }
}

function renderStats(){
  const monthKey=`${appState.currentYear}-${String(appState.currentMonth).padStart(2,"0")}`;
  const totals={process:0,maint:0,clean:0};
  for(const id of bscIds){
    for(const booking of bookings[id]){
      if(!booking.date.startsWith(monthKey)) continue;
      if(booking.purpose==="process") totals.process+=booking.duration;
      if(booking.purpose==="maint") totals.maint+=booking.duration;
      if(booking.purpose==="clean") totals.clean+=booking.duration;
    }
  }
  document.getElementById("stat-process").textContent=`${totals.process.toFixed(1)} h`;
  document.getElementById("stat-maint").textContent=`${totals.maint.toFixed(1)} h`;
  document.getElementById("stat-clean").textContent=`${totals.clean.toFixed(1)} h`;
}
function openBookingModal(id,start){
  if(!can("create")){showToast("예약 생성 권한이 없습니다.","warn");return;}
  appState.bookingTarget={id,start};
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${formatTime(start)} 시작`;
  document.getElementById("booking-start").value=String(start);
  document.getElementById("booking-date").value=getViewDate();
  document.getElementById("booking-user").value=appState.currentUser.name;
  document.getElementById("booking-recurring").checked=false;
  renderPurposeOptions(id);
  const purposeSelect=document.getElementById("booking-purpose");
  if(purposeSelect && !purposeSelect.value){
    const options = getPurposesForMachine(id);
    if(options.length) purposeSelect.value=options[0].key;
  }
  const autoClean=document.getElementById("booking-autoclean");
  if(autoClean) autoClean.checked=false;
}
function closeModal(id){
  const modal=document.getElementById(id);
  if(modal) modal.style.display="none";
  if(id==="day-modal") appState.dayModalDate=null;
}

function openDeleteModal(id, docId){
  if(!can("edit")){showToast("삭제 권한이 없습니다.","warn");return;}
  appState.deleteTarget = { id, docId };
  const reason = document.getElementById("delete-reason");
  if(reason) reason.value = "";
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
  }catch(error){
    reportAsyncError("confirmDelete", error, "예약 삭제에 실패했습니다.");
  }
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
  }catch(error){
    reportAsyncError("confirmBooking", error, "예약 저장에 실패했습니다.");
  }
}

function isOverlap(id,date,start,duration,ignoreDocId){
  return getBookingsForDate(id,date).some(b=>{
    if(ignoreDocId && b.docId===ignoreDocId) return false;
    return start<b.start+b.duration&&start+duration>b.start;
  });
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

function openApprovalModal(id,docId){
  if(!can("approve")) return;
  const booking=findBookingByDocId(id,docId);
  if(!booking||booking.status!=="pending") return;
  appState.approvalTarget={id,docId};
  document.getElementById("approval-modal").style.display="flex";
  document.getElementById("approval-text").textContent=`${booking.user}님의 예약 요청을 처리합니다.`;
  const autoCleanText = booking.autoClean ? "예" : "아니오";
  document.getElementById("approval-detail").innerHTML=
    `날짜: ${booking.date}<br />장비: ${id}<br />시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}<br />목적: ${getPurposeMeta(booking.purpose).label}<br />자동 소독: ${autoCleanText}`;
  const reasonEl = document.getElementById("reject-reason");
  if(reasonEl) reasonEl.value = "";
}

async function processApproval(action){
  const target=appState.approvalTarget;if(!target) return;
  try{
    const {id,docId}=target;
    const booking=findBookingByDocId(id,docId);
    if(!booking) return;
    if(action==="approve"){
      await updateBookingDoc(docId,{status:"confirmed"});
      if(booking.autoClean){
        await addSystemBuffer(id,booking.date,booking.start+booking.duration,docId);
      }
      showToast("예약이 승인되었습니다.");
    }else{
      const reasonEl = document.getElementById("reject-reason");
      const reason = reasonEl ? reasonEl.value.trim() : "";
      if(!reason){
        alert("반려 사유를 입력해주세요.");
        return;
      }
      const rejectedBy = appState.currentUser?.uid || "system";
      await updateBookingDoc(docId,{
        status: "rejected",
        rejectReason: reason,
        rejectedBy,
        rejectedAt: serverTimestamp()
      });
      showToast("예약이 반려되었습니다.","info");
    }
    closeModal("approval-modal");
    appState.approvalTarget=null;
  }catch(error){
    reportAsyncError("processApproval", error, "승인/반려 처리에 실패했습니다.");
  }
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
    await saveConfig();
    ensureBookingBuckets();
    renderAll();
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
  const locationSel=document.getElementById("machine-location");
  renderLocationOptions();
  if(mode==="create"){
    if(title) title.textContent="장비 등록";
    if(original) original.value="";
    if(input){input.value=""; input.disabled=false;}
    if(mgmtInput) mgmtInput.value="";
    if(descInput) descInput.value="";
    if(locationSel) locationSel.value=locations[0];
    return;
  }
  if(title) title.textContent="장비 수정";
  if(original) original.value=id;
  if(input){input.value=id; input.disabled=false;}
  if(mgmtInput) mgmtInput.value=getMachineMgmtNo(id);
  if(descInput) descInput.value=getMachineDesc(id);
  if(locationSel) locationSel.value=getMachineLocation(id);
}

async function saveMachine(){
  try{
    const originalId=document.getElementById("machine-original-id")?.value || "";
    const nextId=document.getElementById("machine-id")?.value.trim() || "";
    const nextMgmt=document.getElementById("machine-mgmt")?.value.trim() || "";
    const nextDesc=document.getElementById("machine-desc")?.value.trim() || "";
    const nextLocation=document.getElementById("machine-location")?.value || locations[0];
    if(!nextId){alert("장비 ID를 입력하세요.");return;}
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
        delete machineLocations[originalId];
        delete machineMgmtNos[originalId];
        delete machineDescs[originalId];
        const existing=bookings[originalId]||[];
        for(const booking of existing){
          if(booking.docId) await updateBookingDoc(booking.docId,{machineId: nextId});
        }
        delete bookings[originalId];
      }else{
        machineLocations[originalId]=nextLocation;
        machineMgmtNos[originalId]=nextMgmt;
        machineDescs[originalId]=nextDesc;
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
      bookings[nextId]=[];
    }
    closeModal("machine-modal");
    showToast("장비 목록이 갱신되었습니다.","info");
    await saveConfig();
    ensureBookingBuckets();
    renderAll();
  }catch(error){
    reportAsyncError("saveMachine", error, "장비 저장에 실패했습니다.");
  }
}

function renderMachineTable(){
  const tbody=document.getElementById("machine-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  for(const id of bscIds){
    const tr=document.createElement("tr");
    const count=(bookings[id]||[]).length;
    const mgmt=getMachineMgmtNo(id);
    const desc=getMachineDesc(id);
    const descShort=desc.length>24?`${desc.slice(0,24)}...`:desc;
    tr.innerHTML=`<td>${id}</td><td>${mgmt}</td><td>${getMachineLocation(id)}</td><td title="${desc.replace(/"/g,"&quot;")}">${descShort}</td><td>${count}</td><td><button class="btn-edit" data-edit-machine="${id}">수정</button><button class="btn-del" data-del-machine="${id}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

















function renderLocationTable(){
  const tbody=document.getElementById("location-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  for(const loc of locations){
    const count=bscIds.filter(id=>getMachineLocation(id)===loc).length;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${loc}</td><td>${count}대</td><td><button class="btn-edit" data-edit-location="${loc}">수정</button><button class="btn-del" data-del-location="${loc}">삭제</button></td>`;
    tbody.appendChild(tr);
  }
}

function renderPurposeTable(){
  const tbody=document.getElementById("purpose-table-body");
  if(!tbody) return;
  tbody.innerHTML="";
  for(const purpose of purposeList){
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
  const pwdInput=document.getElementById("user-password");
  const roleSelect=document.getElementById("user-role");
  if(mode==="create"){
    if(title) title.textContent="계정 생성";
    if(originalId) originalId.value="";
    if(nameInput) nameInput.value="";
    if(idInput){idInput.value=""; idInput.disabled=false;}
    if(pwdInput) pwdInput.value="";
    if(roleSelect) roleSelect.value="worker";
    return;
  }
  const user=users.find(u=>u.uid===uid);
  if(!user) return;
  if(title) title.textContent="계정 수정";
  if(originalId) originalId.value=user.uid;
  if(nameInput) nameInput.value=user.name||"";
  if(idInput){idInput.value=user.id||""; idInput.disabled=true;}
  if(pwdInput) pwdInput.value="";
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
  }catch(error){
    reportAsyncError("saveUser", error, "사용자 저장에 실패했습니다.");
  }
}

async function deleteUser(uid){
  try{
    if(!confirm("정말 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db,"users",uid));
    await refreshUsersFromDb(true);
  }catch(error){
    reportAsyncError("deleteUser", error, "사용자 삭제에 실패했습니다.");
  }
}

function openLocationModal(mode,loc){
  const modal=document.getElementById("location-modal");
  modal.style.display="flex";
  const title=document.getElementById("location-modal-title");
  const original=document.getElementById("location-original-name");
  const input=document.getElementById("location-name");
  if(mode==="create"){
    title.textContent="장소 등록";
    original.value="";
    input.value="";
    return;
  }
  title.textContent="장소 수정";
  original.value=loc;
  input.value=loc;
}

async function saveLocation(){
  try{
    const original=document.getElementById("location-original-name").value;
    const next=document.getElementById("location-name").value.trim();
    if(!next){alert("장소명을 입력하세요.");return;}
    if(original){
      if(original!==next && locations.includes(next)){
        alert("이미 존재하는 장소입니다.");
        return;
      }
      locations=locations.map(l=>l===original?next:l);
      for(const id of bscIds){
        if(getMachineLocation(id)===original) machineLocations[id]=next;
      }
    }else{
      if(locations.includes(next)){
        alert("이미 존재하는 장소입니다.");
        return;
      }
      locations=[...locations,next];
    }
    closeModal("location-modal");
    showToast("장소 목록이 갱신되었습니다.","info");
    await saveConfig();
    renderAll();
  }catch(error){
    reportAsyncError("saveLocation", error, "장소 저장에 실패했습니다.");
  }
}

async function deleteLocation(loc){
  try{
    const used=bscIds.some(id=>getMachineLocation(id)===loc);
    if(used){alert("장비가 배정된 장소는 삭제할 수 없습니다.");return;}
    if(!confirm(`${loc}를 삭제하시겠습니까?`)) return;
    locations=locations.filter(l=>l!==loc);
    await saveConfig();
    renderAll();
  }catch(error){
    reportAsyncError("deleteLocation", error, "장소 삭제에 실패했습니다.");
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
  on("btn-save-booking","click",confirmBooking);
  on("btn-approve","click",()=>processApproval("approve"));
  on("btn-reject","click",()=>processApproval("reject"));
  on("btn-confirm-delete","click",confirmDelete);
  document.querySelectorAll("[data-close-modal]").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.closeModal)));
  document.querySelectorAll("[data-day-action]").forEach(btn=>btn.addEventListener("click",()=>handleDayAction(btn.dataset.dayAction)));
  on("btn-create-user","click",()=>refreshUsersFromDb());
  on("btn-save-user","click",saveUser);
  on("btn-create-machine","click",()=>openMachineModal("create"));
  on("btn-create-location","click",()=>openLocationModal("create"));
  on("btn-create-purpose","click",()=>openPurposeModal("create"));
  on("btn-save-machine","click",saveMachine);
  on("btn-save-location","click",saveLocation);
  on("btn-save-purpose","click",savePurpose);
  on("btn-print","click",printReport);
  on("schedule-location-filter","change",renderSchedule);
  on("schedule-machine-search","input",renderSchedule);
  on("schedule-my-only","change",renderSchedule);
  on("btn-schedule-filter-reset","click",resetScheduleFilters);
  on("purpose-all","change",(e)=>setPurposeAll(e.target.checked));
  document.querySelectorAll(".side-tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>setDashboardSidePanel(btn.dataset.sidePanel));
  });
  document.querySelectorAll(".mobile-view-btn").forEach(btn=>{
    btn.addEventListener("click",()=>setDashboardMobileView(btn.dataset.mobileView));
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
    const editLocation=e.target.getAttribute("data-edit-location"); if(editLocation) openLocationModal("edit",editLocation);
    const delLocation=e.target.getAttribute("data-del-location"); if(delLocation) deleteLocation(delLocation);
    const editPurpose=e.target.getAttribute("data-edit-purpose"); if(editPurpose) openPurposeModal("edit",editPurpose);
    const delPurpose=e.target.getAttribute("data-del-purpose"); if(delPurpose) deletePurpose(delPurpose);
    const approveId=e.target.getAttribute("data-approve-id");
    const approveDoc=e.target.getAttribute("data-approve-doc");
    if(approveId && approveDoc){openApprovalModal(approveId,approveDoc);}
    const rejectId=e.target.getAttribute("data-reject-id");
    const rejectDoc=e.target.getAttribute("data-reject-doc");
    if(rejectId && rejectDoc){openApprovalModal(rejectId,rejectDoc);}
    const adminView=e.target.closest(".admin-btn"); if(adminView&&adminView.dataset.adminView) switchAdminView(adminView.dataset.adminView);
  });
  document.addEventListener("mouseup",handleResizeEnd);
  window.addEventListener("resize",()=>{
    updateTimelineIndicators(document.getElementById("timeline-body"));
    updateTimelineIndicators(document.getElementById("day-timeline"));
    renderDashboardMobileView();
    applyMachineFocus();
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
















































































