-- ============================================================
-- 2026-07-27 · เพิ่มคอลัมน์ section_id ให้ตารางประเภทงาน
-- ตาราง: public."Warranty_categories"
--
-- ที่มา/สาเหตุ:
--   โค้ด (js/helpers.js: catToRow/rowToCat, js/settings.js: addCat)
--   ออกแบบให้ผูก "ประเภทงาน" กับ "หัวข้อ" (section) ผ่านคอลัมน์ section_id
--   แต่ตารางจริงไม่เคยมีคอลัมน์นี้ → ทุกครั้งที่ saveCategories() upsert
--   จะโดน Postgres ปฏิเสธทั้งแถว หมวดใหม่จึงบันทึกขึ้น Supabase ไม่ได้
--   (เก็บแค่ localStorage) พอโหลดใหม่/คนละเครื่องเลย "หมวดหมู่หลุด"
--
-- Idempotent: ADD COLUMN IF NOT EXISTS — รันซ้ำได้ไม่พัง
-- ============================================================
ALTER TABLE public."Warranty_categories"
  ADD COLUMN IF NOT EXISTS section_id text;

COMMENT ON COLUMN public."Warranty_categories".section_id IS 'ผูกประเภทงานกับหัวข้อ (section) — ค่าว่าง/NULL = ไม่ผูกหัวข้อ';
