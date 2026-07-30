/* ============================================================
   main.js — boot + ผูกอีเวนต์ทั้งหมด (โหลดเป็นไฟล์สุดท้าย)
   ============================================================ */

/* ===== boot ===== */
(async()=>{
  DB=await Store.load();
  CATEGORIES=DB.categories||[];
  $("storeStatus").textContent=Store.status||"";
  buildCatSwatches();
  wire();
  renderView();
  if(typeof prefetchElecCounts==="function") prefetchElecCounts();   /* badge เมนูซ้าย = จำนวนกลุ่มใน bucket */
  setInterval(tickCountdowns,1000);   /* นับถอยหลังบัตรแข็งแบบสด ๆ */
})();

/* อัปเดตตัวนับถอยหลังทุกวินาที (การ์ดออเดอร์ + พรีวิวในโมดัล) */
function tickCountdowns(){
  document.querySelectorAll("[data-cd][data-end]").forEach(el=>{
    if(!el.dataset.end)return;
    const c=countdown(new Date(el.dataset.end));
    if(c.expired){ el.textContent="⛔ ครบกำหนดแล้ว"; el.classList.add("exp"); }
    else{ el.textContent=`${c.y} ปี ${c.mo} เดือน ${c.d} วัน · ${pad2(c.h)}:${pad2(c.mi)}:${pad2(c.s)}`; el.classList.remove("exp"); }
  });
  const cf=$("cardFields");
  if(cf && cf.style.display!=="none" && $("modal") && $("modal").classList.contains("show")) updateBuyback();
}

