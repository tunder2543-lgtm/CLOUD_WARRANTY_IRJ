/* ============================================================
   orders.js — โมดัลสร้าง/แก้ไขออเดอร์ + แนบรูปสูงสุด MAX_ORDER_IMGS รูป
   ============================================================ */
let editId=null, mImgs=[], mRemoved=[], tmpStatus=null, mLocked=false, mImgShowAll=false;
const IMG_PREVIEW_LIMIT=6;   /* แสดงตัวอย่างกี่รูปก่อนกด "ดูทั้งหมด" (กันหน่วงตอนเปิดออเดอร์รูปเยอะ) */
let lockViewImgs=[], lockViewOrderId=null, lockShowAll=false;   /* หน้าดูอย่างเดียว (locked) */

/* ประเภทงานในโมดัล ขึ้นกับหัวข้อที่เลือก */
function fillModalCatSelect(secId,selected){
  const list=catsFor(secId);
  $("oCat").innerHTML=`<option value="">— เลือกประเภท —</option>`+list.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("oCat").value=(selected&&list.some(c=>c.id===selected))?selected:"";
}

function openOrder(o){
  if(o && o.locked){ openLockView(o); return; }   /* ล็อคอยู่ → เปิดหน้าดูอย่างเดียว */
  editId=o?o.id:null;
  mLocked=false;
  $("mTitle").textContent=o?"แก้ไขออเดอร์":"สร้างออเดอร์ใหม่";
  $("mDelete").style.display=o?"":"none";
  $("oOrder").value=o?o.order_no:"";
  $("oCust").value=o?o.customer:"";
  dpSet("oDate",o?o.date:"",true);
  $("oNote").value=o?o.note:"";
  $("oSection").innerHTML=`<option value="">— ไม่ระบุ —</option>`+sectionOptions();
  $("oSection").value=o?(o.section||""):(currentSection&&currentSection!=="__none"?currentSection:"");
  fillModalCatSelect($("oSection").value,o?o.category:"");
  /* ฟิลด์บัตรแข็ง */
  $("oProduct").value=o?(o.product||""):"";
  $("oCardNo").value=o?(o.cardno||""):"";
  $("oPrice").value=o?(o.price==null?"":o.price):"";
  $("oTerm").value=o?(o.wterm||""):"";
  dpSet("oWStart",o?(o.wstart||""):"",true);
  updateCardFields();
  $("oSection").onchange=()=>{fillModalCatSelect($("oSection").value,$("oCat").value);updateCardFields();};
  $("oPrice").oninput=updateBuyback; $("oTerm").oninput=updateBuyback;   /* วันที่จัดการผ่าน dpInit onChange */
  tmpStatus=o?o.status:"todo";
  const sc=$("oStatus");sc.innerHTML="";
  STATUSES.forEach(s=>{
    const b=document.createElement("button");b.type="button";b.className="chip-r"+(tmpStatus===s.id?" on":"");b.textContent=s.label;
    if(tmpStatus===s.id)b.style.background=s.c;
    b.onclick=()=>{tmpStatus=tmpStatus===s.id?"":s.id;sc.querySelectorAll(".chip-r").forEach(x=>{x.classList.remove("on");x.style.background="";});if(tmpStatus===s.id){b.classList.add("on");b.style.background=s.c;}};
    sc.appendChild(b);
  });
  mImgs=o?(o.images||[]).map(n=>({kind:"existing",name:n})):[];
  mRemoved=[]; mImgShowAll=false; $("mProg").textContent="";
  renderModalImgs();
  showModal(true);
}
/* แสดง/ซ่อน + อัปเดตกล่องบัตรแข็งตามหัวข้อ */
function updateCardFields(){
  const sec=$("oSection").value, plan=cardPlan(sec);
  $("cardFields").style.display=plan?"":"none";
  if(!plan)return;
  $("cardBoxHead").textContent=`${plan.emoji} ข้อมูลประกัน${plan.label} — รับซื้อคืน ${Math.round(plan.rate*100)}%`;
  $("cardBox").style.setProperty("--card-c",plan.color);
  $("cardBox").style.setProperty("--card-tint",plan.tint);
  if(!$("oTerm").value)$("oTerm").value=DEFAULT_TERM_YEARS;
  if(!dpGet("oWStart") && dpGet("oDate"))dpSet("oWStart",dpGet("oDate"),true);
  updateBuyback();
}
function updateBuyback(){
  const sec=$("oSection").value, plan=cardPlan(sec); if(!plan)return;
  const price=Number($("oPrice").value)||0;
  $("oBuyback").value = price? ("฿"+fmtMoney(price*plan.rate)) : "—";
  const cd=fmtCountdown({section:sec,price:$("oPrice").value,wstart:$("oWStart").value,wterm:$("oTerm").value});
  $("oCountdown").innerHTML = cd ? (cd.expired?"⛔ ครบกำหนดรับซื้อคืนแล้ว":("⏳ เหลือเวลา: <b>"+cd.text+"</b>")) : "⏳ กรอกวันเริ่มประกันเพื่อดูเวลาที่เหลือ";
}
function renderModalImgs(){
  const g=$("imgGrid");g.innerHTML="";
  const n=mImgs.length;
  /* รูปเยอะ → แสดงตัวอย่างแค่ IMG_PREVIEW_LIMIT รูปก่อน (กันโหลดรูปเต็มพร้อมกันจนค้าง) */
  const limited = !mImgShowAll && n>IMG_PREVIEW_LIMIT;
  const shown = limited ? IMG_PREVIEW_LIMIT : n;
  for(let i=0;i<shown;i++){
    const im=mImgs[i];
    const url=im.kind==="new"?im.url:imgUrl(editId,im.name);
    const c=document.createElement("div");c.className="cell"+(i===0?" cover":"");
    c.innerHTML=`<img src="${url}" alt="" loading="lazy" decoding="async">
      ${i===0?`<span class="cover-tag">ปก</span>`:`<button class="star" type="button" title="ตั้งเป็นรูปแรก">⭐</button>`}
      <button class="x" type="button" title="ลบ">✕</button>
      <div class="ord">
        <button class="mv" data-mv="-1" type="button" ${i===0?"disabled":""} title="เลื่อนซ้าย">◀</button>
        <button class="mv" data-mv="1" type="button" ${i===n-1?"disabled":""} title="เลื่อนขวา">▶</button>
      </div>`;
    c.querySelector("img").onclick=()=>{$("lbImg").src=url;$("lb").classList.add("open");};
    c.querySelector(".x").onclick=()=>removeModalImg(i);
    const st=c.querySelector(".star"); if(st) st.onclick=()=>setCoverImg(i);
    c.querySelectorAll(".mv").forEach(b=>b.onclick=()=>{ if(!b.disabled) moveImg(i,+b.dataset.mv); });
    g.appendChild(c);
  }
  if(limited){   /* ปุ่มดูรูปที่เหลือ */
    const more=document.createElement("div");
    more.className="add img-more";
    more.innerHTML=`<span class="im-ic">📷</span><span class="im-tx">ดูรูปทั้งหมด<br>(${n} รูป)</span>`;
    more.onclick=()=>{ mImgShowAll=true; renderModalImgs(); };
    g.appendChild(more);
  }
  if(n<MAX_ORDER_IMGS){
    const a=document.createElement("div");a.className="add";a.textContent="＋";
    a.onclick=()=>$("oFiles").click();
    g.appendChild(a);
  }
  $("imgCount").textContent = limited
    ? `แสดง ${shown} จาก ${n}/${MAX_ORDER_IMGS} รูป — กด “ดูรูปทั้งหมด” เพื่อดูที่เหลือ`
    : `${n}/${MAX_ORDER_IMGS} รูป`;
}
function addModalFiles(files){
  for(const f of files){
    if(mImgs.length>=MAX_ORDER_IMGS){toast("แนบได้สูงสุด "+MAX_ORDER_IMGS+" รูป");break;}
    mImgs.push({kind:"new",file:f,url:URL.createObjectURL(f)});
  }
  mImgShowAll=true;   /* เห็นรูปที่เพิ่งเพิ่มทันที */
  renderModalImgs();
}
function removeModalImg(i){
  const im=mImgs[i];
  if(im.kind==="existing")mRemoved.push(im.name);
  if(im.kind==="new")URL.revokeObjectURL(im.url);
  mImgs.splice(i,1);renderModalImgs();
}
/* ===== ย้ายลำดับรูป (⭐ตั้งเป็นรูปแรก / ◀▶ เลื่อนทีละช่อง) — บันทึกเมื่อกด "บันทึก" ===== */
function setCoverImg(i){ if(i<=0||i>=mImgs.length)return; const [im]=mImgs.splice(i,1); mImgs.unshift(im); renderModalImgs(); }
function moveImg(i,dir){ const j=i+dir; if(j<0||j>=mImgs.length)return; const t=mImgs[i]; mImgs[i]=mImgs[j]; mImgs[j]=t; renderModalImgs(); }
async function saveOrder(){
  const wasEdit=!!editId;
  const id=editId||genId();
  const sec=$("oSection").value||"";
  const o={id,order_no:$("oOrder").value.trim(),customer:$("oCust").value.trim(),date:$("oDate").value||"",
    category:$("oCat").value||"",section:sec,
    status:tmpStatus||"",note:$("oNote").value.trim(),
    price:isCardSection(sec)?$("oPrice").value:"", wstart:isCardSection(sec)?$("oWStart").value:"", wterm:isCardSection(sec)?$("oTerm").value:"",
    product:isCardSection(sec)?$("oProduct").value.trim():"", cardno:isCardSection(sec)?$("oCardNo").value.trim():"",
    locked:mLocked,
    images:[]};
  const btn=$("mSave");btn.disabled=true;
  if(Store.mode==="supabase"){
    const finalNames=[];let idx=0,done=0;const news=mImgs.filter(x=>x.kind==="new").length;
    for(const im of mImgs){
      if(im.kind==="existing"){finalNames.push(im.name);continue;}
      $("mProg").textContent=`กำลังอัปโหลดรูป ${++done}/${news}…`;
      const nm=safeName(im.file,idx++);
      try{ const f=await compressImageFile(im.file); await Store.uploadImage(id,nm,f); finalNames.push(nm); }
      catch(e){ console.warn("upload",e&&e.message||e); toast("อัปโหลดบางรูปไม่สำเร็จ: "+(e&&e.message||"")); }
    }
    for(const rn of mRemoved){ await Store.removeImage(id,rn); }
    o.images=finalNames;
  }else{
    o.images=mImgs.filter(x=>x.kind==="existing").map(x=>x.name);
    if(mImgs.some(x=>x.kind==="new"))toast("ออฟไลน์: อัปโหลดรูปไม่ได้ บันทึกเฉพาะข้อมูล");
  }
  await Store.saveOrder(o);
  /* บันทึกกิจกรรม (สร้าง vs แก้ไข แยกด้วย wasEdit) */
  const secNm=o.section?((sectionById(o.section)||{}).name||""):"";
  const dparts=[];
  if(o.customer) dparts.push("ลูกค้า: "+o.customer);
  if(o.category) dparts.push("ประเภท: "+catName(o.category));
  if(secNm) dparts.push("หัวข้อ: "+secNm);
  Log.add(wasEdit?"edit_order":"create_order","ออเดอร์ #"+(o.order_no||"(ไม่มีเลข)"),dparts.join(" · "));
  btn.disabled=false;$("mProg").textContent="";
  showModal(false);renderAll();
  toast(wasEdit?"บันทึกออเดอร์แล้ว":"สร้างออเดอร์แล้ว");
}
async function deleteOrder(){
  if(!editId)return;
  const o=DB.orders.find(x=>x.id===editId);if(!o)return;
  const ok=await askConfirm({title:"ลบออเดอร์นี้?",
    message:`ลบออเดอร์ ${o.order_no?"#"+o.order_no:""} และรูปทั้งหมดถาวร?`,
    icon:"🗑",confirmText:"ลบออเดอร์",danger:true});
  if(!ok)return;
  await Store.deleteOrder(o);
  const secNm=o.section?((sectionById(o.section)||{}).name||""):"";
  const dparts=[];
  if(o.customer) dparts.push("ลูกค้า: "+o.customer);
  if(secNm) dparts.push("หัวข้อ: "+secNm);
  Log.add("delete_order","ออเดอร์ #"+(o.order_no||"(ไม่มีเลข)"),dparts.join(" · "));
  showModal(false);renderAll();toast("ลบออเดอร์แล้ว");
}
function showModal(on){$("modal").classList.toggle("show",on);$("ov").classList.toggle("show",on);if(!on){editId=null;mImgs=[];mRemoved=[];mImgShowAll=false;}}

