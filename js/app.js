/* ============================================================
   app.js — state, เมนูซ้าย, หน้าแรก(ภาพรวม), กราฟ, สถิติ,
   ตัวกรอง, แกลเลอรีออเดอร์
   ============================================================ */

/* ===== state ===== */
let DB, CATEGORIES=[];
let view="cat", fCat="all", fStat="all", fDate="all", search="";
let currentSection=null;   /* null = หน้าแรก(ภาพรวม), "__none" = ยังไม่ระบุหัวข้อ */
let cardView="all";        /* สรุปบัตรแข็งหน้าแรก: all | card-gold | card-silver */
const collapsedGroups=new Set();   /* จำกลุ่มเมนูที่ถูกพับไว้ (ไม่ให้เด้งกางเองตอน re-render) */

const catById=id=>CATEGORIES.find(c=>c.id===id);
const catName=id=>{const c=catById(id);return c?c.name:(id||"ไม่ระบุ");};
const catColor=id=>{const c=catById(id);return c?c.color:"#c9d2cc";};
/* หมวด(ประเภทงาน) เป็นของหัวข้อนั้น ๆ เท่านั้น */
const catsFor=secId=>CATEGORIES.filter(c=>(c.section||"")===(secId||""));
const orderCount=catId=>DB.orders.filter(o=>o.category===catId).length;
const allSections=()=>[...FIXED_GROUPS.flatMap(g=>g.sections),...DB.sections];
const sectionById=id=>allSections().find(s=>s.id===id);
const sectionCount=id=>DB.orders.filter(o=>o.section===id).length;
function scoped(){
  if(currentSection===null) return DB.orders;
  if(currentSection==="__none") return DB.orders.filter(o=>!o.section);
  return DB.orders.filter(o=>o.section===currentSection);
}
function groupOf(secId){ return FIXED_GROUPS.find(g=>g.sections.some(s=>s.id===secId)); }
function renderAll(){ renderView(); }

/* ===== sidebar nav ===== */
function sbItem(s,special){
  const n=sectionCount(s.id);
  return `<div class="sb-item ${currentSection===s.id?"on":""}" data-sec="${s.id}">
    <span class="sb-nm"><span>${esc(s.name)}</span>${s.desc?`<span class="sb-desc">${esc(s.desc)}</span>`:""}</span>
    ${special?`<button class="sb-del" data-id="${s.id}" title="ลบ">🗑</button>`:""}
    <span class="sb-badge num">${n}</span></div>`;
}
function renderNav(){
  const nav=$("nav");
  let html=`<div class="sb-item ${currentSection===null?"on":""}" data-sec="__home">🏠
    <span class="sb-nm"><span>หน้าแรก · ภาพรวม</span></span><span class="sb-badge num">${DB.orders.length}</span></div>`;
  FIXED_GROUPS.forEach(g=>{
    html+=`<div class="sb-group${collapsedGroups.has(g.id)?" closed":""}" data-g="${g.id}">
      <div class="sb-gtitle">${g.icon} ${esc(g.name)}<span class="car">▾</span></div>
      <div class="sb-subs">${g.sections.map(s=>sbItem(s)).join("")}</div></div>`;
  });
  html+=`<div class="sb-group${collapsedGroups.has("g3")?" closed":""}" data-g="g3">
    <div class="sb-gtitle">⭐ หมวดหมู่พิเศษ<span class="sb-note">(รายงานคุณสายฟ้า)</span><span class="car">▾</span></div>
    <div class="sb-subs">${DB.sections.map(s=>sbItem(s,true)).join("")}
      <button class="sb-add" id="sbAdd">＋ เพิ่มหมวดหมู่พิเศษ (${DB.sections.length}/${SPECIAL_MAX})</button></div></div>`;
  const un=DB.orders.filter(o=>!o.section).length;
  if(un)html+=`<div class="sb-item ${currentSection==="__none"?"on":""}" data-sec="__none">📥
    <span class="sb-nm"><span>ยังไม่ระบุหัวข้อ</span></span><span class="sb-badge num">${un}</span></div>`;
  nav.innerHTML=html;
  nav.querySelectorAll(".sb-item").forEach(el=>el.onclick=()=>{const v=el.dataset.sec;gotoSection(v==="__home"?null:v);});
  nav.querySelectorAll(".sb-del").forEach(b=>b.onclick=e=>{e.stopPropagation();delSpecial(b.dataset.id);});
  nav.querySelectorAll(".sb-gtitle").forEach(t=>t.onclick=()=>{
    const grp=t.parentElement, id=grp.dataset.g;
    grp.classList.toggle("closed");
    if(grp.classList.contains("closed")) collapsedGroups.add(id); else collapsedGroups.delete(id);
  });
  const add=$("sbAdd"); if(add)add.onclick=e=>{e.stopPropagation();addSpecial();};
}
function gotoSection(id){
  currentSection=id;
  fStat="all";fCat="all";fDate="all";search="";
  if(typeof resetElecNav==="function") resetElecNav();
  const si=$("search"); if(si)si.value="";
  $("sidebar").classList.remove("show"); $("sbOv").classList.remove("show");
  renderView();
  window.scrollTo({top:0,behavior:"smooth"});
}

