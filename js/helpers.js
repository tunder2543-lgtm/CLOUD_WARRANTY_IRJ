/* ============================================================
   helpers.js — ฟังก์ชันช่วยทั่วไป + ตัวแปลงข้อมูล
   ============================================================ */
const $=id=>document.getElementById(id);
const esc=s=>(s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const f1=n=>(Math.round(n*10)/10).toString();
function genId(){ return "ord_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }
function catGenId(){ return "c_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }
function safeName(file,i){ const m=(file.name||"").match(/\.([A-Za-z0-9]+)$/); const ext=(m?m[1]:"png").toLowerCase();
  return `img${i}_${Date.now().toString(36)}${Math.floor(Math.random()*1e5).toString(36)}.${ext}`; }
function imgUrl(orderId,name){ return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${orderId}/${encodeURIComponent(name)}`; }

/* ===== ประกันอิเล็คทรอนิค (คลังกลุ่มรูป) ===== */
function groupGenId(){ return "grp_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }
/* URL รูปในคลัง bucket ที่ path <groupId>/<name> */
function bucketImgUrl(bucket,groupId,name){ return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${groupId}/${encodeURIComponent(name)}`; }
/* แปลงวันที่ ISO (2026-07-19) -> ป้ายชื่อกลุ่ม 19-07-69 (วัน-เดือน-พ.ศ. 2 หลัก) */
function beDateLabel(iso){
  if(!iso) return "";
  const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(iso);
  const be=(Number(m[1])+543)%100;
  return `${m[3]}-${m[2]}-${String(be).padStart(2,"0")}`;
}
/* ===== จัดกลุ่มตามเดือน (คลังกลุ่มรูป) ===== */
const TH_MONTHS=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
/* คีย์เดือนไว้จัดกลุ่ม/เรียง เช่น 2026-07 (คืน "" ถ้าไม่มีวันที่ → ไปกองล่างสุด) */
function monthKey(iso){ const m=String(iso||"").match(/^(\d{4})-(\d{2})/); return m?`${m[1]}-${m[2]}`:""; }
/* ป้ายชื่อเดือนไทย + พ.ศ. เช่น 2026-07 -> "กรกฎาคม 2569" */
function monthLabel(iso){
  const m=String(iso||"").match(/^(\d{4})-(\d{2})/);
  if(!m) return "ไม่ระบุวันที่";
  return `${TH_MONTHS[Number(m[2])-1]||m[2]} ${Number(m[1])+543}`;
}
/* ทำชื่อไฟล์ให้ปลอดภัยสำหรับ storage key แต่คงชื่อเดิมไว้อ่าน/ค้นหาได้ */
function sanitizeImgName(name,i){
  let n=String(name||"").split(/[\\/]/).pop().trim();      /* เอาเฉพาะชื่อไฟล์ ตัด path */
  n=n.replace(/[#?%*:|"<>]+/g,"_");                          /* อักขระที่ storage ไม่รับ */
  if(!n) n=`image_${i}.png`;
  return n;
}

let toastT;
function toast(msg){const t=$("toast");t.textContent="✓ "+msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2100);}
function countUp(el,to,dur=1200){const s=performance.now();(function step(t){let p=Math.min((t-s)/dur,1);p=1-Math.pow(1-p,3);el.textContent=Math.round(to*p);if(p<1)requestAnimationFrame(step);})(s);}

/* ===== ตัวแปลง ออเดอร์ <-> แถว Supabase ===== */
const orderToRow=o=>({id:o.id,order_no:o.order_no||null,customer:o.customer||null,category:o.category||null,
  status:o.status||null,note:o.note||null,order_date:o.date||null,
  section_id:o.section||null,
  price:(o.price===""||o.price==null)?null:Number(o.price),
  warranty_start:o.wstart||null, term_years:(o.wterm==null||o.wterm==="")?null:Number(o.wterm),
  images:o.images||[],updated_at:new Date().toISOString()});
const rowToOrder=r=>({id:r.id,order_no:r.order_no||"",customer:r.customer||"",category:r.category||"",
  status:r.status||"",note:r.note||"",date:r.order_date||"",
  section:r.section_id||"",
  price:(r.price==null?"":r.price), wstart:r.warranty_start||"", wterm:(r.term_years==null?"":r.term_years),
  images:Array.isArray(r.images)?r.images:(r.images?(()=>{try{return JSON.parse(r.images)}catch(e){return[]}})():[])});

/* ===== เงิน + นับถอยหลังประกันบัตรแข็ง ===== */
function fmtMoney(n){ n=Number(n)||0; return n.toLocaleString("th-TH",{maximumFractionDigits:0}); }
function buybackRate(secId){ const p=cardPlan(secId); return p?p.rate:0; }
function buybackValue(o){ return o&&o.price!=="" ? (Number(o.price)||0)*buybackRate(o.section) : 0; }
function warrantyEnd(o){
  if(!o||!o.wstart) return null;
  const d=new Date(o.wstart+"T00:00:00");
  if(isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear()+(Number(o.wterm)||DEFAULT_TERM_YEARS));
  return d;
}
/* คืน {expired} หรือ {y,mo,d,h,mi,s} เหลือถึง end (Date) */
function countdown(end){
  const now=new Date();
  if(!end||end.getTime()<=now.getTime()) return {expired:true};
  let y=end.getFullYear()-now.getFullYear(), mo=end.getMonth()-now.getMonth(), d=end.getDate()-now.getDate();
  let h=end.getHours()-now.getHours(), mi=end.getMinutes()-now.getMinutes(), s=end.getSeconds()-now.getSeconds();
  if(s<0){s+=60;mi--;} if(mi<0){mi+=60;h--;} if(h<0){h+=24;d--;}
  if(d<0){ const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(); d+=dim; mo--; }
  if(mo<0){mo+=12;y--;}
  return {expired:false,y,mo,d,h,mi,s};
}
/* pad2() ประกาศไว้ใน main.js (ใช้ร่วมกัน) */
/* ข้อความนับถอยหลังแบบย่อ เช่น "4 ปี 3 เดือน 12 วัน · 05:22:41" */
function fmtCountdown(o){
  const end=warrantyEnd(o); if(!end) return null;
  const c=countdown(end);
  if(c.expired) return {expired:true, text:"⛔ ครบกำหนดแล้ว"};
  return {expired:false, text:`${c.y} ปี ${c.mo} เดือน ${c.d} วัน · ${pad2(c.h)}:${pad2(c.mi)}:${pad2(c.s)}`};
}

/* ===== ตัวแปลง ประเภทงาน (หมวด) — ผูกกับหัวข้อ (section) ===== */
const catToRow=c=>({id:c.id,name:c.name,color:c.color||null,sort:c.sort||0,section_id:c.section||null});
const rowToCat=r=>({id:r.id,name:r.name,color:r.color||"#7cb5a0",sort:r.sort||0,section:r.section_id||""});
