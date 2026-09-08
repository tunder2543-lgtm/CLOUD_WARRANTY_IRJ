/* ============================================================
   storage.js — หน้าต่าง "พื้นที่จัดเก็บ" (Supabase Storage)

   วิธีอ่านยอด 2 ทาง:
   1) RPC storage_usage()  ← ทางหลัก: ถาม Postgres ครั้งเดียว ~0.2 วิ
                              ได้ครบทุกไฟล์ ทุก bucket แม้ bucket ที่เว็บไม่รู้จัก
   2) ไล่ list ทีละโฟลเดอร์ ← ทางสำรอง: ใช้เมื่อยังไม่ได้ติดตั้ง function
                              ช้ามาก (1 ออเดอร์ = 1 request) และนับได้ไม่ครบ
   ============================================================ */
const STO_QUOTA_KEY = KEY+"_quota";     /* โควตาที่เลือกไว้ (ไบต์) */
const STO_CACHE_KEY = KEY+"_stousage";  /* ผลสแกนล่าสุด (กันสแกนซ้ำทุกครั้งที่เปิด) */
const STO_FRESH_MS  = 5*60*1000;        /* ผลเก่ากว่านี้ → อ่านใหม่อัตโนมัติตอนเปิด */
const GB = 1024*1024*1024;

/* แพ็กเกจ Supabase (โควตาพื้นที่ Storage) — เลือกให้ตรงกับที่ใช้จริง */
const STO_PLANS=[
  {id:"free",  label:"Free · 1 GB",   bytes:1*GB},
  {id:"pro",   label:"Pro · 100 GB",  bytes:100*GB},
  {id:"custom",label:"กำหนดเอง",       bytes:null},
];
/* สีประจำคลัง (ใช้ทั้งจุดนำหน้าและแถบสัดส่วน) */
const STO_PALETTE=["#7cb5a0","#8fb2ce","#b39ddb","#e6b96f","#e7a08c","#90c8b0","#d99fb0","#c0a98f"];

/* bucket ที่เว็บนี้รู้จัก (จาก config.js) — ใช้เป็นป้ายชื่อสวย ๆ เท่านั้น
   ยอดจริงมาจาก RPC ซึ่งเจอทุก bucket แม้ตัวที่ไม่ได้อยู่ในนี้ */
function stoKnown(){
  const m={};
  m[BUCKET]={label:"รูปออเดอร์",emoji:"🖼️"};
  Object.values(ELEC_SECTIONS).forEach(ei=>{ m[ei.bucket]={label:ei.label,emoji:ei.emoji}; });
  return m;
}
/* ใส่ป้ายชื่อ/สีให้ผลลัพธ์
   ลำดับสี = คลังที่รู้จักเรียงตาม config ก่อน (คลังหลักได้สีเขียวเสมอ)
   แล้วค่อยตามด้วยคลังแปลกหน้าเรียงตามชื่อ — ทำให้สีคงที่ทุกครั้งที่อ่านใหม่ */
function stoDecorate(rows){
  const known=stoKnown(), order=Object.keys(known);
  const rank=r=>{ const i=order.indexOf(r.name); return i<0?order.length:i; };
  return rows.slice()
    .sort((a,b)=>rank(a)-rank(b) || a.name.localeCompare(b.name))
    .map((r,i)=>{
      const k=known[r.name];
      return {...r, label:k?k.label:r.name, emoji:k?k.emoji:"📦",
              color:STO_PALETTE[i%STO_PALETTE.length], unknown:!k};
    });
}

/* ---------- โควตา ---------- */
function stoQuota(){
  const v=Number(localStorage.getItem(STO_QUOTA_KEY));
  return (v&&v>0)?v:1*GB;                      /* ไม่เคยตั้ง → Free 1 GB */
}
function stoSetQuota(bytes){
  try{ localStorage.setItem(STO_QUOTA_KEY,String(bytes)); }catch(e){}
  if(stoData) stoRender();
}

/* ---------- cache ผลสแกน ---------- */
function stoLoadCache(){ try{ return JSON.parse(localStorage.getItem(STO_CACHE_KEY))||null; }catch(e){ return null; } }
function stoSaveCache(d){ try{ localStorage.setItem(STO_CACHE_KEY,JSON.stringify(d)); }catch(e){} }

