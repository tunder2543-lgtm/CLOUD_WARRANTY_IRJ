/* ============================================================
   loader.js — หน้าโหลดตอนเปิดเว็บ (#bootLoader)
   % เดินตามขั้นตอนจริงของ Store.load (ส่งมาทาง Boot.step) และระหว่างรอขั้นที่นาน
   จะไหลขึ้นช้า ๆ เข้าหาเพดานของขั้นนั้น (ไม่ทะลุ) เพื่อไม่ให้ดูค้าง — โหลดเป็นไฟล์แรก
   ============================================================ */
const Boot=(()=>{
  const el=document.getElementById("bootLoader");
  if(!el) return {step(){},done(){}};
  const pctEl=document.getElementById("bootPct"), fill=document.getElementById("bootFill"), lab=document.getElementById("bootLabel");
  let shown=0, target=0, cap=0, finished=false;
  function frame(){
    if(cap>target) target=Math.min(cap,target+(cap-target)*.012+.02);   /* ระหว่างรอ: ไหลเข้าหาเพดาน */
    shown+=(target-shown)*.14;
    if(target-shown<.4) shown=target;
    const v=Math.floor(shown);
    pctEl.textContent=v; fill.style.width=shown+"%"; el.setAttribute("aria-valuenow",v);
    if(finished&&shown>=100){ setTimeout(hide,220); return; }   /* ให้เห็น 100% ครู่หนึ่งก่อนจางหาย */
    requestAnimationFrame(frame);
  }
  function hide(){ el.classList.add("out"); setTimeout(()=>el.remove(),500); }
  requestAnimationFrame(frame);
  /* p = % ที่ถึงแล้ว, label = ข้อความขั้นตอน, creepTo = เพดานที่ยอมให้ไหลไปถึงระหว่างรอขั้นถัดไป */
  function step(p,label,creepTo){
    target=Math.max(target,p); cap=Math.max(target,creepTo||0);
    if(label&&lab.textContent!==label) lab.textContent=label;
  }
  function done(){
    if(finished) return;
    finished=true; step(100,"พร้อมใช้งาน");
  }
  setTimeout(()=>{ if(!finished) done(); },30000);   /* กันค้าง: ถ้าบูตพังกลางทาง ไม่บังหน้าไว้ตลอด */
  step(4,"กำลังเริ่มต้น…",10);
  return {step,done};
})();
