# POS ฉุกเฉิน (Emergency POS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างโปรแกรม Electron สำหรับขายต่อฉุกเฉินเมื่อ Sea & Hill POS ใช้ไม่ได้ เก็บบิลลงดิสก์ แล้วพิมพ์บาร์โค้ดของบิลเข้า POS หลักทีหลัง

**Architecture:** ตรรกะทั้งหมด (คำนวณบิล, CSV, ใบเสร็จ, state machine, สรุป) เป็นโมดูล CommonJS บริสุทธิ์ใน `src/shared/` ทดสอบด้วย `node --test` โดยไม่ต้องเปิด Electron; `src/main/` เป็นชั้นบางที่ต่อกับ fs / เครื่องพิมพ์ / PowerShell; renderer เป็น HTML/CSS/JS ธรรมดา เรียก `window.api` ผ่าน preload

**Tech Stack:** Electron (รุ่นปัจจุบัน), Node `node:test`, electron-builder, PowerShell 5.1 (`.ps1` สำหรับตัวพิมพ์), ไม่มี UI framework

**Spec:** `docs/EMERGENCY-POS-SPEC.md` (Task 1 Step 1 คัดลอกสเปกจาก Boss เข้า repo)

## Global Constraints

- โปรเจกต์ใหม่แยก repo ที่ `D:\Claude\emergency-pos` ไม่รวมกับ POS Hero / pos-lan
- Electron: `contextIsolation: true`, `nodeIntegration: false`, สื่อสารผ่าน preload + IPC; `requestSingleInstanceLock`
- UI ภาษาไทยทั้งหมด ตัวใหญ่ ปุ่มใหญ่; HTML/CSS/JS ธรรมดา ไม่ใช้ framework
- ข้อมูลใน `app.getPath('userData')`: `settings.json`, `products.json`, `bills/YYYY-MM-DD.json`, `backup/` (ทุกครั้งที่ปิด + ทุก 30 นาที เก็บ 30 วัน)
- เขียนไฟล์แบบ atomic (temp + rename); **บันทึกบิลก่อนสั่งพิมพ์ใบเสร็จเสมอ**
- ใบเสร็จ: ไม่มี `เลขที่:` ไม่มีบาร์โค้ดท้ายใบ ไม่เพิ่มข้อความนอกสเปก; วันที่ `DD-MM-YYYY@HH:mm` ปี พ.ศ.; ชื่อร้านค่าเริ่มต้น `UNG LUK SENG`
- ตัวพิมพ์: `SendInput` + `KEYEVENTF_UNICODE`, Enter = `VK_RETURN` ห้ามเปลี่ยนวิธีส่งคีย์; หน่วงเริ่มต้น 600 ms; `BlockInput(false)` ใน `finally`; หน้าต่าง `*Sea And Hill POS*`
- `requestedExecutionLevel: requireAdministrator`
- `method`: `cash|transfer|gov`; `status`: `pending|sending|typed|confirmed|flagged|void`
- ไม่ทำ: สมาชิก/แต้ม/โปรโมชั่น, ทศนิยมจำนวน, VAT แยก, ตัดสต็อก, sync อัตโนมัติ
- ห้ามรัน `npx electron .` จาก source เพื่อทดสอบ (build-gotchas) ใช้ unit test + `npm run harness:ui` (เปิด renderer ใน browser ด้วย mock `window.api`); ทดสอบบน Electron จริงทำกับ exe ที่ build แล้วที่ร้าน
- C: เกือบเต็ม: ถ้า build พัง I/O แปลก ๆ ให้เช็คที่ว่าง/ล้าง npm cache; ไฟล์ที่มีภาษาไทยสร้างด้วย Write tool ไม่ใช้ heredoc
- แต่ละขั้น (Stage) จบด้วยเกณฑ์ผ่านของ Boss ที่ร้าน **ห้ามเริ่ม Stage ถัดไปจนกว่า Boss ยืนยัน**

## Review Focus

1. บาร์โค้ดใน Sheet ถูกแปลงเป็นตัวเลข (เลข 0 นำหน้าหาย / `8.85E+12`) → ยิงแล้วไม่พบ; ควรเทียบแบบตัดศูนย์นำหน้า และไม่รับ scientific notation เงียบ ๆ (Task 2)
2. CSV มี BOM, CRLF, เครื่องหมายคำพูด/คอมมาในชื่อไทย, ราคาเป็น `1,250.00` หรือว่าง → ต้องอ่านได้ ข้ามแถวราคาว่างโดยไม่ล่ม (Task 2)
3. โปรแกรมถูกปิด/ไฟดับขณะบิลเป็น `sending` → เปิดใหม่ต้องกลับเป็น `pending` คง `sentCount` และเตือนให้ตรวจบาร์โค้ดสุดท้ายใน POS หลัก (Task 11)
4. ขายคาบเกี่ยวเที่ยงคืน → วันของบิลคือเวลาที่กดยืนยันรับเงิน, `seq` รีเซ็ตตามวัน (Task 4)
5. ส่วนลดมากกว่ายอดรายการ / จำนวน 0 หรือติดลบ / ยอดบิล 0 → ปฏิเสธหรือจำกัด ไม่ให้ยอดติดลบ (Task 1, 6)

