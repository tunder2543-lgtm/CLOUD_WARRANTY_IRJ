/* ============================================================
   elec.js — ประกันอิเล็คทรอนิค (คลังกลุ่มรูป 3 bucket)
   • แหล่งข้อมูล = โฟลเดอร์จริงใน Storage bucket (1 โฟลเดอร์ = 1 กลุ่ม)
   • โหลดเป็น 2 ชั้น: (1) รายชื่อโฟลเดอร์ 1 request  (2) รายชื่อไฟล์ "เฉพาะเดือนที่ต้องใช้"
     เปิดคลัง = เดือนนี้ + เดือนก่อน · เดือนอื่นเป็นหัวข้อ กดแล้วค่อยโหลด (มีหน้าต่าง %)
   • นำเข้ารูป: เลือกหลายรูป/ลากวาง · วันที่ซ้ำ = รวมเข้ากลุ่มเดิม · กลุ่มใหม่ชื่อโฟลเดอร์ = YYYY-MM-DD
   • ลากรูปวางบนการ์ดกลุ่ม / ในหน้ากลุ่ม = เพิ่มรูปเข้ากลุ่มนั้น (ชื่อซ้ำถามก่อนทับ)
   • เข้ากลุ่ม = ดูรูปทั้งหมด · ค้นหาชื่อ · Export ZIP · ลบกลุ่ม (รหัส 5044)
   หมายเหตุ: กลุ่ม grp_… (import รุ่นเก่า) ยังมีเรคคอร์ดใน Warranty_orders เก็บวันที่+ลำดับรูป
             กลุ่มชื่อวันที่ไม่สร้างเรคคอร์ด (id ซ้ำข้ามคลังจะชนกันในตาราง)
   ============================================================ */

/* ===== state ===== */
let elecGroupId=null;        /* กลุ่มที่กำลังเปิดดู (null = หน้ารายการกลุ่ม) */
let elecSearch="";           /* คำค้นในหน้ารายละเอียดกลุ่ม */
let elecYear=null;           /* ปี (ค.ศ.) ที่เลือกดู */
let elecFiles=[];            /* ไฟล์ที่เลือกในโมดัลนำเข้า [{file,name,status,reason,thumb}] */
let elecUploadGroupId=null;  /* โฟลเดอร์ปลายทางของการนำเข้าครั้งนี้ */
let elecUploadExisting=null; /* กลุ่มเดิมที่กำลังรวมเข้า (null = กลุ่มใหม่) */
let elecUploadNewNames=[];   /* ชื่อไฟล์ที่ "เพิ่มใหม่" ในการนำเข้าครั้งนี้ (ไว้ลบตอนยกเลิก) */
let elecZipBusy=false;
let elecLB=null;             /* lightbox แกลเลอรี: {list,idx,bucket,gid} */
let elecGroupsCache={};      /* bucket -> group[]  (images:null + _loaded:false = ยังไม่ list ไฟล์) */
let elecStatCache={};        /* bucket -> {groups,images(เฉพาะที่โหลดแล้ว)} */
let elecFolderCountCache={}; /* bucket -> {folder:count} เฉพาะโฟลเดอร์ที่โหลดแล้ว (ใช้คำนวณป้าย New) */
let elecLoadedAt={};         /* bucket -> เวลาที่ refresh เดือนล่าสุดครั้งสุดท้าย */
let elecInflight={};         /* bucket -> Promise ที่กำลังโหลดเดือนล่าสุดอยู่ (กันโหลดซ้อน) */
let elecLoading=false;       /* กำลังโหลดครั้งแรกของหัวข้อที่เปิดอยู่ */
const elecMonthOpen=new Set();     /* "bucket|YYYY-MM" ที่กางอยู่ */
const ELEC_SEEN_KEY=KEY+"_elec_seen";
const ELEC_CONCURRENCY=6;          /* list โฟลเดอร์พร้อมกันกี่ตัว */
const ELEC_REFRESH_MS=30*1000;     /* เปิดหัวข้อซ้ำภายในเวลานี้ = ใช้ cache ไม่อ่านใหม่ */

/* รีเซ็ตการนำทาง (เรียกจาก gotoSection) — ไม่ล้าง cache เพื่อให้เปิดซ้ำได้ทันที */
function resetElecNav(){ elecGroupId=null; elecSearch=""; elecYear=null; }

/* กำลังอัปโหลดในโมดัลนำเข้า (step2) — ห้ามปิดโมดัล */
function elecBusy(){
  const m=$("elecModal"), s2=$("elecStep2");
  return !!(m&&m.classList.contains("show")&&s2&&s2.style.display!=="none");
}

/* ============================================================
   เครื่องมือ
   ============================================================ */
/* รัน fn กับทุกรายการ พร้อมกันไม่เกิน limit ตัว */
async function elecMapLimit(list,limit,fn){
  const out=new Array(list.length); let i=0;
  const worker=async()=>{ for(;;){ const k=i++; if(k>=list.length) return; out[k]=await fn(list[k],k); } };
  await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));
  return out;
}
/* list รายการใน path เดียว (แบ่งหน้าเอง กัน limit 100 ของ Storage) */
async function elecList(bucket,path){
  const out=[]; const limit=100; let offset=0;
  for(;;){
    const {data,error}=await sb.storage.from(bucket).list(path,{limit,offset,sortBy:{column:"name",order:"asc"}});
    if(error) throw error;
    if(!data||!data.length) break;
    out.push(...data);
    if(data.length<limit) break;
    offset+=limit;
  }
  return out;
}
const elecIsFile=e=>e.id!==null&&e.name!==".emptyFolderPlaceholder";
const elecIsFolder=e=>e.id===null&&e.name!==".emptyFolderPlaceholder";
/* วันที่ของกลุ่มจากชื่อโฟลเดอร์ (หรือจากเรคคอร์ดถ้ามี) */
function elecDateFromFolder(folder,rec){
  if(/^\d{4}-\d{2}-\d{2}$/.test(folder)) return folder;
  if(rec&&rec.date) return rec.date;
  return "";
}
/* จัดลำดับรูป: มีเรคคอร์ด → ใช้ลำดับนั้นก่อน แล้วต่อด้วยไฟล์ใหม่ (เรียงชื่อ) */
function elecOrderImages(files,rec){
  if(rec&&Array.isArray(rec.images)&&rec.images.length){
    const set=new Set(files);
    const ordered=rec.images.filter(n=>set.has(n));
    const recSet=new Set(rec.images);
    const extra=files.filter(n=>!recSet.has(n)).sort((a,b)=>a.localeCompare(b));
    return [...ordered,...extra];
  }
  return files.slice().sort((a,b)=>a.localeCompare(b));
}
/* เดือนนี้ + เดือนก่อน (คีย์ YYYY-MM) */
function elecRecentMonths(){
  const d=new Date(); const cur=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  d.setDate(1); d.setMonth(d.getMonth()-1);
  const prev=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  return [cur,prev];
}
function elecGroupsFromDB(secId){ return DB.orders.filter(o=>o.section===secId).map(o=>({...o,_loaded:true})); }
/* กลุ่มทั้งหมดของหัวข้อ (จาก cache; ยังไม่โหลด → ใช้ตารางไปก่อน) ไม่รวมโฟลเดอร์ว่าง */
function elecGroups(secId){
  const ei=elecInfo(secId);
  const c=ei?elecGroupsCache[ei.bucket]:undefined;
  return ((c!==undefined)?c:elecGroupsFromDB(secId)).filter(g=>!g._empty);
}
function elecGroupById(id){
  for(const b in elecGroupsCache){ const g=(elecGroupsCache[b]||[]).find(x=>x.id===id); if(g) return g; }
  return DB.orders.find(o=>o.id===id&&isElecSection(o.section))||null;
}
/* คำนวณสถิติ + ตัวนับไฟล์ต่อโฟลเดอร์ใหม่จาก cache */
function elecRecalc(bucket){
  const groups=(elecGroupsCache[bucket]||[]).filter(g=>!g._empty);
  const fc={}; let images=0;
  groups.forEach(g=>{ if(g._loaded){ fc[g.id]=g.images.length; images+=g.images.length; } });
  elecStatCache[bucket]={groups:groups.length,images};
  elecFolderCountCache[bucket]=fc;
}

