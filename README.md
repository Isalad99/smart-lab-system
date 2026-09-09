# Smart Lab Management System

ระบบจัดการและจองห้องปฏิบัติการ ประกอบด้วยเว็บไซต์ Backend, Frontend, Desktop Agent และ AI Gatekeeper

เอกสารนี้จัดทำสำหรับผู้รับงานต่อและใช้ทดสอบ AI/Agent ในสภาพแวดล้อมทดสอบ

## ภาพรวมระบบ

| ส่วน | หน้าที่ | ตำแหน่ง |
| --- | --- | --- |
| Backend | REST API และเชื่อมต่อ Supabase/PostgreSQL | `backend/` |
| Frontend | เว็บไซต์สำหรับผู้ใช้และ Admin | `frontend/` |
| Smart Lab Agent | ตรวจ process/active window และบันทึกการใช้โปรแกรม | `smart-lab-agent/` |
| AI Gatekeeper | ตรวจใบหน้าและ liveness/anti-spoofing จากกล้อง | `gatekeeper/` |

### ขอบเขตปัจจุบันที่ควรรู้

- Gatekeeper ใช้ AI ตรวจว่าใบหน้าเป็นคนจริงหรือภาพปลอม แต่หน้าจอ `smart_gatekeeper.py` ยังไม่ได้เชื่อมการสแกนเข้ากับ `/gatekeeper/scan` โดยอัตโนมัติ
- Agent ไม่ใช่ Machine Learning แต่ใช้ process name, active-window title และรายการ blacklist จาก Backend
- การสมัครสมาชิกใช้ DeepFace/Facenet สร้าง face embedding แต่การจับคู่ใบหน้ากับผู้ใช้ใน Gatekeeper ยังต้องพัฒนาต่อ
- ปุ่ม `Force: Real Face` และ `Force: Spoof / Fake` ใช้ทดสอบ UI ของ Gatekeeper เท่านั้น และไม่เขียนข้อมูลลง Database

## การเตรียมระบบ

ต้องมี Python 3.11, Node.js/npm และ Database URL ของ Supabase โดยห้าม commit ค่า secret ลง Git

### 1. ตั้งค่า Backend

สร้างไฟล์ `backend/.env` จากค่าของระบบจริง เช่น:

```env
SQLALCHEMY_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/postgres
SECRET_KEY=<ใส่ค่า secret ของระบบ>
BREVO_API_KEY=<ใส่เมื่อทดสอบอีเมล OTP>
SENDER_EMAIL=<อีเมลผู้ส่ง>
SEED_ADMIN_PASSWORD=<ตั้งเฉพาะตอน seed บัญชี admin>
SEED_TEST_STUDENT_PASSWORD=<ตั้งเฉพาะตอน seed บัญชีทดสอบ>
```

ติดตั้งและรัน Backend บน Windows PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

ตรวจสอบว่า Backend ทำงาน:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/
```

เปิดเอกสาร API ได้ที่ [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

> ถ้าใช้ Backend บน Hugging Face ให้เปลี่ยน URL ในคำสั่งทดสอบเป็น `https://<space-name>.hf.space` และตรวจสอบว่า Deployment ได้รับ source code ล่าสุดแล้ว

### 2. อัปเดตโครงสร้าง Supabase

รันใน Supabase SQL Editor ตามลำดับ:

1. `backend/migrations/001_usage_violations.sql`
2. `backend/migrations/002_session_device_identity.sql`
3. `backend/migrations/003_agent_session_hardening.sql`

Migration ชุดนี้เพิ่มตาราง violation, เพิ่ม device identity, ทำให้ lifecycle ของ Session ชัดเจน, เพิ่ม Heartbeat และ index/constraint ที่จำเป็น การใช้ `Base.metadata.create_all()` ไม่สามารถเพิ่ม column ให้ตารางเดิมได้ จึงต้องรัน SQL migration แยก

### 3. รัน Frontend

