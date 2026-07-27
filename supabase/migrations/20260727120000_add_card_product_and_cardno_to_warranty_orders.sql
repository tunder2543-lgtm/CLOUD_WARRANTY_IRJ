-- ============================================================
-- 2026-07-27 · เพิ่มฟิลด์บัตรแข็ง: ชื่อสินค้า + เลขบัตรประกัน
-- ตาราง: public."Warranty_orders"
-- โค้ดที่ใช้: js/helpers.js (orderToRow/rowToOrder), js/orders.js
-- Idempotent: ใช้ ADD COLUMN IF NOT EXISTS — รันซ้ำได้ไม่พัง
-- ============================================================
ALTER TABLE public."Warranty_orders"
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS card_no text;

COMMENT ON COLUMN public."Warranty_orders".product_name IS 'ชื่อสินค้า (บัตรแข็งทอง/เงิน)';
COMMENT ON COLUMN public."Warranty_orders".card_no      IS 'เลขบัตรประกัน (บัตรแข็งทอง/เงิน)';