/* ============================================================
   ชั้นที่ 1: รายชื่อโฟลเดอร์ (1 request) → โครงกลุ่ม
   ============================================================ */
async function loadElecFolders(secId){
  const ei=elecInfo(secId); if(!ei) return;
  if(Store.mode!=="supabase"||!sb){ elecGroupsCache[ei.bucket]=elecGroupsFromDB(secId); elecRecalc(ei.bucket); return; }
  const bucket=ei.bucket;
  const top=await elecList(bucket,"");
  const folders=top.filter(elecIsFolder).map(e=>e.name);
  const dbById=new Map(DB.orders.filter(o=>o.section===secId).map(o=>[o.id,o]));
  const old=new Map((elecGroupsCache[bucket]||[]).map(g=>[g.id,g]));
  const groups=folders.map(folder=>{
    const prev=old.get(folder), rec=dbById.get(folder);
    if(prev) return prev;                                  /* โฟลเดอร์เดิม: คงรูปที่โหลดไว้แล้ว */
    return {
      id:folder, section:secId, date:elecDateFromFolder(folder,rec),
      images:null, _loaded:false, _empty:false,
      order_no:"", customer:"", category:"", status:"", note:"",
      price:"", wstart:"", wterm:"", locked:!!(rec&&rec.locked), _fromBucket:true,
    };
  });
  groups.sort((a,b)=> a.date<b.date?1 : a.date>b.date?-1 : 0);   /* ใหม่→เก่า */
  elecGroupsCache[bucket]=groups;
  elecRecalc(bucket);
}

/* ============================================================
   ชั้นที่ 2: รายชื่อไฟล์ของโฟลเดอร์ในเดือนที่ขอ (ขนานกัน)
   force=true → อ่านใหม่แม้โหลดแล้ว (ใช้ตอน refresh เดือนล่าสุด)
   ============================================================ */
async function loadElecMonth(secId,mk,onProgress,force){
  const ei=elecInfo(secId); if(!ei) return;
  if(Store.mode!=="supabase"||!sb) return;
  const bucket=ei.bucket;
  const all=(elecGroupsCache[bucket]||[]).filter(g=>monthKey(g.date)===mk);
  const todo=force?all:all.filter(g=>!g._loaded);
  if(!todo.length){ if(onProgress) onProgress(0,0); return; }
  const dbById=new Map(DB.orders.filter(o=>o.section===secId).map(o=>[o.id,o]));
  let done=0; if(onProgress) onProgress(0,todo.length);
  await elecMapLimit(todo,ELEC_CONCURRENCY,async g=>{
    const entries=await elecList(bucket,g.id);
    const files=entries.filter(elecIsFile).map(e=>e.name);
    g.images=elecOrderImages(files,dbById.get(g.id));
    g._loaded=true; g._empty=!files.length;                 /* โฟลเดอร์ว่าง/ผี → ซ่อน */
    done++; if(onProgress) onProgress(done,todo.length);
  });
  elecRecalc(bucket);
}
/* เดือนที่จะโหลดตอนเปิด: เดือนนี้+เดือนก่อน; ถ้าทั้งสองเดือนไม่มีกลุ่มเลย → เดือนล่าสุดที่มี 1 เดือน */
function elecInitialMonths(bucket){
  const groups=(elecGroupsCache[bucket]||[]);
  const have=new Set(groups.map(g=>monthKey(g.date)));
  const recent=elecRecentMonths().filter(k=>have.has(k));
  if(recent.length) return recent;
  const keys=[...have].filter(k=>k!=="").sort().reverse();
  return keys.length?[keys[0]]:(have.has("")?[""]:[]);
}
/* โหลดโครง + เดือนล่าสุด (แชร์ promise ถ้ากำลังโหลดอยู่) */
function elecEnsureRecent(secId,force){
  const ei=elecInfo(secId); if(!ei) return Promise.resolve();
  const bucket=ei.bucket;
  if(elecInflight[bucket]) return elecInflight[bucket];
  const p=(async()=>{
    await loadElecFolders(secId);
    const months=elecInitialMonths(bucket);
    await Promise.all(months.map(mk=>loadElecMonth(secId,mk,null,force)));
    elecLoadedAt[bucket]=Date.now();
  })();
  elecInflight[bucket]=p;
  return p.finally(()=>{ delete elecInflight[bucket]; });
}

/* ===== ป้าย "New +N" — ไฟล์ใหม่ที่ยังไม่ได้ดู (seen ต่อเบราว์เซอร์, นับเฉพาะเดือนที่โหลดแล้ว) ===== */
function elecLoadSeen(){ try{ return JSON.parse(localStorage.getItem(ELEC_SEEN_KEY))||{}; }catch(e){ return {}; } }
function elecSaveSeen(o){ try{ localStorage.setItem(ELEC_SEEN_KEY,JSON.stringify(o)); }catch(e){} }
function elecNewCount(secId){
  const ei=elecInfo(secId); if(!ei) return 0;
  const cur=elecFolderCountCache[ei.bucket]; if(!cur) return 0;
  const seen=elecLoadSeen()[ei.bucket]||{};
  let n=0; for(const f in cur){ n+=Math.max(0,(cur[f]|0)-(seen[f]|0)); }
  return n;
}
/* ดูแล้ว → รวม (merge) จำนวนปัจจุบันของโฟลเดอร์ที่โหลดแล้วเข้ากับ seen เดิม */
function elecMarkSeen(secId){
  const ei=elecInfo(secId); const cur=ei?elecFolderCountCache[ei.bucket]:null; if(!cur) return;
  const all=elecLoadSeen(); all[ei.bucket]={...(all[ei.bucket]||{}),...cur}; elecSaveSeen(all);
}
function elecSeedSeenIfEmpty(){
  try{ if(localStorage.getItem(ELEC_SEEN_KEY)!==null) return; }catch(e){ return; }
  const all={};
  Object.values(ELEC_SECTIONS).forEach(ei=>{ if(elecFolderCountCache[ei.bucket]) all[ei.bucket]={...elecFolderCountCache[ei.bucket]}; });
  elecSaveSeen(all);
}

