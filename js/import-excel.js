/* ============================================================
   import-excel.js — นำเข้าออเดอร์จาก Excel (.xlsx) / CSV
   คอลัมน์: A เลขออเดอร์ · B ชื่อลูกค้า · C วันที่ · D ประเภทงาน ·
            E หัวข้อ · F สถานะงาน · G หมายเหตุ
   (รูปภาพไม่นำเข้า — ใส่เองในเว็บภายหลัง)
   ============================================================ */
let importRows=[];   /* แถวที่แปลงแล้ว รอยืนยัน */

/* map สถานะ (ไทย/อังกฤษ) -> id */
const STATUS_ALIAS={
  "รอทำ":"todo","todo":"todo","รอ":"todo",
  "กำลังทำ":"doing","doing":"doing","ทำ":"doing",
  "เสร็จแล้ว":"done","เสร็จ":"done","done":"done",
  "ส่งแล้ว":"ship","ส่ง":"ship","ship":"ship","จัดส่ง":"ship",
};

/* ---------- ดาวน์โหลดเทมเพลต ---------- */
function importTemplate(){
  const headers=["เลขออเดอร์","ชื่อลูกค้า","วันที่","ประเภทงาน","หัวข้อ","สถานะงาน","หมายเหตุ"];
  const sample=[
    ["PK099-01","คุณสมชาย ใจดี","2026-07-24","หลวงปู่ทวดหยกดำ","รูปเลเซอร์ใต้ฐาน","รอทำ","ทองคำเปลว"],
    ["PK099-02","คุณมณี ทองงาม","2026-07-25","หลวงปู่ทวดหยกดำ","รูปเลเซอร์ใต้ฐาน","กำลังทำ",""],
  ];
  const csv=[headers,...sample].map(r=>r.map(c=>/[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c).join(",")).join("\n");
  const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"});   /* BOM ให้ Excel อ่านไทยถูก */
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="เทมเพลต-นำเข้าออเดอร์.csv";a.click();URL.revokeObjectURL(a.href);
  toast("ดาวน์โหลดเทมเพลตแล้ว");
}

/* ---------- อ่านไฟล์ ---------- */
async function handleImportFile(file){
  if(!window.XLSX){ toast("ไลบรารีอ่าน Excel ยังโหลดไม่เสร็จ — ลองอีกครั้ง"); return; }
  let wb;
  try{ const buf=await file.arrayBuffer(); wb=XLSX.read(new Uint8Array(buf),{type:"array",cellDates:true}); }
  catch(e){ toast("อ่านไฟล์ไม่ได้: "+(e&&e.message||"")); return; }
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws){ toast("ไม่พบชีตในไฟล์"); return; }
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:"yyyy-mm-dd",blankrows:false});
  parseImportRows(rows);
  if(!importRows.length){ toast("ไม่พบข้อมูลออเดอร์ในไฟล์"); return; }
  openImportPreview();
}

function looksLikeHeader(row){
  const j=(row||[]).join("").replace(/\s/g,"");
  return /เลขออเดอร์|ชื่อลูกค้า|ประเภทงาน|หัวข้อ|สถานะ|order|customer/i.test(j);
}
function normDate(v){
  if(!v) return "";
  if(v instanceof Date && !isNaN(v)){ const p=new Date(v.getTime()-v.getTimezoneOffset()*60000); return p.toISOString().slice(0,10); }
  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);   /* dd/mm/yyyy */
  if(m){ let d=+m[1],mo=+m[2],y=+m[3]; if(y<100)y+=2000; if(y>2400)y-=543; return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const d=new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
  return "";
}
function parseImportRows(rows){
  importRows=[];
  let start=(rows.length && looksLikeHeader(rows[0]))?1:0;
  for(let i=start;i<rows.length;i++){
    const r=rows[i]||[];
    const g=n=>(r[n]==null?"":String(r[n]).trim());
    const order_no=g(0),customer=g(1),date=normDate(r[2]),catName=g(3),secName=g(4),note=g(6);
    const sraw=g(5).toLowerCase();
    if(!order_no&&!customer&&!catName&&!secName&&!note) continue;   /* ข้ามแถวว่าง */
    const status=STATUS_ALIAS[g(5)]||STATUS_ALIAS[sraw]||"todo";
    importRows.push({order_no,customer,date,catName,secName,status,note});
  }
}

