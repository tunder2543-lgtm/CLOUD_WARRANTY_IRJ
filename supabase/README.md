# Supabase migrations

ไฟล์ SQL ที่นี่คือ migration ที่รันกับฐานข้อมูล Supabase ของโปรเจกต์
(`Warranty_*` tables · project ref `bcyupufhqlgkykmonnsy`) เก็บไว้เป็นหลักฐาน
และให้รันซ้ำได้เวลาตั้งฐานข้อมูลใหม่/ย้ายโปรเจกต์

รันเรียงตามชื่อไฟล์ (timestamp นำหน้า) จากเก่าไปใหม่

| ไฟล์ | ทำอะไร |
|------|--------|
| `20260727120000_add_card_product_and_cardno_to_warranty_orders.sql` | เพิ่มคอลัมน์ `product_name`, `card_no` (ชื่อสินค้า/เลขบัตรประกัน) ให้ `Warranty_orders` |
| `20260727120100_add_section_id_to_warranty_categories.sql` | เพิ่มคอลัมน์ `section_id` ให้ `Warranty_categories` (แก้บั๊ก "หมวดหมู่หลุด" — โค้ดต้องการคอลัมน์นี้ในการผูกประเภทงานกับหัวข้อ) |
| `20260727120200_restore_orphaned_categories.sql` | แก้ข้อมูลครั้งเดียว: กู้ 7 ประเภทงานที่หลุด + ลบหมวดเก่าตกค้าง 4 รายการ |

ทุกไฟล์เขียนให้ **idempotent** (รันซ้ำได้ไม่พัง): DDL ใช้ `IF NOT EXISTS`,
DML ใช้ `ON CONFLICT DO UPDATE` และ `DELETE` มี guard

## วิธีรัน

### แบบง่าย — Supabase SQL Editor
เปิด Supabase Dashboard → SQL Editor → วางเนื้อไฟล์ทีละไฟล์ (เรียงตามชื่อ) → Run

### แบบ CLI (ถ้าติดตั้ง Supabase CLI)
```bash
supabase link --project-ref bcyupufhqlgkykmonnsy
supabase db push
```

> หมายเหตุ: migration เหล่านี้เป็นส่วน "เพิ่มเติม" บนสคีมาเดิมที่มีอยู่แล้ว
> (`Warranty_orders`, `Warranty_categories`, `Warranty_sections`, `Warranty_logs`
> และ storage buckets) ไม่ได้สร้างตารางฐานตั้งแต่ต้น