/* สถิติของหัวข้อ elec (null = ยังไม่รู้) */
function elecStat(secId){ const ei=elecInfo(secId); return ei?(elecStatCache[ei.bucket]||null):null; }
function elecCount(secId){ const s=elecStat(secId); return s?s.groups:null; }

/* โหลดโครง + เดือนล่าสุดของทั้ง 3 คลังตอนเปิดแอป (เบื้องหลัง) → badge เมนูซ้าย + การ์ดหน้าแรก
   ข้อมูลเข้า cache เดียวกัน เปิดหัวข้อแล้วใช้ได้ทันที */
async function prefetchElecCounts(){
  if(Store.mode!=="supabase"||!sb) return;
  let fresh=false; try{ fresh=localStorage.getItem(ELEC_SEEN_KEY)===null; }catch(e){}   /* เครื่องใหม่: รอ seed ก่อนค่อยโชว์ป้าย กัน New กระพริบ */
  await Promise.all(Object.keys(ELEC_SECTIONS).map(async secId=>{
    try{ await elecEnsureRecent(secId); }
    catch(e){ console.warn("[elec] prefetch",secId,e&&e.message||e); }
    if(fresh) return;
    if(typeof renderNav==="function") renderNav();
    if(currentSection===null && typeof renderHome==="function") renderHome();
  }));
  elecSeedSeenIfEmpty();
  if(typeof renderNav==="function") renderNav();
  if(currentSection===null && typeof renderHome==="function") renderHome();
}
/* เปิดหัวข้อครั้งแรก (ยังไม่มี cache) → โหลดแล้ว render */
async function loadAndRenderElec(secId){
  const ei=elecInfo(secId); if(!ei) return;
  elecLoading=true; renderElecLoading(ei);
  let err="";
  try{ await elecEnsureRecent(secId); }
  catch(e){ err=(e&&e.message)||String(e); console.warn("[elec] load bucket:",err); }
  elecLoading=false;
  if(currentSection!==secId) return;
  if(err){ elecGroupsCache[ei.bucket]=elecGroupsFromDB(secId); elecRecalc(ei.bucket); toast("อ่านจากคลังไม่สำเร็จ ใช้ข้อมูลในตารางแทน"); }
  else elecMarkSeen(secId);
  if(typeof renderNav==="function") renderNav();
  renderElecView();
}
/* เปิดซ้ำ: มี cache แล้ว → ถ้าเก่ากว่า ELEC_REFRESH_MS อ่านโครง+เดือนล่าสุดใหม่เบื้องหลัง แล้ว render ถ้าเปลี่ยน */
async function elecMaybeRefresh(secId){
  const ei=elecInfo(secId); if(!ei) return;
  const bucket=ei.bucket;
  if(Store.mode!=="supabase"||!sb) return;
  if(elecInflight[bucket]) return;
  if(Date.now()-(elecLoadedAt[bucket]||0)<ELEC_REFRESH_MS) return;
  const before=JSON.stringify([elecStatCache[bucket],elecFolderCountCache[bucket]]);
  try{ await elecEnsureRecent(secId,true); }catch(e){ console.warn("[elec] refresh",e&&e.message||e); return; }
  const after=JSON.stringify([elecStatCache[bucket],elecFolderCountCache[bucket]]);
  if(currentSection===secId) elecMarkSeen(secId);
  if(typeof renderNav==="function") renderNav();
  if(before!==after && currentSection===secId && !elecGroupId) renderElecView();
}
/* รีเฟรช: ล้าง cache ของ bucket นี้แล้วอ่านใหม่ทั้งหมด */
function refreshElec(){
  const ei=elecInfo(currentSection); if(!ei) return;
  delete elecGroupsCache[ei.bucket]; delete elecLoadedAt[ei.bucket]; elecGroupId=null;
  [...elecMonthOpen].forEach(k=>{ if(k.startsWith(ei.bucket+"|")) elecMonthOpen.delete(k); });
  renderElecView();
}

/* ============================================================
   หน้าต่างความคืบหน้า (#elecLoadModal) — ใช้ทั้งโหลดเดือน และอัปโหลดรูปเข้ากลุ่ม
   ============================================================ */
function elecProgressOpen(title,sub){
  $("elecLoadTitle").textContent=title||"กำลังโหลด…";
  $("elecLoadSub").textContent=sub||"";
  elecProgressSet(0,0,"");
  $("elecLoadOv").classList.add("show"); $("elecLoadModal").classList.add("show");
}
function elecProgressSet(done,total,label){
  const pct=total?Math.round(done/total*100):0;
  $("elecLoadFill").style.width=pct+"%";
  $("elecLoadPct").textContent=pct+"%";
  $("elecLoadCnt").textContent=label!=null?label:(total?`${done}/${total}`:"");
}
function elecProgressClose(){ $("elecLoadOv").classList.remove("show"); $("elecLoadModal").classList.remove("show"); }
function elecProgressActive(){ const m=$("elecLoadModal"); return !!(m&&m.classList.contains("show")); }

/* ============================================================
   หน้าคลัง (list) / หน้ารายละเอียดกลุ่ม (detail)
   ============================================================ */
function renderElecView(){
  const ei=elecInfo(currentSection); if(!ei) return;
  if(elecGroupsCache[ei.bucket]===undefined){
    if(elecLoading) renderElecLoading(ei); else loadAndRenderElec(currentSection);
    return;
  }
  const g=elecGroupId?elecGroupById(elecGroupId):null;
  if(g) renderElecDetail(g);
  else {
    renderElecList();
    /* เปิดดูคลัง = อ่านแล้ว → บันทึก seen (จำต่อเครื่องใน localStorage) แล้วลบป้าย New ทันที
       (เดิมเส้นทางนี้ไม่ได้ mark เพราะ cache ถูกพรีโหลดไว้ตอนบูต ป้ายเลยค้าง) */
    elecMarkSeen(currentSection);
    if(typeof renderNav==="function") renderNav();
    elecMaybeRefresh(currentSection);
  }
}

function renderElecLoading(ei){
  const wrap=$("elecView"); if(!wrap) return;
  wrap.innerHTML=`<div class="elec-bar-top">
    <div class="elec-store">${ei?ei.emoji:""} คลัง <b>${esc(ei?ei.label:"")}</b>
      <span class="elec-store-sub">กำลังอ่านรายการจากคลัง…</span></div>
  </div>
  <div class="elec-empty"><div class="elec-empty-ic">${ico("clock")}</div>
    <div class="elec-empty-h">กำลังโหลดคลัง ${esc(ei?ei.label:"")}…</div>
    <div class="elec-empty-s">อ่านรายชื่อกลุ่ม และรูปของเดือนนี้กับเดือนก่อนจาก Supabase Storage</div></div>`;
}

