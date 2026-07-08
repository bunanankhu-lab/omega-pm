# 🔧 Omega PM — ระบบเตือนรอบ PM ช่างบริการ

เว็บแอปเตือนรอบเข้าบริการ PM เครื่องล้างจาน / เครื่องทำน้ำแข็ง ของโอเมก้าอีสาน (แยกออกมาจาก omega-payroll)

- **เว็บจริง:** https://omega-pm.vercel.app
- **ฐานข้อมูล:** Supabase (ตาราง `pm_stores`, `pm_records`, Storage bucket `pm-photos`) — ใช้โปรเจกต์เดียวกับ omega-payroll
- **QR ประจำร้าน:** `#store=<รหัสร้าน>` — ลูกค้าสแกนเห็นการตรวจล่าสุด ช่างใส่รหัสช่างเพื่อบันทึก PM
- ลิงก์เก่า `omega-payroll.vercel.app/pm.html#...` redirect มาที่นี่อัตโนมัติ (QR ที่ติดหน้าเครื่องไปแล้วใช้ได้ต่อ)
