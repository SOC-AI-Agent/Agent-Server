# Database Schema — LLM_Server

Database: **PostgreSQL**
สร้างจาก [`script/create_db.py`](script/create_db.py) (schema อ้างอิงจาก [`script/draw-erd.txt`](script/draw-erd.txt))

ระบบนี้ใช้สำหรับให้บริการ LLM ผ่าน "agent" ที่แต่ละตัวมี system prompt และ config การ generate ของตัวเอง แล้วบันทึก log ทุกครั้งที่มีการเรียกใช้งาน (inference)

---

## ภาพรวมความสัมพันธ์ระหว่างตาราง

```
users ───────────┐
                 │ owner_id
                 ▼
llm_models ───► agents ───► agent_prompts ───┐
                 │                            │
                 │ (1:1)                      │
                 ▼                            ▼
            agent_configs              inference_requestss
                                              ▲       ▲
                                              │       │
                                       model_id       api_client_id
                                    (→ llm_models)   (ยังไม่มีตาราง api_clients)
```

---

## ตาราง

### 1. `users`
เก็บข้อมูลบัญชีผู้ใช้ของระบบ (เช่น เจ้าของ/ผู้ดูแล agent ต่าง ๆ)

| คอลัมน์ | คำอธิบาย |
|---|---|
| `id` | UUID, primary key |
| `username`, `email` | ต้อง unique ทั้งคู่ |
| `password` | เก็บ password (ควรเป็นค่าที่ hash แล้ว) |
| `is_active` | เปิด/ปิดการใช้งานบัญชี |
| `created_at`, `updated_at` | timestamp มาตรฐาน |

ใช้เป็นเจ้าของ (`owner_id`) ของตารางeach `agents`

---

### 2. `llm_models`
เก็บรายชื่อ "โมเดล LLM" ที่ระบบรองรับ/พร้อมใช้งาน เช่น `llama3.1:8b`, `qwen3:8b`, `mistral:7b` และ provider ที่รันโมเดลนั้น เช่น `ollama`, `vllm`, `llama.cpp`, `openai-compatible`

| คอลัมน์ | คำอธิบาย |
|---|---|
| `name` | ชื่อที่ใช้แสดงผล |
| `model_name` | ชื่อโมเดลจริงตามที่ provider เรียก |
| `provider` | ผู้ให้บริการ/runtime ที่ใช้รันโมเดล |
| `is_active` | โมเดลนี้ยังใช้งานได้อยู่หรือไม่ |

ใช้เป็นค่า default โมเดลของ `agents.model_id` และถูกอ้างอิงตรงใน `inference_requests.model_id` เพื่อบันทึกว่า request นั้น ๆ ใช้โมเดลอะไรจริง (เผื่อ agent เปลี่ยนโมเดล default ในภายหลัง)

---

### 3. `agents`
หัวใจของระบบ — คือ "แชทบอท/เอเจนต์" แต่ละตัวที่เปิดให้เรียกใช้งานผ่าน API เช่น agent ชื่อ `customer-support`

| คอลัมน์ | คำอธิบาย |
|---|---|
| `slug` | ตัวระบุสาธารณะที่ใช้เรียกผ่าน API (unique) |
| `name`, `description` | ชื่อและคำอธิบาย agent |
| `owner_id` | ผู้ใช้ที่เป็นเจ้าของ agent (FK → `users`) |
| `model_id` | โมเดลที่ agent นี้ใช้เป็นค่าเริ่มต้น (FK → `llm_models`) |
| `is_active` | agent เปิดใช้งานอยู่หรือไม่ |

---

### 4. `agent_prompts`
เก็บ **ประวัติ system prompt** ของแต่ละ agent แบบมี versioning เพื่อให้ track ได้ว่าตอนยิง request แต่ละครั้งใช้ prompt เวอร์ชันไหน และ rollback/สลับ prompt ได้โดยไม่ทำลายของเดิม