/* ===== view switching ===== */
function renderView(){
  renderNav();
  const home=currentSection===null;
  const elec=!home&&isElecSection(currentSection);
  $("homeView").style.display=home?"":"none";
  $("sectionView").style.display=home?"none":"";
  $("normalView").style.display=(home||elec)?"none":"";
  $("elecView").style.display=elec?"":"none";
  $("btnNew").textContent=elec?"＋ นำเข้ารูปใหม่":"＋ สร้างออเดอร์";   /* ปุ่มบนหัวเว็บ: หัวข้อ Live = นำเข้ารูป */
  const s=home?null:sectionById(currentSection);
  const g=home?null:groupOf(currentSection);
  $("pageEb").textContent=home?"ระบบจัดการออเดอร์ · งานแกะสลักเลเซอร์":(currentSection==="__none"?"ออเดอร์ที่ยังไม่จัดหัวข้อ":(g?g.name:"หมวดหมู่พิเศษ (รายงานคุณสายฟ้า)"));
  $("pageTitle").textContent=home?"ภาพรวมทุกหัวข้อ":(currentSection==="__none"?"ยังไม่ระบุหัวข้อ":(s?s.name:currentSection));
  $("pageSub").textContent=home?"เลือกหัวข้อจากเมนูซ้าย หรือกดการ์ดด้านล่าง":(elec?"คลังรูป · กด “＋ นำเข้ารูปใหม่” เพื่อเลือกวันที่และนำเข้ารูปทั้งโฟลเดอร์เข้าคลังนี้":(s&&s.desc?s.desc:"คลังออเดอร์ของหัวข้อนี้ · สร้างออเดอร์ใหม่จะเข้าหัวข้อนี้อัตโนมัติ"));
  renderCatManager();   /* หมวดในตั้งค่า อิงหัวข้อปัจจุบัน */
  if(home) renderHome();
  else if(elec) renderElecView();
  else { buildCharts(); renderStats(); fillFilters(); renderGallery(); }
}

/* ===== สรุปประกันบัตรแข็ง (ทอง/เงิน) ===== */
const cardOrders=secId=>DB.orders.filter(o=>o.section===secId);
const sumPrice=list=>list.reduce((s,o)=>s+(Number(o.price)||0),0);
const sumBuyback=list=>list.reduce((s,o)=>s+buybackValue(o),0);
function cardSummaryHtml(){
  const gold=cardOrders("card-gold"), silver=cardOrders("card-silver");
  const sets={
    all:{emoji:"💳",label:"รวมทั้งหมด",list:[...gold,...silver],color:"var(--sage)"},
    "card-gold":{emoji:"🥇",label:"บัตรแข็งทอง",list:gold,color:CARD_PLANS["card-gold"].color},
    "card-silver":{emoji:"🥈",label:"บัตรแข็งเงิน",list:silver,color:CARD_PLANS["card-silver"].color},
  };
  const cur=sets[cardView]||sets.all;
  const toggle=Object.keys(sets).map(k=>`<button class="cv-btn${cardView===k?" on":""}" data-cv="${k}">${sets[k].emoji} ${k==="all"?"รวม":sets[k].label.replace("บัตรแข็ง","")}</button>`).join("");
  const bigs=`
    <div class="cs-stat"><div class="cs-l">จำนวนบัตร</div><div class="cs-v num">${cur.list.length}<span>ใบ</span></div></div>
    <div class="cs-stat"><div class="cs-l">มูลค่ารวม</div><div class="cs-v num">฿${fmtMoney(sumPrice(cur.list))}</div></div>
    <div class="cs-stat"><div class="cs-l">มูลค่ารับซื้อคืนรวม</div><div class="cs-v num" style="color:var(--sage)">฿${fmtMoney(sumBuyback(cur.list))}</div></div>`;
  const breakdown=`
    <div class="cs-break">
      <span>🥇 ทอง <b>${gold.length}</b> ใบ · ฿${fmtMoney(sumPrice(gold))} <span class="cs-bb">(รับคืน ฿${fmtMoney(sumBuyback(gold))})</span></span>
      <span>🥈 เงิน <b>${silver.length}</b> ใบ · ฿${fmtMoney(sumPrice(silver))} <span class="cs-bb">(รับคืน ฿${fmtMoney(sumBuyback(silver))})</span></span>
    </div>`;
  return `<section class="card-summary" style="--cs-c:${cur.color}">
    <div class="cs-head"><div class="cs-title">💳 ประกันบัตรแข็ง</div><div class="cv-toggle">${toggle}</div></div>
    <div class="cs-grid">${bigs}</div>
    ${(gold.length+silver.length)?breakdown:`<div class="cs-empty">ยังไม่มีบัตรแข็ง — เพิ่มออเดอร์ในหัวข้อ 🥇 บัตรแข็งทอง หรือ 🥈 บัตรแข็งเงิน จากเมนูซ้าย</div>`}
  </section>`;
}