/* ---------- แปลงหน่วย ---------- */
function fmtBytes(n){
  n=Number(n)||0;
  if(n<1024) return n+" B";
  if(n<1048576) return (n/1024).toFixed(1)+" KB";
  if(n<GB) return (n/1048576).toFixed(1)+" MB";
  return (n/GB).toFixed(2)+" GB";
}
const fmtNum=n=>(Number(n)||0).toLocaleString("th-TH");

/* ============================================================
   ทางหลัก — ถามฐานข้อมูลครั้งเดียว
   ============================================================ */
async function stoReadRpc(){
  const {data,error}=await sb.rpc("storage_usage");
  if(error) throw error;
  if(!Array.isArray(data)) throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
  return data.map(r=>({name:r.bucket, bytes:Number(r.bytes)||0, files:Number(r.files)||0, ok:true}));
}

/* ============================================================
   ทางสำรอง — ไล่ทุกโฟลเดอร์ใน bucket ที่รู้จัก แล้วบวกขนาดไฟล์
   (ช้าและนับได้ไม่ครบ ใช้เมื่อ RPC ใช้ไม่ได้เท่านั้น)
   ============================================================ */
async function stoScanBucket(bucket,onTick){
  let bytes=0,files=0;
  async function walk(path,depth){
    const entries=await elecList(bucket,path);        /* elecList: แบ่งหน้าเอง กัน limit 100 ของ Storage */
    for(const e of entries){
      if(e.name===".emptyFolderPlaceholder") continue;
      const full=path?path+"/"+e.name:e.name;
      if(e.id===null){ if(depth<4) await walk(full,depth+1); }   /* โฟลเดอร์ (จำกัดความลึกกันวนไม่จบ) */
      else{
        files++;
        bytes+=(e.metadata&&Number(e.metadata.size))||0;
        if(onTick&&files%50===0) onTick(files,bytes);
      }
    }
  }
  await walk("",0);
  return {bytes,files};
}
async function stoReadWalk(){
  const names=Object.keys(stoKnown()), rows=[];
  let total=0;
  for(const name of names){
    stoSetMsg(`กำลังไล่โฟลเดอร์ <b>${esc(name)}</b> … (${rows.length}/${names.length} คลัง · รวม ${fmtBytes(total)})`);
    try{
      const r=await stoScanBucket(name,(f,by)=>{
        stoSetMsg(`กำลังไล่โฟลเดอร์ <b>${esc(name)}</b> … ${fmtNum(f)} ไฟล์ · ${fmtBytes(total+by)}`);
      });
      rows.push({name,bytes:r.bytes,files:r.files,ok:true});
      total+=r.bytes;
    }catch(e){
      rows.push({name,bytes:0,files:0,ok:false,err:(e&&e.message)||String(e)});
      console.warn("[storage] scan",name,e);
    }
  }
  return rows;
}

let stoScanning=false, stoData=null;

async function stoScan(){
  if(stoScanning) return;
  if(Store.mode!=="supabase"||!sb){ stoSetMsg("🟠 ออฟไลน์ — ต้องเชื่อม Supabase ก่อนถึงจะอ่านพื้นที่ได้"); return; }
  stoScanning=true; stoSetBusy(true);
  if(!stoData) stoRender();                            /* ยังไม่มีข้อมูลเก่า → โชว์โครงร่างระหว่างรอ */
  stoSetMsg("กำลังอ่านยอดจากฐานข้อมูล…");

  let rows=[], method="rpc";
  try{
    rows=await stoReadRpc();
  }catch(e){
    console.warn("[storage] storage_usage() ใช้ไม่ได้ → ถอยไปไล่ทีละโฟลเดอร์:",e&&e.message||e);
    method="walk";
    stoSetMsg("อ่านสรุปจากฐานข้อมูลไม่ได้ — กำลังไล่ทีละโฟลเดอร์ (ช้ากว่ามาก)");
    try{ rows=await stoReadWalk(); }
    catch(e2){ stoScanning=false; stoSetBusy(false); stoSetMsg("อ่านพื้นที่ไม่สำเร็จ: "+esc((e2&&e2.message)||String(e2))); return; }
  }

  rows=stoDecorate(rows);
  const failed=rows.filter(r=>!r.ok).length;
  stoData={ts:Date.now(),method,buckets:rows,failed,
           total:rows.reduce((s,r)=>s+r.bytes,0),
           files:rows.reduce((s,r)=>s+r.files,0)};
  stoSaveCache(stoData);
  /* ครั้งแรก (ยังไม่เคยเลือกแพ็กเกจ) → เดาให้จากยอดที่ใช้จริง แล้วให้ผู้ใช้แก้เองได้ */
  if(!Number(localStorage.getItem(STO_QUOTA_KEY))){
    const fit=STO_PLANS.filter(p=>p.bytes).sort((a,b)=>a.bytes-b.bytes).find(p=>p.bytes>=stoData.total);
    stoSetQuota(fit?fit.bytes:Math.ceil(stoData.total/GB)*GB);
  }
  stoScanning=false; stoSetBusy(false);
  stoBuildPlanUI(); stoRender();
  stoSetMsg(failed?`⚠️ อ่านไม่ได้ ${failed} คลัง — ตัวเลขรวมอาจต่ำกว่าจริง`:"");
}