---

# Stage 1 — หน้าขายและการเก็บบิล

### Task 1: โครงโปรเจกต์ + คำนวณบิล/รับเงิน

**Files:**
- Create: `package.json` (scripts: `test` = `node --test test/`, `harness:ui`), `.gitignore`, `docs/EMERGENCY-POS-SPEC.md`
- Create: `src/shared/bill.js`
- Test: `test/bill.test.js`

**Interfaces:**
- Produces:
  - `round2(n:number):number`
  - `lineTotal({price,qty,discount}):number` — `round2(price*qty - discount)`, ไม่ต่ำกว่า 0
  - `billTotal(lines):number`
  - `validatePayments(total:number, {cash,transfer,gov}:Record<string,number>) -> {ok:true, payments:[{method,amount}], change:number} | {ok:false, error:string}` กติกา 6.3: โอน+รัฐ ≤ total; ผลรวม ≥ total; change = ผลรวม − total (ทอนจากเงินสดเท่านั้น); ช่องที่ 0 ไม่ใส่ใน payments

- [ ] **Step 1:** `git init` ใน `D:\Claude\emergency-pos`, บันทึกสเปกที่ได้รับเป็น `docs/EMERGENCY-POS-SPEC.md` (Write tool), สร้าง `package.json` ด้วย electron + electron-builder เป็น devDependencies
- [ ] **Step 2: เขียนเทสต์ที่ล้มเหลว** ใน `test/bill.test.js`:
  - `validatePayments(58,{cash:500})` → `{ok:true,change:442,payments:[{method:'cash',amount:500}]}`
  - `validatePayments(100,{cash:50,transfer:50})` → ok, change 0
  - `validatePayments(100,{transfer:120})` → `ok:false` (โอนเกินยอด)
  - `validatePayments(100,{gov:60,cash:30})` → `ok:false` (ผลรวมน้อยกว่า)
  - `validatePayments(100,{gov:40,transfer:30,cash:100})` → ok, change 70
  - `lineTotal({price:10,qty:3,discount:50})` → 0 (ไม่ติดลบ)
  - `round2(0.1+0.2)` → 0.3
- [ ] **Step 3:** รัน `npm test` ต้อง FAIL (module not found)
- [ ] **Step 4:** implement `src/shared/bill.js` ตาม Interfaces (คำนวณเป็นสตางค์จำนวนเต็มเพื่อเลี่ยง float)
- [ ] **Step 5:** รัน `npm test` ต้อง PASS
- [ ] **Step 6:** `git commit -m "feat: scaffold and bill math"`

### Task 2: อ่าน CSV, เดาคอลัมน์, ดัชนีสินค้า

**Files:**
- Create: `src/shared/csv.js`, `src/shared/products.js`
- Test: `test/csv.test.js`, `test/products.test.js`, `test/fixtures/sheet-sample.csv`

**Interfaces:**
- Produces:
  - `parseCsv(text:string):string[][]` — ตัด BOM, รองรับ CRLF, quoted field, คอมมา/ขึ้นบรรทัดใน quote
  - `guessColumns(headers:string[]) -> {barcode:number,name:number,unit:number,price:number}` (ดัชนีคอลัมน์, `-1` ถ้าไม่พบ); กติกา: `barcode|บาร์โค้ด|รหัส` / `ชื่อ|name` / `หน่วย|unit` / `ราคาขาย|ราคา|price` โดยไม่เอาหัวที่มี `ทุน|cost`
  - `normalizeBarcode(s:string):string` — trim, ตัด `'` นำหน้า; ถ้าเป็น scientific notation คืน `''` (ถือว่าใช้ไม่ได้)
  - `buildIndex(rows:string[][], map) -> {byBarcode:Map<string,Product>, count:number, duplicates:number}` ใช้แถวแรกเมื่อซ้ำ; ราคาแปลง `1,250.00`→1250; ข้ามแถวบาร์โค้ดว่างหรือราคาไม่ใช่ตัวเลข
  - `findByBarcode(index, code) -> Product|null` — ลองเทียบตรง ๆ ก่อน แล้วเทียบแบบตัดศูนย์นำหน้า
  - `searchByName(index, q:string, limit=30):Product[]`
  - `Product = {barcode,name,unit,price}`