/* ===== หน้าแรก (ภาพรวมทุกหัวข้อ) ===== */
function renderHome(){
  const hv=$("homeView");
  const T=DB.orders.length;
  const cnt=st=>DB.orders.filter(o=>o.status===st).length;
  const doneship=DB.orders.filter(o=>o.status==="done"||o.status==="ship").length;
  let html=`<section class="stats">${[
    ["📦 ออเดอร์ทั้งหมด",T,"#7cb5a0"],["⏳ รอทำ",cnt("todo"),"#b8beba"],
    ["🔨 กำลังทำ",cnt("doing"),"#e6b96f"],["✅ เสร็จ / ส่งแล้ว",doneship,"#8fb2ce"]
  ].map(c=>`<div class="stat" style="--sc:${c[2]}"><div class="l">${c[0]}</div><div class="v num" style="color:${c[2]}">${c[1]}</div><div class="sub">ทุกหัวข้อรวมกัน</div></div>`).join("")}</section>`;
  html+=cardSummaryHtml();
  const groups=[...FIXED_GROUPS,{id:"g3",icon:"⭐",name:"หมวดหมู่พิเศษ (รายงานคุณสายฟ้า)",sections:DB.sections}];
  groups.forEach(g=>{
    html+=`<div class="grphead"><span class="dot" style="--gc:var(--sage)"></span>
      <span class="t">${g.icon} ${esc(g.name)}</span><span class="c num">${g.sections.length}</span><span class="rule"></span></div>`;
    if(!g.sections.length){ html+=`<div style="color:var(--muted);font-size:13px;margin-bottom:22px">ยังไม่มีหมวดหมู่ — เพิ่มได้ที่เมนูซ้าย (สูงสุด ${SPECIAL_MAX})</div>`; return; }
    html+=`<div class="scards">`+g.sections.map(s=>{
      const list=DB.orders.filter(o=>o.section===s.id);
      if(isElecSection(s.id)){   /* คลังกลุ่มรูป: แสดงจำนวนกลุ่ม + จำนวนรูปรวม */
        const imgs=list.reduce((n,o)=>n+((o.images&&o.images.length)||0),0);
        const ei=elecInfo(s.id);
        return `<div class="scard" data-sec="${s.id}">
          <div class="sc-n">${ei?ei.emoji+" ":""}${esc(s.name)}</div>
          <div class="sc-v num">${list.length}<span>กลุ่ม</span></div>
          <div class="sc-st"><span>🖼️ ${imgs} รูป</span></div></div>`;
      }
      const t=list.filter(o=>o.status==="todo").length,w=list.filter(o=>o.status==="doing").length,
            d=list.filter(o=>o.status==="done"||o.status==="ship").length;
      return `<div class="scard" data-sec="${s.id}">
        <div class="sc-n">${esc(s.name)}</div>${s.desc?`<div class="sc-d">${esc(s.desc)}</div>`:""}
        <div class="sc-v num">${list.length}<span>ออเดอร์</span></div>
        <div class="sc-st"><span>⏳ ${t}</span><span>🔨 ${w}</span><span>✅ ${d}</span></div></div>`;
    }).join("")+`</div>`;
  });
  const un=DB.orders.filter(o=>!o.section);
  if(un.length){
    html+=`<div class="grphead"><span class="dot"></span><span class="t">📥 ยังไม่ระบุหัวข้อ</span><span class="rule"></span></div>
      <div class="scards"><div class="scard" data-sec="__none">
        <div class="sc-n">ออเดอร์ที่ยังไม่จัดหัวข้อ</div><div class="sc-d">กดเพื่อเปิดดูและย้ายเข้าหัวข้อ</div>
        <div class="sc-v num">${un.length}<span>ออเดอร์</span></div></div></div>`;
  }
  hv.innerHTML=html;
  hv.querySelectorAll(".scard").forEach(el=>el.onclick=()=>gotoSection(el.dataset.sec));
  hv.querySelectorAll(".cv-btn").forEach(b=>b.onclick=()=>{cardView=b.dataset.cv;renderHome();});
}

