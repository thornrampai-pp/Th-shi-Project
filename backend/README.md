# Personal Investment Platform — Backend

Backend สำหรับแพลตฟอร์มลงทุนส่วนตัว: จัดการพอร์ต, ธุรกรรมซื้อขาย (double-entry ledger), ข้อมูลตลาด, สรุปผลการลงทุน (TWR), ภาษี, งานวิจัย (Thesis/Watchlist/Alert), คำสั่งซื้อขาย (Paper/Real), อ่านสลิปด้วย Gemini พร้อมจับคู่ธุรกรรมอัตโนมัติ และแจ้งเตือนผ่าน Discord

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | Node.js >= 20.19, TypeScript 6 (strict) |
| API | Express 5 + Apollo Server 5 (`@as-integrations/express5`) |
| GraphQL | Pothos (code-first) |
| Database | PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Cache | Redis (`ioredis`) |
| Market data / FX | Yahoo Finance (`yahoo-finance2` v4, rate-limited ด้วย `p-queue`) |
| Slip OCR | Google Gemini |
| Object storage | Cloudflare R2 (S3 API, `@aws-sdk/client-s3`) — รูปสลิป |
| Notification | Discord (Webhook + Slash Commands) |
| Jobs | `node-cron` |
| Test | Vitest |

## โครงสร้างโปรเจกต์

```
src/
├── config/          env (zod), prisma client, redis client
├── common/
│   ├── errors/      AppError (code → GraphQL extensions.code)
│   ├── middlewares/ auth middleware (สร้าง GraphQL context จาก JWT)
│   ├── utils/       cache, date, image validation, source country, portfolio ownership
│   └── integrations/ yahoo-finance, discord, discord-signature, gemini, r2-storage
├── graphql/         Pothos SchemaBuilder ตัวกลาง
├── jobs/            daily-snapshot.job.ts, market-watch.job.ts
└── modules/
    ├── auth/  user/  notification/  asset/  portfolio/
    ├── ledger/  transaction/  snapshot/  fx/  history/  discord-bot/
    ├── tax/                          Phase 7
    ├── thesis/  watchlist/  alert/   Phase 8
    ├── trading/                      Phase 9 (signal + order)
    └── index.ts     รวม schema ทุก module แล้ว toSchema()
prisma/
├── schema.prisma
└── seed.ts
scripts/
├── register-discord-commands.ts
└── migrate-slip-images-to-r2.ts
docker-compose.yml   Postgres + Redis สำหรับ dev
```

แต่ละ module มี `*.service.ts` (business logic) และ `*.schema.ts` (Pothos: type + resolver) — resolver ไม่มี logic, แค่เรียก service

## เริ่มต้นใช้งาน

### 1. ติดตั้ง

```bash
npm install
cp .env.example .env              # ใส่ JWT secrets (และ key อื่นตามต้องการ)
docker compose up -d --wait       # Postgres + Redis (รอจน healthcheck ผ่าน)
npx prisma generate
npx prisma migrate dev
```

ค่า default ใน `.env.example` ตรงกับ `docker-compose.yml` แล้ว ถ้าในเครื่องมี Postgres/Redis รันที่พอร์ต 5432/6379 อยู่แล้ว ให้เปลี่ยน `POSTGRES_PORT`/`REDIS_PORT` และพอร์ตใน `DATABASE_URL`/`REDIS_URL` ให้ตรงกัน (หรือใช้ของเดิมโดยไม่ต้องรัน compose)

### 2. Seed ข้อมูลทดสอบ (ไม่บังคับ)

```bash
npm run db:seed
```

ได้: user `demo@example.com` (password `password123`), asset AAPL/MSFT/PTT, พอร์ต THB (REAL) และพอร์ต USD (PAPER) พร้อมธุรกรรมตัวอย่าง รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ

Seed เรียก `createTransaction()` ตัวจริง ไม่ insert ตรง จึงใช้เป็น smoke test ของ Ledger/FIFO/avg cost ไปในตัว ค่าที่ควรได้หลัง seed พอร์ต THB: เงินสด 92,322 THB, PTT เหลือ 90 หุ้น avg 36.03, realizedPL 65.00

### 3. รัน

```bash
npm run dev          # http://localhost:4000/graphql
```