- [ ] **Step 1: ดู Sheet จริงก่อน:** ดาวน์โหลด URL ในสเปกหัวข้อ 4 (ตาม redirect) ไปไว้ `test/fixtures/sheet-sample.csv` (ตัดเหลือ ~20 แถวหลังตรวจ) แล้ว **รายงานหัวคอลัมน์จริงให้ Boss** (ข้อ 3 ของหัวข้อ 10) ถ้า `guessColumns` เดาไม่ถูก ให้ปรับกติกาและบอก Boss
- [ ] **Step 2: เทสต์ที่ล้มเหลว:** BOM+CRLF; ชื่อมี `"ปลา, กระป๋อง"`; `guessColumns` กับหัวจริงจาก fixture และหัวสมมติที่มีคอลัมน์ `ราคาทุน` ต้องไม่ถูกเลือกเป็นราคา; ราคา `"1,250.00"`→1250; `0885000` กับ `885000` ค้นเจอทั้งคู่; `8.85E+12` ถูกข้าม; บาร์โค้ดซ้ำ→`duplicates===1` และคืนแถวแรก; `searchByName` คืนไม่เกิน 30
- [ ] **Step 3:** รันให้ FAIL → implement → รันให้ PASS
- [ ] **Step 4:** commit `feat: csv parsing and product index`

### Task 3: ดาวน์โหลดสินค้า + สำเนาในเครื่อง

**Files:**
- Create: `src/main/products-store.js`
- Test: `test/products-store.test.js`

**Interfaces:**
- Consumes: Task 2 (`parseCsv`, `guessColumns`, `buildIndex`), Task 4 (`atomicWriteJson`)
- Produces:
  - `fetchText(url:string, maxRedirects=5):Promise<string>` (ใช้ `node:https`, ตาม 302)
  - `refreshProducts({url, dir, columnMap?, fetchText}) -> Promise<{ok:boolean, count:number, updatedAt:string|null, error?:string}>` สำเร็จ → เขียน `products.json` (`{updatedAt, rows, map}`); ล้มเหลว → ไม่แตะสำเนาเดิม ไม่ throw
  - `loadProducts(dir) -> {index, updatedAt, stale:boolean}|null` (`stale` = เก่ากว่า 3 วัน)

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** เซิร์ฟเวอร์ `http` ในเทสต์ตอบ 302→200 CSV, `fetchText` ได้เนื้อหา; `refreshProducts` ที่ fetch throw → ผล `ok:false` และ `products.json` เดิมไม่เปลี่ยน; `loadProducts` กับ `updatedAt` 4 วันก่อน → `stale:true`
- [ ] **Step 2:** FAIL → implement → PASS (ถ้า dependency Task 4 ยังไม่มี ให้ทำ Task 4 ก่อน; ลำดับจริง 1→2→4→3)
- [ ] **Step 3:** commit `feat: product download with offline copy`

### Task 4: ที่เก็บข้อมูล atomic, บิลรายวัน, สำรอง

