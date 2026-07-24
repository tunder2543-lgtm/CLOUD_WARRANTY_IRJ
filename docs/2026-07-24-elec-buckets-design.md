# ระบบคลังรูป "ประกันอิเล็คทรอนิค" (3 Buckets)

วันที่: 2026-07-24

## เป้าหมาย
เปลี่ยนการใช้งานของหัวข้อกลุ่ม "⚡ ประกันอิเล็คทรอนิค" (Live FB / Live TikTok / Live Sell)
จากระบบออเดอร์รายชิ้น → เป็น **ระบบคลังรูปแบบกลุ่ม (Import batch)** โดยเก็บรูปแยก 3 คลัง (bucket) จริงบน Supabase

## การตัดสินใจหลัก (ผู้ใช้ยืนยันแล้ว)
1. **3 Bucket จริง** บน Supabase: `live-fb`, `live-tiktok`, `live-sell` (ผู้ใช้สร้างเอง + ตั้ง public + policy anon)
2. **เปลี่ยนเป็นระบบกลุ่มรูปล้วน ๆ** — ไม่มีเลขออเดอร์/ลูกค้า/สถานะ ใน 3 หัวข้อนี้
3. **ระบบแปลงวันที่อัตโนมัติ** — 2026-07-19 → `19-07-69` (วัน-เดือน-พ.ศ.2หลัก) เป็นชื่อกลุ่ม
4. **อัปโหลดต้องผ่าน 100%** — ถ้าไม่ครบ: ค้างกลุ่มไว้ (ยังไม่บันทึกเรคคอร์ด) แสดงรูปที่พลาด + สาเหตุ + ปุ่มลองใหม่เฉพาะที่พลาด
5. **ปุ่มลบกลุ่ม (รหัส 5044)** อยู่ทั้งบนการ์ดกลุ่ม และในหน้ารายละเอียดกลุ่ม

## Data model
เก็บกลุ่มเป็นเรคคอร์ดในตาราง `Warranty_orders` เดิม (ไม่สร้างตารางใหม่):
- `id` = `grp_...` (unique ต่อการ import)
- `section_id` = bucket key (`live-fb`|`live-tiktok`|`live-sell`)
- `order_date` = วันที่ ISO (`2026-07-19`)
- `images` = jsonb array ของชื่อไฟล์จริง (เก็บชื่อเดิมไว้เพื่อค้นหา/ZIP)
- ฟิลด์อื่น (order_no/customer/category/status/price...) = null

รูปเก็บใน bucket ที่ path: `<groupId>/<ชื่อไฟล์>`

## องค์ประกอบ (units)
- **config.js**: `ELEC_SECTIONS` (map section→bucket/label/emoji), `isElecSection()`, `DEL_GROUP_PASSWORD="5044"`
- **helpers.js**: `beDateLabel(iso)` แปลงวันที่→`DD-MM-YY(พ.ศ.)`, `bucketImgUrl(bucket,groupId,name)`, `groupGenId()`
- **store.js**: `uploadTo(bucket,path,file)`, `removeFromBucket(bucket,paths)`, `listGroupImages` (ไม่จำเป็น—ใช้ images ในเรคคอร์ด)
- **js/elec.js** (ใหม่): โมดัลนำเข้า (เลือกวันที่+โฟลเดอร์+อัปโหลด%+แจ้ง error+retry), หน้าคลังกลุ่ม, หน้ารายละเอียดกลุ่ม (ค้นหา+ZIP+ลบ), ลบกลุ่มด้วยรหัส
- **app.js**: `renderView()` แยก route — ถ้า `isElecSection(currentSection)` → `renderElecView()` (ซ่อน stats/charts/toolbar/gallery ปกติ)
- **main.js**: ปุ่ม `btnNew` — ถ้าอยู่ในหัวข้อ elec → เปิดโมดัลนำเข้า; อื่น ๆ → openOrder เดิม; ผูกอีเวนต์โมดัล elec
- **index.html**: เพิ่ม `#elecView` container, โมดัล `#elecModal`, โหลด JSZip CDN, โหลด `js/elec.js`

## Flow การนำเข้า
1. อยู่ในหัวข้อ elec → กด "＋ สร้างออเดอร์" → เปิด `#elecModal`
2. เลือกวันที่ (`<input type=date>`) → เลือกโฟลเดอร์ (`<input webkitdirectory>` กรองเฉพาะ image/*)
3. แสดง preview (ชื่อโฟลเดอร์ + จำนวนรูป + ธัมบ์เนล) → กด "เริ่มอัปโหลด"
4. อัปโหลดทีละไฟล์ไป `<groupId>/<name>` พร้อมแถบ % — เก็บ success/fail
5. ครบ 100% → `Store.saveOrder(group)` + Log + toast → ปิดโมดัล refresh
6. มีพลาด → แสดงรายการ (ชื่อ+ธัมบ์+สาเหตุ) + ปุ่ม "ลองใหม่เฉพาะที่พลาด" (อัปเฉพาะที่ fail) จนครบ 100%; ยกเลิกได้ (ลบไฟล์ที่อัปแล้วออกจาก bucket)

## Flow หน้าคลัง & กลุ่ม
- หน้าคลัง: การ์ดกลุ่มเรียงใหม่→เก่า แต่ละใบ = `19-07-69 (จำนวนรูป 30)` + cover + เวลา + ปุ่มลบ 🗑
- คลิกการ์ด → หน้ารายละเอียด: กริดรูปทั้งหมด, ช่องค้นหา (substring, case-insensitive), ปุ่ม 📦 Export ZIP, ↩ กลับ, 🗑 ลบกลุ่ม
- ZIP: JSZip — fetch blob แต่ละรูปจาก public URL → zip → ดาวน์โหลด `<label>.zip`
- ลบกลุ่ม: prompt รหัส === 5044 → ลบรูปทั้งหมดใน bucket + ลบเรคคอร์ด + Log

## หมายเหตุ
- ต้องสร้าง 3 buckets เอง + policy anon (จะแนบขั้นตอนตอนจบ)
- โปรเจกต์นี้ไม่ใช่ git repo → ข้ามการ commit