/* ===== หมวดหมู่พิเศษ (เมนูซ้าย กลุ่ม 3) ===== */
async function addSpecial(){
  if(DB.sections.length>=SPECIAL_MAX){alert(`หมวดหมู่พิเศษเต็มแล้ว (สูงสุด ${SPECIAL_MAX} หมวด)`);return;}
  const name=(prompt("ชื่อหมวดหมู่พิเศษ\nเช่น รูปเลเซอร์ใต้ฐาน หลวงปู่ทวดหยกดำ PK099")||"").trim();
  if(!name)return;
  if(DB.sections.some(s=>s.name===name)){alert("มีหมวดหมู่ชื่อนี้แล้ว");return;}
  const id="sp_"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  DB.sections.push({id,name,sort:DB.sections.length+1});
  await Store.saveSections(DB.sections);
  Log.add("add_special","หมวดหมู่พิเศษ: "+name,null);
  renderView(); toast("เพิ่มหมวดหมู่พิเศษแล้ว");
}
async function delSpecial(id){
  const s=DB.sections.find(x=>x.id===id); if(!s)return;
  const n=sectionCount(id);
  if(!confirm(`ลบ "${s.name}"?${n?`\nออเดอร์ ${n} รายการจะกลายเป็น "ยังไม่ระบุหัวข้อ"`:""}`))return;
  DB.sections=DB.sections.filter(x=>x.id!==id);
  await Store.deleteSection(id);
  Log.add("del_special","หมวดหมู่พิเศษ: "+s.name,n?("ออเดอร์ "+n+" รายการย้ายไปยังไม่ระบุหัวข้อ"):null);
  if(currentSection===id)currentSection=null;
  renderView(); toast("ลบหมวดหมู่แล้ว");
}
function sectionOptions(){
  let h="";
  FIXED_GROUPS.forEach(g=>{
    const secs=g.sections.filter(s=>!isElecSection(s.id));   /* หัวข้อ elec ใช้ระบบคลังรูป ไม่ให้ผูกกับออเดอร์ปกติ */
    if(!secs.length) return;
    h+=`<optgroup label="${esc(g.name)}">`+secs.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")+`</optgroup>`;
  });
  if(DB.sections.length)h+=`<optgroup label="หมวดหมู่พิเศษ">`+DB.sections.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")+`</optgroup>`;
  return h;
}

