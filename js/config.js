/* ============================================================
   config.js — ค่าตั้งต้นทั้งหมด (Supabase, เมนูหัวข้อ, สถานะ, สี)
   ============================================================ */
const SUPABASE_URL="https://bcyupufhqlgkykmonnsy.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjeXVwdWZocWxna3lrbW9ubnN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDYwMjgsImV4cCI6MjA5NzU4MjAyOH0.W2B4qXUo-u1TYTQhxv7gZBwgd46_dUOCJYLryNanpGA";
const BUCKET="warranty-images";
const T_ORDERS="Warranty_orders", T_CATS="Warranty_categories", T_SECTIONS="Warranty_sections", T_LOGS="Warranty_logs";
const KEY="laser_dash_v3";
const LOG_KEY=KEY+"_log";   /* คีย์ mirror ของ log (อยู่รวมใน _cache.logs ด้วย) */

/* ===== หัวข้อเมนูซ้าย (คงที่) ===== */
const FIXED_GROUPS=[
  {id:"g1",icon:"⚡",name:"ประกันอิเล็คทรอนิค",sections:[
    {id:"live-fb",name:"Live FB"},
    {id:"live-tiktok",name:"Live TikTok"},
    {id:"live-sell",name:"Live Sell"},
  ]},
  {id:"g2",icon:"💳",name:"ประกันบัตรแข็ง",sections:[
    {id:"card-gold",name:"บัตรแข็งทอง",desc:"รับซื้อคืน 70% · ระยะเวลา 5 ปี"},
    {id:"card-silver",name:"บัตรแข็งเงิน",desc:"รับซื้อคืน 50% · ระยะเวลา 5 ปี"},
    {id:"card-green",name:"บัตรแข็งเขียว",desc:"ประกันหยกแท้จากร้าน I Real Jade"},
  ]},
];
const SPECIAL_MAX=100;   /* หมวดหมู่พิเศษ สร้างได้สูงสุด */

/* ===== ประกันอิเล็คทรอนิค: 3 คลัง (bucket จริงบน Supabase) =====
   หัวข้อทั้ง 3 นี้ใช้ "ระบบคลังกลุ่มรูป" (import batch) แทนระบบออเดอร์ปกติ
   ต้องสร้าง bucket ชื่อตรงนี้เองใน Supabase (Public) + policy ให้ anon อัปโหลด/ลบได้ */
const ELEC_SECTIONS={
  "live-fb":     {bucket:"live-fb",     label:"Live FB",     emoji:"📘"},
  "live-tiktok": {bucket:"live-tiktok", label:"Live TikTok", emoji:"🎵"},
  "live-sell":   {bucket:"live-sell",   label:"Live Sell",   emoji:"🛒"},
};
const isElecSection=id=>!!ELEC_SECTIONS[id];
const elecInfo=id=>ELEC_SECTIONS[id]||null;
const DEL_GROUP_PASSWORD="5044";   /* รหัสยืนยันการลบกลุ่ม */

/* ===== ประกันบัตรแข็ง: อัตรารับซื้อคืน + ระยะเวลา (ต่อหัวข้อ) ===== */
const CARD_PLANS={
  "card-gold":   {emoji:"🥇", label:"บัตรแข็งทอง", rate:0.70, color:"#e0b34e", tint:"#fbf3e0"},
  "card-silver": {emoji:"🥈", label:"บัตรแข็งเงิน", rate:0.50, color:"#9aa7b0", tint:"#eef1f3"},
};
const DEFAULT_TERM_YEARS=5;   /* ระยะเวลารับซื้อคืนมาตรฐาน */
const isCardSection=id=>!!CARD_PLANS[id];
const cardPlan=id=>CARD_PLANS[id]||null;

/* ===== สถานะงาน ===== */
const STATUSES=[
  {id:"todo", label:"รอทำ",     c:"#b8beba"},
  {id:"doing",label:"กำลังทำ",  c:"#e6b96f"},
  {id:"done", label:"เสร็จแล้ว", c:"#7cb5a0"},
  {id:"ship", label:"ส่งแล้ว",   c:"#8fb2ce"},
];
const statusById=id=>STATUSES.find(s=>s.id===id);

/* ===== ชุดสีสำหรับหมวด ===== */
const ZONE_COLORS=["#7cb5a0","#8fb2ce","#e6b96f","#e7a08c","#b39ddb","#90c8b0","#d99fb0","#88b0a0","#c0a98f","#a0c4d8"];
