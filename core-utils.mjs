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

export function isCellBankRoomName(name){
  return String(name || "").includes("세포은행");
}

export function buildTimelineMachineIds({ orderedRooms, machineIdsByRoomId, allMachineIds, machineRoomIdsById }){
  const ids=[];
  const seen=new Set();
  let fixedTopCrfId=null;

  orderedRooms.forEach(room=>{
    if(!isCellBankRoomName(room?.name)) return;
    const roomMachineIds=(machineIdsByRoomId[room.id] || [])
      .map(rawId=>normalizeMachineIdForRender(rawId))
      .filter(id=>id && isRenderableMachineId(id));
    const crf=roomMachineIds.find(id=>String(id).toUpperCase()==="CRF");
    if(crf) fixedTopCrfId=crf;
  });

  if(fixedTopCrfId){
    seen.add(fixedTopCrfId);
    ids.push(fixedTopCrfId);
  }

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