/* ============================================================
   หน้าต่าง
   ============================================================ */
function showStoModal(on){
  $("stoOv").classList.toggle("show",on);
  $("stoModal").classList.toggle("show",on);
}
function stoSetBusy(on){
  const b=$("stoRescan");
  if(b){ b.disabled=on; b.style.opacity=on?.55:1; b.textContent=on?"⏳ กำลังอ่าน…":"🔄 อ่านใหม่"; }
}
function stoSetMsg(html){ const el=$("stoMsg"); if(el) el.innerHTML=html||""; }

function openStorageModal(){
  $("drawer").classList.remove("show");   /* ปิดลิ้นชักตั้งค่าก่อน ไม่ให้บังหน้าต่าง */
  stoData=stoData||stoLoadCache();
  stoBuildPlanUI();
  stoRender();                            /* มีค่าเก่า → เห็นทันที ไม่ต้องรอ */
  showStoModal(true);
  stoSetMsg("");
  if(!stoData||(Date.now()-stoData.ts)>STO_FRESH_MS) stoScan();
}

/* ---------- ตัวเลือกแพ็กเกจ (segmented) + ช่องกำหนดเอง ---------- */
function stoBuildPlanUI(){
  const box=$("stoPlan"); if(!box) return;
  if(!box.dataset.built){
    box.dataset.built="1";
    STO_PLANS.forEach(p=>{
      const b=document.createElement("button");
      b.type="button"; b.dataset.plan=p.id; b.textContent=p.label;
      b.onclick=()=>{
        if(p.bytes){ stoSetQuota(p.bytes); }
        else{ $("stoCustomWrap").style.display=""; $("stoCustom").focus(); }
        stoSyncPlanUI(p.id);
      };
      box.appendChild(b);
    });
    $("stoCustom").oninput=()=>{
      const gb=parseFloat($("stoCustom").value);
      if(gb>0) stoSetQuota(Math.round(gb*GB));
    };
  }
  const q=stoQuota(), hit=STO_PLANS.find(p=>p.bytes===q);
  stoSyncPlanUI(hit?hit.id:"custom");
  if(!hit) $("stoCustom").value=String(+(q/GB).toFixed(2));
}
function stoSyncPlanUI(active){
  $("stoPlan").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.plan===active));
  $("stoCustomWrap").style.display=(active==="custom")?"":"none";
}

/* ---------- โครงร่างระหว่างอ่านครั้งแรก ---------- */
function stoSkeleton(){
  return `<div class="sto-sk hero"></div><div class="sto-sk bar"></div>
    <div class="sto-sk row"></div><div class="sto-sk row"></div><div class="sto-sk row"></div><div class="sto-sk row"></div>`;
}

