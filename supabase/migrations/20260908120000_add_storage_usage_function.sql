-- ============================================================
-- storage_usage() — สรุปพื้นที่ที่ใช้ไปของทุก bucket ในคำสั่งเดียว
--
-- ทำไมต้องมี:
--   Storage API ไม่มีตัวบอกขนาดรวม ฝั่งเว็บจึงต้องไล่ list ทีละโฟลเดอร์
--   (1 ออเดอร์ = 1 โฟลเดอร์) ตอนนี้ 752 โฟลเดอร์ = ยิง HTTP 752 ครั้ง
--   เรียงกัน ใช้เวลา ~157 วินาที และยังนับไม่ครบ (ไฟล์ที่ลึกเกิน 2 ชั้น
--   หรือวางที่รากของ bucket จะหลุด)
--
--   storage.objects เป็นตารางปกติใน Postgres อ่านตรงๆ ครั้งเดียวจบ
--   ได้ครบทุกไฟล์ ทุก bucket และเร็วกว่ามาก
--
-- ความปลอดภัย:
--   security definer เพื่อข้าม RLS ของ storage.objects (anon อ่านตารางนี้
--   ตรงๆ ไม่ได้) แต่คืนแค่ ชื่อ bucket · จำนวนไฟล์ · ขนาดรวม
--   ไม่มีชื่อไฟล์ ไม่มีเนื้อหา ไม่มีข้อมูลลูกค้า
--   search_path = '' + อ้างชื่อตารางแบบเต็ม กัน search_path injection
-- ============================================================

create or replace function public.storage_usage()
returns table(bucket text, files bigint, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id::text,
         count(*)::bigint,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  group by o.bucket_id
$$;

comment on function public.storage_usage() is
  'สรุปจำนวนไฟล์และขนาดรวมต่อ bucket — ใช้โดยหน้าต่าง "พื้นที่จัดเก็บ"';

revoke all on function public.storage_usage() from public;
grant execute on function public.storage_usage() to anon, authenticated;
