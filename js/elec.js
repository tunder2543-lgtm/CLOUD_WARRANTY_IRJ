/* ============================================================
   elec.js — ประกันอิเล็คทรอนิค (คลังกลุ่มรูป 3 bucket)
   • นำเข้ารูปทั้งโฟลเดอร์ → อัปโหลดขึ้น bucket ของหัวข้อ (ต้องผ่าน 100%)
   • เก็บเป็น "กลุ่ม" (1 กลุ่ม = 1 ครั้ง import) ชื่อ = วันที่แบบ พ.ศ. เช่น 19-07-69
   • เข้ากลุ่ม = ดูรูปทั้งหมด · ค้นหาชื่อ · Export ZIP · ลบกลุ่ม (รหัส 5044)
   หมายเหตุ: กลุ่มถูกเก็บเป็นเรคคอร์ดในตาราง Warranty_orders เดิม
             (section_id=bucket, order_date=วันที่, images=ชื่อไฟล์จริง)
   ============================================================ */

/* ===== state ===== */
let elecGroupId=null;        /* กลุ่มที่กำลังเปิดดู (null = หน้ารายการกลุ่ม) */
let elecSearch="";           /* คำค้นในหน้ารายละเอียดกลุ่ม */
let elecYear=null;           /* ปี (ค.ศ.) ที่เลือกดู (null = ยังไม่เลือก → default ปีปัจจุบัน) */
let elecFiles=[];            /* [{file,name,status:'pending'|'done'|'fail',reason,thumb}] */
let elecUploadGroupId=null;  /* id ที่ใช้ระหว่างการ import ครั้งนี้ */
let elecZipBusy=false;
let elecLB=null;             /* lightbox แกลเลอรี: {list,idx,bucket,gid} */
let elecGroupsCache={};      /* bucket -> group[] ที่อ่านมาจาก Storage (undefined = ยังไม่โหลด) */
let elecStatCache={};         /* bucket -> {groups,images} สำหรับ badge เมนูซ้าย + การ์ดหน้าแรก (คงอยู่ข้ามการนำทาง) */
let elecFolderCountCache={};  /* bucket -> {folder:count} ล่าสุดจาก bucket (ใช้คำนวณป้าย New) */
let elecLoading=false;       /* กำลัง list ไฟล์จาก bucket อยู่ */
const ELEC_SEEN_KEY=KEY+"_elec_seen";  /* localStorage: {bucket:{folder:count}} ที่ผู้ใช้ดูแล้ว */

/* รีเซ็ตการนำทาง (เรียกจาก gotoSection ตอนเปลี่ยนหัวข้อ)
   ล้าง cache ด้วย เพื่อให้ทุกครั้งที่เปิดหัวข้อ = อ่านรายการล่าสุดจาก bucket ใหม่ */
function resetElecNav(){ elecGroupId=null; elecSearch=""; elecYear=null; elecGroupsCache={}; }

/* กำลังอยู่ในขั้นตอนอัปโหลด (step2) — ห้ามปิดโมดัลด้วยการกดพื้นที่นอก/Esc/X
   ต้องรอเสร็จ หรือกดปุ่ม "ยกเลิก & ลบที่อัปแล้ว" เท่านั้น */
function elecBusy(){
  const m=$("elecModal"), s2=$("elecStep2");
  return !!(m&&m.classList.contains("show")&&s2&&s2.style.display!=="none");
}

/* ============================================================
   แหล่งข้อมูลกลุ่ม = โฟลเดอร์จริงใน Storage bucket (source of truth)
   ทำให้เว็บนี้เห็นทุกอย่างที่ระบบอื่นอัปขึ้น bucket โดยอัตโนมัติ
   • 1 โฟลเดอร์บนสุด = 1 กลุ่ม (ชื่อโฟลเดอร์ = group id ที่ใช้ประกอบ URL รูป)
   • วันที่: ถ้าชื่อโฟลเดอร์เป็นรูปแบบวันที่ (2026-07-30) ใช้เป็นวันที่เลย
             ถ้าเป็น grp_… (import จากเว็บนี้) ดึงวันที่จากเรคคอร์ดในตาราง
   • ออฟไลน์ (ไม่ได้ต่อ Supabase) → ถอยไปใช้เรคคอร์ดในตารางเหมือนเดิม
   ============================================================ */
