/* ============================================================
   datepicker.js — ตัวเลือกวันที่ (custom) แทน <input type="date">
   • แสดงผลช่อง: วัน/เดือน/ปี (ตัวเลขล้วน, ปี ค.ศ.) เช่น 27/07/2026
   • ป็อปอัปเลือกเดือน = เดือนย่อภาษาไทย (ม.ค. ก.พ. …)
   • ลิสต์ปีโชว์ "2026 (พ.ศ. 2569)" แต่ผลลัพธ์ที่เลือกโชว์แค่ ค.ศ.
   โครงสร้าง HTML ที่ต้องมีต่อ 1 ช่อง:
     <input id="X_disp" class="dp-disp" readonly>  ← ช่องแสดงผล (คลิกเปิดป็อปอัป)
     <input id="X" type="hidden">                  ← เก็บค่า ISO (yyyy-mm-dd)
   อ่านค่า: $("X").value / dpGet("X")  ·  ตั้งค่า: dpSet("X", iso)
   ============================================================ */
const DP_MON=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DP_WD=["อา","จ","อ","พ","พฤ","ศ","ส"];
const _dpReg={};       /* id -> {onChange} */
let _dpState=null;     /* {id,view,y,mo} ระหว่างเปิดป็อปอัป */

function dpParse(iso){ const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?{y:+m[1],mo:+m[2]-1,d:+m[3]}:null; }
function dpISO(y,mo,d){ return `${y}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
/* รูปแบบแสดงผล: DD/MM/YYYY (ค.ศ.) */
function dpFormat(iso){ const p=dpParse(iso); return p?`${String(p.d).padStart(2,"0")}/${String(p.mo+1).padStart(2,"0")}/${p.y}`:""; }

/* ตั้งค่า (อัปเดตทั้ง hidden + ช่องแสดงผล) — silent=true จะไม่เรียก onChange */
function dpSet(id,iso,silent){
  const h=$(id); if(!h) return;
  iso=iso||"";
  h.value=iso;
  const disp=$(id+"_disp");
  if(disp) disp.value=iso?dpFormat(iso):"";
  if(!silent && _dpReg[id] && _dpReg[id].onChange) _dpReg[id].onChange(iso);
}
function dpGet(id){ const h=$(id); return h?h.value:""; }

/* ผูกช่องแสดงผลให้คลิกแล้วเปิดป็อปอัป (เรียกครั้งเดียวตอน boot) */
function dpInit(id,opts){
  _dpReg[id]=opts||{};
  const disp=$(id+"_disp"); if(!disp) return;
  disp.readOnly=true; disp.autocomplete="off";
  disp.addEventListener("click",e=>{ e.preventDefault(); dpOpen(id); });
  disp.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); dpOpen(id); } });
}

/* ===== ป็อปอัป ===== */
function _dpPop(){
  let p=$("dpPop");
  if(!p){ p=document.createElement("div"); p.id="dpPop"; p.className="dp-pop"; document.body.appendChild(p); }
  return p;
}
function dpOpen(id){
  if(_dpState && _dpState.id===id){ dpClose(); return; }   /* คลิกซ้ำ = ปิด */
  const cur=dpParse(dpGet(id)), now=new Date();
  _dpState={ id, view:"day", y:cur?cur.y:now.getFullYear(), mo:cur?cur.mo:now.getMonth() };
  dpRender();
  _dpPop().classList.add("show");
  dpPosition(id);
  setTimeout(()=>document.addEventListener("mousedown",_dpOutside,true),0);
  window.addEventListener("scroll",_dpReposition,true);
  window.addEventListener("resize",_dpReposition);
  document.addEventListener("keydown",_dpEsc,true);
}
function dpClose(){
  const p=$("dpPop"); if(p) p.classList.remove("show");
  _dpState=null;
  document.removeEventListener("mousedown",_dpOutside,true);
  window.removeEventListener("scroll",_dpReposition,true);
  window.removeEventListener("resize",_dpReposition);
  document.removeEventListener("keydown",_dpEsc,true);
}
function _dpEsc(e){ if(e.key==="Escape"){ e.stopPropagation(); dpClose(); } }
function _dpOutside(e){ const p=$("dpPop"); if(p && !p.contains(e.target)){ const s=_dpState; if(!s||e.target!==$(s.id+"_disp")) dpClose(); } }
function _dpReposition(){ if(_dpState) dpPosition(_dpState.id); }
function dpPosition(id){
  const disp=$(id+"_disp"), p=$("dpPop"); if(!disp||!p) return;
  const r=disp.getBoundingClientRect(), pw=p.offsetWidth||300, ph=p.offsetHeight||330;
  let left=r.left, top=r.bottom+6;
  if(left+pw>window.innerWidth-8) left=Math.max(8,window.innerWidth-pw-8);
  if(top+ph>window.innerHeight-8 && r.top-ph-6>8) top=r.top-ph-6;   /* ล้นล่าง → เด้งขึ้นบน */
  p.style.left=left+"px"; p.style.top=Math.max(8,top)+"px";
}

function dpRender(){
  const s=_dpState; if(!s) return;
  _dpPop().innerHTML = s.view==="day" ? dpDayHTML(s) : dpMYHTML(s);
  dpWire();
}
function dpDayHTML(s){
  const first=new Date(s.y,s.mo,1).getDay(), dim=new Date(s.y,s.mo+1,0).getDate();
  const sel=dpParse(dpGet(s.id)), t=new Date(), tISO=dpISO(t.getFullYear(),t.getMonth(),t.getDate());
  let cells="";
  for(let i=0;i<first;i++) cells+=`<span class="dp-d empty"></span>`;
  for(let d=1;d<=dim;d++){
    const iso=dpISO(s.y,s.mo,d);
    const isSel=sel&&sel.y===s.y&&sel.mo===s.mo&&sel.d===d;
    cells+=`<button type="button" class="dp-d${isSel?" sel":""}${iso===tISO?" today":""}" data-d="${d}">${d}</button>`;
  }
  return `<div class="dp-head">
      <button type="button" class="dp-nav" data-nav="-1" title="เดือนก่อน">‹</button>
      <button type="button" class="dp-title" data-my>${DP_MON[s.mo]} ${s.y} ▾</button>
      <button type="button" class="dp-nav" data-nav="1" title="เดือนถัดไป">›</button>
    </div>
    <div class="dp-wd">${DP_WD.map(w=>`<span>${w}</span>`).join("")}</div>
    <div class="dp-grid">${cells}</div>
    <div class="dp-foot">
      <button type="button" class="dp-fbtn" data-today>วันนี้</button>
      <button type="button" class="dp-fbtn" data-clear>ล้าง</button>
    </div>`;
}
function dpMYHTML(s){
  const now=new Date().getFullYear();
  const y0=Math.min(s.y-8,now-6), y1=Math.max(s.y+8,now+6);
  let years="";
  for(let y=y1;y>=y0;y--) years+=`<button type="button" class="dp-y${y===s.y?" sel":""}" data-y="${y}">${y} <small>(พ.ศ. ${y+543})</small></button>`;
  const months=DP_MON.map((m,i)=>`<button type="button" class="dp-m${i===s.mo?" sel":""}" data-m="${i}">${m}</button>`).join("");
  return `<div class="dp-head"><button type="button" class="dp-title dp-back" data-day>‹ เลือกวัน · ${DP_MON[s.mo]} ${s.y}</button></div>
    <div class="dp-my"><div class="dp-years">${years}</div><div class="dp-months">${months}</div></div>`;
}
function dpWire(){
  const p=$("dpPop"), s=_dpState; if(!p||!s) return;
  p.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{ const t=s.y*12+s.mo+(+b.dataset.nav); s.y=Math.floor(t/12); s.mo=((t%12)+12)%12; dpRender(); });
  const my=p.querySelector("[data-my]"); if(my) my.onclick=()=>{ s.view="my"; dpRender(); };
  const day=p.querySelector("[data-day]"); if(day) day.onclick=()=>{ s.view="day"; dpRender(); };
  p.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>{ dpSet(s.id,dpISO(s.y,s.mo,+b.dataset.d)); dpClose(); });
  p.querySelectorAll("[data-y]").forEach(b=>b.onclick=()=>{ s.y=+b.dataset.y; dpRender(); const yl=p.querySelector(".dp-y.sel"); if(yl)yl.scrollIntoView({block:"nearest"}); });
  p.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ s.mo=+b.dataset.m; s.view="day"; dpRender(); });
  const tb=p.querySelector("[data-today]"); if(tb) tb.onclick=()=>{ const n=new Date(); dpSet(s.id,dpISO(n.getFullYear(),n.getMonth(),n.getDate())); dpClose(); };
  const cb=p.querySelector("[data-clear]"); if(cb) cb.onclick=()=>{ dpSet(s.id,""); dpClose(); };
  if(s.view==="my"){ const yl=p.querySelector(".dp-y.sel"); if(yl) yl.scrollIntoView({block:"center"}); }
  dpPosition(s.id);
}