## Environment Variables

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | เช่น `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | ✅ | อย่างน้อย 32 ตัวอักษร |
| `JWT_REFRESH_SECRET` | ✅ | อย่างน้อย 32 ตัวอักษร (ต้องต่างจากตัวบน — เช็คตอน boot) |
| `JWT_ACCESS_EXPIRES_IN` | | default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | | default `30d` |
| `PORT` | | default `4000` |
| `ENABLE_JOBS` | | default `true` — ตั้ง `false` ถ้ารันหลาย instance และให้รัน cron แค่ตัวเดียว |
| `CRON_SECRET` | | อย่างน้อย 32 ตัวอักษร — เปิด `POST /jobs/run` ให้ scheduler ภายนอกสั่งรัน job (ใช้กับ host ที่ sleep ได้) |
| `GEMINI_API_KEY` | | ต้องใช้เมื่อเปิดใช้อ่านสลิป |
| `GEMINI_MODEL` | | default `gemini-3.8-flash` (Google retired 2.5-flash for new keys) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | | ต้องครบทั้ง 4 ตัวเพื่อเปิดใช้อัปโหลดสลิป |
| `R2_PRESIGN_TTL_SECONDS` | | default `600` — อายุลิงก์อ่านรูป |
| `SLIP_MAX_BYTES` | | default `5242880` (5 MB) — ขนาดสูงสุดต่อรูป |
| `R2_STORAGE_QUOTA_BYTES` | | default `10737418240` (10 GB = R2 free tier) |
| `R2_STORAGE_ALERT_PERCENTS` | | default `80,90,100` — เกณฑ์แจ้งเตือนพื้นที่ (%) |
| `R2_ENDPOINT` | | override endpoint (เช่น MinIO ตอนเทสต์) ปกติไม่ต้องตั้ง |
| `ENABLE_HISTORY_BOOTSTRAP` | | default `true` — ตั้ง `false` เพื่อข้ามการดึงประวัติจาก Yahoo ตอนเปิดเซิร์ฟเวอร์ |
| `POSTGRES_*`, `REDIS_PORT` | | ใช้โดย `docker-compose.yml` เท่านั้น |
| `DISCORD_PUBLIC_KEY` | | ต้องใช้เมื่อเปิด Discord slash commands (ไม่มี → endpoint ตอบ 503) |
| `DISCORD_BOT_TOKEN` | | ใช้ตอนลงทะเบียน commands |
| `DISCORD_APPLICATION_ID` | | ใช้ตอนลงทะเบียน commands และตอบกลับ interaction |
| `FMP_API_KEY` | | สำรองไว้ ยังไม่ได้ใช้ |

ถ้าตัวแปรจำเป็นไม่ครบ แอปจะหยุดตั้งแต่ boot พร้อมบอกว่าขาดตัวไหน ค่าว่าง (`KEY=`) ถือว่าไม่ได้ตั้ง

## Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รัน dev server (nodemon + ts-node) |
| `npm run build` / `npm start` | compile แล้วรันจาก `dist/` |
| `npm test` | unit test (ไม่ต้องใช้ DB) |
| `npm run test:integration` | concurrency test ของ Ledger บน DB จริง (ดูด้านล่าง) |
| `npm run db:seed` | seed ข้อมูลทดสอบ |
| `npm run prisma:generate` | generate Prisma client ไปที่ `src/generated/prisma` |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run discord:register-commands` | ลงทะเบียน slash commands กับ Discord (ต้องรันทุกครั้งที่เปลี่ยนนิยาม command) |
| `npm run slips:migrate-to-r2` | ย้ายรูปสลิป base64 เก่าใน DB ไป R2 (`-- --dry` เพื่อดูก่อน) |

### Integration test

```bash
npm run test:integration
```

⚠️ สร้าง/ลบข้อมูลจริง ชี้ `DATABASE_URL` ไปที่ DB สำหรับทดสอบเท่านั้น

## ตัวอย่าง GraphQL

