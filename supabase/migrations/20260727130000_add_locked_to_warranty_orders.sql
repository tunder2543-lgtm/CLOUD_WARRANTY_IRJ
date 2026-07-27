-- ============================================================
-- 2026-07-27 · เพิ่มระบบล็อคออเดอร์
-- ตาราง: public."Warranty_orders"
-- โค้ด: js/helpers.js (orderToRow/rowToOrder), js/orders.js (read-only view)
--
-- locked=true → กดเข้าออเดอร์จะเปิดหน้า read-only (แก้ไขไม่ได้)
--               ปลดล็อคด้วยรหัสผ่าน (config.js: UNLOCK_PASSWORD)
-- Idempotent: ADD COLUMN IF NOT EXISTS — รันซ้ำได้ไม่พัง
-- ============================================================
ALTER TABLE public."Warranty_orders"
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public."Warranty_orders".locked IS 'ล็อคออเดอร์: เปิดดูแบบ read-only, ปลดล็อคด้วยรหัสผ่าน';