/* ============================================================
   ล็อค / ปลดล็อค / หน้าดูอย่างเดียว (read-only)
   ============================================================ */
async function lockCurrentOrder(){
  const ok=await askConfirm({title:"ล็อคออเดอร์นี้?",
    message:"หลังล็อคจะเปิดดูได้อย่างเดียว — ต้องใส่รหัสผ่านเพื่อกลับมาแก้ไข",
    icon:"🔒",confirmText:"🔒 ล็อค"});
  if(!ok)return;
  mLocked=true;
  await saveOrder();
  toast("🔒 ล็อคออเดอร์แล้ว");
}
/* render ส่วนรูปในหน้า locked — โชว์ 6 รูปก่อน + ปุ่ม "ดูรูปทั้งหมด" (กันหน่วงตอนรูปเยอะ) */
function renderLockImgs(){
  const wrap=$("lockImgWrap"); if(!wrap) return;
  const imgs=lockViewImgs, n=imgs.length, id=lockViewOrderId;
  if(!n){ wrap.innerHTML=`<div class="lv-noimg">— ไม่มีรูป —</div>`; return; }
  const limited=!lockShowAll && n>IMG_PREVIEW_LIMIT, shown=limited?IMG_PREVIEW_LIMIT:n;
  let html=`<div class="lv-imgs">`;
  for(let i=0;i<shown;i++){ const u=imgUrl(id,imgs[i]);
    html+=`<figure class="lv-cell"><img loading="lazy" decoding="async" src="${u}" data-full="${u}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'iph',textContent:'⚠️'}))"></figure>`;
  }
  html+=`</div>`;
  if(limited) html+=`<button class="btn ghost lv-more" id="lockMore" type="button">📷 ดูรูปทั้งหมด (${n} รูป)</button>`;
  wrap.innerHTML=html;
  wrap.querySelectorAll(".lv-cell img").forEach(im=>im.onclick=()=>{$("lbImg").src=im.dataset.full;$("lb").classList.add("open");});
  const mb=$("lockMore"); if(mb) mb.onclick=()=>{ lockShowAll=true; renderLockImgs(); };
}
function openLockView(o){
  const plan=cardPlan(o.section), cd=plan?fmtCountdown(o):null;
  const rows=[
    ["🧾 เลขออเดอร์", o.order_no?("#"+esc(o.order_no)):"—"],
    ["👤 ชื่อลูกค้า", esc(o.customer||"—")],
    ["📅 วันที่", o.date?esc(dpFormat(o.date)):"—"],
  ];
  if(plan){
    const price=Number(o.price)||0, end=warrantyEnd(o);
    rows.push(["💰 มูลค่าบัตร (เต็ม)", "฿"+fmtMoney(price)]);
    rows.push([`💵 ราคารับซื้อคืน ${Math.round(plan.rate*100)}%`, "฿"+fmtMoney(price*plan.rate)]);
    rows.push(["⏳ เหลือระยะเวลา", cd?(cd.expired?"⛔ ครบกำหนดแล้ว":cd.text):"—", end?end.toISOString():""]);
  }
  lockViewImgs=o.images||[]; lockViewOrderId=o.id; lockShowAll=false;
  $("lockTitle").textContent="🔒 "+(o.order_no?("#"+o.order_no):"ออเดอร์");
  $("lockBody").innerHTML=
    `<div class="lv-rows">`+rows.map(r=>
      `<div class="lv-row"><span class="lv-l">${r[0]}</span><span class="lv-v num" ${r[2]?`data-cd data-end="${r[2]}"`:""}>${r[1]}</span></div>`
    ).join("")+`</div>
     <div class="lv-imgs-h">🖼️ รูปภาพ (${lockViewImgs.length})</div>
     <div id="lockImgWrap"></div>`;
  renderLockImgs();
  $("lockUnlock").onclick=()=>unlockOrder(o);
  $("lockModal").classList.add("show"); $("lockOv").classList.add("show");
}
function closeLockView(){ $("lockModal").classList.remove("show"); $("lockOv").classList.remove("show"); }
async function unlockOrder(o){
  const ok=await askPassword({title:"ปลดล็อคออเดอร์",message:"ใส่รหัสผ่านเพื่อกลับมาแก้ไขออเดอร์นี้",
    icon:"🔓",confirmText:"🔓 ปลดล็อค",expect:UNLOCK_PASSWORD});
  if(!ok)return;
  o.locked=false;
  await Store.saveOrder(o);
  Log.add("edit_order","ออเดอร์ #"+(o.order_no||"(ไม่มีเลข)"),"ปลดล็อคออเดอร์");
  closeLockView(); renderAll();
  openOrder(DB.orders.find(x=>x.id===o.id)||o);
  toast("🔓 ปลดล็อคแล้ว");
}
