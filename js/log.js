/* ============================================================
   log.js — ระบบ LOG บันทึกกิจกรรม (Activity Log)
   เก็บใน localStorage (ผ่าน Store._cache.logs / _persist) และ
   mirror ขึ้น Supabase ตาราง Warranty_logs แบบ fire-and-forget
   *** ไม่บันทึกตัวตนผู้ใช้ *** เก็บเฉพาะ {id, ts, action, entity, detail}
   ============================================================ */
const LOG_MAX=500;   /* เพดานรายการที่เก็บในเครื่อง (ตัดตัวเก่าทิ้งอัตโนมัติ) */

/* map action(โค้ดคงที่) -> ป้ายไทย + อีโมจิ + โทนสีของกล่องไอคอน
   tone: add=เขียว sage อ่อน · edit=ฟ้า k4 · del=แดงอ่อน */
const LOG_LABELS={
  create_order:{t:"สร้างออเดอร์",       ic:"🟢", tone:"add"},
  edit_order:  {t:"แก้ไขออเดอร์",       ic:"✏️", tone:"edit"},
  delete_order:{t:"ลบออเดอร์",          ic:"🗑️", tone:"del"},
  add_category:{t:"เพิ่มประเภทงาน",      ic:"🏷️", tone:"add"},
  del_category:{t:"ลบประเภทงาน",        ic:"❌", tone:"del"},
  add_special: {t:"เพิ่มหมวดหมู่พิเศษ",   ic:"➕", tone:"add"},
  del_special: {t:"ลบหมวดหมู่พิเศษ",     ic:"➖", tone:"del"},
  reset:       {t:"ล้างข้อมูลทั้งหมด",    ic:"⚠️", tone:"del"},
  import_json: {t:"นำเข้า JSON",         ic:"⬆️", tone:"edit"},
};

function logGenId(){ return "log_"+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36); }

const Log={
  /* บันทึกกิจกรรมหนึ่งรายการ — เรียกหลังการเซฟ/เปลี่ยน state สำเร็จเท่านั้น */
  add(action,entity,detail){
    const entry={
      id:logGenId(),
      ts:new Date().toISOString(),
      action,
      entity:entity||null,
      detail:detail||null,
    };
    try{
      if(!Store._cache) return entry;
      if(!Array.isArray(Store._cache.logs)) Store._cache.logs=[];
      Store._cache.logs.unshift(entry);                       /* ใหม่สุดอยู่บนสุด */
      if(Store._cache.logs.length>LOG_MAX) Store._cache.logs.length=LOG_MAX;
      Store._persist();                                       /* mirror ลง localStorage เสมอ */
      Store.insertLog(entry);                                 /* ขึ้น Supabase (fire-and-forget, มี catch ภายใน) */
    }catch(e){ console.warn("[Log] add:",e&&e.message||e); }
    /* รีเฟรชลิ้นชักบันทึกถ้าเปิดอยู่ (ไม่ให้ล้มการทำงานหลัก) */
    if(typeof renderLogs==="function"){ try{ renderLogs(); }catch(e){} }
    return entry;
  },
};

/* เปิดให้เข้าถึงผ่าน window.Log ด้วย (top-level const ไม่ผูกกับ window อัตโนมัติ) */
window.Log=Log;
