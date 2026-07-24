/* ============================================================
   settings.js — ลิ้นชักตั้งค่า: ประเภทงาน (ผูกหัวข้อ),
   นำเข้า/ส่งออก/ล้างข้อมูล
   ============================================================ */
let pickCatColor=ZONE_COLORS[0];

function buildCatSwatches(){ mkSwatches("catSwatches",c=>pickCatColor=c); }
function mkSwatches(id,cb){ const sw=$(id);sw.innerHTML="";ZONE_COLORS.forEach((c,i)=>{const b=document.createElement("button");b.type="button";b.style.background=c;if(i===0)b.classList.add("on");b.onclick=()=>{cb(c);sw.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");};sw.appendChild(b);}); }

/* ---------- ประเภทงาน (ผูกกับหัวข้อปัจจุบันเท่านั้น) ---------- */
function renderCatManager(){
  const cl=$("catList");cl.innerHTML="";
  const secId=(currentSection&&currentSection!=="__none")?currentSection:null;
  if(!secId){
    cl.innerHTML=`<div style="color:var(--muted);font-size:13px;line-height:1.6">เปิดหัวข้อจากเมนูซ้ายก่อน — ประเภทงานที่เพิ่มจะเป็นของหัวข้อนั้นเท่านั้น</div>`;
    $("newCat").disabled=true; $("addCat").disabled=true; $("addCat").style.opacity=.5;
    return;
  }
  if(isElecSection(secId)){   /* หัวข้อคลังรูป: ไม่มีระบบประเภทงาน */
    const ei=elecInfo(secId);
    cl.innerHTML=`<div style="color:var(--muted);font-size:13px;line-height:1.6">หัวข้อ <b style="color:var(--ink)">${esc(ei?ei.label:secId)}</b> ใช้ระบบ <b>คลังกลุ่มรูป</b> (นำเข้าทั้งโฟลเดอร์) — ไม่มีประเภทงาน</div>`;
    $("newCat").disabled=true; $("addCat").disabled=true; $("addCat").style.opacity=.5;
    return;
  }
  $("newCat").disabled=false; $("addCat").disabled=false; $("addCat").style.opacity=1;
  const s=sectionById(secId);
  const head=document.createElement("div");
  head.style.cssText="font-size:12px;color:var(--muted)";
  head.innerHTML=`ประเภทงานของหัวข้อ: <b style="color:var(--ink)">${esc(s?s.name:secId)}</b>`;
  cl.appendChild(head);
  const list=catsFor(secId);
  if(!list.length){
    const d=document.createElement("div");d.style.cssText="color:var(--muted);font-size:13px";
    d.textContent="ยังไม่มีประเภทงานในหัวข้อนี้ — เพิ่มด้านล่าง";cl.appendChild(d);
  }
  list.forEach(c=>{
    const el=document.createElement("div");el.className="zitem";
    el.innerHTML=`<span class="zc" style="background:${c.color}"></span><span class="zn">${esc(c.name)}</span><span class="zct num">${orderCount(c.id)} ออเดอร์</span><button class="del">🗑</button>`;
    el.querySelector(".del").onclick=async()=>{
      if(orderCount(c.id)>0){alert(`ประเภท "${c.name}" ยังมีออเดอร์ ${orderCount(c.id)} รายการ — ย้ายออกก่อน`);return;}
      if(!confirm(`ลบประเภท "${c.name}"?`))return;
      CATEGORIES=CATEGORIES.filter(x=>x.id!==c.id);
      await Store.saveCategories(CATEGORIES);await Store.deleteCategory(c.id);
      Log.add("del_category","ประเภทงาน: "+c.name,s?("จากหัวข้อ "+s.name):null);
      renderAll();toast("ลบประเภทงานแล้ว");
    };
    cl.appendChild(el);
  });
}
async function addCat(){
  const secId=(currentSection&&currentSection!=="__none")?currentSection:null;
  if(!secId){alert("เปิดหัวข้อจากเมนูซ้ายก่อน แล้วค่อยเพิ่มประเภทงานของหัวข้อนั้น");return;}
  const inp=$("newCat"),name=inp.value.trim();if(!name){inp.focus();return;}
  if(catsFor(secId).some(c=>c.name===name)){alert("หัวข้อนี้มีประเภทชื่อนี้แล้ว");return;}
  CATEGORIES.push({id:catGenId(),name,color:pickCatColor,sort:catsFor(secId).length+1,section:secId});
  await Store.saveCategories(CATEGORIES);
  const s=sectionById(secId);
  Log.add("add_category","ประเภทงาน: "+name,s?("ในหัวข้อ "+s.name):null);
  inp.value="";renderAll();toast("เพิ่มประเภทงานแล้ว");
}

/* ---------- นำเข้า / ส่งออก ---------- */
function exportJSON(){const b=new Blob([Store.export()],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="warranty-orders.json";a.click();URL.revokeObjectURL(a.href);toast("ส่งออกแล้ว");}
function importJSON(file){const r=new FileReader();r.onload=async()=>{try{const o=JSON.parse(r.result);if(!o.orders)throw 0;Store.replaceAll(o);DB=Store._cache;DB.categories=DB.categories||[];DB.sections=DB.sections||[];DB.logs=DB.logs||[];CATEGORIES=DB.categories;await Store.pushAll();renderAll();Log.add("import_json","นำเข้าข้อมูล","นำเข้า "+(DB.orders||[]).length+" ออเดอร์ · "+(CATEGORIES||[]).length+" ประเภท");toast("นำเข้าแล้ว");}catch(e){toast("ไฟล์ไม่ถูกต้อง");}};r.readAsText(file);}
