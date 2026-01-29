import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const appState = {
  currentUser:null,currentView:"dashboard",currentHour:9,
  currentDate:todayISO(),currentYear:new Date().getFullYear(),
  currentMonth:new Date().getMonth()+1,dragPayload:null,
  isResizing:false,resizeStartX:0,resizeOriginDuration:0,resizeTarget:null,
  bookingTarget:{id:null,start:9},approvalTarget:null
};

let users = [];
const demoAccounts = {
  admin: { email: "demo-admin@reservation.local", password: "demo1234" },
  supervisor: { email: "demo-supervisor@reservation.local", password: "demo1234" },
  worker: { email: "demo-worker@reservation.local", password: "demo1234" }
};

const bookings = Object.fromEntries(bscIds.map(id=>[id,[]]));
let bookingsUnsub = null;



function todayISO(){return new Date().toISOString().slice(0,10);} 
function formatTime(val){const h=Math.floor(val);const m=Math.round((val-h)*60);return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function formatDateLabel(iso){return iso.replace(/-/g,". ");}
function clampHour(val){if(val<9) return 9; if(val>18) return 18; return val;}
function getViewDate(){return appState.currentDate;}
function getMachineLocation(id){return machineLocations[id]||locations[0];}
function getMachineMgmtNo(id){return machineMgmtNos[id]||"";}
function getMachineDesc(id){return machineDescs[id]||"";}
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

function syncBookingsSnapshot(snapshot){
  const next = Object.fromEntries(bscIds.map(id=>[id,[]]));
  snapshot.forEach(docSnap=>{
    const data = docSnap.data();
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

function subscribeBookings(){
  if(bookingsUnsub) bookingsUnsub();
  bookingsUnsub = onSnapshot(collection(db,"bookings"), snapshot=>{
    syncBookingsSnapshot(snapshot);
    renderAll();
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

function getBookingsForDate(id,date){return (bookings[id]||[]).filter(b=>b.date===date);} 
function findBookingByDocId(id, docId){return (bookings[id]||[]).find(b=>b.docId===docId);}  
function getCurrentBooking(id){const date=getViewDate();const hour=appState.currentHour;return getBookingsForDate(id,date).find(b=>b.start<=hour&&hour<(b.start+b.duration));}

function getPendingBookings(date=getViewDate()){
  const pending=[];
  for(const id of bscIds){
    getBookingsForDate(id,date).filter(b=>b.status==="pending").forEach(b=>pending.push({id,docId:b.docId,booking:b}));
  }
  return pending.sort((a,b)=>a.id.localeCompare(b.id)||a.booking.start-b.booking.start);
}

function can(action){
  const user=appState.currentUser; if(!user) return false;
  const isManager=user.role==="admin"||user.role==="supervisor";
  if(action==="create") return true;
  if(action==="edit"||action==="approve"||action==="admin"||action==="print") return isManager;
  return false;
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



function initStartTimes(){
  const select=document.getElementById("booking-start"); select.innerHTML="";
  for(let h=9;h<18;h+=0.5){const opt=document.createElement("option");opt.value=String(h);opt.textContent=formatTime(h);select.appendChild(opt);} 
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
async function applySession(user){
  appState.currentUser = user;
  document.body.className=`role-${appState.currentUser.role}`;
  document.getElementById("login-modal").style.display="none";
  const badge=document.getElementById("user-badge");
  badge.className=`user-badge role-${appState.currentUser.role}`;
  badge.textContent=appState.currentUser.role.toUpperCase();
  document.getElementById("user-name").textContent=appState.currentUser.name;
  const adminTab=document.getElementById("tab-admin");
  adminTab.hidden=!(appState.currentUser.role==="admin"||appState.currentUser.role==="supervisor");
  if(appState.currentUser.role==="supervisor") switchAdminView("audit"); else switchAdminView("users");
  ensureBookingBuckets();
  subscribeBookings();
  renderAll();
}

function initAuthListener(){
  onAuthStateChanged(auth, async (user)=>{
    if(!user){
      appState.currentUser=null;
      if(bookingsUnsub){bookingsUnsub();bookingsUnsub=null;}
      document.body.className="";
      document.getElementById("login-modal").style.display="flex";
      return;
    }
    const snap = await getDoc(doc(db,"users",user.uid));
    if(!snap.exists()){
      await signOut(auth);
      alert("\uACC4\uC815 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const data = snap.data();
    if(!data.approved){
      await signOut(auth);
      alert("\uC2B9\uC778 \uB300\uAE30 \uC911\uC785\uB2C8\uB2E4.");
      return;
    }
    applySession({uid:user.uid, id:data.id||user.email, name:data.name||user.email, role:data.role||"worker"});
  });
}
async function logout(){
  try{
    await signOut(auth);
  }catch(e){}
}catch(e){} }

function switchView(view){
  if(view==="admin"&&!can("admin")){alert("접근 권한이 없습니다.");return;}
  appState.currentView=view;
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===view));
  document.querySelectorAll(".view-section").forEach(sec=>sec.classList.toggle("active",sec.id===`view-${view}`));
  if(view==="calendar") renderCalendar();
  if(view==="admin") renderAdmin();
}

function switchAdminView(view){
  document.querySelectorAll(".admin-btn").forEach(btn=>btn.classList.toggle("active",btn.dataset.adminView===view));
  document.querySelectorAll(".admin-section").forEach(sec=>sec.classList.toggle("active",sec.id===`admin-${view}`));
}

function updateDate(delta){
  const date=new Date(appState.currentDate);
  date.setDate(date.getDate()+delta);
  appState.currentDate=date.toISOString().slice(0,10);
  renderAll();
}

function setToday(){
  appState.currentDate=todayISO();
  const today=new Date();
  appState.currentYear=today.getFullYear();
  appState.currentMonth=today.getMonth()+1;
  resetToNow();
  renderAll();
}

function changeMonth(delta){
  appState.currentMonth+=delta;
  if(appState.currentMonth>12){appState.currentMonth=1;appState.currentYear+=1;}
  if(appState.currentMonth<1){appState.currentMonth=12;appState.currentYear-=1;}
  renderCalendar();
  renderStats();
}

function updateTimeFromSlider(val){appState.currentHour=clampHour(Number(val));renderDashboard();}
function resetToNow(){
  const now=new Date();
  let hour=now.getHours()+now.getMinutes()/60;
  hour=Math.round(hour*2)/2;
  appState.currentHour=clampHour(hour);
  document.getElementById("time-slider").value=String(appState.currentHour);
  renderDashboard();
}

function renderAll(){renderLocationOptions();renderDateLabels();renderDashboard();renderSchedule();renderCalendar();renderAdmin();}

function renderDateLabels(){
  const label=formatDateLabel(getViewDate());
  document.getElementById("reservation-date-label").textContent=label;
  document.getElementById("timeline-date-label").textContent=`${label} 기준`;
  document.getElementById("chart-date-label").textContent=label;
  document.getElementById("status-date-label").textContent=label;
}

function renderDashboard(){
  renderTimeLabels();
  renderMap();
  renderTimeline(document.getElementById("timeline-body"),getViewDate());
  renderStatusList();
  renderChart();
}

function renderTimeLabels(){
  const time=formatTime(appState.currentHour);
  document.getElementById("map-time-label").textContent=`기준 시각: ${time}`;
  document.getElementById("time-slider-label").textContent=time;
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
      const timeText=booking?`${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`:"예약 없음";
      tile.innerHTML=`<div class="machine-id">${id}</div><div class="machine-meta">${meta.labelText}</div><div class="machine-time">${timeText}</div>`;
      tile.addEventListener("click",()=>handleTileClick(id));
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
  const meta=statusMeta[booking.purpose];
  return {tile:meta.tile,labelText:`${meta.label} · ${booking.user}`};
}

function handleTileClick(id){
  const booking=getCurrentBooking(id);
  if(!booking){alert(`[${id}] 현재 사용 가능합니다.\n\n예약 신청은 '예약 관리' 탭에서 진행하세요.`);return;}
  if(booking.status==="pending"){
    alert(`[승인 대기]\n신청자: ${booking.user}\n시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}\n\n승인은 '관리 > 승인 및 보고'에서 가능합니다.`);
    return;
  }
  const purpose=booking.user==="System"?"자동 소독":statusMeta[booking.purpose].label;
  alert(`[예약 정보]\n작업자: ${booking.user}\n목적: ${purpose}\n시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}`);
}

function showTooltip(event,id,booking){
  const tooltip=document.getElementById("map-tooltip");
  const wrapper=document.getElementById("map-wrapper");
  const rect=wrapper.getBoundingClientRect();
  tooltip.style.display="block";
  tooltip.style.left=`${event.clientX-rect.left+14}px`;
  tooltip.style.top=`${event.clientY-rect.top+14}px`;
  tooltip.textContent=booking?`${id}: ${booking.user} · ${booking.status==="pending"?"승인 대기":statusMeta[booking.purpose].label}`:`${id}: 사용 가능`;
}
function hideTooltip(){document.getElementById("map-tooltip").style.display="none";}

function renderTimeline(container,date){
  container.innerHTML="";
  const indicator=document.createElement("div");
  indicator.className="time-indicator";
  indicator.style.left=`${((appState.currentHour-9)/9)*100}%`;
  container.appendChild(indicator);
  for(const id of bscIds){
    const row=document.createElement("div");row.className="timeline-row";
    const label=document.createElement("div");label.className="tl-label";label.textContent=id;
    const track=document.createElement("div");track.className="tl-track";
    for(let i=0;i<9;i+=1){const line=document.createElement("div");line.className="tl-track-line";line.style.left=`${(i/9)*100}%`;track.appendChild(line);} 
    for(const booking of getBookingsForDate(id,date)){
      const bar=document.createElement("div");
      const width=(booking.duration/9)*100;const left=((booking.start-9)/9)*100;
      bar.className=`tl-bar ${booking.status==="pending"?"pending":""}`.trim();
      bar.style.width=`${width}%`;bar.style.left=`${left}%`;
      if(booking.status!=="pending") bar.style.background=booking.user==="System"?statusMeta.system.color:statusMeta[booking.purpose].color;
      bar.textContent=booking.status==="pending"?`${booking.user} (대기)`:booking.user;
      track.appendChild(bar);
    }
    row.appendChild(label);row.appendChild(track);container.appendChild(row);
  }
}
function renderStatusList(){
  const list=document.getElementById("status-list");list.innerHTML="";
  for(const id of bscIds){
    const booking=getCurrentBooking(id);
    const meta=getStatusMeta(booking);
    const item=document.createElement("div");item.className="status-item";item.style.borderLeftColor=meta.color;
    item.innerHTML=`<div class="status-icon" style="color:${meta.color}">●</div><div class="status-info"><div class="status-id">${id}</div><div class="status-text">${meta.text}</div></div><div class="status-badge" style="background:${meta.color}">${meta.label}</div>`;
    list.appendChild(item);
  }
}

function getStatusMeta(booking){
  if(!booking) return {color:statusMeta.free.color,label:statusMeta.free.label,text:"대기 중"};
  if(booking.status==="pending") return {color:statusMeta.pending.color,label:statusMeta.pending.label,text:`${booking.user} (승인 대기)`};
  if(booking.user==="System") return {color:statusMeta.system.color,label:statusMeta.system.label,text:"시스템 소독"};
  const meta=statusMeta[booking.purpose];
  return {color:meta.color,label:meta.label,text:`${booking.user} 작업 중`};
}

function renderChart(){
  const counts={process:0,maint:0,em:0,clean:0,other:0,free:0};
  for(const id of bscIds){
    const booking=getCurrentBooking(id);
    if(booking&&booking.status==="confirmed"&&booking.user!=="System") counts[booking.purpose]+=1;
    else if(!booking) counts.free+=1;
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
    circle.setAttribute("stroke",statusMeta[key].color);
    circle.setAttribute("stroke-dasharray",`${percent} ${100-percent}`);
    circle.setAttribute("stroke-dashoffset",String(25-startAngle));
    svg.appendChild(circle);
    const legendItem=document.createElement("div");legendItem.className="legend-item";
    legendItem.innerHTML=`<span class="legend-dot" style="background:${statusMeta[key].color}"></span><span>${statusMeta[key].label} (${counts[key]}대)</span>`;
    legend.appendChild(legendItem);
    startAngle+=percent;
  }
  const label=document.createElementNS("http://www.w3.org/2000/svg","text");
  label.setAttribute("x","50%");label.setAttribute("y","50%");label.setAttribute("text-anchor","middle");label.setAttribute("dominant-baseline","middle");
  label.setAttribute("font-size","6");label.setAttribute("font-weight","900");label.setAttribute("fill","#2c3e50");
  label.textContent=`${Math.round(((total-counts.free)/total)*100)}%`;
  svg.appendChild(label);
}

function renderSchedule(){
  const tbody=document.getElementById("schedule-body");tbody.innerHTML="";
  const date=getViewDate();
  for(const id of bscIds){
    const tr=document.createElement("tr");
    const nameTd=document.createElement("td");nameTd.className="col-machine";nameTd.textContent=id;tr.appendChild(nameTd);
    for(let i=0;i<18;i+=1){
      const hour=9+i*0.5;
      const booking=(bookings[id]||[]).find(b=>b.date===date&&b.start===hour);
      if(booking){
        const td=document.createElement("td");td.style.padding="2px";
        const span=booking.duration/0.5;td.colSpan=span;
        const block=document.createElement("div");block.className="booking-block";
        if(booking.status==="pending"){
          block.classList.add("pending");block.style.backgroundColor=statusMeta.pending.color;
          block.innerHTML=`<span>${booking.user} (대기)</span>`;
          block.addEventListener("click",()=>openApprovalModal(id,booking.docId));
        }else if(booking.user==="System"){
          block.style.backgroundColor=statusMeta.system.color;block.innerHTML="<span>소독</span>";
        }else{
          block.style.backgroundColor=statusMeta[booking.purpose].color;
          block.innerHTML=`<span>${booking.user}</span><span class="booking-sub">${statusMeta[booking.purpose].label}</span><div class="resize-handle"></div>`;
        }
        if(can("edit")&&booking.user!=="System"){
          block.draggable=true;
          block.addEventListener("dragstart",e=>handleDragStart(e,id,booking.docId));
          block.addEventListener("dragend",handleDragEnd);
          const handle=block.querySelector(".resize-handle");
          if(handle) handle.addEventListener("mousedown",e=>handleResizeStart(e,id,booking.docId,booking.duration));
        }else{
          block.style.cursor="default";
          const handle=block.querySelector(".resize-handle");if(handle) handle.style.display="none";
        }
        td.appendChild(block);tr.appendChild(td);i+=span-1;continue;
      }
      const td=document.createElement("td");
      if(can("edit")){
        td.addEventListener("dragover",e=>{e.preventDefault();td.classList.add("drag-hover");});
        td.addEventListener("dragleave",()=>td.classList.remove("drag-hover"));
        td.addEventListener("drop",e=>{td.classList.remove("drag-hover");handleDrop(e,id,hour);});
      }
      const empty=document.createElement("div");empty.className="empty-slot";
      empty.addEventListener("click",()=>openBookingModal(id,hour));
      td.appendChild(empty);tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}
function renderCalendar(){
  const grid=document.getElementById("calendar-grid");
  const title=document.querySelector(".cal-title");
  title.textContent=`${appState.currentYear}. ${String(appState.currentMonth).padStart(2,"0")}`;
  grid.innerHTML="";
  const headers=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  headers.forEach((h,idx)=>{const div=document.createElement("div");div.className="cal-header-cell";div.textContent=h;if(idx===0)div.style.color="#e74c3c";if(idx===6)div.style.color="#3498db";grid.appendChild(div);});
  const firstDay=new Date(appState.currentYear,appState.currentMonth-1,1).getDay();
  const daysInMonth=new Date(appState.currentYear,appState.currentMonth,0).getDate();
  for(let i=0;i<firstDay;i+=1) grid.appendChild(document.createElement("div"));
  const today=new Date();
  const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  for(let d=1;d<=daysInMonth;d+=1){
    const key=`${appState.currentYear}-${String(appState.currentMonth).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const cell=document.createElement("button");cell.type="button";cell.className="cal-day-cell";
    if(key===todayKey) cell.classList.add("today");
    const util=computeUtilizationForDay(key);
    const utilClass=util>70?"util-high":util>30?"util-mid":"util-low";
    cell.innerHTML=`<div class="cal-day-num">${d}</div><div class="util-indicator"><span class="util-value ${utilClass}">${util}%</span><div class="util-bar-bg"><div class="util-bar-fill ${utilClass}" style="width:${util}%"></div></div></div>`;
    cell.addEventListener("click",()=>openDayModal(key));
    grid.appendChild(cell);
  }
}

function computeUtilizationForDay(date){
  let usedSlots=0;const totalSlots=bscIds.length*18;
  for(const id of bscIds){usedSlots+=getBookingsForDate(id,date).reduce((sum,b)=>sum+b.duration/0.5,0);} 
  return Math.min(100,Math.round((usedSlots/totalSlots)*100));
}

function openDayModal(date){
  document.getElementById("day-modal").style.display="flex";
  document.getElementById("day-modal-title").textContent=`${date.replace(/-/g,". ")} 상세 일정`;
  renderTimeline(document.getElementById("day-timeline"),date);
}

function renderAdmin(){
  if(!can("admin") || appState.currentView!=="admin") return;
  const usersBtn=document.querySelector('[data-admin-view="users"]');
  const machinesBtn=document.querySelector('[data-admin-view="machines"]');
  const locationsBtn=document.querySelector('[data-admin-view="locations"]');
  if(appState.currentUser.role==="supervisor"){
    usersBtn.style.display="none";
    machinesBtn.style.display="none";
    locationsBtn.style.display="none";
    switchAdminView("audit");
  }else{
    usersBtn.style.display="flex";
    machinesBtn.style.display="flex";
    locationsBtn.style.display="flex";
  }
  refreshUsersFromDb();
  renderLocationTable();
  renderMachineTable();
  renderPendingList();
  renderStats();
}

async function refreshUsersFromDb(){
  const snap = await getDocs(collection(db,"users"));
  users = snap.docs.map(docSnap=>({uid: docSnap.id, ...docSnap.data()}));
  renderUserTable();
}

async function approveUser(uid){
  await updateDoc(doc(db,"users",uid),{approved:true});
  await refreshUsersFromDb();
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
    div.innerHTML=`<strong>${id} · ${booking.user}</strong><div class="pending-meta">${booking.date} · ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}</div><div class="pending-meta">목적: ${statusMeta[booking.purpose].label}</div><div class="pending-actions"><button class="btn-edit" data-approve-id="${id}" data-approve-doc="${docId}">승인</button><button class="btn-del" data-reject-id="${id}" data-reject-doc="${docId}">반려</button></div>`;
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
  if(!can("create")){alert("권한이 없습니다.");return;}
  appState.bookingTarget={id,start};
  document.getElementById("booking-modal").style.display="flex";
  document.getElementById("booking-sub").textContent=`${id} / ${formatTime(start)} 시작`;
  document.getElementById("booking-start").value=String(start);
  document.getElementById("booking-date").value=getViewDate();
  document.getElementById("booking-user").value=appState.currentUser.name;
  document.getElementById("booking-recurring").checked=false;
}
function closeModal(id){document.getElementById(id).style.display="none";}

async function confirmBooking(){
  const user=document.getElementById("booking-user").value.trim();
  const date=document.getElementById("booking-date").value;
  const start=Number(document.getElementById("booking-start").value);
  const duration=Number(document.getElementById("booking-duration").value);
  const purpose=document.getElementById("booking-purpose").value;
  const recurring=document.getElementById("booking-recurring").checked;
  if(!user||!date){alert("정보를 모두 입력해주세요.");return;}
  if(start+duration>18){alert("운영 시간을 초과합니다.");return;}
  const status=appState.currentUser.role==="worker"?"pending":"confirmed";
  const userId=appState.currentUser.id||appState.currentUser.name||user;
  const weeks=recurring?4:1; let success=0;
  for(let i=0;i<weeks;i+=1){
    const dateObj=new Date(date);dateObj.setDate(dateObj.getDate()+i*7);
    const targetDate=dateObj.toISOString().slice(0,10);
    if(isOverlap(appState.bookingTarget.id,targetDate,start,duration)){
      if(!recurring){alert("해당 날짜/시간에 예약이 중복됩니다.");return;}
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
      status
    });
    success+=1;
    if(status==="confirmed") await addSystemBuffer(appState.bookingTarget.id,targetDate,start+duration);
  }
  closeModal("booking-modal");
  if(success===0){alert("모든 반복 예약이 중복으로 인해 실패했습니다.");return;}
  showToast(status==="pending"?"예약 요청이 등록되었습니다.":"예약이 확정되었습니다.");
  if(recurring) showToast(`${success}건의 반복 예약이 등록되었습니다.`,"info");
}

function isOverlap(id,date,start,duration){
  return getBookingsForDate(id,date).some(b=>start<b.start+b.duration&&start+duration>b.start);
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
  document.getElementById("approval-detail").innerHTML=`날짜: ${booking.date}<br />장비: ${id}<br />시간: ${formatTime(booking.start)} - ${formatTime(booking.start+booking.duration)}<br />목적: ${statusMeta[booking.purpose].label}`;
}

async function processApproval(action){
  const target=appState.approvalTarget;if(!target) return;
  const {id,docId}=target;const booking=findBookingByDocId(id,docId);if(!booking) return;
  if(action==="approve"){
    await updateBookingDoc(docId,{status:"confirmed"});
    await addSystemBuffer(id,booking.date,booking.start+booking.duration,docId);
    showToast("예약이 승인되었습니다.");
  }else{
    await deleteBookingDoc(docId);
    showToast("예약이 반려되었습니다.","info");
  }
  closeModal("approval-modal");
  appState.approvalTarget=null;
}
async function deleteMachine(id){
  if(!confirm(`장비 ${id}를 삭제하시겠습니까?`)) return;
  const existing=bookings[id]||[];
  for(const booking of existing){
    if(booking.docId) await deleteBookingDoc(booking.docId);
  }
  bscIds=bscIds.filter(x=>x!==id);
  delete bookings[id];
  delete machineLocations[id];
  delete machineMgmtNos[id];
  delete machineDescs[id];
  ensureBookingBuckets();
  renderAll();
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

function saveLocation(){
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
  renderAll();
}

function deleteLocation(loc){
  const used=bscIds.some(id=>getMachineLocation(id)===loc);
  if(used){alert("장비가 배정된 장소는 삭제할 수 없습니다.");return;}
  if(!confirm(`${loc}를 삭제하시겠습니까?`)) return;
  locations=locations.filter(l=>l!==loc);
  renderAll();
}













































