/* ---------- พรีวิว ---------- */
function openImportPreview(){
  const secByName=new Set(allSections().map(s=>s.name));
  const secById=new Set(allSections().map(s=>s.id));
  const newSecs=new Set(), newCats=new Set();
  importRows.forEach(r=>{
    if(r.secName && !secByName.has(r.secName) && !secById.has(r.secName)) newSecs.add(r.secName);
  });
  importRows.forEach(r=>{
    if(!r.catName) return;
    const sec=allSections().find(s=>s.name===r.secName||s.id===r.secName);
    const exists=sec && CATEGORIES.some(c=>c.section===sec.id && c.name===r.catName);
    if(!exists) newCats.add((r.secName||"?")+" › "+r.catName);
  });
  $("impSummary").innerHTML=`พบ <b>${importRows.length}</b> ออเดอร์`
    +(newSecs.size?` · สร้างหัวข้อใหม่ <b>${newSecs.size}</b>`:"")
    +(newCats.size?` · ประเภทใหม่ <b>${newCats.size}</b>`:"");
  const body=importRows.slice(0,40).map(r=>`<tr>
    <td>${esc(r.order_no)||"—"}</td><td>${esc(r.customer)||"—"}</td><td>${esc(r.date)||"—"}</td>
    <td>${esc(r.catName)||"—"}</td><td>${esc(r.secName)||"—"}</td>
    <td>${esc((statusById(r.status)||{}).label||r.status)}</td><td>${esc(r.note)||"—"}</td></tr>`).join("");
  $("impPreview").innerHTML=`<table class="imp-tbl"><thead><tr>
    <th>เลขออเดอร์</th><th>ลูกค้า</th><th>วันที่</th><th>ประเภท</th><th>หัวข้อ</th><th>สถานะ</th><th>หมายเหตุ</th>
    </tr></thead><tbody>${body}</tbody></table>`
    +(importRows.length>40?`<div class="imp-more">…และอีก ${importRows.length-40} รายการ</div>`:"");
  $("impStep1").style.display="none"; $("impStep2").style.display="";
}

/* ---------- resolve หัวข้อ/ประเภท (สร้างใหม่ถ้ายังไม่มี) ---------- */
function resolveSectionId(name,createdSecs){
  if(!name) return "";
  const hit=allSections().find(s=>s.name===name||s.id===name);
  if(hit) return hit.id;
  if(createdSecs[name]) return createdSecs[name];
  if(DB.sections.length>=SPECIAL_MAX) return "";   /* เต็มโควตา → ปล่อยว่าง */
  const id="sp_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36);
  DB.sections.push({id,name,sort:DB.sections.length+1});
  createdSecs[name]=id;
  return id;
}
function resolveCatId(name,secId,createdCats){
  if(!name||!secId) return "";
  const hit=CATEGORIES.find(c=>(c.section||"")===secId && c.name===name);
  if(hit) return hit.id;
  const key=secId+"|"+name;
  if(createdCats[key]) return createdCats[key];
  const id=catGenId();
  CATEGORIES.push({id,name,color:ZONE_COLORS[CATEGORIES.length%ZONE_COLORS.length],sort:catsFor(secId).length+1,section:secId});
  createdCats[key]=id;
  return id;
}

/* ---------- ยืนยันนำเข้า ---------- */
async function confirmImport(){
  if(!importRows.length){ toast("ไม่มีข้อมูลนำเข้า"); return; }
  const btn=$("impConfirm"); btn.disabled=true; btn.textContent="⏳ กำลังนำเข้า…";
  const createdSecs={}, createdCats={};
  const orders=importRows.map(r=>{
    const secId=resolveSectionId(r.secName,createdSecs);
    const catId=resolveCatId(r.catName,secId,createdCats);
    return {id:genId(),order_no:r.order_no,customer:r.customer,date:r.date,
      category:catId,section:secId,status:r.status,note:r.note,
      price:"",wstart:"",wterm:"",images:[]};
  });
  const nSec=Object.keys(createdSecs).length, nCat=Object.keys(createdCats).length;
  if(nSec) await Store.saveSections(DB.sections);
  if(nCat) await Store.saveCategories(CATEGORIES);
  await Store.saveOrdersBulk(orders);
  Log.add("import_json","นำเข้าจาก Excel/CSV",
    `สร้าง ${orders.length} ออเดอร์`+(nSec?` · หัวข้อใหม่ ${nSec}`:"")+(nCat?` · ประเภทใหม่ ${nCat}`:""));
  btn.disabled=false; btn.textContent="✅ ยืนยันนำเข้า";
  closeImportModal(); renderAll();
  toast(`นำเข้า ${orders.length} ออเดอร์แล้ว 🎉`);
}

/* ---------- เปิด/ปิด modal ---------- */
function openImportModal(){
  importRows=[];
  $("impStep1").style.display=""; $("impStep2").style.display="none";
  $("impModal").classList.add("show"); $("impOv").classList.add("show");
}
function closeImportModal(){ $("impModal").classList.remove("show"); $("impOv").classList.remove("show"); }
