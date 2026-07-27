-- ============================================================
-- 2026-07-27 · กู้ประเภทงานที่ "หลุด" + ล้างหมวดเก่าตกค้าง (ครั้งเดียว)
-- ตาราง: public."Warranty_categories"
-- ต้องรันหลัง 20260727120100 (ต้องมีคอลัมน์ section_id ก่อน)
--
-- บริบท:
--   หมวดเหล่านี้ถูกสร้างผ่านแอปแต่บันทึกขึ้น Supabase ไม่สำเร็จ
--   (เพราะตอนนั้นตารางยังไม่มี section_id) ออเดอร์จึงชี้ไปยัง id ที่
--   ไม่มีในตาราง → แสดงเป็นรหัสดิบ c_...  ชื่อที่ถูกต้องกู้จาก
--   public."Warranty_logs" (action=add_category / *_order)
--
-- Idempotent:
--   • INSERT ใช้ ON CONFLICT DO UPDATE
--   • DELETE มี guard (id=name, ไม่มี section, ไม่มีออเดอร์ผูก)
--   รันซ้ำได้ปลอดภัย
-- ============================================================

-- (1) กู้ 7 หมวดที่ออเดอร์อ้างถึงกลับเข้าตาราง (พร้อมผูกหัวข้อให้ถูก)
INSERT INTO public."Warranty_categories" (id, name, color, sort, section_id) VALUES
  ('c_ms2lqooj4md3', 'ท้าวเวสสุวรรณ',  '#e6b96f', 1, 'card-gold'),
  ('c_ms2lqtzzhd0o', 'สร้อยข้อมือหยก', '#7cb5a0', 2, 'card-gold'),
  ('c_ms2lr3uihbc2', 'แหวนหยก',        '#8fb2ce', 3, 'card-gold'),
  ('c_ms2lr8x0kqnd', 'พระหยก',         '#e7a08c', 4, 'card-gold'),
  ('c_mryp16it388h', 'ชื่อ-นามสกุล',   '#7cb5a0', 1, 'sp_mryn7ure16l'),
  ('c_mryp1a3216qf', 'คาถา',           '#e6b96f', 2, 'sp_mryn7ure16l'),
  ('c_mryp1j1u2ex0', 'อวยพร-โชคลาภ',   '#e7a08c', 3, 'sp_mryn7ure16l')
ON CONFLICT (id) DO UPDATE
  SET name       = EXCLUDED.name,
      color      = EXCLUDED.color,
      sort       = EXCLUDED.sort,
      section_id = EXCLUDED.section_id;

-- (2) ลบหมวดเก่าตกค้างจากเวอร์ชันก่อน (id = ชื่อ, ไม่ผูกหัวข้อ, 0 ออเดอร์)
DELETE FROM public."Warranty_categories" c
WHERE c.id IN ('คาถา', 'ชื่อ-นามสกุล', 'อวยพรโชคลาภ', 'อื่น ๆ')
  AND c.id = c.name
  AND c.section_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public."Warranty_orders" o WHERE o.category = c.id
  );
