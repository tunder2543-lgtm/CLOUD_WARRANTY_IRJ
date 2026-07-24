/* ============================================================
   store.js — ชั้นข้อมูล (Supabase + สำรอง localStorage)
   ============================================================ */
let sb=null;

const Store={
  mode:"local", status:"", _cache:null,
  async load(){
    if(SUPABASE_URL&&SUPABASE_KEY&&window.supabase){
      try{
        sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
        const [cr,or]=await Promise.all([
          sb.from(T_CATS).select("*").order("sort"),
          sb.from(T_ORDERS).select("*").order("updated_at",{ascending:false})
        ]);
        if(cr.error) throw cr.error; if(or.error) throw or.error;
        this.mode="supabase";
        let cats=(cr.data||[]).map(rowToCat);
        let orders=(or.data||[]).map(rowToOrder);
        /* หมวดหมู่พิเศษ (ไม่ fatal ถ้าตารางยังไม่ถูกสร้าง) */
        let sections=[];
        try{ const sr=await sb.from(T_SECTIONS).select("*").order("sort");
          if(sr.error) console.warn("[Supabase] sections:",sr.error.message);
          else sections=(sr.data||[]).map(s=>({id:s.id,name:s.name,sort:s.sort||0}));
        }catch(e){ console.warn("[Supabase] sections:",e&&e.message||e); }
        /* บันทึกกิจกรรม (ไม่ fatal ถ้าตารางยังไม่ถูกสร้าง) — โหลดล่าสุด ~200 รายการ */
        let logs=[];
        try{ const lr=await sb.from(T_LOGS).select("*").order("ts",{ascending:false}).limit(200);
          if(lr.error) console.warn("[Supabase] logs:",lr.error.message);
          else logs=(lr.data||[]).map(r=>({id:r.id,ts:r.ts,action:r.action,entity:r.entity||null,detail:r.detail||null}));
        }catch(e){ console.warn("[Supabase] logs:",e&&e.message||e); }
        this._cache={categories:cats,orders,sections,logs};
        this._persist(); this.status="🟢 เชื่อมต่อ Supabase แล้ว";
        return this._cache;
      }catch(e){
        console.warn("[Supabase] เชื่อมต่อไม่ได้:",e&&e.message||e);
        this.mode="local"; this.status="🟠 ออฟไลน์ — เก็บในเครื่อง ("+(e&&e.message?e.message:"ต่อไม่ได้")+")";
      }
    }else{ this.mode="local"; this.status="🟠 ออฟไลน์ — เก็บในเครื่อง"; }
    /* สำรอง: localStorage */
    try{ this._cache=JSON.parse(localStorage.getItem(KEY))||null; }catch(e){ this._cache=null; }
    if(!this._cache) this._cache={};
    if(!this._cache.categories) this._cache.categories=[];
    if(!this._cache.orders) this._cache.orders=[];
    if(!this._cache.sections) this._cache.sections=[];
    if(!this._cache.logs) this._cache.logs=[];
    return this._cache;
  },

  /* ---------- ออเดอร์ ---------- */
  async saveOrder(o){
    const arr=this._cache.orders, i=arr.findIndex(x=>x.id===o.id);
    if(i>=0)arr[i]=o; else arr.unshift(o);
    if(this.mode==="supabase"){ try{ const {error}=await sb.from(T_ORDERS).upsert(orderToRow(o)); if(error)throw error; }
      catch(e){ console.warn("[Supabase] saveOrder:",e&&e.message||e); toast("บันทึกขึ้น Supabase ไม่สำเร็จ"); } }
    this._persist();
  },
  async deleteOrder(o){
    this._cache.orders=this._cache.orders.filter(x=>x.id!==o.id);
    if(this.mode==="supabase"){ try{
      if(o.images&&o.images.length) await sb.storage.from(BUCKET).remove(o.images.map(n=>o.id+"/"+n));
      await sb.from(T_ORDERS).delete().eq("id",o.id);
    }catch(e){ console.warn("[Supabase] deleteOrder:",e&&e.message||e); } }
    this._persist();
  },
  async saveOrdersBulk(orders){   /* สร้างออเดอร์จำนวนมาก (นำเข้า Excel) — upsert ครั้งเดียว */
    orders.forEach(o=>{ const i=this._cache.orders.findIndex(x=>x.id===o.id); if(i>=0)this._cache.orders[i]=o; else this._cache.orders.unshift(o); });
    if(this.mode==="supabase"){ try{ const {error}=await sb.from(T_ORDERS).upsert(orders.map(orderToRow)); if(error)throw error; }
      catch(e){ console.warn("[Supabase] saveOrdersBulk:",e&&e.message||e); toast("บันทึกบางออเดอร์ขึ้น Supabase ไม่สำเร็จ"); } }
    this._persist();
  },

  /* ---------- รูปภาพ (bucket) ---------- */
  async uploadImage(orderId,name,file){
    const {error}=await sb.storage.from(BUCKET).upload(orderId+"/"+name,file,{upsert:true,contentType:file.type||"image/png"});
    if(error) throw error;
  },
  async removeImage(orderId,name){ try{ await sb.storage.from(BUCKET).remove([orderId+"/"+name]); }catch(e){ console.warn(e); } },

  /* ---------- คลังกลุ่มรูป (ประกันอิเล็คทรอนิค) — อัปโหลด/ลบ ตาม bucket ---------- */
  async uploadTo(bucket,path,file){
    const {error}=await sb.storage.from(bucket).upload(path,file,{upsert:true,contentType:file.type||"image/jpeg"});
    if(error) throw error;
  },
  async removeFromBucket(bucket,paths){
    if(!paths||!paths.length) return;
    try{ await sb.storage.from(bucket).remove(paths); }catch(e){ console.warn("[Supabase] removeFromBucket:",e&&e.message||e); }
  },

  /* ---------- ประเภทงาน (หมวด ผูกกับหัวข้อ) ---------- */
  async saveCategories(cats){ this._cache.categories=cats;
    if(this.mode==="supabase"){ try{ const {error}=await sb.from(T_CATS).upsert(cats.map(catToRow)); if(error)throw error; }
      catch(e){ console.warn("[Supabase] saveCategories:",e&&e.message||e); toast("บันทึกหมวดขึ้น Supabase ไม่สำเร็จ (ตรวจว่ารัน SQL เพิ่ม section_id แล้ว)"); } }
    this._persist(); },
  async deleteCategory(id){
    if(this.mode==="supabase"){ try{ await sb.from(T_CATS).delete().eq("id",id); }catch(e){console.warn(e);} }
    this._persist(); },

  /* ---------- หมวดหมู่พิเศษ (เมนูซ้าย กลุ่ม 3) ---------- */
  async saveSections(secs){ this._cache.sections=secs;
    if(this.mode==="supabase"){ try{ const {error}=await sb.from(T_SECTIONS).upsert(secs.map(s=>({id:s.id,name:s.name,sort:s.sort||0}))); if(error)throw error; }
      catch(e){ console.warn("[Supabase] saveSections:",e&&e.message||e); toast("บันทึกหมวดพิเศษขึ้น Supabase ไม่สำเร็จ (ตรวจว่ารัน SQL แล้ว)"); } }
    this._persist(); },
  async deleteSection(id){
    if(this.mode==="supabase"){ try{ await sb.from(T_ORDERS).update({section_id:null}).eq("section_id",id); await sb.from(T_SECTIONS).delete().eq("id",id); }catch(e){console.warn(e);} }
    this._cache.orders.forEach(o=>{if(o.section===id)o.section="";}); this._persist(); },

  /* ---------- บันทึกกิจกรรม (Activity Log) ---------- */
  async insertLog(entry){
    if(this.mode!=="supabase"||!sb) return;
    try{ const {error}=await sb.from(T_LOGS).upsert(entry); if(error)throw error; }
    catch(e){ console.warn("[Supabase] insertLog:",e&&e.message||e); }
  },
  async clearLogs(){   /* ล้างประวัติทั้งเครื่องและ Supabase */
    if(this.mode==="supabase"){ try{ const {error}=await sb.from(T_LOGS).delete().not("id","is",null); if(error)throw error; }
      catch(e){ console.warn("[Supabase] clearLogs:",e&&e.message||e); toast("ล้างประวัติบน Supabase ไม่สำเร็จ"); } }
    this._cache.logs=[]; this._persist();
  },

  /* ---------- push ข้อมูลทั้งหมดขึ้น Supabase (ใช้ตอนนำเข้า JSON) ---------- */
  async pushAll(){
    if(this.mode!=="supabase"||!sb) return;
    const c=this._cache;
    try{
      if(c.categories&&c.categories.length) await sb.from(T_CATS).upsert(c.categories.map(catToRow));
      if(c.sections&&c.sections.length)   await sb.from(T_SECTIONS).upsert(c.sections.map(s=>({id:s.id,name:s.name,sort:s.sort||0})));
      if(c.orders&&c.orders.length)       await sb.from(T_ORDERS).upsert(c.orders.map(orderToRow));
      if(c.logs&&c.logs.length)           await sb.from(T_LOGS).upsert(c.logs.map(e=>({id:e.id,ts:e.ts,action:e.action,entity:e.entity||null,detail:e.detail||null})));
    }catch(e){ console.warn("[Supabase] pushAll:",e&&e.message||e); toast("ซิงก์บางส่วนขึ้น Supabase ไม่สำเร็จ"); }
  },

  /* ---------- อื่น ๆ ---------- */
  _persist(){ try{ localStorage.setItem(KEY,JSON.stringify(this._cache)); }catch(e){} },
  export(){ return JSON.stringify(this._cache,null,2); },
  replaceAll(o){ this._cache=o; this._persist(); },
  async reset(){   /* ล้างเฉพาะออเดอร์ — คงประเภทงาน/หมวดพิเศษ/บันทึกไว้ */
    const cats=this._cache.categories||[], secs=this._cache.sections||[], logs=this._cache.logs||[];
    if(this.mode==="supabase"){ try{ await sb.from(T_ORDERS).delete().not("id","is",null); }catch(e){console.warn(e);} }
    this._cache={categories:cats,orders:[],sections:secs,logs:logs};
    this._persist();
  },
};
