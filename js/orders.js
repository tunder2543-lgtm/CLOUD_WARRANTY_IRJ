/* ============================================================
   orders.js — โมดัลสร้าง/แก้ไขออเดอร์ + แนบรูปสูงสุด MAX_ORDER_IMGS รูป
   ============================================================ */
let editId=null, mImgs=[], mRemoved=[], tmpStatus=null;

/* ประเภทงานในโมดัล ขึ้นกับหัวข้อที่เลือก */
function fillModalCatSelect(secId,selected){
  const list=catsFor(secId);
  $("oCat").innerHTML=`<option value="">— เลือกประเภท —</option>`+list.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("oCat").value=(selected&&list.some(c=>c.id===selected))?selected:"";
}

function openOrder(o){
  editId=o?o.id:null;
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
  mRemoved=[]; $("mProg").textContent="";
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
  mImgs.forEach((im,i)=>{
    const url=im.kind==="new"?im.url:imgUrl(editId,im.name);
    const c=document.createElement("div");c.className="cell";
    c.innerHTML=`<img src="${url}" alt=""><button class="x" type="button">✕</button>`;
    c.querySelector("img").onclick=()=>{$("lbImg").src=url;$("lb").classList.add("open");};
    c.querySelector(".x").onclick=()=>removeModalImg(i);
    g.appendChild(c);
  });
  if(mImgs.length<MAX_ORDER_IMGS){
    const a=document.createElement("div");a.className="add";a.textContent="＋";
    a.onclick=()=>$("oFiles").click();
    g.appendChild(a);
  }
  $("imgCount").textContent=`${mImgs.length}/${MAX_ORDER_IMGS} รูป`;
}
function addModalFiles(files){
  for(const f of files){
    if(mImgs.length>=MAX_ORDER_IMGS){toast("แนบได้สูงสุด "+MAX_ORDER_IMGS+" รูป");break;}
    mImgs.push({kind:"new",file:f,url:URL.createObjectURL(f)});
  }
  renderModalImgs();
}
function removeModalImg(i){
  const im=mImgs[i];
  if(im.kind==="existing")mRemoved.push(im.name);
  if(im.kind==="new")URL.revokeObjectURL(im.url);
  mImgs.splice(i,1);renderModalImgs();
}
async function saveOrder(){
  const wasEdit=!!editId;
  const id=editId||genId();
  const sec=$("oSection").value||"";
  const o={id,order_no:$("oOrder").value.trim(),customer:$("oCust").value.trim(),date:$("oDate").value||"",
    category:$("oCat").value||"",section:sec,
    status:tmpStatus||"",note:$("oNote").value.trim(),
    price:isCardSection(sec)?$("oPrice").value:"", wstart:isCardSection(sec)?$("oWStart").value:"", wterm:isCardSection(sec)?$("oTerm").value:"",
    product:isCardSection(sec)?$("oProduct").value.trim():"", cardno:isCardSection(sec)?$("oCardNo").value.trim():"",
    images:[]};
  const btn=$("mSave");btn.disabled=true;
  if(Store.mode==="supabase"){
    const finalNames=[];let idx=0,done=0;const news=mImgs.filter(x=>x.kind==="new").length;
    for(const im of mImgs){
      if(im.kind==="existing"){finalNames.push(im.name);continue;}
      $("mProg").textContent=`กำลังอัปโหลดรูป ${++done}/${news}…`;
      const nm=safeName(im.file,idx++);
      try{ await Store.uploadImage(id,nm,im.file); finalNames.push(nm); }
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
  if(!confirm(`ลบออเดอร์ ${o.order_no?"#"+o.order_no:""} และรูปทั้งหมด?`))return;
  await Store.deleteOrder(o);
  const secNm=o.section?((sectionById(o.section)||{}).name||""):"";
  const dparts=[];
  if(o.customer) dparts.push("ลูกค้า: "+o.customer);
  if(secNm) dparts.push("หัวข้อ: "+secNm);
  Log.add("delete_order","ออเดอร์ #"+(o.order_no||"(ไม่มีเลข)"),dparts.join(" · "));
  showModal(false);renderAll();toast("ลบออเดอร์แล้ว");
}
function showModal(on){$("modal").classList.toggle("show",on);$("ov").classList.toggle("show",on);if(!on){editId=null;mImgs=[];mRemoved=[];}}