**Files:**
- Create: `src/main/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces:
  - `atomicWriteJson(file:string, data:any):void` — เขียน `file.tmp` (fsync) แล้ว `renameSync`
  - `loadSettings(dir)/saveSettings(dir, s)`; ค่าเริ่มต้น `{machineId:'POS02', staff:[], shopName:'UNG LUK SENG', productsUrl:<URL สเปก>, columnMap:null, printer:'', delayMs:600, windowLike:'*Sea And Hill POS*'}`
  - `saveBill(dir, bill) -> bill` — ถ้าไม่มี `seq` ให้กำหนด max(seq ของวันนั้น)+1; วันที่ใช้ `createdAt` (เวลาที่บันทึก)
  - `updateBill(dir, date, seq, patch):bill`
  - `listBills(dir, date):Bill[]`, `listPending(dir):Bill[]` (ไม่ใช่ confirmed/void, เรียงเก่า→ใหม่)
  - `recoverSending(dir):number` — บิล `sending` ทั้งหมดกลับเป็น `pending` (ใช้ตอนเปิดโปรแกรม)
  - `makeBackup(dir, now:Date)` คัดลอก `bills/` ไป `backup/<timestamp>/` และลบที่เก่ากว่า 30 วัน

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** เหลือ `x.json.tmp` ค้างจากไฟดับ → `listBills` ยังอ่านไฟล์จริงได้; seq 1,2,3 ต่อเนื่องและรีเซ็ตเป็น 1 ในวันถัดไป (`createdAt` 23:59 กับ 00:01); `recoverSending` เปลี่ยน sending→pending โดยคง `sentCount`; backup เก่า 31 วันถูกลบ ของ 29 วันอยู่
- [ ] **Step 2:** FAIL → implement → PASS → commit `feat: atomic store and backups`

### Task 5: Electron shell, IPC, เลือกพนักงาน, หน้าตั้งค่า

**Files:**
- Create: `src/main/main.js`, `src/main/preload.js`, `src/main/ipc.js`, `src/renderer/index.html`, `src/renderer/style.css`, `src/renderer/app.js`, `src/renderer/settings.js`, `tools/harness-ui.js`
- Test: `test/ipc-contract.test.js`

**Interfaces:**
- Produces: `window.api` (preload) — `getSettings()`, `saveSettings(s)`, `getProductsStatus() -> {count,updatedAt,stale}`, `refreshProducts()`, `findByBarcode(code)`, `searchByName(q)`, `saveBill(bill)`, `listPending()`, `listPrinters()`, `openDataFolder()`; ชื่อ channel รวมเป็นค่าคงที่ใน `src/main/ipc.js` (`CHANNELS`) เทสต์ตรวจว่าทุก channel มี handler และปรากฏใน preload
- เปิดโปรแกรม: โหลดสำเนาสินค้าทันที, สั่ง `refreshProducts` เบื้องหลังโดยไม่ขวางหน้าขาย; เรียก `recoverSending`; ตั้ง `setInterval` สำรอง 30 นาที และสำรองตอน `before-quit`
- `tools/harness-ui.js`: เปิด `src/renderer/index.html` ใน browser เริ่มต้นพร้อม mock `window.api` ที่เก็บใน memory (ใช้ตรวจ UI โดยไม่เปิด Electron)

- [ ] **Step 1:** เขียน `ipc-contract.test.js` (ล้มเหลวเพราะไม่มี `CHANNELS`) → implement ipc/preload/main → PASS
- [ ] **Step 2:** หน้าเลือกพนักงาน (รายการจาก settings, ว่างให้เพิ่มชื่อ) + หน้าตั้งค่าตามหัวข้อ 6.11 เฉพาะรายการที่ใช้ใน Stage 1 (รหัสเครื่อง, พนักงาน, ชื่อร้าน, URL, จับคู่คอลัมน์, ปุ่มเปิดโฟลเดอร์ข้อมูล); ช่องอื่นเพิ่มใน Task ที่เป็นเจ้าของ
- [ ] **Step 3:** `npm run harness:ui` เปิดดูด้วยตา ตรวจฟอนต์ไทย/ปุ่มใหญ่ (ใช้ skill `thai-ui-review`)
- [ ] **Step 4:** commit `feat: electron shell, staff picker, settings`

### Task 6: หน้าขาย + เพิ่มสินค้าเอง + หน้ารับเงิน

**Files:**
- Create: `src/shared/cart.js`, `src/renderer/sell.js`, `src/renderer/pay.js`
- Test: `test/cart.test.js`

**Interfaces:**
- Consumes: Task 1 (`lineTotal`, `billTotal`, `validatePayments`), `window.api` จาก Task 5
- Produces ใน `cart.js` (ฟังก์ชันบริสุทธิ์ คืน cart ใหม่ ไม่แก้ของเดิม):
  - `addProduct(cart, product, qty=1)` — ถ้าบาร์โค้ดเดิมมีอยู่และ `priceEdited===false` ให้บวกจำนวน
  - `addManual(cart, {barcode?, name, price, qty})` — `manual:true`, ต้อง `price>=0`, `qty` เป็นจำนวนเต็ม ≥1
  - `setQty(cart, idx, qty)` (จำนวนเต็ม ≥1 มิฉะนั้นไม่เปลี่ยน), `setPrice(cart, idx, price)`, `setDiscount(cart, idx, baht)` (จำกัดไม่เกิน `price*qty`), `removeLine(cart, idx)` — แก้ราคา/ส่วนลดตั้ง `priceEdited:true`; `listPrice` คงราคาเดิม
  - `cartSummary(cart) -> {total, itemCount, pieceCount}`
  - `toBill(cart, {machine, cashier, now:Date, payments, change}) -> Bill` ตามรูปแบบหัวข้อ 5, `status:'pending'`, `sentCount:0`

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** ยิงซ้ำบาร์โค้ดเดิม→qty 2 บรรทัดเดียว; ยิงหลังแก้ราคา→เพิ่มบรรทัดใหม่; `setDiscount` เกินยอด→ถูกจำกัด; `setQty(cart,0,0)` ไม่เปลี่ยน; `addManual` ตั้ง `manual:true` และเก็บบาร์โค้ดที่ยิง; `toBill` ได้ `total` ตรงกับ `billTotal`
- [ ] **Step 2:** FAIL → implement `cart.js` → PASS
- [ ] **Step 3:** ต่อ UI: ช่องยิงบาร์โค้ดรับโฟกัสหลังทุกการกระทำ; Enter ที่เป็นบาร์โค้ด→ค้น, ข้อความอื่น→ค้นชื่อ (≤30 รายการให้เลือก); ไม่พบ→กล่อง "เพิ่มสินค้าเอง"; แสดงยอดรวมใหญ่/จำนวนรายการ/ชิ้น; F11 เปิดหน้ารับเงิน; ล้างบิลต้องยืนยัน; แถบสถานะตามหัวข้อ 6.2 (สินค้าเก่ากว่า 3 วันเป็นสีเตือน)
- [ ] **Step 4:** หน้ารับเงิน: สามช่อง + ปุ่ม "เงินสดพอดี" / "โอนเต็มจำนวน" ใช้ `validatePayments`; ยืนยัน→`api.saveBill` แล้วเริ่มบิลใหม่ (ยังไม่พิมพ์ใน Stage นี้)
- [ ] **Step 5:** ตรวจใน `harness:ui`; commit `feat: sell screen and payment`

### 🚦 Gate Stage 1 (Boss ทดสอบที่ร้าน)

build exe ตาม Task 15 แบบ unpacked เบื้องต้น แล้วให้ Boss ตรวจ: ถอดสายเน็ตแล้วเปิดขายได้; ปิดโปรแกรมกลางบิลที่รับเงินแล้วเปิดใหม่บิลยังอยู่; ยิงบาร์โค้ดที่ไม่มีแล้วเพิ่มเองได้ **และถามข้อ 1–3 ของหัวข้อ 10** (รหัสเครื่อง POS ที่สอง, รายชื่อพนักงาน, หัวคอลัมน์)

---

# Stage 2 — ใบเสร็จและลิ้นชัก

### Task 7: ตัวสร้างใบเสร็จ

**Files:**
- Create: `src/shared/receipt.js`, `src/shared/thaidate.js`
- Test: `test/receipt.test.js`

**Interfaces:**
- Produces:
  - `formatThaiDate(d:Date):string` → `12-11-2569@16:20`
  - `buildReceipt(bill, {shopName}) -> {lines:Array<{kind:'center'|'row'|'item'|'rule'|'bold'|'text', ...}>, text:string}` (`text` = รูปข้อความล้วนกว้าง 42 ตัวอักษรใช้เทสต์)
  - `renderReceiptHtml(receipt):string` (หน้า HTML 80 มม. สำหรับพิมพ์)
  - `renderSummaryHtml` ทำใน Task 13

- [ ] **Step 1: เทสต์ที่ล้มเหลว (golden):** บิลตัวอย่างจากสเปก (อะยัม แมคเคอเรล 58.00 x1, เงินสด 500) ต้องได้ `text` ตรงกับตัวอย่างหัวข้อ 6.4 ทุกบรรทัด; ทุกกรณีต้อง **ไม่มี** `เลขที่` และไม่มีบาร์โค้ด; จ่ายผสมเงินสด+โอนได้บรรทัด `ชำระด้วยเงินสด` และ `ชำระด้วยเงินโอน` ตามด้วย `เงินทอน` เฉพาะเมื่อมีเงินสด; จ่ายโอนล้วนไม่มีบรรทัดเงินทอน; รายการมีส่วนลดมีบรรทัด `ส่วนลด` ยอดติดลบ; บรรทัดสรุป `3 รายการ 5.00 ชิ้น`; ชื่อยาวเกินกว้างต้องตัดบรรทัดไม่ทับยอดเงิน
- [ ] **Step 2:** FAIL → implement → PASS → commit `feat: receipt builder`

### Task 8: พิมพ์เงียบ + เปิดลิ้นชัก + พิมพ์ซ้ำ

**Files:**
- Create: `src/main/print.js`
- Modify: `src/main/ipc.js` (เพิ่ม `printReceipt`, `printTest`), `src/renderer/pay.js`, `src/renderer/settings.js` (เลือกเครื่องพิมพ์ + ปุ่มพิมพ์ทดสอบ)
- Test: `test/print-order.test.js`

**Interfaces:**
- Produces:
  - `confirmAndPrint({bill, saveBill, printReceipt}) -> Promise<{saved:Bill, printed:boolean, error?:string}>` — **ต้องเรียก `saveBill` สำเร็จก่อน `printReceipt`**; ถ้า print ล้มเหลวบิลยังอยู่ ผลคืน `printed:false`
  - `printHtml(html, deviceName):Promise<void>` ใช้ `BrowserWindow` ซ่อน + `webContents.print({silent:true, deviceName})`
  - `openDrawerRaw(deviceName)` (ESC `p` 0 ผ่าน raw) ใช้เป็นแผนสำรองเท่านั้น; ทางหลักคือตั้งค่าไดรเวอร์

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** fake `saveBill`/`printReceipt` บันทึกลำดับเรียก → `['save','print']`; `saveBill` throw → ไม่เรียก print; `printReceipt` throw → `printed:false` และ `saved` มีค่า
- [ ] **Step 2:** FAIL → implement → PASS
- [ ] **Step 3:** ต่อ UI: หลังยืนยันรับเงินพิมพ์อัตโนมัติ, ล้มเหลวแสดงปุ่ม "พิมพ์ซ้ำ"
- [ ] **Step 4:** commit `feat: silent receipt printing`

### 🚦 Gate Stage 2

Boss วางใบเสร็จฉุกเฉินเทียบใบจริง (ไม่มีเลขที่/บาร์โค้ด) ตรงทุกบรรทัด; จ่ายผสมแล้วบรรทัดชำระถูก; ลิ้นชักเปิด; **ขอใบเสร็จจริงที่มีส่วนลดและที่จ่ายโอน/โครงการรัฐ** (หัวข้อ 10 ข้อ 4) แล้วปรับ golden test ให้ตรง

---

# Stage 3 — ส่งเข้า POS หลัก

### Task 9: สคริปต์ `pos-type.ps1`

**Files:**
- Create: `resources/pos-type.ps1`
- Test: `test/pos-type-protocol.test.js`

**Interfaces:**
- Produces: `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File pos-type.ps1 -ListFile <path> -DelayMs <int> -WindowLike <pattern> [-DryRun]`
  - stdout ทีละบรรทัด: `TYPED <n> <barcode>`, `STOPPED <n> <reason>`, `DONE <total>`; exit code 0 เมื่อ DONE, 2 เมื่อ STOPPED
  - `-DryRun`: ข้ามการหาหน้าต่าง/BlockInput/SendInput แต่ปล่อยโปรโตคอลเดิมเพื่อเทสต์ (ไม่เปลี่ยนโค้ดส่งคีย์)
- โค้ด `KeyTyper` (Add-Type C#), การตรวจ `GetForegroundWindow` ก่อนทุกบาร์โค้ด, `SetForegroundWindow` + หน่วง 800 ms, `Text` หน่วง 15 ms/ตัว, หน่วง 80 ms ก่อน Enter และ `$DelayMs` หลัง Enter **คัดลอกจากภาคผนวก A ไม่ดัดแปลง** ส่วนที่เปลี่ยนมีแค่: อ่านรายการจาก `-ListFile`, ตัด `Read-Host`/`Write-Host` ที่รอคน, พิมพ์ผลตามโปรโตคอล, `BlockInput(false)` ใน `finally`

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** รันด้วย `-DryRun` กับ ListFile 3 บรรทัด → stdout ตรง `TYPED 1 a`…`DONE 3`; ListFile ว่าง→`STOPPED 0 ...`; หน้าต่างไม่พบ (ไม่ใช้ DryRun, pattern ที่ไม่มี) → `STOPPED 0 window-not-found` และไม่ block input
- [ ] **Step 2:** FAIL → เขียนสคริปต์ → PASS → commit `feat: pos-type.ps1 with stream protocol`

### Task 10: ตัวห่อ typer ใน main process

**Files:**
- Create: `src/main/typer.js`, `src/shared/sendlist.js`
- Test: `test/sendlist.test.js`, `test/typer.test.js`, `test/fixtures/fake-typer.js`

**Interfaces:**
- Produces:
  - `buildBarcodeList(bill) -> string[]` — เฉพาะ `manual:false`, ซ้ำตาม `qty`, ตามลำดับรายการ
  - `remainingFrom(list, sentCount) -> string[]`
  - `timeoutMs(count, delayMs) = count*(delayMs+500)+10000`
  - `runTyper({list, delayMs, windowLike, script, spawn?, onProgress(n,barcode), onStop(n,reason)}) -> Promise<{done:boolean, typed:number, reason?:string, lastBarcode?:string}>` อ่าน stdout แบบ stream; เกินเวลา→kill process แล้วคืน `reason:'timeout'`; เขียน ListFile ชั่วคราวใน temp แล้วลบเมื่อจบ

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** บิล 2 รายการ qty 3 และ 2 + 1 รายการ manual → list ยาว 5 ไม่มี manual; `remainingFrom(list,2)` ข้าม 2 ตัวแรก; `timeoutMs(10,600)===21000`; `runTyper` กับ `fake-typer.js` ที่ print TYPED ×3 → onProgress 3 ครั้ง done:true; fake ที่ค้างไม่จบ + timeout สั้น → ถูก kill และ `reason:'timeout'`; fake ที่ print STOPPED → done:false พร้อมเหตุผล
- [ ] **Step 2:** FAIL → implement → PASS → commit `feat: typer wrapper with timeout kill`

### Task 11: state machine บิล + หน้าบิลค้างส่ง + ส่ง/ส่งต่อ

**Files:**
- Create: `src/shared/billstate.js`, `src/renderer/pending.js`
- Modify: `src/main/ipc.js` (`sendBill`, `resumeBill`, `listBills`), `src/renderer/index.html`
- Test: `test/billstate.test.js`

**Interfaces:**
- Produces ใน `billstate.js`:
  - `canTransition(from, to):boolean` ตามหัวข้อ 5/6.6/6.8: `pending→sending`, `sending→typed|pending`, `typed→confirmed|flagged|void`, `flagged→void|pending`(ส่งใหม่), `pending→void`; ทุกอย่างอื่นเป็น false
  - `applyProgress(bill, typedCount) -> bill` (ตั้ง `sentCount`)
  - `flagsOf(bill) -> {manual:boolean, priceEdited:boolean}`
- `sendBill(date, seq)` ใน main: เช็คหน้าต่าง→ตั้ง `sending`→`runTyper`→อัปเดต `sentCount` ลงดิสก์ทุกความคืบหน้า→จบ `typed` / หยุด `pending` พร้อมรายงาน (พิมพ์ไปกี่รายการ, บาร์โค้ดสุดท้าย, ปุ่ม "ส่งต่อจากรายการที่เหลือ")
- UI: กล่องยืนยันก่อนส่ง (ข้อความหัวข้อ 6.6 ข้อ 1) และข้อความตลอดการส่งว่าค้างให้กด `Ctrl+Alt+Del`; ตารางเรียงเก่า→ใหม่ พร้อมธง; ตัวกรองบิลที่ส่งแล้ว/ยกเลิก
- เปิดโปรแกรมที่มีบิลที่ `recoverSending` แก้ → แสดงเตือน "ตรวจรายการสุดท้ายใน POS หลักก่อนส่งต่อ" (Review Focus #3)

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** ตารางการเปลี่ยนสถานะทั้งหมด (อนุญาต/ปฏิเสธ), `confirmed→void` ต้องเป็น false; `flagsOf` ของบิลที่มี manual และไม่มี
- [ ] **Step 2:** FAIL → implement → PASS
- [ ] **Step 3:** ต่อ main + UI; ตรวจด้วย `harness:ui` โดย mock `sendBill`
- [ ] **Step 4:** commit `feat: pending bills and send flow`

### Task 12: หน้าต่างเทียบยอด + ยกเลิกบิล

**Files:**
- Create: `src/renderer/reconcile.html`, `src/renderer/reconcile.js`, `src/shared/manualfix.js`
- Modify: `src/main/main.js` (หน้าต่างเล็ก `alwaysOnTop`, วางมุมจอ), `src/renderer/pending.js` (ปุ่มยกเลิก)
- Test: `test/manualfix.test.js`

**Interfaces:**
- Produces: `manualFixList(bill) -> Array<{kind:'edited'|'manual', name, qty, price, discount}>` — ว่างเมื่อไม่มีรายการแก้ราคาและไม่มีรายการคีย์เอง (ส่วน "ต้องแก้ด้วยมือ" ถูกซ่อน)
- `voidBill(dir, date, seq, {by, reason})` ต้องมีเหตุผลไม่ว่าง ใช้ได้กับ `pending|typed|flagged` เท่านั้น

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** บิลมี 1 manual + 1 priceEdited → 2 รายการ; บิลปกติ → `[]`; `voidBill` เหตุผลว่าง → throw; `voidBill` บน confirmed → throw
- [ ] **Step 2:** FAIL → implement → PASS
- [ ] **Step 3:** หน้าต่างเทียบยอดแสดงยอดรวมใหญ่ + ยอดแต่ละช่องทาง + รายการต้องแก้ด้วยมือ; ปุ่ม "ยอดตรง รับเงินแล้ว"→`confirmed`, "ยอดไม่ตรง"+หมายเหตุ→`flagged`
- [ ] **Step 4:** commit `feat: reconcile window and void`

### 🚦 Gate Stage 3 (ต้องทดสอบที่ร้านจริงกับ Sea & Hill)

บิล 10 รายการเข้าครบ ยอดตรง กดรับเงินได้; ขยับเมาส์/กดคีย์ระหว่างส่งแล้วไม่เสีย (ยืนยันว่า `BlockInput` ทำงานเมื่อรันแบบ Administrator); บิลที่มีบาร์โค้ดที่ POS ไม่รู้จักหยุดและส่งต่อได้; **ทดสอบยิงเครื่องยิงบาร์โค้ด USB ระหว่างส่ง แล้วบันทึกผลลงเอกสาร** (สเปกยังไม่รู้ว่า BlockInput กันได้หรือไม่)

---

# Stage 4 — สรุปและแพ็กเกจ

### Task 13: หน้าสรุป + พิมพ์ใบสรุป

**Files:**
- Create: `src/shared/summary.js`, `src/renderer/summary.js`
- Modify: `src/shared/receipt.js` (เพิ่ม `renderSummaryHtml`)
- Test: `test/summary.test.js`

**Interfaces:**
- Produces: `summarize(bills:Bill[]) -> {billCount, sales, cash, transfer, gov, netCash, byCashier:Record<string,{count,sales}>, pending:{count,sales}, sent:{count,sales}, flagged:{count,sales}, void:{count,sales}}` — `void` ไม่นับใน `billCount`/`sales`; `netCash = ผลรวมเงินสดรับ − ผลรวมเงินทอน`; `cash` คือเงินสดที่รับ **ก่อนหักทอน**

- [ ] **Step 1: เทสต์ที่ล้มเหลว:** ชุดบิลมือ 5 ใบ (จ่ายผสม 1, ยกเลิก 1) เทียบยอดที่คำนวณด้วยมือในเทสต์; บิลยกเลิกไม่เข้ายอดขายแต่เข้า `void`
- [ ] **Step 2:** FAIL → implement → PASS → UI เลือกวัน + ปุ่มพิมพ์ → commit `feat: daily summary`

### Task 14: ส่งออก/นำเข้าบิล

**Files:**
- Create: `src/main/transfer.js`
- Modify: `src/main/ipc.js`, `src/renderer/pending.js`
- Test: `test/transfer.test.js`

**Interfaces:**
- Produces:
  - `exportPending(dir, filePath):number` — เขียนบิล `pending|flagged` เป็น `.json` ไฟล์เดียว คืนจำนวน
  - `importBills(dir, filePath) -> {added:number, skipped:number}` — คงรหัสเครื่องต้นทาง; คีย์กันซ้ำ = `machine`+วันที่+`seq`; บิลที่นำเข้ามาไม่ชนกับ `seq` ของเครื่องนี้ (เก็บใน `imported/<machine>/` หรือรวมใน list โดยคีย์รวม machine)
  
- [ ] **Step 1: เทสต์ที่ล้มเหลว:** export 2 บิล → import เข้า dir ใหม่ `added:2`; import ซ้ำ `added:0 skipped:2`; ไฟล์ที่ JSON พัง → throw ข้อความอ่านรู้เรื่อง ไม่แตะข้อมูลเดิม
- [ ] **Step 2:** FAIL → implement → PASS → commit `feat: bill export and import`

### Task 15: แพ็กเกจและส่งมอบ

**Files:**
- Modify: `package.json` (`build` สำหรับ electron-builder: `win.requestedExecutionLevel: "requireAdministrator"`, target nsis หรือ portable, ไอคอน), `build/icon.ico`
- Create: `README.md` (ขั้นตอนติดตั้ง/ใช้งานย่อสำหรับ Boss)

- [ ] **Step 1:** โหลด skills `build-gotchas` และ `release-checklist` ก่อน build; เช็คพื้นที่ C:
- [ ] **Step 2:** `npm test` ผ่านทั้งหมด แล้ว `npx electron-builder --win`
- [ ] **Step 3:** ตรวจว่า exe ที่ได้ขอสิทธิ์ Administrator ตอนเปิด (UAC) และเปิดได้ครั้งละหน้าต่างเดียว
- [ ] **Step 4:** commit `chore: packaging`

### 🚦 Gate Stage 4

ติดตั้งบนเครื่อง POS ทั้งสองจากไฟล์เดียว; ยอดสรุปตรงกับผลรวมบิลที่นับมือ

---

## Self-Review (ทำแล้ว)

- **ครอบคลุมสเปก:** หัวข้อ 4→T2,T3; 5→T4,T5; 6.1→T5; 6.2→T6; 6.3→T1,T6; 6.4→T7,T8; 6.5,6.6→T10,T11; 6.7,6.8→T12; 6.9→T13; 6.10→T14; 6.11→T5 (ฐาน) + T8 (เครื่องพิมพ์) + T11 (หน่วง/ชื่อหน้าต่าง ต้องเพิ่มช่องในหน้าตั้งค่า); 7→T9,T10; 9→Gates
- **ช่องว่างที่ต้องทำใน task เจ้าของ:** ช่อง `หน่วงระหว่างบาร์โค้ด` และ `รูปแบบชื่อหน้าต่าง POS` ในหน้าตั้งค่า เพิ่มใน Task 11 Step 3
- **ชื่อที่ใช้ข้าม task:** `atomicWriteJson`, `saveBill/updateBill/listPending/recoverSending`, `buildBarcodeList`, `runTyper`, `manualFixList`, `summarize` ตรงกันทุกที่
- **ความเสี่ยงที่ยังไม่รู้ (ตามสเปก):** `BlockInput` กับเครื่องยิง USB; รูปแบบใบเสร็จส่วนลด/โอน/โครงการรัฐ; หัวคอลัมน์จริงของ Sheet — ทั้งหมดมีจุดตรวจใน Gate/Task 2