```graphql
# สมัคร / เข้าสู่ระบบ
mutation { login(email: "demo@example.com", password: "password123") { accessToken refreshToken } }

# ส่ง header: Authorization: Bearer <accessToken>
query { myPortfolios { id name baseCurrency cashAccounts { currency balance } } }

# ซื้อหุ้น
mutation {
  createTransaction(portfolioId: "seed-real-portfolio", type: BUY,
    assetId: "<assetId>", quantity: 10, price: 35.5, fee: 5) { id baseCurrAmount }
}

# ปันผลต่างประเทศ (หักภาษี ณ ที่จ่าย 15%) / นำเงินกลับไทย
mutation { createTransaction(portfolioId: "<id>", type: DIVIDEND, assetId: "<AAPL>", currency: "USD", amount: 8.5, taxWithheld: 1.5) { id } }
mutation { createTransaction(portfolioId: "<id>", type: REPATRIATION, currency: "USD", amount: 1000, price: 33.9) { id baseCurrAmount } }

# สลิป — imageUrl เป็น presigned URL อายุสั้น ขอใหม่ทุกครั้งที่จะแสดง
# auto-match: ส่งผ่าน Discord `/upload-slip` หรือเรียก mutation uploadTransactionSlip กับ transactionId ต่อเป็นปกติ
query { transactionSlip(transactionId: "<id>") { amount netAmount fxRate targetAmount targetCurrency isAmountMatched imageUrl imageMimeType imageSize } }

# สรุปผล
mutation { triggerSnapshot(portfolioId: "seed-real-portfolio") { equity cash unrealizedPL twrReturn } }
query { dashboard { currency netWorth pl dividendYtd assetAllocation { symbol value } } }

# ภาษี
query { calculatePersonalIncomeTax(input: { taxYear: 2026, totalIncome: 900000, expenses: 100000,
  deductions: [{ label: "ส่วนตัว", amount: 60000 }], taxCredits: 5000 }) { netIncome grossTax taxPayable refund brackets { rate taxableAmount tax } disclaimer } }
query { portfolioFxBreakdown(portfolioId: "<id>") { homeCurrency totals { realizedStockPLHome realizedFxPLHome unrealizedStockPLHome unrealizedFxPLHome complete }
  positions { symbol unrealizedPLHome unrealizedStockPLHome unrealizedFxPLHome realizedFxPLHome } } }
query { taxSummary(taxYear: 2026) { totalIncomeTHB foreignIncomeTHB withheldTaxTHB repatriatedTHB breakdown { taxType sourceCountry incomeTHB } } }

# Paper trading
mutation { placeOrder(portfolioId: "seed-paper-portfolio", assetId: "<AAPL>", side: BUY, orderType: MARKET, quantity: 2) { status avgFillPrice } }
```

### ประเภทธุรกรรม (`createTransaction`)

| type | ฟิลด์ที่ใช้ | Ledger |
|---|---|---|
| `BUY` | assetId, quantity, price, fee? | CASH Cr / ASSET Dr |
| `SELL` | assetId, quantity, price, fee? | CASH Dr / ASSET Cr (ที่ต้นทุน FIFO) / EQUITY Cr-Dr (กำไร-ขาดทุน) |
| `DEPOSIT` / `WITHDRAW` | amount, currency | CASH ↔ EQUITY |
| `DIVIDEND` | assetId, amount (สุทธิ), currency, taxWithheld? | CASH Dr / EQUITY Cr |
| `FEE` / `TAX` | amount, currency | CASH Cr / EQUITY Dr |
| `ADJUSTMENT` | amount (บวก = เพิ่มเงิน, ลบ = ลดเงิน), currency | CASH ↔ EQUITY |
| `SPLIT` | assetId, ratio (2 = 1→2, 0.1 = 10→1) | ไม่มี (ปรับ Position + TaxLot) |
| `REPATRIATION` | amount (สกุลต่างประเทศ), currency, price? (= เรทที่ใช้จริง), fee? | CASH ต่างประเทศ → CASH THB (domestic) |

ทุกประเภทรับ `note` และ `executedAt` ได้ DIVIDEND/SELL รับ `sourceCountry` (รหัสประเทศ 2 ตัว) เพื่อกำหนดประเทศแหล่งเงินได้ของ TaxRecord เอง ถ้าไม่ส่งจะใช้ค่าจากตาราง exchange → ประเทศ (ดู `Asset.defaultSourceCountry`) แก้ทีหลังได้ด้วย `updateTaxRecord`

## Architecture Notes

**Ledger คือทางเดียวที่เงินเปลี่ยนได้** — `postLedgerEntries()` ตรวจว่า debit = credit (เทียบเป็นสตางค์) ก่อนเขียนเสมอ และรับ transaction client จากผู้เรียก เพื่อให้ Transaction service รวม Ledger + Position + TaxLot + TaxRecord เป็น atomic เดียว บัญชีมี 3 ประเภท: `CASH`, `ASSET`, `EQUITY` (ฝั่งตรงข้ามของเงินเข้า/ออกจากภายนอก และกำไร/ขาดทุนที่รับรู้แล้ว) ยอด ASSET ใน ledger = ต้นทุนของ TaxLot ที่ยังเปิดอยู่เสมอ