/* ===== กราฟ (เฉพาะหมวดของหัวข้อปัจจุบัน) ===== */
function buildCharts(){
  const list=scoped();
  const cats=catsFor(currentSection);
  const T=list.length||1;
  const oc=id=>list.filter(o=>o.category===id).length;
  $("donutN").textContent=list.length;
  const donut=$("donut"),R=78,C=95,CIRC=2*Math.PI*R,GAP=6; let off=0;
  donut.innerHTML=""; $("legend").innerHTML="";
  if(!cats.length){
    $("legend").innerHTML=`<div class="empty-rank">ยังไม่มีประเภทงานในหัวข้อนี้ — เพิ่มได้ที่ ⚙️ ตั้งค่า</div>`;
  }
  cats.forEach(d=>{
    const n=oc(d.id),p=n/T*100,len=CIRC*(p/100);
    const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx",C);c.setAttribute("cy",C);c.setAttribute("r",R);c.setAttribute("fill","none");
    c.setAttribute("stroke",d.color);c.setAttribute("stroke-width","15");c.setAttribute("stroke-linecap","round");
    c.style.transition="stroke-dasharray 1s cubic-bezier(.2,.9,.3,1)";
    c.setAttribute("stroke-dasharray",`0 ${CIRC}`);c.setAttribute("stroke-dashoffset",-off);donut.appendChild(c);off+=len;
    const L=Math.max(len-GAP,n?.1:0);
    requestAnimationFrame(()=>setTimeout(()=>c.setAttribute("stroke-dasharray",`${L} ${CIRC-L}`),60));
    const r=document.createElement("div");r.className="lg";r.style.setProperty("--kc",d.color);
    r.innerHTML=`<span class="sw"></span><span class="nm">${esc(d.name)}</span><span class="pc num">${f1(p)}%</span>`;
    $("legend").appendChild(r);
  });
  const rank=$("rank");rank.innerHTML="";
  if(!list.length){ rank.innerHTML=`<div class="empty-rank">ยังไม่มีออเดอร์ในหัวข้อนี้ — กด “＋ สร้างออเดอร์”</div>`; return; }
  if(!cats.length){ rank.innerHTML=`<div class="empty-rank">ยังไม่มีประเภทงาน — เพิ่มได้ที่ ⚙️ ตั้งค่า</div>`; return; }
  [...cats].sort((a,b)=>oc(b.id)-oc(a.id)).forEach(d=>{
    const n=oc(d.id),p=n/T*100;
    const el=document.createElement("div");el.className="rk";el.style.setProperty("--kc",d.color);
    el.innerHTML=`<div class="h"><span class="nm">${esc(d.name)}</span><span class="v"><b>${f1(p)}%</b> · ${n} ออเดอร์</span></div>
      <div class="track"><div class="fill" data-w="${p}"></div></div>`;
    rank.appendChild(el);
  });
  requestAnimationFrame(()=>setTimeout(()=>document.querySelectorAll(".rk .fill[data-w]").forEach(f=>f.style.width=f.dataset.w+"%"),60));
}

/* ===== การ์ดสถิติ (กดกรองสถานะ) ===== */
function renderStats(){
  const list=scoped();
  const T=list.length;
  const sc=s=>list.filter(o=>o.status===s).length;
  const todo=sc("todo"),doing=sc("doing"),doneship=list.filter(o=>o.status==="done"||o.status==="ship").length;
  const cards=[
    {k:"all",l:"📦 ออเดอร์ทั้งหมด",v:T,sub:`${catsFor(currentSection).length} ประเภท`,c:"#7cb5a0"},
    {k:"todo",l:"⏳ รอทำ",v:todo,sub:"คลิกเพื่อดู",c:"#b8beba"},
    {k:"doing",l:"🔨 กำลังทำ",v:doing,sub:"คลิกเพื่อดู",c:"#e6b96f"},
    {k:"doneship",l:"✅ เสร็จ / ส่งแล้ว",v:doneship,sub:"คลิกเพื่อดู",c:"#8fb2ce"},
  ];
  $("stats").innerHTML=cards.map(c=>`<div class="stat clk${fStat===c.k?" on":""}" data-stat="${c.k}" style="--sc:${c.c}">
    <div class="l">${c.l}</div><div class="v num">${c.v}</div><div class="sub">${c.sub}</div></div>`).join("");
}

/* ===== ตัวกรอง ===== */
function fillFilters(){
  const fc=$("fCat");fc.innerHTML=`<option value="all">ทุกประเภท</option>`+catsFor(currentSection).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");fc.value=fCat;
  if(fc.value!==fCat)fCat="all";
  const fd=$("fDate");const dates=[...new Set(scoped().map(o=>o.date).filter(Boolean))].sort().reverse();
  fd.innerHTML=`<option value="all">ทุกวันที่</option>`+dates.map(d=>`<option value="${d}">📅 ${d}</option>`).join("");
  fd.value=dates.includes(fDate)?fDate:"all"; if(fd.value!==fDate)fDate=fd.value;
}

