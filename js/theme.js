/* ============================================================
   theme.js — สลับธีมสว่าง/มืด (จำต่อเครื่อง) + แสงตามเมาส์บนการ์ด
   ค่าเริ่มต้น = สว่าง; ธีมถูกตั้งก่อนวาดหน้าโดยสคริปต์สั้นใน <head> ของ index.html
   ============================================================ */
const THEME_KEY=KEY+"_theme";   /* ต้องตรงกับคีย์ในสคริปต์ <head> */

function themeIsDark(){ return document.documentElement.dataset.theme==="dark"; }
function themeApply(dark){
  if(dark) document.documentElement.dataset.theme="dark";
  else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem(THEME_KEY,dark?"dark":"light"); }catch(e){}
  const b=$("btnTheme"); if(b) b.title=dark?"เปลี่ยนเป็นธีมสว่าง":"เปลี่ยนเป็นธีมมืด";
}
/* สลับธีมด้วยวงกลมขยายจากจุดที่กด (View Transitions) — เบราว์เซอร์ที่ไม่รองรับ/ตั้งลดการเคลื่อนไหว สลับทันที */
function themeToggle(ev){
  const dark=!themeIsDark();
  const calm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!document.startViewTransition||calm){ themeApply(dark); return; }
  const x=ev&&ev.clientX?ev.clientX:innerWidth-40, y=ev&&ev.clientY?ev.clientY:28;
  const r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const vt=document.startViewTransition(()=>themeApply(dark));
  vt.ready.then(()=>{
    document.documentElement.animate(
      {clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${r}px at ${x}px ${y}px)`]},
      {duration:520,easing:"cubic-bezier(.22,1,.36,1)",pseudoElement:"::view-transition-new(root)"});
  }).catch(()=>{});
}

/* แสงตามเมาส์: เก็บตำแหน่งเมาส์ลง --mx/--my ของการ์ดที่ชี้อยู่ */
const THEME_SPOT_SEL=".stat,.scard,.ocard,.gcard,.card,.card-summary";
document.addEventListener("pointermove",e=>{
  if(e.pointerType!=="mouse") return;
  const el=e.target.closest&&e.target.closest(THEME_SPOT_SEL); if(!el) return;
  const r=el.getBoundingClientRect();
  el.style.setProperty("--mx",(e.clientX-r.left)+"px");
  el.style.setProperty("--my",(e.clientY-r.top)+"px");
},{passive:true});

(function(){
  const b=$("btnTheme"); if(!b) return;
  b.onclick=themeToggle;
  b.title=themeIsDark()?"เปลี่ยนเป็นธีมสว่าง":"เปลี่ยนเป็นธีมมืด";
})();
