export function formatTime(val){
  const totalMinutes=Math.max(0,Math.round((Number(val)||0)*60));
  const h=Math.floor(totalMinutes/60);
  const m=totalMinutes%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

export function clampHour(val){
  if(val<9) return 9;
  if(val>18) return 18;
  return val;
}

export function snapToHalfHour(val){
  return Math.round((Number(val)||0)*2)/2;
}

export function canRolePerform(role, action){
  if(!role || role==="guest") return false;
  const isManager=role==="admin" || role==="supervisor";
  if(action==="create") return true;
  if(action==="edit" || action==="approve" || action==="admin" || action==="print") return isManager;
  return false;
}

export function sortByOrderThenName(list){
  return [...list].sort((a,b)=>{
    const ao=Number(a.order)||0;
    const bo=Number(b.order)||0;
    if(ao!==bo) return ao-bo;
    return String(a.name||"").localeCompare(String(b.name||""));
  });
}

export function normalizeMachineIdForRender(rawId){
  const id=String(rawId || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g,"")
    .replace(/\s+/g,"")
    .trim();
  if(!id) return "";
  if(!/[A-Za-z0-9가-힣]/.test(id)) return "";
  return id;
}

export function isRenderableMachineId(id){
  return /^[A-Za-z가-힣][A-Za-z0-9\-_.가-힣]{0,31}$/.test(id);
}

export function compareMachineIdAsc(a,b){
  return String(a).localeCompare(String(b),"ko",{ numeric:true, sensitivity:"base" });
}

export function deriveMachineCategory(machineId){
  const id=normalizeMachineIdForRender(machineId);
  if(!id) return "기타";
  const hyphenIndex=id.indexOf("-");
  if(hyphenIndex>0) return id.slice(0,hyphenIndex).toUpperCase();
  const alphaMatch=id.match(/^[A-Za-z가-힣]+/);
  if(alphaMatch?.[0]) return alphaMatch[0].toUpperCase();
  return "기타";
}

export function buildMobileReservationCategories(machineIds){
  const counts=new Map();
  machineIds.forEach(machineId=>{
    const key=deriveMachineCategory(machineId);
    counts.set(key,(counts.get(key) || 0)+1);
  });
  const items=[...counts.entries()].map(([key,count])=>({ key, label:key, count }));
  items.sort((a,b)=>{
    const aPinned=isPinnedTimelineMachineId(a.key);
    const bPinned=isPinnedTimelineMachineId(b.key);
    if(aPinned!==bPinned) return aPinned ? -1 : 1;
    return compareMachineIdAsc(a.key,b.key);
  });
  return [{ key:"all", label:"전체", count:machineIds.length }, ...items];
}

export function isCellBankRoomName(name){
  return String(name || "").includes("세포은행");
}

export function buildTimelineMachineIds({ orderedRooms, machineIdsByRoomId, allMachineIds, machineRoomIdsById }){
  const ids=[];
  const seen=new Set();
  const fixedTopCrfIds=[];

  orderedRooms.forEach(room=>{
    const roomMachineIds=(machineIdsByRoomId[room.id] || [])
      .map(rawId=>normalizeMachineIdForRender(rawId))
      .filter(id=>id && isRenderableMachineId(id) && isPinnedTimelineMachineId(id))
      .sort(compareMachineIdAsc);
    roomMachineIds.forEach(id=>{
      if(seen.has(id)) return;
      seen.add(id);
      fixedTopCrfIds.push(id);
    });
  });

  allMachineIds.forEach(rawId=>{
    const id=normalizeMachineIdForRender(rawId);
    if(!id || !isRenderableMachineId(id) || seen.has(id)) return;
    if(!machineRoomIdsById[id] || !isPinnedTimelineMachineId(id)) return;
    seen.add(id);
    fixedTopCrfIds.push(id);
  });

  fixedTopCrfIds.sort(compareMachineIdAsc).forEach(id=>ids.push(id));

  orderedRooms.forEach(room=>{
    const roomMachineIds=(machineIdsByRoomId[room.id] || [])
      .map(rawId=>normalizeMachineIdForRender(rawId))
      .filter(id=>id && isRenderableMachineId(id) && !seen.has(id))
      .sort(compareMachineIdAsc);
    roomMachineIds.forEach(id=>{
      seen.add(id);
      ids.push(id);
    });
  });

  allMachineIds.forEach(rawId=>{
    const id=normalizeMachineIdForRender(rawId);
    if(!id || !isRenderableMachineId(id) || seen.has(id)) return;
    if(!machineRoomIdsById[id]) return;
    seen.add(id);
    ids.push(id);
  });

  return ids;
}

export function hasBookingOverlap(bookingsForDate,start,duration,ignoreDocId){
  return bookingsForDate.some(booking=>{
    if(ignoreDocId && booking.docId===ignoreDocId) return false;
    return start<booking.start+booking.duration && start+duration>booking.start;
  });
}

export function canUserOperateBooking(user, booking){
  if(!user || !booking) return false;
  if(user.role==="guest") return false;
  if(booking.user==="System") return false;
  if(user.role==="admin" || user.role==="supervisor") return true;
  if(user.role!=="worker") return false;
  if(booking.createdBy && user.uid && booking.createdBy===user.uid) return true;
  if(booking.userId && user.id && booking.userId===user.id) return true;
  if(booking.user && user.name && booking.user===user.name) return true;
  return false;
}

export function validateBookingDrop({
  booking,
  canDrag,
  targetHour,
  operatingStart=9,
  operatingEnd=18,
  minHour=null,
  overlap=false,
  formatTimeFn=formatTime
}){
  if(!booking) return { ok:false, reason:"예약 정보를 찾을 수 없습니다." };
  if(!canDrag) return { ok:false, reason:"본인 예약만 이동할 수 있습니다." };
  if(targetHour<operatingStart || targetHour+booking.duration>operatingEnd){
    return { ok:false, reason:`운영 시간(${formatTimeFn(operatingStart)}~${formatTimeFn(operatingEnd)})을 벗어납니다.` };
  }
  if(minHour!==null && targetHour<minHour){
    return { ok:false, reason:`오늘 예약은 ${formatTimeFn(minHour)} 이후로만 이동할 수 있습니다.` };
  }
  if(overlap){
    return { ok:false, reason:"다른 예약과 시간이 겹칩니다." };
  }
  return { ok:true, reason:"이 위치로 이동 가능합니다." };
}

export function validateBookingResize({
  booking,
  newDuration,
  operatingEnd=18,
  overlap=false
}){
  if(!booking) return { ok:false, reason:"예약 정보를 찾을 수 없습니다." };
  if(newDuration<0.5 || booking.start+newDuration>operatingEnd){
    return { ok:false, reason:"운영 시간 범위를 벗어납니다." };
  }
  if(overlap){
    return { ok:false, reason:"다른 예약과 시간이 겹칩니다." };
  }
  return { ok:true, reason:"변경 가능합니다." };
}


export function isPinnedTimelineMachineId(id){
  return String(id || "").toUpperCase().includes("CRF");
}