/* ===== wiring ===== */
function wire(){
  $("btnNew").onclick=()=>{ if(isElecSection(currentSection)) openElecModal(); else openOrder(null); };
  $("btnMenu").onclick=()=>{$("sidebar").classList.add("show");$("sbOv").classList.add("show");};
  $("sbClose").onclick=()=>{$("sidebar").classList.remove("show");$("sbOv").classList.remove("show");};
  $("sbOv").onclick=()=>{$("sidebar").classList.remove("show");$("sbOv").classList.remove("show");};
  $("search").oninput=e=>{search=e.target.value;renderGallery();};
  $("fCat").onchange=e=>{fCat=e.target.value;renderGallery();};
  $("fDate").onchange=e=>{fDate=e.target.value;renderGallery();};
  $("stats").onclick=e=>{const c=e.target.closest(".stat.clk");if(!c)return;fStat=c.dataset.stat;
    document.querySelectorAll("#stats .stat").forEach(s=>s.classList.toggle("on",s.dataset.stat===fStat));
    renderGallery();$("gallery").scrollIntoView({behavior:"smooth",block:"start"});};
  document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{view=b.dataset.v;document.querySelectorAll(".seg button").forEach(x=>x.classList.remove("on"));b.classList.add("on");renderGallery();});
  /* โมดัลออเดอร์ */
  $("mSave").onclick=saveOrder; $("mDelete").onclick=deleteOrder;
  $("mCancel").onclick=()=>showModal(false); $("mClose").onclick=()=>showModal(false); $("ov").onclick=()=>{};   /* กดพื้นหลังไม่ปิด — ต้องกด ✕ หรือ ยกเลิก */
  $("mLock").onclick=lockCurrentOrder;
  /* โมดัลดูออเดอร์แบบล็อค (read-only) */
  $("lockClose").onclick=closeLockView; $("lockCloseBtn").onclick=closeLockView; $("lockOv").onclick=()=>{};
  $("oFiles").onchange=e=>{if(e.target.files.length){addModalFiles(e.target.files);e.target.value="";}};
  /* ตัวเลือกวันที่ (custom): เลือก "วันที่" → ตั้ง "วันเริ่มประกัน" ตามอัตโนมัติ (เฉพาะหัวข้อบัตรแข็ง) */
  dpInit("oDate",{onChange:iso=>{ if(iso && cardPlan($("oSection").value)) dpSet("oWStart",iso,true); updateBuyback(); }});
  dpInit("oWStart",{onChange:()=>updateBuyback()});
  /* ลิ้นชักตั้งค่า */
  const dr=$("drawer");
  $("btnSettings").onclick=()=>dr.classList.add("show");
  $("dClose").onclick=()=>dr.classList.remove("show");
  $("addCat").onclick=addCat; $("newCat").addEventListener("keydown",e=>{if(e.key==="Enter")addCat();});
  $("btnExport").onclick=exportJSON; $("btnImport").onclick=()=>$("importFile").click();
  $("importFile").onchange=e=>{if(e.target.files[0])importJSON(e.target.files[0]);};
  $("btnCompressImgs").onclick=migrateCompressImages;
  /* โมดัลนำเข้ารูปเข้าคลัง (ประกันอิเล็คทรอนิค) */
  $("elecClose").onclick=()=>{ if(elecBusy()){ toast("กำลังอัปโหลด… รอให้เสร็จ หรือกด “ยกเลิก & ลบที่อัปแล้ว”"); return; } showElecModal(false); };
  $("elecOv").onclick=()=>{};   /* กดพื้นหลังไม่ปิด — ต้องกด ✕ (ระหว่างอัปโหลด ✕ ก็ถูกล็อกไว้) */
  $("elecCancel1").onclick=()=>showElecModal(false);
  $("elecDrop").onclick=()=>$("elecFolder").click();
  $("elecFolder").onchange=e=>{ if(e.target.files&&e.target.files.length){ handleElecFolder(e.target.files); e.target.value=""; } };
  $("elecDate").onchange=()=>{ elecUpdateStartBtn(); if($("elecPick").style.display!=="none"&&elecFiles.length){ const p=$("elecPick").querySelector(".ep-sub b:last-of-type"); if(p)p.textContent=beDateLabel($("elecDate").value)||"—"; } };
  $("elecStart").onclick=elecStartUpload;
  $("elecRetry").onclick=elecRetryFailed;
  $("elecAbort").onclick=elecAbort;
  /* นำเข้า Excel/CSV */
  $("btnImportExcel").onclick=openImportModal;
  $("impClose").onclick=closeImportModal; $("impOv").onclick=()=>{};   /* กดพื้นหลังไม่ปิด — ต้องกด ✕ */
  $("impPick").onclick=()=>$("impFile").click();
  $("impFile").onchange=e=>{if(e.target.files[0]){handleImportFile(e.target.files[0]);e.target.value="";}};
  $("impTemplate").onclick=importTemplate;
  $("impBack").onclick=()=>{$("impStep1").style.display="";$("impStep2").style.display="none";};
  $("impConfirm").onclick=confirmImport;
  $("btnReset").onclick=async()=>{if(confirm("ล้างออเดอร์ทั้งหมด?")){await Store.reset();DB=Store._cache;CATEGORIES=DB.categories||[];renderAll();Log.add("reset","ข้อมูลทั้งหมด","ล้างออเดอร์ทั้งหมดออกจากระบบ");toast("ล้างข้อมูลแล้ว");}};
  /* ลิ้นชักบันทึกกิจกรรม (Activity Log) */
  const lg=$("logDrawer");
  $("btnLog").onclick=()=>{renderLogs();lg.classList.add("show");};
  $("logClose").onclick=()=>lg.classList.remove("show");
  $("logClear").onclick=async()=>{
    const n=(Store._cache&&Store._cache.logs)?Store._cache.logs.length:0;
    if(!n){toast("ยังไม่มีบันทึก");return;}
    if(!confirm(`ล้างประวัติการทำงานทั้งหมด (${n} รายการ)?`))return;
    await Store.clearLogs(); renderLogs(); toast("ล้างประวัติแล้ว");
  };
  /* lightbox + Escape */
  const lbCloseFn=()=>{ $("lb").classList.remove("open"); if(typeof closeElecLB==="function")closeElecLB(); };
  $("lb").onclick=()=>{};                       /* กดพื้นหลังไม่ปิด — ต้องกด ✕ */
  $("lbClose").onclick=e=>{ e.stopPropagation(); lbCloseFn(); };
  $("lbImg").onclick=e=>e.stopPropagation();     /* กดรูปไม่ปิด */
  $("lbPrev").onclick=e=>{ e.stopPropagation(); if(typeof elecLBPrev==="function")elecLBPrev(); };
  $("lbNext").onclick=e=>{ e.stopPropagation(); if(typeof elecLBNext==="function")elecLBNext(); };
  document.addEventListener("keydown",e=>{
    if(!$("lb").classList.contains("open")||typeof elecLBActive!=="function"||!elecLBActive())return;
    if(e.key==="ArrowLeft"){e.preventDefault();elecLBPrev();}
    else if(e.key==="ArrowRight"){e.preventDefault();elecLBNext();}
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){showModal(false);closeLockView();closeImportModal();if(typeof showElecModal==="function"&&!(typeof elecBusy==="function"&&elecBusy()))showElecModal(false);dr.classList.remove("show");lg.classList.remove("show");$("lb").classList.remove("open");if(typeof closeElecLB==="function")closeElecLB();$("sidebar").classList.remove("show");$("sbOv").classList.remove("show");}});
}