**กันเงินติดลบ** — หลังลง ledger จะอ่านยอดใหม่ใน transaction เดียวกัน ถ้าติดลบจะ rollback (ปลอดภัยกับ request พร้อมกันเพราะ row lock) พอร์ตที่ `isMargin = true` ซื้อเกินเงินสดได้

**ต้นทุนและกำไร** — BUY ใช้ต้นทุนเฉลี่ยถ่วงน้ำหนัก (รวม fee) และสร้าง TaxLot, SELL ตัด TaxLot แบบ FIFO แล้วคำนวณ realizedPL

**กำไรจากหุ้น vs กำไรจากค่าเงิน** — ทุก TaxLot เก็บ `purchaseFxRate` (สกุลของล็อต → THB ณ วันซื้อ) ตอน SELL จะแยก P/L เป็น THB ด้วยสูตรใน `transaction/fx-pl.ts` (pure function มี test):
ต้นทุน THB = Σ ต้นทุนล็อต × เรทวันซื้อของล็อต, กำไรหุ้น = (เงินขาย − ต้นทุน) ในสกุลหุ้น × เรทวันขาย, กำไร FX = Σ ต้นทุนล็อต × (เรทวันขาย − เรทวันซื้อ) — สองส่วนรวมกันเท่ากับกำไรรวม THB พอดี ผลเก็บใน SELL transaction (`realizedPLHome`, `realizedStockPLHome`, `realizedFxPLHome`) และสะสมใน Position; ส่วนที่ยังไม่ขายดูได้จาก `portfolioFxBreakdown` สินทรัพย์ที่เป็น THB อยู่แล้ว FX = 0 เสมอ `realizedPL` เดิม (สกุลของหุ้น) ไม่เปลี่ยน

**Snapshot ตามวันที่** — snapshot วันที่ D คือมูลค่า ณ สิ้นวัน D (UTC) โดยใช้เฉพาะข้อมูลที่มี ณ ตอนนั้น: position replay จาก transaction (`snapshot/replay.ts`, pure function), เงินสดจาก ledger, ราคาปิดล่าสุด ≤ D จาก `AssetPrice` และเรท FX ของวัน D จาก `ExchangeRate` ดังนั้นสร้างย้อนหลังกี่ครั้งก็ได้ผลเท่าเดิม

**History sync** (`history/history.service.ts`) — ตอนเปิดเซิร์ฟเวอร์และทุกวัน 00:30 UTC: ดึงราคาปิด/เรท FX จาก Yahoo เฉพาะช่วงที่ยังขาด (ครั้งแรกดึงย้อนไปถึงก่อนธุรกรรมแรก 7 วัน ครั้งต่อไปดึงแค่วันล่าสุด) แล้วสร้าง snapshot ทุกวันที่ขาด ถ้าบันทึกธุรกรรมย้อนหลัง ระบบจะ rebuild snapshot ตั้งแต่วันนั้นให้อัตโนมัติ (background) หรือสั่งเองด้วย `rebuildPortfolioSnapshots`

**TWR** — แต่ละ snapshot เก็บผลตอบแทนของช่วงนั้น (หักเงินฝาก/ถอนแล้ว) และ `portfolioPerformance` คูณทบแบบ geometric ข้ามหลายช่วง

**สกุลเงิน** — ทุกตัวเลขของพอร์ตคิดเป็น `baseCurrency` ของพอร์ตนั้น (เงินสด/หุ้นสกุลอื่นแปลงด้วยเรทปัจจุบัน) ส่วน `netWorth` และ `dashboard` ที่รวมทุกพอร์ตแปลงเป็น THB (ฟิลด์ `currency` บอกว่าเป็นสกุลไหน) เรทมาจาก Yahoo (`USDTHB=X`) แคชใน Redis 1 ชม. และบันทึกลงตาราง `ExchangeRate` ซึ่งใช้เป็น fallback ตอน Yahoo ล่ม