สร้าง `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

จากนั้น:

```powershell
cd frontend
npm install
npm run dev
```

## ทดสอบ AI Gatekeeper

Gatekeeper ต้องใช้กล้องและ model files ที่อยู่ใน `gatekeeper/Silent-Face-Anti-Spoofing/resources/`

```powershell
cd gatekeeper
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python smart_gatekeeper.py
```

Gatekeeper ใช้ CPU inference และ requirements นี้เลือก PyTorch แบบ CPU-only เพื่อไม่ติดตั้ง CUDA runtime ที่ไม่จำเป็นกับเครื่องสแกนหน้า หากต้อง build executable ให้ติดตั้ง requirements-build.txt แล้วรัน pyinstaller --clean --noconfirm smart_gatekeeper.spec

ผลที่คาดหวัง:

1. เปิดโปรแกรมแล้วสถานะเปลี่ยนเป็น `READY TO SCAN`
2. ใบหน้าจริงได้ผล `ACCESS GRANTED` เมื่อ score มากกว่า `0.72`
3. รูปถ่าย/หน้าจอควรได้ผล `ACCESS DENIED` แต่ผลขึ้นกับแสง กล้อง และคุณภาพภาพ
4. เปิดรูปแบบทดสอบหลายคนพร้อมกัน ควรแจ้งให้เข้าทีละคน
5. ถ้า model โหลดไม่ได้ ให้ตรวจ path ของ model, เวอร์ชัน Torch และกล้องก่อน

การทดสอบปุ่ม Force เป็นเพียงการตรวจสถานะหน้าจอ ไม่ใช่การทดสอบการเขียน Database

### ทดสอบ API ที่บันทึกผล Gatekeeper

API นี้ต้องใช้ `email` ที่มีอยู่ใน `users` และ `lab_id` ที่มีอยู่ใน `labs`:

```powershell
$api = "http://127.0.0.1:8000"
$body = @{
  email = "<test-user-email>"
  lab_id = 1 # เปลี่ยนเป็น lab id จริง
  score = 0.95
  is_real = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "$api/gatekeeper/scan" `
  -ContentType "application/json" `
  -Body $body
```

ผลสำเร็จควรได้ `Access Granted` และมีแถวใหม่ใน `lab_access_logs` หาก `is_real = false` ควรได้ HTTP 403 และไม่เพิ่ม access log

## ทดสอบ Smart Lab Agent

Agent รุ่น source อยู่ที่ `smart-lab-agent/agent.pyw` ส่วนไฟล์ executable ที่ build แล้วอาจถูกเก็บแยก เพราะโฟลเดอร์ `dist/` ถูก ignore โดย Git

### รันจาก source เพื่อดู log

```powershell
cd smart-lab-agent
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python agent.pyw
```

ค่าหลักใน `agent.pyw`:

- `API_URL`: URL ของ Backend ที่ Agent จะเรียก
- `LAB_CODE`: รหัสห้องที่ต้องมีอยู่ใน Database เช่น `LAB01`
- `SMART_LAB_API_URL`: override URL ของ Backend โดยไม่ต้องแก้ source
- `SMART_LAB_CODE`: override รหัสห้อง
- `SMART_LAB_AGENT_DEBUG=1`: ป้องกันการ logout Windows ระหว่างทดสอบ; ตั้งเป็น `0` ตอนใช้งานจริง
- `DEVICE_NAME` และ `DEVICE_MAC`: อ่านจากเครื่องและส่งตอนสร้าง session

ถ้าต้อง build executable ให้ติดตั้ง requirements-build.txt แล้วรัน pyinstaller --clean --noconfirm agent.spec

ถ้าทดสอบ Backend local ให้ตั้งค่า SMART_LAB_API_URL เป็น http://127.0.0.1:8000 ก่อนรัน Agent หรือ build executable ใหม่หลังแก้ค่าแล้ว

### Test case: บันทึกการใช้โปรแกรมปกติ

1. ตรวจว่ามี test user และ lab code อยู่ใน Database
2. เปิด Agent และ login ด้วย test user
3. เปิดโปรแกรมที่ไม่อยู่ใน blacklist เช่น Notepad หรือ Calculator อย่างน้อย 10 วินาที
4. เปลี่ยนไปยังโปรแกรมอื่นอย่างน้อย 10 วินาที
5. กดจบการใช้งานบน Agent
6. ตรวจ Database ตาม query ด้านล่าง

ข้อมูลที่ Agent ส่งตามปกติ:

- ตอน login: `POST /login`
- ตอนเริ่ม session: `POST /agent/start-session`
- ระหว่างใช้งาน: `POST /agent/heartbeat` ทุก 30 วินาที
- ตอนจบ session: `POST /agent/log-usage` และ `POST /agent/end-session`
- Agent ส่ง usage เป็น JSON list ที่มี `name`, `started_at`, `ended_at`, `duration`

ถ้าไม่มี Heartbeat เกิน 2 นาที Backend จะปิด Session เป็น `abandoned` ด้วย `end_reason = stale_cleanup` เมื่อมีการเริ่ม Session ใหม่

### Test case: ตรวจโปรแกรมผิดกฎ

1. เพิ่ม `notepad` ในหน้า Admin > Blacklist หรือในตาราง `blacklisted_apps`
2. เปิด Agent และเริ่ม session ใหม่
3. เปิด Notepad
4. Agent จะตรวจทุกประมาณ 5 วินาทีและควรแสดง violation dialog พร้อมจบ session
5. ตรวจว่ามีแถวใน `usage_violations`

ข้อมูล violation ที่ Agent ส่ง:

```text
POST /agent/log-violation
session_id, program_name, reason, action_taken
```

## Query ตรวจผลใน Supabase

### ตรวจ session และ device identity

```sql
select
    l.id as session_id,
    l.user_id,
    l.lab_id,
    l.entry_time,
    l.exit_time,
    l.device_used,
    l.device_mac
from public.lab_access_logs l
order by l.id desc
limit 20;
```

### ตรวจการใช้โปรแกรมและเชื่อมกับ session

```sql
select
    p.id,
    p.lab_access_log_id as session_id,
    l.user_id,
    l.device_used,
    l.device_mac,
    p.program_name,
    p.usage_start_time,
    p.usage_end_time,
    p.duration_seconds
from public.program_usage_logs p
join public.lab_access_logs l on l.id = p.lab_access_log_id
order by p.id desc
limit 50;
```

> `lab_access_logs` เป็นแหล่งข้อมูลหลักของเครื่องในระดับ session ส่วน `program_usage_logs.device_name/device_mac` ยังเก็บไว้เพื่อรองรับข้อมูลเก่าและ compatibility ของ Agent รุ่นเดิม

### ตรวจ violation

```sql
select
    v.id,
    v.lab_access_log_id as session_id,
    l.user_id,
    v.program_name,
    v.reason,
    v.action_taken,
    v.detected_at
from public.usage_violations v
join public.lab_access_logs l on l.id = v.lab_access_log_id
order by v.id desc
limit 50;
```

## เกณฑ์ผ่านสำหรับการส่งต่องาน

- Backend เปิดได้และ `/docs` แสดง route ของ Agent และ Gatekeeper
- Supabase มี `usage_violations` และ `lab_access_logs.device_mac`
- Agent สร้าง session ที่มี `user_id`, `device_used`, `device_mac`
- Session ปกติจบด้วย `session_status = completed` และมี `end_reason`
- Session ที่ Agent หยุดส่ง Heartbeat ถูกปิดเป็น `abandoned`
- Agent บันทึกโปรแกรมอย่างน้อย 1 รายการและเชื่อมด้วย `lab_access_log_id`
- การเปิดโปรแกรมใน blacklist สร้าง violation และจบ session
- Gatekeeper โหลด model และแยก real face/spoof ได้ในสภาพแสงที่เหมาะสม
- การทดสอบ local ใช้ `DEBUG_MODE = True` เท่านั้น และห้ามนำ password, API key หรือ Database URL จริงใส่ใน README/Git

## ตรวจสอบก่อนส่งงาน

```powershell
git status --short
git diff --check
cd frontend
npm run lint
npm run build
```

การ Push Git ไม่ได้แปลว่า Hugging Face จะ deploy ใหม่เสมอไป ต้องตรวจ Deployment ของ Space และเรียก `/openapi.json` หลัง deploy เพื่อยืนยันว่า Backend ใช้ source code ล่าสุด

## โครงสร้างสำคัญ

```text
backend/
  main.py
  models.py
  routers/agent.py
  routers/gatekeeper.py
  migrations/
frontend/
smart-lab-agent/
  agent.pyw
gatekeeper/
  smart_gatekeeper.py
  Silent-Face-Anti-Spoofing/
```