/* ===== แสดงรายการบันทึกกิจกรรม (ใหม่→เก่า, เวลาอ่านง่ายภาษาไทย) ===== */
const LOG_MONTHS=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function pad2(n){return String(n).padStart(2,"0");}
function fmtLogTime(iso){
  const d=new Date(iso); if(isNaN(d)) return "";
  const diff=(Date.now()-d.getTime())/1000;
  if(diff<60)    return "เมื่อสักครู่";
  if(diff<3600)  return Math.floor(diff/60)+" นาทีที่แล้ว";
  if(diff<86400) return Math.floor(diff/3600)+" ชม.ที่แล้ว";
  return d.getDate()+" "+LOG_MONTHS[d.getMonth()]+" "+(d.getFullYear()+543)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function fmtLogFull(iso){
  const d=new Date(iso); if(isNaN(d)) return "";
  return d.getDate()+" "+LOG_MONTHS[d.getMonth()]+" "+(d.getFullYear()+543)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes())+":"+pad2(d.getSeconds());
}
function renderLogs(){
  const list=$("logList"); if(!list) return;
  const logs=(Store._cache&&Store._cache.logs)||[];
  const cnt=$("logCount");
  if(cnt) cnt.textContent=logs.length?("ทั้งหมด "+logs.length+" รายการ · เรียงใหม่→เก่า"):"ยังไม่มีรายการ";
  if(!logs.length){
    list.className="log-empty";
    list.innerHTML=`<div class="log-empty-ic">📜</div>
      <div class="log-empty-h">ยังไม่มีบันทึกกิจกรรม</div>
      <div class="log-empty-s">เมื่อคุณสร้าง แก้ไข หรือลบออเดอร์ รายการจะปรากฏที่นี่</div>`;
    return;
  }
  list.className="zlist";
  list.innerHTML=logs.map(e=>{
    const m=LOG_LABELS[e.action]||{t:e.action||"กิจกรรม",ic:"•",tone:"edit"};
    return `<div class="zitem log" title="${esc(fmtLogFull(e.ts))}">
      <span class="log-ic tone-${m.tone}">${m.ic}</span>
      <div class="log-body">
        <div class="log-h"><b>${esc(m.t)}</b>${e.entity?` · <span>${esc(e.entity)}</span>`:""}</div>
        ${e.detail?`<div class="log-d">${esc(e.detail)}</div>`:""}
        <div class="log-t num">${esc(fmtLogTime(e.ts))}</div>
      </div></div>`;
  }).join("");
}