function renderElecList(){
  const wrap=$("elecView");
  const sec=currentSection, ei=elecInfo(sec), bucket=ei?ei.bucket:sec;
  const groups=elecGroups(sec);
  let html=`<div class="elec-bar-top">
    <div class="elec-store">${ei?ei.emoji:""} คลัง <b>${esc(ei?ei.label:sec)}</b>
      <span class="elec-store-sub">${groups.length} กลุ่ม · bucket <code>${esc(bucket)}</code> · โหลดเฉพาะเดือนล่าสุด เดือนอื่นกดเพื่อโหลด</span></div>
    <button class="btn ghost" id="elecRefresh" title="อ่านรายการล่าสุดจากคลังใหม่">${ico("refresh")} รีเฟรชจากคลัง</button>
  </div>`;
  if(!groups.length){
    html+=`<div class="elec-empty">
      <div class="elec-empty-ic">${ico("folder")}</div>
      <div class="elec-empty-h">ยังไม่มีกลุ่มรูปในคลังนี้</div>
      <div class="elec-empty-s">กดปุ่ม “นำเข้ารูปใหม่” มุมบนขวา เลือกวันที่แล้วเลือกรูป (หรือลากรูปมาวาง)</div></div>`;
  }else{
    /* ===== แถบเลือกปี (ค.ศ. ใหม่→เก่า) — กลุ่มที่ไม่มีวันที่ รวมเข้ากับปีล่าสุด ===== */
    const now=new Date(), curYear=String(now.getFullYear());
    const realYears=groups.map(o=>yearKey(o.date)).filter(y=>y!=="");
    const latestYear=realYears.length?realYears.slice().sort().slice(-1)[0]:curYear;
    const effYear=o=>{ const y=yearKey(o.date); return y!==""?y:latestYear; };
    const years=[...new Set(groups.map(effYear))].sort((a,b)=> a<b?1:-1);
    if(!years.includes(elecYear)) elecYear = years.includes(curYear)?curYear:years[0];
    html+=`<div class="eyear-bar">`+years.map(y=>{
      const cnt=groups.filter(o=>effYear(o)===y).length;
      return `<button class="eyear-chip${y===elecYear?" on":""}" data-year="${esc(y)}">${esc(String(Number(y)+543))}<span class="eyc-n num">${cnt}</span></button>`;
    }).join("")+`</div>`;
    /* ===== เดือนของปีที่เลือก (ใหม่→เก่า) ===== */
    const inYear=groups.filter(o=>effYear(o)===elecYear);
    const byMonth=new Map();
    inYear.forEach(o=>{ const k=monthKey(o.date); if(!byMonth.has(k)) byMonth.set(k,[]); byMonth.get(k).push(o); });
    const keys=[...byMonth.keys()].sort((a,b)=>{ if(a==="")return 1; if(b==="")return -1; return a<b?1:-1; });
    const loadedKeys=keys.filter(k=>byMonth.get(k).every(g=>g._loaded));
    /* ยังไม่เคยกางเดือนไหนของคลังนี้ → กางเดือนนี้ถ้าโหลดแล้ว ไม่งั้นเดือนล่าสุดที่โหลดแล้ว */
    if(![...elecMonthOpen].some(k=>k.startsWith(bucket+"|"))){
      const curMonth=curYear+"-"+String(now.getMonth()+1).padStart(2,"0");
      const first=loadedKeys.includes(curMonth)?curMonth:loadedKeys[0];
      if(first!==undefined) elecMonthOpen.add(bucket+"|"+first);
    }
    html+=keys.map(k=>{
      const items=byMonth.get(k), loaded=items.every(g=>g._loaded);
      const open=loaded&&elecMonthOpen.has(bucket+"|"+k);
      const imgN=items.reduce((n,o)=>n+((o.images&&o.images.length)||0),0);
      const cards=loaded?items.map(o=>{
        const label=beDateLabel(o.date), cnt=(o.images&&o.images.length)||0;
        const cover=cnt?bucketImgUrl(bucket,o.id,o.images[0]):null;
        return `<div class="gcard" data-gid="${esc(o.id)}">
          <div class="gcover">${cover
            ?`<img loading="lazy" src="${cover}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'gph',textContent:''}))">`
            :`<div class="gph"></div>`}
            <span class="gcnt num">${ico("images")} ${cnt}</span>
            <span class="gdrop-tag">${ico("upload")} วางเพื่อเพิ่มเข้ากลุ่ม</span></div>
          <div class="gbody">
            <div class="gname num">${esc(label||"(ไม่มีวันที่)")}</div>
            <div class="gmeta">จำนวนรูป ${cnt}</div>
          </div>
          <button class="gdel" data-del="${esc(o.id)}" title="ลบกลุ่ม (ใส่รหัส)">${ico("trash")}</button>
        </div>`;
      }).join(""):"";
      return `<section class="emonth${open?"":" collapsed"}${loaded?"":" unloaded"}" data-mk="${esc(k)}">
        <button class="emonth-head" type="button">
          <span class="emonth-caret">${ico("chevron-down")}</span>
          <span class="emonth-name">${ico("calendar")} ${esc(monthLabel(k))}</span>
          <span class="emonth-sub">${loaded?`${items.length} กลุ่ม · ${imgN} รูป`:`${items.length} กลุ่ม · <b>กดเพื่อโหลด</b>`}</span>
        </button>
        <div class="egrid">${cards}</div>
      </section>`;
    }).join("");
  }
  wrap.innerHTML=html;
  { const rb=$("elecRefresh"); if(rb) rb.onclick=refreshElec; }
  wrap.querySelectorAll(".eyear-chip").forEach(c=>c.onclick=()=>{ elecYear=c.dataset.year; renderElecList(); window.scrollTo({top:0,behavior:"smooth"}); });
  wrap.querySelectorAll(".emonth-head").forEach(h=>h.onclick=()=>{
    const secEl=h.closest(".emonth"), k=secEl.dataset.mk, key=bucket+"|"+k;
    if(secEl.classList.contains("unloaded")){ elecOpenMonth(sec,k); return; }
    secEl.classList.toggle("collapsed");
    if(secEl.classList.contains("collapsed")) elecMonthOpen.delete(key); else elecMonthOpen.add(key);
  });
  wrap.querySelectorAll(".gcard").forEach(el=>el.onclick=e=>{
    if(e.target.closest(".gdel")) return;
    elecGroupId=el.dataset.gid; elecSearch=""; renderElecView(); window.scrollTo({top:0,behavior:"smooth"});
  });
  wrap.querySelectorAll(".gdel").forEach(b=>b.onclick=e=>{e.stopPropagation();const o=elecGroupById(b.dataset.del);if(o)deleteElecGroup(o);});
}
/* กดหัวเดือนที่ยังไม่โหลด → หน้าต่าง % → โหลดรูปของเดือนนั้น → กางให้ */
async function elecOpenMonth(secId,mk){
  const ei=elecInfo(secId); if(!ei) return;
  if(elecProgressActive()) return;
  elecProgressOpen(`กำลังโหลด ${monthLabel(mk)}…`,"อ่านรายชื่อรูปของแต่ละกลุ่มในเดือนนี้จากคลัง");
  try{
    await loadElecMonth(secId,mk,(d,t)=>elecProgressSet(d,t,`${d}/${t} กลุ่ม`));
    elecMonthOpen.add(ei.bucket+"|"+mk);
    elecMarkSeen(secId);
    if(typeof renderNav==="function") renderNav();
  }catch(e){ console.warn("[elec] month",mk,e); toast("โหลดเดือนนี้ไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  elecProgressClose();
  if(currentSection===secId && !elecGroupId) renderElecList();
}

function renderElecDetail(o){
  const wrap=$("elecView");
  const ei=elecInfo(o.section);
  const label=beDateLabel(o.date), all=o.images||[];
  const q=elecSearch.trim().toLowerCase();
  const shown=q?all.filter(n=>n.toLowerCase().includes(q)):all;
  let html=`<div class="elec-detail-head">
    <button class="btn ghost" id="elecBack">${ico("arrow-left")} กลับคลัง</button>
    <div class="edh-title"><div class="edh-name num">${ei?ei.emoji+" ":""}${esc(label||"(ไม่มีวันที่)")}</div>
      <div class="edh-sub">${ei?ei.label:o.section} · ทั้งหมด ${all.length} รูป · ลากรูปมาวางที่หน้านี้เพื่อเพิ่มเข้ากลุ่ม</div></div>
    <div class="edh-actions">
      <button class="btn primary" id="elecAddBtn">${ico("plus")} เพิ่มรูป</button>
      <button class="btn ghost" id="elecZip">${ico("archive")} Export ZIP</button>
      <button class="btn danger" id="elecDel">${ico("trash")} ลบกลุ่ม</button>
    </div>
  </div>
  <div class="search elec-search"><span class="ic">${ico("search")}</span>
    <input id="elecSearchInp" placeholder="ค้นหาชื่อรูปในกลุ่มนี้…" value="${esc(elecSearch)}"></div>`;
  if(!shown.length){
    html+=`<div class="elec-empty"><div class="elec-empty-ic">${q?ico("search"):ico("images")}</div>
      <div class="elec-empty-h">${q?"ไม่พบรูปที่ตรงกับคำค้น":"กลุ่มนี้ยังไม่มีรูป"}</div>
      ${q?`<div class="elec-empty-s">ลองพิมพ์คำอื่น (พิมพ์บางส่วนของชื่อก็ได้)</div>`:`<div class="elec-empty-s">กด “เพิ่มรูป” หรือลากรูปมาวางที่นี่</div>`}</div>`;
  }else{
    if(q) html+=`<div class="elec-count">พบ ${shown.length} จาก ${all.length} รูป</div>`;
    html+=`<div class="igrid">`+shown.map(n=>{
      const url=bucketImgUrl(ei.bucket,o.id,n);
      return `<figure class="icell">
        <img loading="lazy" src="${url}" alt="${esc(n)}" data-full="${url}"
          onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'iph',textContent:''}))">
        <figcaption title="${esc(n)}">${esc(n)}</figcaption></figure>`;
    }).join("")+`</div>`;
  }
  html+=`<div class="elec-dropzone" id="elecDropzone"><div class="edz-box">${ico("upload")}<b>วางรูปที่นี่</b><span>เพิ่มเข้ากลุ่ม ${esc(label||"")}</span></div></div>`;
  wrap.innerHTML=html;
  $("elecBack").onclick=()=>{elecGroupId=null;elecSearch="";renderElecView();};
  $("elecDel").onclick=()=>deleteElecGroup(o);
  $("elecZip").onclick=()=>exportGroupZip(o);
  $("elecAddBtn").onclick=()=>$("elecAddFiles").click();
  const si=$("elecSearchInp");
  si.oninput=e=>{elecSearch=e.target.value; renderElecDetail(o); const n=$("elecSearchInp"); n.focus(); n.setSelectionRange(n.value.length,n.value.length);};
  wrap.querySelectorAll(".icell img").forEach((im,i)=>im.onclick=()=>openElecLightbox(shown,i,ei.bucket,o.id));
}

/* ============================================================
   Lightbox แกลเลอรี — เลื่อนซ้าย/ขวาดูรูปในกลุ่ม
   ============================================================ */
function openElecLightbox(list,idx,bucket,gid){
  if(!list||!list.length) return;
  elecLB={list:list.slice(),idx,bucket,gid};
  $("lb").classList.add("open","gallery");
  showElecLBAt(idx);
}
function showElecLBAt(i){
  if(!elecLB) return;
  const n=elecLB.list.length;
  i=Math.max(0,Math.min(i,n-1));
  elecLB.idx=i;
  $("lbImg").src=bucketImgUrl(elecLB.bucket,elecLB.gid,elecLB.list[i]);
  $("lbImg").alt=elecLB.list[i];
  $("lbCount").textContent=`${i+1} / ${n}`;
  $("lbPrev").disabled=(i<=0);
  $("lbNext").disabled=(i>=n-1);
}
function elecLBPrev(){ if(elecLB&&elecLB.idx>0) showElecLBAt(elecLB.idx-1); }
function elecLBNext(){ if(elecLB&&elecLB.idx<elecLB.list.length-1) showElecLBAt(elecLB.idx+1); }
function elecLBActive(){ return !!elecLB; }
function closeElecLB(){ elecLB=null; $("lb").classList.remove("gallery"); const c=$("lbCount"); if(c)c.textContent=""; }

/* ============================================================
   เตรียมไฟล์ (ใช้ร่วมกันทั้งโมดัลนำเข้า และลากรูปเข้ากลุ่ม)
   ============================================================ */
function isImageFile(f){
  if(f.type&&f.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?)$/i.test(f.name||"");
}
/* กรองเฉพาะรูป + ทำชื่อให้ปลอดภัย + กันชื่อซ้ำกันเองในชุด → [{file,name,status,reason,thumb}] */
function elecPrepareFiles(fileList,withThumb){
  const files=Array.from(fileList||[]).filter(isImageFile);
  const used=new Set();
  return files.map((file,i)=>{
    let name=sanitizeImgName(file.name,i);
    if(used.has(name.toLowerCase())){
      const dot=name.lastIndexOf("."); const base=dot>0?name.slice(0,dot):name; const ext=dot>0?name.slice(dot):"";
      name=`${base}_${i}${ext}`;
    }
    used.add(name.toLowerCase());
    return {file,name,status:"pending",reason:"",thumb:withThumb?URL.createObjectURL(file):null};
  });
}
/* ชื่อซ้ำกับรูปที่มีอยู่ในกลุ่ม → ถามยืนยัน (ยืนยัน = เขียนทับ · ยกเลิก = ข้ามไฟล์ที่ซ้ำ)
   คืนรายการที่จะอัปจริง (null = ไม่มีอะไรให้อัป) */
async function elecResolveDuplicates(items,existingNames,label){
  const ex=new Set((existingNames||[]).map(n=>n.toLowerCase()));
  const dups=items.filter(it=>ex.has(it.name.toLowerCase()));
  if(!dups.length) return items;
  const ok=await askConfirm({title:`มีชื่อไฟล์ซ้ำ ${dups.length} รูป`,
    message:`กลุ่ม ${label||""} มีรูปชื่อเดียวกันอยู่แล้ว เช่น ${dups.slice(0,3).map(d=>d.name).join(", ")}${dups.length>3?" …":""}\nเขียนทับไฟล์เดิม? (ยกเลิก = ข้ามไฟล์ที่ซ้ำ)`,
    icon:"alert",confirmText:"เขียนทับ",cancelText:"ข้ามที่ซ้ำ",danger:true});
  const out=ok?items:items.filter(it=>!ex.has(it.name.toLowerCase()));
  if(!out.length){ toast("ไม่มีรูปใหม่ให้เพิ่ม (ซ้ำทั้งหมด)"); return null; }
  return out;
}
/* ต่อชื่อรูปใหม่เข้าท้ายรายการเดิม (ชื่อซ้ำคงตำแหน่งเดิม) */
function elecMergeNames(existing,names){
  const out=(existing||[]).slice(); const set=new Set(out.map(n=>n.toLowerCase()));
  names.forEach(n=>{ if(!set.has(n.toLowerCase())){ out.push(n); set.add(n.toLowerCase()); } });
  return out;
}
/* หลังเพิ่ม/ลบรูปในกลุ่ม: อัปเดต cache + seen + เรคคอร์ด (ถ้ามี) */
async function elecCommitGroupImages(group,names,logAction,logDetail){
  const ei=elecInfo(group.section); if(!ei) return;
  group.images=names; group._loaded=true; group._empty=!names.length;
  const cache=elecGroupsCache[ei.bucket];
  if(cache&&!cache.some(g=>g.id===group.id)){ cache.push(group); cache.sort((a,b)=> a.date<b.date?1 : a.date>b.date?-1 : 0); }
  elecRecalc(ei.bucket); elecMarkSeen(group.section);
  const rec=DB.orders.find(o=>o.id===group.id&&o.section===group.section);
  if(rec){ rec.images=names.slice(); await Store.saveOrder(rec); }   /* grp_… : รักษาลำดับรูปในตาราง */
  Log.add(logAction,"คลัง "+ei.label+" · กลุ่ม "+(beDateLabel(group.date)||"—"),logDetail);
  if(typeof renderNav==="function") renderNav();
}

/* ============================================================
   เพิ่มรูปเข้ากลุ่มเดิม (ลากวาง / ปุ่มเพิ่มรูป)
   ============================================================ */
async function elecAddFilesToGroup(group,fileList){
  if(!group){ toast("ไม่พบกลุ่มปลายทาง"); return; }
  const ei=elecInfo(group.section); if(!ei) return;
  if(Store.mode!=="supabase"||!sb){ toast("เพิ่มรูปได้เฉพาะตอนออนไลน์ (เชื่อมต่อ Supabase)"); return; }
  if(!group._loaded){ toast("กดโหลดเดือนของกลุ่มนี้ก่อน แล้วค่อยลากรูปเข้า"); return; }
  if(elecProgressActive()||elecBusy()) return;
  let items=elecPrepareFiles(fileList,false);
  if(!items.length){ toast("ไม่พบไฟล์รูปในที่ลากมา"); return; }
  const label=beDateLabel(group.date)||group.id;
  items=await elecResolveDuplicates(items,group.images,label);
  if(!items) return;
  elecProgressOpen(`กำลังเพิ่มรูปเข้ากลุ่ม ${label}`,`คลัง ${ei.label}`);
  let done=0; const fails=[];
  for(const it of items){
    try{ await Store.uploadTo(ei.bucket, group.id+"/"+it.name, it.file); it.status="done"; }
    catch(e){ it.status="fail"; it.reason=(e&&e.message)||"อัปโหลดไม่สำเร็จ"; fails.push(it); }
    done++; elecProgressSet(done,items.length,`${done}/${items.length} รูป`);
  }
  const okNames=items.filter(it=>it.status==="done").map(it=>it.name);
  if(okNames.length) await elecCommitGroupImages(group,elecMergeNames(group.images,okNames),"edit_order","เพิ่ม "+okNames.length+" รูป");
  elecProgressClose();
  if(currentSection===group.section) renderElecView();
  if(fails.length) await askAlert({title:`อัปโหลดไม่สำเร็จ ${fails.length} รูป`,message:fails.slice(0,8).map(f=>`${f.name} — ${f.reason}`).join("\n")+(fails.length>8?"\n…":""),icon:"alert"});
  else toast(`เพิ่ม ${okNames.length} รูปเข้ากลุ่ม ${label} แล้ว`);
}
/* ผูกลากวาง: การ์ดกลุ่ม (หน้ารายการ) · ทั้งหน้า (หน้ารายละเอียด) · กล่องเลือกรูปในโมดัลนำเข้า */
function elecWireDragDrop(){
  const hasFiles=e=>!!(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes("Files"));
  /* กันเบราว์เซอร์เปิดไฟล์แทนหน้าเว็บ เมื่อวางนอกจุดรับ */
  document.addEventListener("dragover",e=>{ if(hasFiles(e)) e.preventDefault(); });
  document.addEventListener("drop",e=>{ if(hasFiles(e)) e.preventDefault(); });
  const view=$("elecView"); let depth=0;
  const clearCards=()=>view.querySelectorAll(".gcard.drop-on").forEach(c=>c.classList.remove("drop-on"));
  const zone=()=>$("elecDropzone");
  view.addEventListener("dragenter",e=>{ if(!hasFiles(e)) return; depth++; if(elecGroupId&&zone()) zone().classList.add("show"); });
  view.addEventListener("dragleave",e=>{ if(!hasFiles(e)) return; depth=Math.max(0,depth-1); if(!depth){ clearCards(); if(zone()) zone().classList.remove("show"); } });
  view.addEventListener("dragover",e=>{
    if(!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect="copy";
    if(elecGroupId) return;
    const card=e.target.closest(".gcard");
    clearCards(); if(card) card.classList.add("drop-on");
  });
  view.addEventListener("drop",e=>{
    if(!hasFiles(e)) return; e.preventDefault(); depth=0; clearCards(); if(zone()) zone().classList.remove("show");
    const files=e.dataTransfer.files;
    if(elecGroupId){ elecAddFilesToGroup(elecGroupById(elecGroupId),files); return; }
    const card=e.target.closest(".gcard"); if(!card) return;
    elecAddFilesToGroup(elecGroupById(card.dataset.gid),files);
  });
  /* กล่องเลือกรูปในโมดัลนำเข้า */
  const drop=$("elecDrop"); if(!drop) return;
  drop.addEventListener("dragover",e=>{ if(!hasFiles(e)) return; e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));
  drop.addEventListener("drop",e=>{ if(!hasFiles(e)) return; e.preventDefault(); drop.classList.remove("drag"); handleElecFiles(e.dataTransfer.files); });
}

/* ============================================================
   โมดัลนำเข้า (เลือกวันที่ + เลือกรูป/ลากวาง + อัปโหลด)
   ============================================================ */
function openElecModal(){
  const ei=elecInfo(currentSection);
  if(!ei){ toast("เปิดการนำเข้าได้เฉพาะในหัวข้อประกันอิเล็คทรอนิค"); return; }
  $("elecTitle").textContent=`นำเข้ารูปเข้าคลัง ${ei.label}`;
  elecClearFiles();
  elecUploadGroupId=null; elecUploadExisting=null; elecUploadNewNames=[];
  $("elecStep1").style.display="";
  $("elecStep2").style.display="none";
  $("elecFail").style.display="none";
  $("elecStep2Actions").style.display="none";
  $("elecPick").style.display="none";
  $("elecThumbs").innerHTML="";
  $("elecHint").textContent="";
  try{ $("elecDate").value=new Date().toISOString().slice(0,10); }catch(e){ $("elecDate").value=""; }
  elecUpdateTargetHint();
  elecUpdateStartBtn();
  showElecModal(true);
}
function showElecModal(on){
  $("elecModal").classList.toggle("show",on);
  $("elecOv").classList.toggle("show",on);
  if(!on) elecClearFiles();
}
function elecClearFiles(){
  elecFiles.forEach(f=>{ if(f.thumb) try{URL.revokeObjectURL(f.thumb);}catch(e){} });
  elecFiles=[];
}
function elecUpdateStartBtn(){
  const ok=elecFiles.length>0 && !!$("elecDate").value;
  $("elecStart").disabled=!ok;
}
/* กลุ่มเดิมของวันที่นี้ (โฟลเดอร์ชื่อวันที่ก่อน ไม่งั้น grp_ ที่วันที่ตรง) */
function elecTargetGroup(secId,iso){
  if(!iso) return null;
  const groups=elecGroups(secId);
  return groups.find(g=>g.id===iso)||groups.find(g=>g.date===iso)||null;
}
/* ข้อความใต้วันที่: จะรวมเข้ากลุ่มเดิม หรือสร้างกลุ่มใหม่ */
function elecUpdateTargetHint(){
  const el=$("elecTarget"); if(!el) return;
  const iso=$("elecDate").value, label=beDateLabel(iso);
  if(!iso){ el.innerHTML=""; el.className="elec-target"; return; }
  const t=elecTargetGroup(currentSection,iso);
  if(t){ el.className="elec-target merge"; el.innerHTML=`${ico("folder")} จะเพิ่มเข้ากลุ่มเดิม <b class="num">${esc(label)}</b>${t._loaded?` (มี <span class="num">${t.images.length}</span> รูป)`:" (ยังไม่ได้โหลดรายชื่อรูป)"}`; }
  else { el.className="elec-target new"; el.innerHTML=`${ico("plus-circle")} จะสร้างกลุ่มใหม่ <b class="num">${esc(label)}</b>`; }
  const p=$("elecPick").querySelector(".ep-sub b:last-of-type"); if(p) p.textContent=label||"—";
}
function handleElecFiles(fileList){
  const items=elecPrepareFiles(fileList,true);
  if(!items.length){ toast("ไม่พบไฟล์รูปในที่เลือก"); return; }
  elecClearFiles(); elecFiles=items;
  const rel=(items[0].file.webkitRelativePath||""); const folder=rel?rel.split("/")[0]:"";
  const pk=$("elecPick");
  pk.style.display="";
  pk.innerHTML=`<span class="ep-ic">${ico(folder?"folder":"images")}</span><div class="ep-body">
    <div class="ep-name">${folder?esc(folder):`เลือก ${elecFiles.length} รูป`}</div>
    <div class="ep-sub">พบรูป <b class="num">${elecFiles.length}</b> รูป · เข้ากลุ่ม <b class="num">${esc(beDateLabel($("elecDate").value)||"—")}</b></div>
  </div><button class="ep-clear" id="elecPickClear" type="button">${ico("x")}</button>`;
  $("elecPickClear").onclick=()=>{ elecClearFiles(); pk.style.display="none"; $("elecThumbs").innerHTML=""; elecUpdateStartBtn(); };
  renderElecThumbs();
  elecUpdateStartBtn();
}
function renderElecThumbs(){
  $("elecThumbs").innerHTML=elecFiles.map(f=>
    `<div class="et-cell"><img src="${f.thumb}" alt=""><span class="et-nm" title="${esc(f.name)}">${esc(f.name)}</span></div>`
  ).join("");
}

/* ===== อัปโหลด ===== */
async function elecStartUpload(){
  const date=$("elecDate").value, secId=currentSection;
  if(!date){ toast("กรุณาเลือกวันที่ก่อน"); return; }
  if(!elecFiles.length){ toast("ยังไม่ได้เลือกรูป"); return; }
  if(Store.mode!=="supabase"){ toast("อัปโหลดได้เฉพาะตอนออนไลน์ (เชื่อมต่อ Supabase)"); return; }
  if(elecProgressActive()) return;
  let target=elecTargetGroup(secId,date);
  if(target&&!target._loaded){                       /* ต้องรู้ชื่อรูปเดิมก่อน เพื่อตรวจซ้ำ */
    elecProgressOpen(`กำลังอ่านกลุ่มเดิม ${beDateLabel(date)}…`);
    try{ await loadElecMonth(secId,monthKey(date),(d,t)=>elecProgressSet(d,t,`${d}/${t} กลุ่ม`)); }
    catch(e){ elecProgressClose(); toast("อ่านกลุ่มเดิมไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
    elecProgressClose();
    target=elecTargetGroup(secId,date);
  }
  if(target){
    const keep=await elecResolveDuplicates(elecFiles,target.images,beDateLabel(date));
    if(!keep) return;
    elecFiles.filter(f=>!keep.includes(f)).forEach(f=>{ if(f.thumb) try{URL.revokeObjectURL(f.thumb);}catch(e){} });
    elecFiles=keep;
    const ex=new Set(target.images.map(n=>n.toLowerCase()));
    elecUploadNewNames=elecFiles.filter(f=>!ex.has(f.name.toLowerCase())).map(f=>f.name);
  }else elecUploadNewNames=elecFiles.map(f=>f.name);
  elecUploadExisting=target;
  elecUploadGroupId=target?target.id:date;           /* กลุ่มใหม่ = โฟลเดอร์ชื่อวันที่ */
  $("elecStep1").style.display="none";
  $("elecStep2").style.display="";
  await elecUploadPending();
}
async function elecUploadPending(){
  const ei=elecInfo(currentSection);
  $("elecStep2Actions").style.display="none";
  $("elecFail").style.display="none";
  const total=elecFiles.length;
  const setBar=()=>{
    const done=elecFiles.filter(f=>f.status==="done").length;
    const pct=total?Math.round(done/total*100):0;
    $("elecBarFill").style.width=pct+"%";
    $("elecBarPct").textContent=pct+"%";
    $("elecBarCnt").textContent=`${done}/${total}`;
  };
  $("elecUpHead").textContent="กำลังอัปโหลดขึ้นคลัง "+ei.label+"…";
  setBar();
  for(const f of elecFiles){
    if(f.status==="done") continue;
    try{
      await Store.uploadTo(ei.bucket, elecUploadGroupId+"/"+f.name, f.file);
      f.status="done"; f.reason="";
    }catch(e){
      f.status="fail"; f.reason=(e&&e.message)?e.message:"อัปโหลดไม่สำเร็จ";
    }
    setBar();
  }
  const fails=elecFiles.filter(f=>f.status==="fail");
  if(fails.length){
    $("elecUpHead").textContent="อัปโหลดยังไม่ครบ 100% — แก้ไขรูปที่พลาดแล้วลองใหม่";
    $("elecFailN").textContent=fails.length;
    $("elecFailList").innerHTML=fails.map(f=>
      `<div class="ef-item"><img src="${f.thumb}" alt=""><div class="ef-info">
        <div class="ef-nm">${esc(f.name)}</div><div class="ef-rs">${ico("x")} ${esc(f.reason)}</div></div></div>`
    ).join("");
    $("elecFail").style.display="";
    $("elecStep2Actions").style.display="";
  }else{
    await elecFinalize();
  }
}
async function elecRetryFailed(){
  elecFiles.forEach(f=>{ if(f.status==="fail") f.status="pending"; });
  await elecUploadPending();
}
/* ยกเลิก: ลบเฉพาะไฟล์ที่ "เพิ่มใหม่" และอัปไปแล้ว (ไฟล์ที่เขียนทับของเดิมกู้คืนไม่ได้) */
async function elecAbort(){
  const ei=elecInfo(currentSection);
  const newSet=new Set(elecUploadNewNames);
  const done=elecFiles.filter(f=>f.status==="done");
  const donePaths=done.filter(f=>newSet.has(f.name)).map(f=>elecUploadGroupId+"/"+f.name);
  const overwritten=done.filter(f=>!newSet.has(f.name)).length;
  if(donePaths.length) await Store.removeFromBucket(ei.bucket, donePaths);
  if(elecUploadExisting&&overwritten) await elecCommitGroupImages(elecUploadExisting,elecUploadExisting.images,"edit_order","ยกเลิกนำเข้า — เขียนทับไปแล้ว "+overwritten+" รูป");
  showElecModal(false);
  if(currentSection&&isElecSection(currentSection)) renderElecView();
  toast(overwritten?`ยกเลิกแล้ว (รูปที่เขียนทับไปแล้ว ${overwritten} รูป กู้คืนไม่ได้)`:"ยกเลิกการนำเข้าแล้ว");
}
async function elecFinalize(){
  const ei=elecInfo(currentSection);
  const names=elecFiles.map(f=>f.name), date=$("elecDate").value||"";
  $("elecBarFill").style.width="100%"; $("elecBarPct").textContent="100%";
  let group=elecUploadExisting;
  if(group){
    await elecCommitGroupImages(group,elecMergeNames(group.images,names),"create_order","นำเข้าเพิ่ม "+names.length+" รูป");
  }else{
    group={id:elecUploadGroupId, section:currentSection, date, images:[], _loaded:true, _empty:false,
      order_no:"", customer:"", category:"", status:"", note:"", price:"", wstart:"", wterm:"", locked:false, _fromBucket:true};
    await elecCommitGroupImages(group,names.slice(),"create_order","นำเข้า "+names.length+" รูป");
    elecMonthOpen.add(ei.bucket+"|"+monthKey(date));
  }
  showElecModal(false);
  renderView();
  toast(`นำเข้าสำเร็จ ${names.length} รูป เข้ากลุ่ม ${beDateLabel(date)||""}`);
}

/* ===== ลบกลุ่ม (รหัส 5044) ===== */
async function deleteElecGroup(o){
  const ei=elecInfo(o.section);
  const label=beDateLabel(o.date), cnt=(o.images&&o.images.length)||0;
  const ok=await askPassword({title:"ลบกลุ่มรูป",
    message:`ลบกลุ่ม "${label||"—"}" (${o._loaded?cnt+" รูป":"ยังไม่ได้นับรูป"}) ถาวร?\nใส่รหัสผ่านเพื่อยืนยัน`,
    icon:"trash",confirmText:"ลบกลุ่ม",danger:true,expect:DEL_GROUP_PASSWORD});
  if(!ok) return;
  let imgs=o.images;
  if(ei&&!o._loaded&&Store.mode==="supabase"&&sb){            /* ยังไม่รู้ชื่อไฟล์ → อ่านก่อนลบ */
    try{ imgs=(await elecList(ei.bucket,o.id)).filter(elecIsFile).map(e=>e.name); }catch(e){ imgs=[]; }
  }
  const paths=(imgs||[]).map(n=>o.id+"/"+n);
  if(ei) await Store.removeFromBucket(ei.bucket, paths);
  await Store.deleteOrder({id:o.id, images:[]});   /* ลบเฉพาะเรคคอร์ด (ถ้ามี) */
  Log.add("delete_order","คลัง "+(ei?ei.label:o.section)+" · กลุ่ม "+(label||"—"),"ลบ "+paths.length+" รูป");
  if(elecGroupId===o.id) elecGroupId=null;
  if(ei&&elecGroupsCache[ei.bucket]){ elecGroupsCache[ei.bucket]=elecGroupsCache[ei.bucket].filter(g=>g.id!==o.id); elecRecalc(ei.bucket); }
  if(typeof renderNav==="function") renderNav();
  renderView();
  toast("ลบกลุ่มแล้ว");
}

/* ===== Export ZIP ===== */
async function exportGroupZip(o){
  if(elecZipBusy) return;
  if(typeof JSZip==="undefined"){ toast("โหลดไลบรารี ZIP ไม่สำเร็จ ลองรีเฟรชหน้า"); return; }
  const imgs=o.images||[];
  if(!imgs.length){ toast("กลุ่มนี้ไม่มีรูปให้ส่งออก"); return; }
  const ei=elecInfo(o.section), btn=$("elecZip");
  elecZipBusy=true; if(btn){ btn.disabled=true; btn.textContent="กำลังสร้าง ZIP…"; }
  try{
    const zip=new JSZip(); let ok=0, fail=0;
    for(const name of imgs){
      try{
        const res=await fetch(bucketImgUrl(ei.bucket,o.id,name));
        if(!res.ok) throw new Error("HTTP "+res.status);
        zip.file(name, await res.blob()); ok++;
      }catch(e){ fail++; console.warn("zip fetch",name,e&&e.message||e); }
      if(btn) btn.textContent=`กำลังสร้าง ZIP… ${ok+fail}/${imgs.length}`;
    }
    if(!ok){ toast("ดึงรูปไม่สำเร็จ ส่งออกไม่ได้"); return; }
    const blob=await zip.generateAsync({type:"blob"});
    downloadBlob(blob,(beDateLabel(o.date)||"group")+`_${(ei?ei.label:o.section).replace(/\s+/g,"")}.zip`);
    toast(fail?`ส่งออก ${ok} รูป (พลาด ${fail})`:`ส่งออก ${ok} รูปเป็น ZIP แล้ว`);
  }finally{
    elecZipBusy=false; if(btn){ btn.disabled=false; btn.textContent="Export ZIP"; }
  }
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