**สลิป** — รูปเก็บใน Cloudflare R2 (bucket private) DB เก็บแค่ `imageKey`, `imageMimeType`, `imageSize` ตอนอัปโหลดตรวจชนิดไฟล์จาก magic bytes (jpeg/png/webp/heic) ไม่เชื่อ MIME ที่ client ส่งมา และจำกัดขนาดตาม `SLIP_MAX_BYTES` — ตรวจก่อนส่งไป Gemini/R2 เสมอ อ่านรูปผ่าน presigned URL เท่านั้น
- **Gemini ดึง:** amount, currency, transactionDate (พร้อม timezone), transRef, sendingBank, receivingBank, senderName, fee, vat, netAmount, fxRate, targetAmount, targetCurrency, assetSymbol (คอด asset ที่ซื้อ/ขาย/แลก), transactionType (BUY/SELL/EXCHANGE), confidence
- **Auto-match (Discord):** ค้นหาธุรกรรมที่เหมาะสม ถ้าเจอแล้วบันทึกเลย ถ้าเจอหลายรายการหรือไม่เจอจะขึ้นข้อความแจ้ง ไม่บันทึก

### Slip Auto-Match Logic

```typescript
// ไฟล์: src/modules/transaction/slip-matcher.ts
// Purpose: Pure matching logic — unit testable, reusable
```

**เลือกธุรกรรมให้สลิป:**
1. **ผู้สมัครควรเป็น:**
   - ธุรกรรมของผู้ใช้
   - ยังไม่มีสลิป attached (`slipVerification is null`)
   - อยู่ในช่วงวันที่ที่เหมาะสม (`executedAt` ห่างจากวันบนสลิป ≤ ±36 ชม.)

2. **เกณฑ์จับคู่:**
   - **ยอดเงินตรงในสกุลเดียวกัน (50 คะแนน):** ต่างกันไม่เกิน 0.01 (เทียบทั้ง amount, netAmount, targetAmount)
   - **ยอดเงินตรงผ่าน FX rate ของธุรกรรม (20 คะแนน):** ใช้ได้เฉพาะเมื่อ asset symbol ตรงด้วย
     - เช่น สลิป THB 335 กับธุรกรรม USD 10 ที่บันทึก exchange rate 33.5 ไว้
   - ถ้ายอดไม่ตรงเลยและไม่มี transRef ใน note → ตัดทิ้ง ไม่นับเป็นผู้สมัคร
   - **Asset Symbol (10 คะแนน):** แอสเสทสัญลักษณ์ตรง (e.g. slip USD ซื้อ LLY = LLY transaction)
   - **Type (5 คะแนน):** ประเภทธุรกรรมสัมพันธ์ (BUY → BUY, EXCHANGE → DEPOSIT/WITHDRAW/REPATRIATION)
   - **transRef in note (100 คะแนน):** ถ้า note มี transRef ของสลิป ชนะทันที (ไม่ต้องดูวันที่)

3. **Breaking ties:** ถ้าคะแนนเท่ากัน เลือกอันที่วันที่ใกล้สลิปที่สุด ถ้ายังเสมอ (หรือไม่มีวันที่บนสลิป) ตอบ `ambiguous` ไม่เดา

**ผลลัพธ์:**
```typescript
type SlipMatchResult =
  | { status: 'matched'; candidate; isAmountMatched: boolean }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: SlipMatchCandidate[] }
```

---

### Slip Upload Flow

```typescript
// ไฟล์: src/modules/transaction/slip.service.ts
// Path 1: uploadTransactionSlip() — ระบุ transaction ID (แอป)
// Path 2: autoMatchSlip() — ให้ระบบหาเอง (Discord)
```

**ขั้นตอน:**
1. **Validate image:** ตรวจ magic bytes, ขนาด, MIME type
2. **Extract (Gemini):** ดึงข้อมูลจากรูป — retry max 5 ครั้ง (รอ 1s, 2s, 3s, 4s ระหว่างครั้ง)
   - Fail → throw `AppError.badRequest()`
3. **Require fields:** amount, transRef ต้องมี ไม่เช่นไม่บันทึก
4. **Check duplicate:** transRef เคยใช้แล้ว? → error
5. **Match transaction:** (`autoMatchSlip` เท่านั้น)
   - เจอ 1 อัน → บันทึก
   - เจอหลาย / ไม่เจอ → return status, don't save
6. **Save:** Upload รูปไป R2 + เขียน SlipVerification row

---

### Discord Batch Upload

