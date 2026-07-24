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
let elecFiles=[];            /* [{file,name,status:'pending'|'done'|'fail',reason,thumb}] */
let elecUploadGroupId=null;  /* id ที่ใช้ระหว่างการ import ครั้งนี้ */
let elecZipBusy=false;
let elecLB=null;             /* lightbox แกลเลอรี: {list,idx,bucket,gid} */

/* รีเซ็ตการนำทาง (เรียกจาก gotoSection ตอนเปลี่ยนหัวข้อ) */
function resetElecNav(){ elecGroupId=null; elecSearch=""; }

/* กำลังอยู่ในขั้นตอนอัปโหลด (step2) — ห้ามปิดโมดัลด้วยการกดพื้นที่นอก/Esc/X
   ต้องรอเสร็จ หรือกดปุ่ม "ยกเลิก & ลบที่อัปแล้ว" เท่านั้น */
function elecBusy(){
  const m=$("elecModal"), s2=$("elecStep2");
  return !!(m&&m.classList.contains("show")&&s2&&s2.style.display!=="none");
}

/* กลุ่มทั้งหมดของหัวข้อ elec ปัจจุบัน (ใหม่→เก่า ตามลำดับใน DB.orders) */
function elecGroups(secId){ return DB.orders.filter(o=>o.section===secId); }
function elecGroupById(id){ return DB.orders.find(o=>o.id===id&&isElecSection(o.section)); }

/* ============================================================
   หน้าคลัง (list) / หน้ารายละเอียดกลุ่ม (detail)
   ============================================================ */
function renderElecView(){
  const g=elecGroupId?elecGroupById(elecGroupId):null;
  if(g) renderElecDetail(g); else renderElecList();
}

function renderElecList(){
  const wrap=$("elecView");
  const sec=currentSection, ei=elecInfo(sec);
  const groups=elecGroups(sec);
  const totalImg=groups.reduce((n,o)=>n+((o.images&&o.images.length)||0),0);
  let html=`<div class="elec-bar-top">
    <div class="elec-store">${ei?ei.emoji:""} คลัง <b>${esc(ei?ei.label:sec)}</b>
      <span class="elec-store-sub">${groups.length} กลุ่ม · ${totalImg} รูป · bucket <code>${esc(ei?ei.bucket:sec)}</code></span></div>
  </div>`;
  if(!groups.length){
    html+=`<div class="elec-empty">
      <div class="elec-empty-ic">🗂️</div>
      <div class="elec-empty-h">ยังไม่มีกลุ่มรูปในคลังนี้</div>
      <div class="elec-empty-s">กดปุ่ม “＋ นำเข้ารูปใหม่” มุมบนขวา เพื่อเลือกวันที่และเลือกโฟลเดอร์รูปทั้งหมด</div></div>`;
  }else{
    html+=`<div class="egrid">`+groups.map(o=>{
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
    }).join("")+`</div>`;
  }
  wrap.innerHTML=html;
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
  showElecModal(false);
  renderView();
  toast(`นำเข้าสำเร็จ ${o.images.length} รูป เข้ากลุ่ม ${beDateLabel(o.date)||""}`);
}

/* ===== ลบกลุ่ม (รหัส 5044) ===== */
async function deleteElecGroup(o){
  const ei=elecInfo(o.section);
  const label=beDateLabel(o.date), cnt=(o.images&&o.images.length)||0;
  const pass=prompt(`ยืนยันการลบกลุ่ม "${label}" (${cnt} รูป)\nพิมพ์รหัสผ่านเพื่อยืนยัน:`);
  if(pass===null) return;
  if(pass.trim()!==DEL_GROUP_PASSWORD){ toast("รหัสผ่านไม่ถูกต้อง"); return; }
  const paths=(o.images||[]).map(n=>o.id+"/"+n);
  if(ei) await Store.removeFromBucket(ei.bucket, paths);
  await Store.deleteOrder({id:o.id, images:[]});   /* ลบเฉพาะเรคคอร์ด (รูปลบจาก bucket แล้ว) */
  Log.add("delete_order","คลัง "+(ei?ei.label:o.section)+" · กลุ่ม "+(label||"—"),"ลบ "+cnt+" รูป");
  if(elecGroupId===o.id) elecGroupId=null;
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