function elecGroupsFromDB(secId){ return DB.orders.filter(o=>o.section===secId); }

/* กลุ่มทั้งหมดของหัวข้อ elec ปัจจุบัน (จาก cache ที่อ่าน bucket มา; ยังไม่โหลด → ใช้ตารางไปก่อน) */
function elecGroups(secId){
  const ei=elecInfo(secId);
  const c=ei?elecGroupsCache[ei.bucket]:undefined;
  return (c!==undefined)?c:elecGroupsFromDB(secId);
}
function elecGroupById(id){
  for(const b in elecGroupsCache){ const g=(elecGroupsCache[b]||[]).find(x=>x.id===id); if(g) return g; }
  return DB.orders.find(o=>o.id===id&&isElecSection(o.section))||null;
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
/* วันที่ของกลุ่มจากชื่อโฟลเดอร์ (หรือจากเรคคอร์ดถ้ามี) */
function elecDateFromFolder(folder,rec){
  if(/^\d{4}-\d{2}-\d{2}$/.test(folder)) return folder;   /* โฟลเดอร์ชื่อวันที่ */
  if(rec&&rec.date) return rec.date;                       /* grp_… → ใช้วันที่จากตาราง */
  return "";
}
/* จัดลำดับรูป: ถ้ามีเรคคอร์ด (เคยจัดเรียงเอง) ใช้ลำดับนั้นก่อน แล้วต่อด้วยไฟล์ใหม่ที่ยังไม่มีในเรคคอร์ด */
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
/* อ่านโฟลเดอร์ทั้งหมดใน bucket ของหัวข้อ → สร้างรายการกลุ่ม เก็บลง cache */
async function loadElecGroups(secId){
  const ei=elecInfo(secId); if(!ei) return;
  /* ออฟไลน์ / ไม่มี client → ใช้ตารางแทน (list bucket ไม่ได้) */
  if(Store.mode!=="supabase"||!sb){ elecGroupsCache[ei.bucket]=elecGroupsFromDB(secId); return; }
  const bucket=ei.bucket;
  const top=await elecList(bucket,"");
  const folders=top.filter(e=>e.id===null&&e.name!==".emptyFolderPlaceholder").map(e=>e.name);
  const dbById=new Map(DB.orders.filter(o=>o.section===secId).map(o=>[o.id,o]));
  const groups=[];
  for(const folder of folders){
    const entries=await elecList(bucket,folder);
    const files=entries.filter(e=>e.id!==null&&e.name!==".emptyFolderPlaceholder").map(e=>e.name);
    if(!files.length) continue;                            /* ข้ามโฟลเดอร์ว่าง/ผี */
    const rec=dbById.get(folder);
    groups.push({
      id:folder, section:secId, date:elecDateFromFolder(folder,rec),
      images:elecOrderImages(files,rec),
      order_no:"", customer:"", category:"", status:"", note:"",
      price:"", wstart:"", wterm:"", locked:!!(rec&&rec.locked),
      _fromBucket:true,
    });
  }
  groups.sort((a,b)=> a.date<b.date?1 : a.date>b.date?-1 : 0);   /* ใหม่→เก่า */
  elecGroupsCache[bucket]=groups;
  elecStatCache[bucket]={groups:groups.length, images:groups.reduce((n,g)=>n+g.images.length,0)};
  const fc={}; groups.forEach(g=>{ fc[g.id]=g.images.length; }); elecFolderCountCache[bucket]=fc;
}

/* ===== ป้าย "New +N" — ไฟล์ใหม่ที่ยังไม่ได้ดู (เก็บสถานะ seen ต่อเบราว์เซอร์) ===== */
function elecLoadSeen(){ try{ return JSON.parse(localStorage.getItem(ELEC_SEEN_KEY))||{}; }catch(e){ return {}; } }
function elecSaveSeen(o){ try{ localStorage.setItem(ELEC_SEEN_KEY,JSON.stringify(o)); }catch(e){} }
/* จำนวนไฟล์ใหม่ของหัวข้อ = ผลรวม max(0, ปัจจุบัน − ที่ดูแล้ว) ทุกโฟลเดอร์ (0 = ไม่มี/ยังไม่ได้ list) */
function elecNewCount(secId){
  const ei=elecInfo(secId); if(!ei) return 0;
  const cur=elecFolderCountCache[ei.bucket]; if(!cur) return 0;
  const seen=elecLoadSeen()[ei.bucket]||{};
  let n=0; for(const f in cur){ n+=Math.max(0,(cur[f]|0)-(seen[f]|0)); }
  return n;
}
/* ทำเครื่องหมายว่าดูหัวข้อนี้แล้ว (บันทึกจำนวนไฟล์ปัจจุบันเป็น seen) */
function elecMarkSeen(secId){
  const ei=elecInfo(secId); const cur=ei?elecFolderCountCache[ei.bucket]:null; if(!cur) return;
  const all=elecLoadSeen(); all[ei.bucket]={...cur}; elecSaveSeen(all);
}
/* ครั้งแรกสุด (ยังไม่มีคีย์ seen เลย) → ตั้งต้น = เห็นทุกอย่างแล้ว ไม่ให้ New ค้างตั้งแต่วันแรก */
function elecSeedSeenIfEmpty(){
  try{ if(localStorage.getItem(ELEC_SEEN_KEY)!==null) return; }catch(e){ return; }
  const all={};
  Object.values(ELEC_SECTIONS).forEach(ei=>{ if(elecFolderCountCache[ei.bucket]) all[ei.bucket]={...elecFolderCountCache[ei.bucket]}; });
  elecSaveSeen(all);
}

/* สถิติของหัวข้อ elec (null = ยังไม่รู้ → ใช้ค่าจากตารางไปก่อน) */
function elecStat(secId){ const ei=elecInfo(secId); return ei?(elecStatCache[ei.bucket]||null):null; }
/* จำนวนกลุ่มของหัวข้อ elec สำหรับ badge เมนูซ้าย */
function elecCount(secId){ const s=elecStat(secId); return s?s.groups:null; }

/* โหลดสถิติ (จำนวนกลุ่ม+รูป) ของทั้ง 3 คลังตอนเปิดแอป แล้วรีเฟรชหน้าจอ
   ต้อง list ไฟล์ในแต่ละโฟลเดอร์เพื่อรู้จำนวนรูป (Storage ไม่มีตัวนับสำเร็จรูป) — รันเบื้องหลัง ไม่บล็อค UI */
async function prefetchElecCounts(){
  if(Store.mode!=="supabase"||!sb) return;
  await Promise.all(Object.values(ELEC_SECTIONS).map(async ei=>{
    try{
      const top=await elecList(ei.bucket,"");
      const folders=top.filter(e=>e.id===null&&e.name!==".emptyFolderPlaceholder").map(e=>e.name);
      let groups=0, images=0; const fc={};
      for(const f of folders){
        const entries=await elecList(ei.bucket,f);
        const n=entries.filter(e=>e.id!==null&&e.name!==".emptyFolderPlaceholder").length;
        if(n>0){ groups++; images+=n; fc[f]=n; }     /* ข้ามโฟลเดอร์ว่าง/ผี */
      }
      elecStatCache[ei.bucket]={groups,images};
      elecFolderCountCache[ei.bucket]=fc;
    }catch(e){ /* list ไม่ได้ → คงค่าจากตารางไว้ */ }
  }));
  elecSeedSeenIfEmpty();                                                    /* ครั้งแรก: กัน New ค้าง */
  if(typeof renderNav==="function") renderNav();                            /* badge + ป้าย New เมนูซ้าย */
  if(currentSection===null && typeof renderHome==="function") renderHome(); /* การ์ดหน้าแรก */
}
/* โหลดแบบ async แล้ว render (แสดงสถานะกำลังโหลดระหว่างรอ) */
async function loadAndRenderElec(secId){
  const ei=elecInfo(secId); if(!ei) return;
  elecLoading=true; renderElecLoading(ei);
  let err="";
  try{ await loadElecGroups(secId); }
  catch(e){ err=(e&&e.message)||String(e); console.warn("[elec] load bucket:",err); }
  elecLoading=false;
  if(currentSection!==secId) return;                       /* ผู้ใช้เปลี่ยนหัวข้อไปแล้ว */
  if(err){ elecGroupsCache[ei.bucket]=elecGroupsFromDB(secId); toast("อ่านจากคลังไม่สำเร็จ ใช้ข้อมูลในตารางแทน"); }
  else elecMarkSeen(secId);                          /* เปิดดูหัวข้อนี้แล้ว → ล้างป้าย New */
  if(typeof renderNav==="function") renderNav();   /* อัปเดต badge + ป้าย New เมนูซ้าย */
  renderElecView();
}
/* รีเฟรช: ล้าง cache ของ bucket นี้แล้วอ่านใหม่ */
function refreshElec(){
  const ei=elecInfo(currentSection); if(!ei) return;
  delete elecGroupsCache[ei.bucket]; elecGroupId=null;
  renderElecView();
}

/* ============================================================
   หน้าคลัง (list) / หน้ารายละเอียดกลุ่ม (detail)
   ============================================================ */
function renderElecView(){
  const ei=elecInfo(currentSection); if(!ei) return;
  /* ยังไม่ได้อ่าน bucket นี้ → โหลดก่อน (แสดงสถานะกำลังโหลด) */
  if(elecGroupsCache[ei.bucket]===undefined){
    if(elecLoading) renderElecLoading(ei); else loadAndRenderElec(currentSection);
    return;
  }
  const g=elecGroupId?elecGroupById(elecGroupId):null;
  if(g) renderElecDetail(g); else renderElecList();
}

/* สถานะระหว่างอ่านรายการไฟล์จาก Storage */
function renderElecLoading(ei){
  const wrap=$("elecView"); if(!wrap) return;
  wrap.innerHTML=`<div class="elec-bar-top">
    <div class="elec-store">${ei?ei.emoji:""} คลัง <b>${esc(ei?ei.label:"")}</b>
      <span class="elec-store-sub">กำลังอ่านรายการรูปจากคลัง…</span></div>
  </div>
  <div class="elec-empty"><div class="elec-empty-ic">⏳</div>
    <div class="elec-empty-h">กำลังโหลดจากคลัง ${esc(ei?ei.label:"")}…</div>
    <div class="elec-empty-s">ดึงรายการไฟล์จาก Supabase Storage โดยตรง</div></div>`;
}

function renderElecList(){
  const wrap=$("elecView");
  const sec=currentSection, ei=elecInfo(sec);
  const groups=elecGroups(sec);
  const totalImg=groups.reduce((n,o)=>n+((o.images&&o.images.length)||0),0);
  let html=`<div class="elec-bar-top">
    <div class="elec-store">${ei?ei.emoji:""} คลัง <b>${esc(ei?ei.label:sec)}</b>
      <span class="elec-store-sub">${groups.length} กลุ่ม · ${totalImg} รูป · bucket <code>${esc(ei?ei.bucket:sec)}</code></span></div>
    <button class="btn ghost" id="elecRefresh" title="อ่านรายการรูปล่าสุดจากคลังใหม่">🔄 รีเฟรชจากคลัง</button>
  </div>`;
  if(!groups.length){
    html+=`<div class="elec-empty">
      <div class="elec-empty-ic">🗂️</div>
      <div class="elec-empty-h">ยังไม่มีกลุ่มรูปในคลังนี้</div>
      <div class="elec-empty-s">กดปุ่ม “＋ นำเข้ารูปใหม่” มุมบนขวา เพื่อเลือกวันที่และเลือกโฟลเดอร์รูปทั้งหมด</div></div>`;
  }else{
    /* ===== แถบเลือกปี (ค.ศ. ใหม่→เก่า) — กลุ่มที่ไม่มีวันที่ รวมเข้ากับ "ปีล่าสุด" ===== */
    const now=new Date(), curYear=String(now.getFullYear());
    const realYears=groups.map(o=>yearKey(o.date)).filter(y=>y!=="");
    const latestYear=realYears.length?realYears.slice().sort().slice(-1)[0]:curYear;
    const effYear=o=>{ const y=yearKey(o.date); return y!==""?y:latestYear; };   /* ไม่มีวันที่ → ปีล่าสุด */
    const years=[...new Set(groups.map(effYear))].sort((a,b)=> a<b?1:-1);
    /* เลือกปี: ค่าที่ผู้ใช้เลือก (ถ้ายังมีข้อมูล) → ปีปัจจุบัน → ปีล่าสุด */
    if(!years.includes(elecYear)) elecYear = years.includes(curYear)?curYear:years[0];
    html+=`<div class="eyear-bar">`+years.map(y=>{
      const cnt=groups.filter(o=>effYear(o)===y).length;
      const lbl=String(Number(y)+543);
      return `<button class="eyear-chip${y===elecYear?" on":""}" data-year="${esc(y)}">${esc(lbl)}<span class="eyc-n num">${cnt}</span></button>`;
    }).join("")+`</div>`;
    /* ===== เดือนของปีที่เลือก (ใหม่→เก่า, ไม่มีวันที่ไว้ล่างสุด) ===== */
    const inYear=groups.filter(o=>effYear(o)===elecYear);
    const byMonth=new Map();
    inYear.forEach(o=>{ const k=monthKey(o.date); if(!byMonth.has(k)) byMonth.set(k,[]); byMonth.get(k).push(o); });
    const keys=[...byMonth.keys()].sort((a,b)=>{ if(a==="")return 1; if(b==="")return -1; return a<b?1:-1; });
    /* เดือนที่กางไว้: เดือนปัจจุบัน (ถ้ามีในปีนี้) ไม่งั้นเดือนล่าสุดของปีนี้ */
    const curMonth=curYear+"-"+String(now.getMonth()+1).padStart(2,"0");
    const openMonth=keys.includes(curMonth)?curMonth:keys[0];
    html+=keys.map(k=>{
      const items=byMonth.get(k);
      const imgN=items.reduce((n,o)=>n+((o.images&&o.images.length)||0),0);
      const cards=items.map(o=>{
        const label=beDateLabel(o.date), cnt=(o.images&&o.images.length)||0;
        const cover=cnt?bucketImgUrl(ei.bucket,o.id,o.images[0]):null;
        return `<div class="gcard" data-gid="${o.id}">
          <div class="gcover">${cover
            ?`<img loading="lazy" src="${cover}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'gph',textContent:'🖼️'}))">`
            :`<div class="gph">🗂️</div>`}
            <span class="gcnt num">🖼️ ${cnt}</span></div>
          <div class="gbody">
            <div class="gname num">${esc(label||"(ไม่มีวันที่)")}</div>
            <div class="gmeta">จำนวนรูป ${cnt}</div>
          </div>
          <button class="gdel" data-del="${o.id}" title="ลบกลุ่ม (ใส่รหัส)">🗑</button>
        </div>`;
      }).join("");
      return `<section class="emonth${k===openMonth?"":" collapsed"}" data-mk="${esc(k)}">
        <button class="emonth-head" type="button">
          <span class="emonth-caret">▾</span>
          <span class="emonth-name">📅 ${esc(monthLabel(k))}</span>
          <span class="emonth-sub">${items.length} กลุ่ม · ${imgN} รูป</span>
        </button>
        <div class="egrid">${cards}</div>
      </section>`;
    }).join("");
  }
  wrap.innerHTML=html;
  { const rb=$("elecRefresh"); if(rb) rb.onclick=refreshElec; }
  wrap.querySelectorAll(".eyear-chip").forEach(c=>c.onclick=()=>{ elecYear=c.dataset.year; renderElecList(); window.scrollTo({top:0,behavior:"smooth"}); });
  wrap.querySelectorAll(".emonth-head").forEach(h=>h.onclick=()=>h.closest(".emonth").classList.toggle("collapsed"));
  wrap.querySelectorAll(".gcard").forEach(el=>el.onclick=e=>{
    if(e.target.closest(".gdel")) return;
    elecGroupId=el.dataset.gid; elecSearch=""; renderElecView(); window.scrollTo({top:0,behavior:"smooth"});
  });
  wrap.querySelectorAll(".gdel").forEach(b=>b.onclick=e=>{e.stopPropagation();const o=elecGroupById(b.dataset.del);if(o)deleteElecGroup(o);});
}

function renderElecDetail(o){
  const wrap=$("elecView");
  const ei=elecInfo(o.section);
  const label=beDateLabel(o.date), all=o.images||[];
  const q=elecSearch.trim().toLowerCase();
  const shown=q?all.filter(n=>n.toLowerCase().includes(q)):all;
  let html=`<div class="elec-detail-head">
    <button class="btn ghost" id="elecBack">↩ กลับคลัง</button>
    <div class="edh-title"><div class="edh-name num">${ei?ei.emoji+" ":""}${esc(label||"(ไม่มีวันที่)")}</div>
      <div class="edh-sub">${ei?ei.label:o.section} · ทั้งหมด ${all.length} รูป</div></div>
    <div class="edh-actions">
      <button class="btn ghost" id="elecZip">📦 Export ZIP</button>
      <button class="btn danger" id="elecDel">🗑 ลบกลุ่ม</button>
    </div>
  </div>
  <div class="search elec-search"><span class="ic">🔍</span>
    <input id="elecSearchInp" placeholder="ค้นหาชื่อรูปในกลุ่มนี้…" value="${esc(elecSearch)}"></div>`;
  if(!shown.length){
    html+=`<div class="elec-empty"><div class="elec-empty-ic">${q?"🔍":"🖼️"}</div>
      <div class="elec-empty-h">${q?"ไม่พบรูปที่ตรงกับคำค้น":"กลุ่มนี้ยังไม่มีรูป"}</div>
      ${q?`<div class="elec-empty-s">ลองพิมพ์คำอื่น (พิมพ์บางส่วนของชื่อก็ได้)</div>`:""}</div>`;
  }else{
    if(q) html+=`<div class="elec-count">พบ ${shown.length} จาก ${all.length} รูป</div>`;
    html+=`<div class="igrid">`+shown.map(n=>{
      const url=bucketImgUrl(ei.bucket,o.id,n);
      return `<figure class="icell">
        <img loading="lazy" src="${url}" alt="${esc(n)}" data-full="${url}"
          onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'iph',textContent:'⚠️'}))">
        <figcaption title="${esc(n)}">${esc(n)}</figcaption></figure>`;
    }).join("")+`</div>`;
  }
  wrap.innerHTML=html;
  $("elecBack").onclick=()=>{elecGroupId=null;elecSearch="";renderElecView();};
  $("elecDel").onclick=()=>deleteElecGroup(o);
  $("elecZip").onclick=()=>exportGroupZip(o);
  const si=$("elecSearchInp");
  si.oninput=e=>{elecSearch=e.target.value; renderElecDetail(o); const n=$("elecSearchInp"); n.focus(); n.setSelectionRange(n.value.length,n.value.length);};
  wrap.querySelectorAll(".icell img").forEach((im,i)=>im.onclick=()=>openElecLightbox(shown,i,ei.bucket,o.id));
}

/* ============================================================
   Lightbox แกลเลอรี — เลื่อนซ้าย/ขวาดูรูปในกลุ่ม
   (รูปแรกกดซ้ายไม่ได้ · รูปสุดท้ายกดขวาไม่ได้)
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
  $("lbPrev").disabled=(i<=0);       /* รูปแรก → ซ้ายไม่ได้ */
  $("lbNext").disabled=(i>=n-1);     /* รูปสุดท้าย → ขวาไม่ได้ */
}
function elecLBPrev(){ if(elecLB&&elecLB.idx>0) showElecLBAt(elecLB.idx-1); }
function elecLBNext(){ if(elecLB&&elecLB.idx<elecLB.list.length-1) showElecLBAt(elecLB.idx+1); }
function elecLBActive(){ return !!elecLB; }
function closeElecLB(){ elecLB=null; $("lb").classList.remove("gallery"); const c=$("lbCount"); if(c)c.textContent=""; }