```typescript
// ไฟล์: src/modules/discord-bot/discord-interactions.service.ts
// Command: /upload-slip image1:<f1> image2:<f2> ... image5:<f5>
```

**วิธีการ:**
- ประมวลผล **ทีละรูปตามลำดับ** (ป้องกัน race condition ที่จับคู่ธุรกรรมเดียวกัน)
- **Live status:** อัปเดตข้อความ Discord เรื่อยๆ แสดง 1️⃣–5️⃣ ตามสถานะ
- **Callback on retry:** `onAttemptFailed(attempt, max)` ให้ UI อัปเดต "attempt 2/5 failed, retrying..."

**ตัวอย่าง status:**
```
📥 กำลังตรวจสลิป 3 รูป

1️⃣ ✅ ยอด 200.85 THB, Ref: ABC123 → Transaction `tx-1`
2️⃣ ⏳ attempt 1/5 failed, retrying...
3️⃣ ⏳ รอคิว...
```

---

### Key Files

| File | Purpose |
|---|---|
| `slip-matcher.ts` | Pure matching logic (testable) |
| `slip.service.ts` | Image validation → Gemini → save (shared) |
| `discord-interactions.service.ts` | Batch upload + live status |
| `gemini.util.ts` | Extraction prompt + parsing |
| `slip-matcher.test.ts` | 12 unit tests |

**ภาษี (Phase 7)** — พอร์ต REAL เท่านั้น (PAPER ไม่เสียภาษี) สร้าง `TaxRecord` อัตโนมัติใน transaction เดียวกับธุรกรรม: DIVIDEND → `PERSONAL_INCOME` หรือ `WITHHOLDING` (ถ้ามี taxWithheld) คิดจากยอดก่อนหักภาษี, SELL ที่มีกำไร → `CAPITAL_GAIN` แปลงเป็น THB ด้วยเรท ณ วันทำรายการ `taxSummary` สรุปรายปี + ยอดนำเงินกลับไทย (REPATRIATION) เพราะตั้งแต่ปี 2567 เงินได้ต่างประเทศต้องเสียภาษีในปีที่นำเข้า

**TaxCalculator** (`tax/tax-calculator.ts`) — แยกจากข้อมูลดิบ: รับปีภาษี, เงินได้รวม, ค่าใช้จ่าย, ค่าลดหย่อน, เครดิตภาษี แล้วคำนวณตามขั้นบันไดภาษีเงินได้บุคคลธรรมดา (ตาราง พ.ศ. 2560 เป็นต้นไป) เป็น pure function มี unit test ครบทุกขั้น ไม่ได้คำนวณค่าใช้จ่ายตามประเภทเงินได้, วิธี 0.5% ของเงินได้, หรือเครดิตภาษีเงินปันผล — ผู้เรียกต้องคิดก่อนส่งเข้า **ผลลัพธ์เป็นการประมาณการ ควรตรวจกับนักบัญชีหรือกรมสรรพากรอีกครั้ง เพราะกฎอาจเปลี่ยนตามปี** เมื่อกฎเปลี่ยนให้เพิ่มตารางใหม่ใน `BRACKET_TABLES` (ไม่แก้ตารางเดิม)

**Trading (Phase 9)** — Signal → Order → Transaction: `createTradingSignal` (จาก bot/CLI ที่ login เป็นเจ้าของพอร์ต) → `executeTradingSignal` หรือ `placeOrder` → พอร์ต PAPER จำลองการ fill ด้วยราคาล่าสุด ± `paperSlippageBps` และค่าคอม `paperCommissionRate`; LIMIT ที่ยังไม่ถึงราคารอ job ทุก 5 นาที; เงินไม่พอ → `REJECTED` พอร์ต REAL ไม่มีการเชื่อมโบรกเกอร์ order จะค้าง `PENDING` จนกว่าจะบันทึกผลจริงด้วย `fillOrder`

**Jobs** — `00:30 UTC` ทุกวัน: history sync + snapshot / `01:00 UTC` ทุกวัน: เช็คพื้นที่ R2 / ทุก 5 นาที: เช็ค Alert และ fill paper LIMIT order