function stoRender(){
  const wrap=$("stoBody"); if(!wrap) return;
  if(!stoData){
    wrap.innerHTML=(Store.mode==="supabase")?stoSkeleton()
      :`<div class="sto-empty">🟠 ออฟไลน์ — เชื่อม Supabase ก่อนถึงจะอ่านพื้นที่ได้</div>`;
    return;
  }
  const quota=stoQuota(), used=stoData.total, left=Math.max(quota-used,0);
  const pct=quota>0?(used/quota*100):0;
  const col=pct>=90?"#c9695b":pct>=75?"#e6b96f":"#7cb5a0";
  const R=53, C=2*Math.PI*R, off=C-C*Math.min(pct,100)/100;
  const sorted=stoData.buckets.slice().sort((a,b)=>b.bytes-a.bytes);

  /* แถบสัดส่วน: แบ่งตามส่วนแบ่งของ "ที่ใช้ไป" (วงแหวนบอกความเต็มอยู่แล้ว) */
  const stack=used>0?sorted.filter(b=>b.ok&&b.bytes>0).map((b,i)=>
    `<div class="sto-seg-b" style="width:${(b.bytes/used*100).toFixed(2)}%;background:${b.color};animation-delay:${i*70}ms"
       title="${esc(b.label)} · ${fmtBytes(b.bytes)}"></div>`).join(""):"";

  const rows=sorted.map(b=>{
    if(!b.ok) return `<div class="sto-row bad">
      <span class="sto-dot" style="background:#d8ddd9"></span>
      <span class="sto-row-n">${b.emoji} ${esc(b.label)} <code>${esc(b.name)}</code></span>
      <span class="sto-row-r"><div class="sto-row-v">อ่านไม่ได้</div>
        <div class="sto-row-sub">${esc((b.err||"").slice(0,40))}</div></span></div>`;
    const share=used>0?(b.bytes/used*100):0;
    return `<div class="sto-row">
      <span class="sto-dot" style="background:${b.color}"></span>
      <span class="sto-row-n">${b.emoji} ${esc(b.label)} <code>${esc(b.name)}</code>${b.unknown?`<span class="sto-tag">ไม่ได้ใช้ในเว็บนี้</span>`:""}</span>
      <span class="sto-row-r">
        <div class="sto-row-v">${fmtBytes(b.bytes)}</div>
        <div class="sto-row-sub"><span class="num">${fmtNum(b.files)}</span> ไฟล์ · <span class="num">${share.toFixed(1)}%</span></div>
      </span></div>`;
  }).join("");

  const d=new Date(stoData.ts);
  const mon=(typeof LOG_MONTHS!=="undefined")?LOG_MONTHS[d.getMonth()]:TH_MONTHS[d.getMonth()];
  const when=`${d.getDate()} ${mon} ${d.getFullYear()+543} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} น.`;
  const src=(stoData.method==="walk")
    ? "อ่านแบบไล่ทีละโฟลเดอร์ — ตัวเลขอาจต่ำกว่าจริง"
    : "อ่านจากฐานข้อมูลโดยตรง — นับครบทุกไฟล์";

  wrap.innerHTML=`
    <div class="sto-hero">
      <div class="sto-ring">
        <svg viewBox="0 0 120 120">
          <defs><linearGradient id="stoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${col}" stop-opacity=".68"/><stop offset="1" stop-color="${col}"/>
          </linearGradient></defs>
          <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(59,69,63,.07)" stroke-width="13"/>
          <circle class="sto-arc" cx="60" cy="60" r="${R}" fill="none" stroke="url(#stoGrad)" stroke-width="13"
            stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" transform="rotate(-90 60 60)"
            style="--sto-c:${C.toFixed(1)};--sto-off:${off.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/>
        </svg>
        <div class="sto-ring-mid"><b style="color:${col}">${pct.toFixed(1)}%</b><span>ใช้ไป</span></div>
      </div>
      <div class="sto-sum">
        <div class="sto-used">${fmtBytes(used)}</div>
        <div class="sto-of">ใช้ไปจากโควตา <b class="num">${fmtBytes(quota)}</b></div>
        <div class="sto-pill"><i style="background:${col}"></i>เหลือ <b>${fmtBytes(left)}</b>
          <span style="color:var(--muted)">(${(100-Math.min(pct,100)).toFixed(1)}%)</span></div>
        <div class="sto-metaline"><span class="num">${fmtNum(stoData.files)}</span> ไฟล์ ·
          <span class="num">${stoData.buckets.length}</span> คลัง</div>
      </div>
    </div>
    ${pct>=90?`<div class="sto-warn"><span>⚠️</span><span>พื้นที่ใกล้เต็ม — ลบรูปที่ไม่ใช้ หรือกด “บีบอัดรูปเก่าให้เล็กลง” ในหน้าตั้งค่า</span></div>`
      :pct>=75?`<div class="sto-warn soft"><span>💡</span><span>ใช้ไปเกิน 75% แล้ว — เผื่อพื้นที่ไว้ก่อนเต็ม</span></div>`:""}
    ${stack?`<div class="sto-stack">${stack}</div>
      <div class="sto-stack-cap"><span>สัดส่วนของที่ใช้ไป</span><span class="num">${fmtBytes(used)}</span></div>`:""}
    <div class="sto-t">แยกตามคลัง</div>
    <div class="sto-rows">${rows}</div>
    <div class="sto-when">อัปเดตล่าสุด: ${when}<br>${src}</div>`;
}