/* ============================================================
   โมดัลนำเข้า (เลือกวันที่ + โฟลเดอร์ + อัปโหลด)
   ============================================================ */
function openElecModal(){
  const ei=elecInfo(currentSection);
  if(!ei){ toast("เปิดการนำเข้าได้เฉพาะในหัวข้อประกันอิเล็คทรอนิค"); return; }
  $("elecTitle").textContent=`${ei.emoji} นำเข้ารูปเข้าคลัง ${ei.label}`;
  elecClearFiles();
  elecUploadGroupId=null;
  $("elecStep1").style.display="";
  $("elecStep2").style.display="none";
  $("elecFail").style.display="none";
  $("elecStep2Actions").style.display="none";
  $("elecPick").style.display="none";
  $("elecThumbs").innerHTML="";
  $("elecHint").textContent="";
  try{ $("elecDate").value=new Date().toISOString().slice(0,10); }catch(e){ $("elecDate").value=""; }
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

/* ตรวจว่าเป็นไฟล์รูปไหม */
function isImageFile(f){
  if(f.type&&f.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?)$/i.test(f.name||"");
}
function handleElecFolder(fileList){
  const files=Array.from(fileList).filter(isImageFile);
  if(!files.length){ toast("ไม่พบไฟล์รูปในโฟลเดอร์ที่เลือก"); return; }
  elecClearFiles();
  const used=new Set();
  elecFiles=files.map((file,i)=>{
    let name=sanitizeImgName(file.name,i);
    if(used.has(name.toLowerCase())){        /* กันชื่อซ้ำในกลุ่มเดียวกัน */
      const dot=name.lastIndexOf("."); const base=dot>0?name.slice(0,dot):name; const ext=dot>0?name.slice(dot):"";
      name=`${base}_${i}${ext}`;
    }
    used.add(name.toLowerCase());
    return {file,name,status:"pending",reason:"",thumb:URL.createObjectURL(file)};
  });
  /* ชื่อโฟลเดอร์ต้นทาง (จาก webkitRelativePath) */
  const rel=files[0].webkitRelativePath||""; const folder=rel?rel.split("/")[0]:"(โฟลเดอร์)";
  const pk=$("elecPick");
  pk.style.display="";
  pk.innerHTML=`<span class="ep-ic">📁</span><div class="ep-body">
    <div class="ep-name">${esc(folder)}</div>
    <div class="ep-sub">พบรูป <b class="num">${elecFiles.length}</b> รูป · จะสร้างกลุ่มชื่อ <b class="num">${esc(beDateLabel($("elecDate").value)||"—")}</b></div>
  </div><button class="ep-clear" id="elecPickClear" type="button">✕</button>`;
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
  const date=$("elecDate").value;
  if(!date){ toast("กรุณาเลือกวันที่ก่อน"); return; }
  if(!elecFiles.length){ toast("ยังไม่ได้เลือกโฟลเดอร์รูป"); return; }
  if(Store.mode!=="supabase"){ toast("อัปโหลดได้เฉพาะตอนออนไลน์ (เชื่อมต่อ Supabase)"); return; }
  if(!elecUploadGroupId) elecUploadGroupId=groupGenId();
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
        <div class="ef-nm">${esc(f.name)}</div><div class="ef-rs">❌ ${esc(f.reason)}</div></div></div>`
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
async function elecAbort(){
  const ei=elecInfo(currentSection);
  const donePaths=elecFiles.filter(f=>f.status==="done").map(f=>elecUploadGroupId+"/"+f.name);
  if(donePaths.length) await Store.removeFromBucket(ei.bucket, donePaths);
  showElecModal(false);
  toast("ยกเลิกการนำเข้าแล้ว");
}
async function elecFinalize(){
  const ei=elecInfo(currentSection);
  const o={
    id:elecUploadGroupId, order_no:"", customer:"", date:$("elecDate").value||"",
    category:"", section:currentSection, status:"", note:"",
    price:"", wstart:"", wterm:"",
    images:elecFiles.map(f=>f.name),
  };
  $("elecBarFill").style.width="100%"; $("elecBarPct").textContent="100%";
  await Store.saveOrder(o);
  Log.add("create_order","คลัง "+ei.label+" · กลุ่ม "+(beDateLabel(o.date)||"—"),"นำเข้า "+o.images.length+" รูป");
  if(ei) delete elecGroupsCache[ei.bucket];   /* ให้ re-list จาก bucket เห็นกลุ่มใหม่ */
  showElecModal(false);
  renderView();
  toast(`นำเข้าสำเร็จ ${o.images.length} รูป เข้ากลุ่ม ${beDateLabel(o.date)||""}`);
}

/* ===== ลบกลุ่ม (รหัส 5044) ===== */
async function deleteElecGroup(o){
  const ei=elecInfo(o.section);
  const label=beDateLabel(o.date), cnt=(o.images&&o.images.length)||0;
  const ok=await askPassword({title:"ลบกลุ่มรูป",
    message:`ลบกลุ่ม "${label||"—"}" (${cnt} รูป) ถาวร?\nใส่รหัสผ่านเพื่อยืนยัน`,
    icon:"🗑",confirmText:"ลบกลุ่ม",danger:true,expect:DEL_GROUP_PASSWORD});
  if(!ok) return;
  const paths=(o.images||[]).map(n=>o.id+"/"+n);
  if(ei) await Store.removeFromBucket(ei.bucket, paths);
  await Store.deleteOrder({id:o.id, images:[]});   /* ลบเฉพาะเรคคอร์ด (รูปลบจาก bucket แล้ว) */
  Log.add("delete_order","คลัง "+(ei?ei.label:o.section)+" · กลุ่ม "+(label||"—"),"ลบ "+cnt+" รูป");
  if(elecGroupId===o.id) elecGroupId=null;
  if(ei) delete elecGroupsCache[ei.bucket];   /* ให้ re-list จาก bucket สะท้อนการลบ */
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
  elecZipBusy=true; if(btn){ btn.disabled=true; btn.textContent="📦 กำลังสร้าง ZIP…"; }
  try{
    const zip=new JSZip(); let ok=0, fail=0;
    for(const name of imgs){
      try{
        const res=await fetch(bucketImgUrl(ei.bucket,o.id,name));
        if(!res.ok) throw new Error("HTTP "+res.status);
        zip.file(name, await res.blob()); ok++;
      }catch(e){ fail++; console.warn("zip fetch",name,e&&e.message||e); }
      if(btn) btn.textContent=`📦 กำลังสร้าง ZIP… ${ok+fail}/${imgs.length}`;
    }
    if(!ok){ toast("ดึงรูปไม่สำเร็จ ส่งออกไม่ได้"); return; }
    const blob=await zip.generateAsync({type:"blob"});
    downloadBlob(blob,(beDateLabel(o.date)||"group")+`_${(ei?ei.label:o.section).replace(/\s+/g,"")}.zip`);
    toast(fail?`ส่งออก ${ok} รูป (พลาด ${fail})`:`ส่งออก ${ok} รูปเป็น ZIP แล้ว`);
  }finally{
    elecZipBusy=false; if(btn){ btn.disabled=false; btn.textContent="📦 Export ZIP"; }
  }
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