ถ้า deploy บน host ที่ sleep เมื่อไม่มีคนใช้ (เช่น Render free) cron ในตัว process จะไม่ทำงาน ให้ตั้ง `CRON_SECRET` แล้วใช้ `.github/workflows/run-jobs.yml` ซึ่งเรียก `POST /jobs/run` (header `Authorization: Bearer <CRON_SECRET>`) ทุก 6 ชม. เพื่อปลุก server และรันทุก job ต่อกัน เวลาที่ sync เสร็จล่าสุดดูได้จาก query `dataSyncedAt` (แสดงที่ footer ของหน้าเว็บ)

ทุกครั้งที่ history sync จบ จะดึง quote ปัจจุบันของทุก asset ที่มีคนถืออยู่ (Yahoo batch ครั้งละ 50 ตัว) เก็บไว้ใน Redis (`asset:latest-quote:<assetId>`) แล้วใช้ตีมูลค่า holdings/dashboard/net worth แทนราคาปิดรายวันถ้า quote ใหม่กว่า ส่วน snapshot ยังใช้ราคาปิดเหมือนเดิมเพื่อให้ rebuild ได้ผลเดิม `Holding.priceSource` / `priceAsOf` บอกว่าราคามาจากไหนและเป็นของเวลาไหน

**แจ้งเตือนพื้นที่ R2** — job รายวันรวม `imageSize` จากตาราง `SlipVerification` (ไม่ต้องเรียก R2 API; ไม่นับรูป base64 เก่าที่ยังอยู่ใน DB) ถ้าถึงเกณฑ์ใน `R2_STORAGE_ALERT_PERCENTS` จะส่ง event `SYSTEM_ALERT` ไปที่ Discord channel ของ user ที่เป็น `ADMIN` ซึ่งติ๊ก event นี้ไว้ แจ้งเฉพาะเกณฑ์สูงสุดที่ถึง เกณฑ์เดิมแจ้งซ้ำได้สัปดาห์ละครั้ง (Redis) แต่ถ้าข้ามไปเกณฑ์ที่สูงขึ้นจะแจ้งทันที ถ้ายังไม่มี admin channel จะ log เตือนและลองใหม่วันถัดไป ตั้ง admin ด้วย SQL: `UPDATE "User" SET role = 'ADMIN' WHERE email = '...'` แนะนำให้ตั้ง Notifications ฝั่ง Cloudflare dashboard ไว้อีกชั้นด้วย

**กันโดน Yahoo บล็อก** — ทุก call ผ่านคิวเดียว (~2 req/วินาที, retry เมื่อโดน 429), quote cache 3 นาที, sync ราคา/fundamental ได้วันละครั้งต่อ asset ผ่าน Redis lock หุ้นไทยเก็บเป็น `PTT` + exchange `SET` แล้วแปลงเป็น `PTT.BK` ตอนเรียก Yahoo

**Auth** — access token 15 นาที, refresh token rotate ทุกครั้งที่ใช้ `logout` revoke ทีละ token (Redis), `revokeAllSessions`/`changePassword` revoke ทั้งหมดผ่าน `tokenVersion`

## Discord

**แจ้งเตือน (Webhook)** — สร้าง webhook ใน Discord แล้วเรียก `connectDiscordChannel(webhookUrl, events)` ระบบจะส่งข้อความทดสอบก่อนบันทึก event ที่ใช้งานแล้ว: `TRANSACTION_EXECUTED`, `ALERT_TRIGGERED`, `ORDER_FILLED`, `SYSTEM_ALERT` (เฉพาะ ADMIN)

**ส่งสลิป (Slash Commands)** ใช้ HTTP Interactions Endpoint ไม่ต้องมี gateway connection