/* ===== แกลเลอรีออเดอร์ ===== */
function visibleOrders(){
  const q=search.trim().toLowerCase();
  return scoped().filter(o=>{
    if(fCat!=="all"&&o.category!==fCat)return false;
    if(fStat!=="all"){ if(fStat==="doneship"){if(o.status!=="done"&&o.status!=="ship")return false;} else if(o.status!==fStat)return false; }
    if(fDate!=="all"&&(o.date||"")!==fDate)return false;
    if(q){ if(![o.order_no,o.customer,o.product,o.cardno].join(" ").toLowerCase().includes(q))return false; }
    return true;
  });
}
function renderGallery(){
  const g=$("gallery");g.innerHTML="";
  const items=visibleOrders();
  if(!items.length){ g.innerHTML=`<div style="text-align:center;color:var(--muted);padding:54px 20px">
    ${scoped().length?"ไม่พบออเดอร์ที่ตรงกับเงื่อนไข":"ยังไม่มีออเดอร์ในหัวข้อนี้ — กด “＋ สร้างออเดอร์” เพื่อเริ่มต้น"}</div>`; return; }
  const groups=new Map();
  items.forEach(o=>{
    let gk,gn,gc;
    if(view==="cat"){gk=o.category||"none";gn=o.category?catName(o.category):"ไม่ระบุประเภท";gc=o.category?catColor(o.category):"#c9d2cc";}
    else{const s=statusById(o.status);gk=o.status||"none";gn=s?s.label:"ยังไม่ระบุสถานะ";gc=s?s.c:"#c9d2cc";}
    if(!groups.has(gk))groups.set(gk,{name:gn,color:gc,items:[]});
    groups.get(gk).items.push(o);
  });
  groups.forEach(grp=>{
    const sec=document.createElement("div");sec.className="grp";
    sec.innerHTML=`<div class="grphead"><span class="dot" style="--gc:${grp.color}"></span>
      <span class="t">${esc(grp.name)}</span><span class="c num">${grp.items.length}</span><span class="rule"></span></div>
      <div class="ocards"></div>`;
    const wrap=sec.querySelector(".ocards");
    grp.items.forEach(o=>wrap.appendChild(orderCard(o)));
    g.appendChild(sec);
  });
}
/* บล็อกข้อมูลบัตรแข็งในการ์ดออเดอร์ (ราคา + รับซื้อคืน + นับถอยหลัง) */
function cardInfoHtml(o){
  const plan=cardPlan(o.section); if(!plan)return "";
  const price=Number(o.price)||0, bb=price*plan.rate;
  const end=warrantyEnd(o), cd=fmtCountdown(o);
  const cdHtml=cd?`<div class="cc-cd ${cd.expired?"exp":""}" data-cd data-end="${end?end.toISOString():""}">${cd.text}</div>`:"";
  const prodHtml=o.product?`<div class="cc-row"><span>🏷️ สินค้า</span><b>${esc(o.product)}</b></div>`:"";
  const cardnoHtml=o.cardno?`<div class="cc-row"><span>🔖 เลขบัตรประกัน</span><b>${esc(o.cardno)}</b></div>`:"";
  return `<div class="ocard-card" style="--card-c:${plan.color};--card-tint:${plan.tint}">
    ${prodHtml}
    ${cardnoHtml}
    <div class="cc-row"><span>${plan.emoji} มูลค่าบัตร</span><b>฿${fmtMoney(price)}</b></div>
    <div class="cc-row"><span>💵 รับซื้อคืน ${Math.round(plan.rate*100)}%</span><b class="cc-bb">฿${fmtMoney(bb)}</b></div>
    ${cdHtml}
  </div>`;
}
function orderCard(o){
  const st=statusById(o.status);
  const cover=o.images&&o.images.length?imgUrl(o.id,o.images[0]):null;
  const el=document.createElement("div");el.className="ocard";
  el.innerHTML=`
    <div class="cover">
      ${cover?`<img loading="lazy" src="${cover}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'🖼️'}))">`:`<div class="ph">📄</div>`}
      ${st?`<span class="stp" style="background:${st.c}">${st.label}</span>`:""}
      <span class="cnt">🖼️ ${o.images?o.images.length:0}</span>
    </div>
    <div class="ob">
      <div class="onum">${o.order_no?"#"+esc(o.order_no):"(ไม่มีเลข)"}</div>
      <div class="ocust">${esc(o.customer||"—")}</div>
      <div class="ometa">
        ${o.category?`<span class="catchip"><i style="background:${catColor(o.category)}"></i>${esc(catName(o.category))}</span>`:""}
        ${o.date?`<span class="odate">📅 ${o.date}</span>`:""}
      </div>
      ${cardInfoHtml(o)}
    </div>`;
  el.onclick=()=>openOrder(o);
  return el;
}