| คอลัมน์ | คำอธิบาย |
|---|---|
| `agent_id` | agent เจ้าของ prompt นี้ (FK → `agents`) |
| `version` | เลขเวอร์ชันของ prompt (unique ร่วมกับ `agent_id`) |
| `system_prompt` | เนื้อหา system prompt |
| `is_active` | prompt เวอร์ชันนี้เป็นเวอร์ชันที่ใช้งานอยู่ปัจจุบันหรือไม่ |

หนึ่ง agent มีได้หลาย prompt (หลายเวอร์ชัน) — index `(agent_id, version)` unique และ `(agent_id, is_active)` ไว้ query หา prompt ที่ active เร็ว ๆ

---

### 5. `agent_configs`
เก็บ **พารามิเตอร์การ generate** (generation parameters) ของแต่ละ agent — ความสัมพันธ์แบบ 1:1 กับ `agents` (agent หนึ่งตัวมี config ชุดเดียว)

| คอลัมน์ | คำอธิบาย |
|---|---|
| `temperature` | ความสุ่มของคำตอบ (0.0 - 2.0) |
| `max_tokens` | จำนวน token สูงสุดที่ generate |
| `top_p` | probability sampling (0.0 - 1.0) |
| `top_k` | top-k sampling |
| `context_window` | ขนาด context window สูงสุด |
| `repetition_penalty` | ค่าปรับโทษการพูดซ้ำ |
| `seed` | random seed สำหรับผลลัพธ์ที่ reproducible |
| `streaming_enabled` | ตอบกลับแบบ stream หรือไม่ |
| `extra_config` | พารามิเตอร์เฉพาะโมเดล/runtime เพิ่มเติม (JSON) เช่น `min_p`, `repeat_last_n` |

---

### 6. `inference_requests`
**Log การเรียกใช้งาน LLM ทุกครั้ง** ผ่าน agent — เก็บทั้ง request/response, การใช้ token, performance และสถานะ เพื่อใช้ตรวจสอบย้อนหลัง, debug, และวิเคราะห์การใช้งาน/ค่าใช้จ่าย

| คอลัมน์ | คำอธิบาย |
|---|---|
| `agent_id` | agent ที่ถูกเรียก (FK → `agents`) |
| `prompt_id` | prompt เวอร์ชันที่ใช้จริงตอนยิง request นี้ (FK → `agent_prompts`) |
| `model_id` | โมเดลที่ใช้จริงตอนยิง request นี้ (FK → `llm_models`) |
| `api_client_id` | ผู้เรียก API (ยังไม่มีตาราง `api_clients` รองรับ — คอมเมนต์ไว้ใน ERD ว่าเป็นแผนในอนาคต) |
| `user_prompt` | ข้อความ/prompt ที่ผู้ใช้ส่งเข้ามา |
| `assistant_response` | คำตอบที่โมเดล generate ออกมา |
| `input_tokens`, `output_tokens`, `total_tokens` | จำนวน token ที่ใช้ไป |
| `latency_ms` | เวลาที่ใช้ในการตอบสนอง (มิลลิวินาที) |
| `status` | สถานะของ request เช่น success/error |
| `error_message` | ข้อความ error (ถ้ามี) |

Index ไว้ที่ `agent_id`, `prompt_id`, `model_id`, `api_client_id`, `created_at`, `status` เพื่อรองรับการ query log ตามช่วงเวลา/agent/สถานะได้เร็ว

---

## หมายเหตุ

- ตาราง `api_clients` ถูกอ้างอิงไว้ใน `inference_requests.api_client_id` และมี comment ไว้ใน [`draw-erd.txt`](script/draw-erd.txt) ว่าจะมี FK ไปยัง `users` แต่ **ยังไม่ถูกสร้างจริง** ใน [`create_db.py`](script/create_db.py) — คอลัมน์นี้จึงยังไม่มี foreign key constraint
- ทุกตารางใช้ `uuid` เป็น primary key และสร้างด้วย extension `pgcrypto` (`gen_random_uuid()`)