1. สร้าง application ที่ Discord Developer Portal แล้วใส่ `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID` ใน `.env`
2. รัน `npm run discord:register-commands` (**ต้องรันใหม่ทุกครั้งที่เปลี่ยน option**)
3. ตั้ง **Interactions Endpoint URL** เป็น `https://<your-domain>/discord/interactions` (ต้องเป็น HTTPS สาธารณะ ใช้ ngrok ตอน dev ได้)
4. ในแอปเรียก `generateDiscordLinkCode` แล้วพิมพ์ `/link code:<โค้ด>` ใน Discord เพื่อผูกบัญชี (โค้ดหมดอายุใน 10 นาที)
5. ส่งสลิป (สูงสุด 5 รูป) ด้วย `/upload-slip image1:<รูป> image2:<รูป> ...` → **จับคู่ธุรกรรมอัตโนมัติ**
   - ค้นหาเฉพาะธุรกรรมที่ยังไม่มีสลิป
   - **เรตแม่น:** ยอดเงินต้องตรงหรือ targetAmount (เช่น slip THB แลก USD ได้)
   - **วันที่:** executedAt ห่างจากวันบน slip ไม่เกิน ±36 ชั่วโมง
   - **transRef:** ถ้ามี transRef ในหมายเหตุธุรกรรมจะตรงทันที
   - **Type/Symbol:** จัดลำดับชั้นความเหมาะสม
   - **ไม่เจอ:** ขึ้น ⚠️ ยังไม่บันทึก บอก assetSymbol ให้สร้าง transaction ใหม่แล้ว upload อีกครั้ง
   - **เจอหลายรายการ:** ขึ้น ⚠️ ยังไม่บันทึก บอก ID ให้ขึ้นแอปเลือกเอง
   - **Gemini ล้มเหลว:** ลอง 5 ครั้งอัตโนมัติ (delay 1–4 วินาที) แล้วข้ามรูปนั้น
6. **Retry + Live status:** ทุกรูปประมวลผลตามลำดับ ข้อความ Discord อัปเดตคงที่ แสดง 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ ตามลำดับ

**ในแอปใช้ mutation `uploadTransactionSlip` ตามปกติ** (ระบุ transactionId ต้องการ, auto-match ใน Discord เท่านั้น) ทั้งสองทางใช้ logic ตัวเดียวกัน

## สถานะการพัฒนา

| Phase | งาน | สถานะ |
|---|---|---|
| 0 | Infra (env, prisma, redis, errors) | ✅ |
| 1 | Auth + User | ✅ |
| – | Notification (Discord webhook) | ✅ |
| 2 | Asset + Market Data (Yahoo) | ✅ |
| 3 | Portfolio + CashAccount | ✅ |
| 4 | Ledger Engine | ✅ |
| 5 | Transaction + Slip OCR + Discord commands | ✅ |
| 6 | Snapshot + Performance + FX | ✅ |
| 7 | Tax (TaxRecord อัตโนมัติ, สรุปรายปี, TaxLot) | ✅ |
| 8 | Research (Thesis, Watchlist, Alert) | ✅ |
| 9 | Trading (TradingSignal, Order, Paper simulator) | ✅ |
| 10 | Backtest (BullMQ + Python service) | ⏳ |
| 11 | ML Prediction (News, NLP, XGBoost) | ⏳ ทำท้ายสุด |

Model ของ Phase 10–11 (`BacktestRun`) มีอยู่ใน `schema.prisma` แล้ว แต่ยังไม่มี service/API

## ข้อจำกัดที่ทราบ

- `SlipVerification.imageUrl` (base64) ยังคงอยู่เป็น nullable สำหรับข้อมูลเก่า — รัน `npm run slips:migrate-to-r2` แล้วค่อยลบคอลัมน์ใน migration ถัดไป
- ลบธุรกรรม/พอร์ตไม่ได้ลบรูปใน R2 ตามไปด้วย (ตอนนี้ยังไม่มีการลบธุรกรรมจริง พอร์ตเป็น soft delete)
- การขายที่บันทึกก่อนมีการแยก FX ไม่มีตัวเลขแยก (`realizedFxPLHome` ของ Position เริ่มนับจาก 0) ล็อตเก่าที่ยังถืออยู่จะได้เรทวันซื้อจาก history sync อัตโนมัติ
- CAPITAL_GAIN TaxRecord ยังคิดจาก `realizedPL` (สกุลหุ้น) × เรทวันขาย ไม่ใช่ `realizedPLHome` (ต้นทุน THB ตามเรทวันซื้อ)
- ค่าใน Position table คิดตามลำดับที่บันทึก ส่วน snapshot replay ตามลำดับ `executedAt` — ถ้าบันทึก BUY ย้อนหลังไปก่อน SELL ที่บันทึกไว้แล้ว ตัวเลข FIFO สองที่อาจต่างกัน
- Order รองรับการ fill ครั้งเดียวทั้งจำนวน (ยังไม่มี partial fill), Alert เป็นแบบยิงครั้งเดียวแล้วปิดตัวเอง (เปิดใหม่ด้วย `updateAlert(isActive: true)`)
- แหล่งข้อมูลตลาดมีแค่ Yahoo Finance (FMP วางแผนไว้แต่ยังไม่ได้ทำ)
