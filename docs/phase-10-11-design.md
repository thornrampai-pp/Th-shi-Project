# Phase 10–11 Design — Backtest & ML Prediction

สถานะ: **ร่างโครงสร้าง** (ยังไม่เขียนโค้ด) · 2026-11-06

> **Phase 11 พักไว้ก่อน** (ตัดสินใจ 2026-11-06) — ทำ Phase 10 ก่อน ส่วน Phase 11 ด้านล่างเก็บไว้เป็นแนวทาง ไม่ต้องสร้างโฟลเดอร์ `news/`, `ml/`, `tasks/news_tasks.py`, `tasks/ml_tasks.py`, ตารางข่าว/ML หรือกลยุทธ์ `ML_SIGNAL` ตอนนี้

## 0. ภาพรวมสถาปัตยกรรม

เพิ่ม **Python service ตัวใหม่ (Flask)** ชื่อ `quant/` วางคู่กับ backend Node เดิม — Node ยังเป็นประตูหน้า (GraphQL, auth, Discord) ส่วน Flask รับงานคำนวณหนัก (backtest, ข่าว/NLP, ML)

```
 frontend (Next.js)
      │ GraphQL
      ▼
 backend (Node/Express/Apollo) ── auth, ownership, GraphQL, notification ──┐
      │  HTTP ภายใน (Bearer QUANT_SERVICE_SECRET)                           │
      ▼                                                                      │
 quant-api (Flask)  ── enqueue ──►  Redis (คิว RQ)  ──►  quant-worker (RQ)   │
      │                                                   │                  │
      └──────────── อ่าน/เขียน Postgres (SQLAlchemy) ◄──────┘                  │
                                                          │ publish event    │
                                                          └─► Redis pub/sub ─┘ (Node ส่ง Discord)
 quant-scheduler ── cron: ดึงข่าว, sentiment, predict รายวัน, train รายสัปดาห์
```

### หลักการ

| เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|
| ใครเป็นเจ้าของ schema | **Prisma (backend) เท่านั้น** — migration ทุกอันทำใน `backend/prisma` | ไม่ให้สองฝั่งแย่งกัน migrate |
| Flask เข้าถึง DB | SQLAlchemy Core (reflect ตาราง) — **อ่าน** ตารางตลาด/พอร์ต, **เขียน** เฉพาะตาราง Phase 10–11 | จำกัดผลกระทบ, ไม่ไปแตะ ledger/transaction |
| ผู้ใช้เรียก Flask ตรงไหม | **ไม่** — เรียกผ่าน Node เสมอ, Flask เปิดเฉพาะ network ภายใน + secret | auth/ownership อยู่ที่เดียว |
| งานยาว | Flask รับ request → enqueue **RQ** (Redis เดิม) → ตอบ 202 ทันที | Flask เป็น sync, ไม่ควรค้าง request |
| แจ้งผล | worker อัปเดตแถวใน DB + publish `quant:events` บน Redis → Node subscribe แล้วยิง notification | Node มี Discord/notification อยู่แล้ว |
| ราคา/FX ขาดช่วง | Node เรียก `ensureHistoryCoverage` ก่อนส่งงาน (Yahoo queue เดิม) | ไม่ต้องมี Yahoo client สองที่สำหรับราคา |
| ข่าว | Flask ดึงเอง (yfinance news / RSS) | งานใหม่ทั้งหมด, อยู่ฝั่ง Python ง่ายกว่า |

### ผลต่อการ deploy

ตอนนี้ backend อาจอยู่บน host ที่ sleep → service Python ต้องมี **3 process** (api, worker, scheduler) ที่ควรรันตลอด
ทางเลือก: (ก) host ที่ไม่ sleep / VPS ด้วย docker compose, (ข) ใช้ GitHub Actions ปลุกแบบเดียวกับ `run-jobs.yml` แล้วให้ `POST /jobs/run` ของ Flask drain คิวและรัน scheduled job ที่ค้าง — แบบ (ข) งาน backtest จะช้าเพราะรอรอบปลุก

---

## 1. โครงสร้างโฟลเดอร์ `quant/`

```
quant/
├── pyproject.toml              # uv; flask, sqlalchemy, psycopg, rq, redis, pandas, numpy,
│                               #     pydantic, xgboost, shap, yfinance, feedparser, google-genai, boto3
├── Dockerfile                  # image เดียว ใช้ได้ทั้ง api / worker / scheduler (ต่าง command)
├── .env.example
├── README.md
│
├── app/
│   ├── __init__.py             # create_app() — Flask factory, ลง blueprint, error handler
│   ├── config.py               # อ่าน env ด้วย pydantic-settings (DATABASE_URL, REDIS_URL, secrets)
│   ├── extensions.py           # engine SQLAlchemy, Redis, RQ queues
│   ├── auth.py                 # ตรวจ Bearer QUANT_SERVICE_SECRET (decorator)
│   ├── errors.py               # รูปแบบ error JSON เดียวกับ AppError ฝั่ง Node
│   │
│   ├── api/                    # Flask blueprints — บางเท่านั้น: validate → เรียก service → ตอบ
│   │   ├── health.py           # GET /health, GET /ready (DB+Redis)
│   │   ├── backtests.py        # /backtests ...
│   │   ├── sweeps.py           # /sweeps ... (sweep, walk-forward, Monte Carlo)
│   │   ├── strategies.py       # GET /strategies (catalog + param schema), GET /indicators
│   │   ├── templates.py        # /templates (StrategyTemplate)
│   │   ├── deployments.py      # /deployments (StrategyDeployment)
│   │   ├── news.py             # /news ...
│   │   ├── ml.py               # /ml/models, /ml/predictions ...
│   │   └── jobs.py             # POST /jobs/run (ปลุกแบบ host sleep)
│   │
│   ├── schemas/                # pydantic models ของ request/response (คือ contract กับ Node)
│   │
│   ├── db/
│   │   ├── tables.py           # reflect ตารางจาก Prisma (ชื่อคอลัมน์ camelCase ตาม Prisma)
│   │   └── repositories/       # query ทีละเรื่อง: prices, fx, fundamentals, dividends,
│   │                           #   portfolios (อ่านอย่างเดียว), backtests, news, ml
│   │
│   ├── backtest/               # ── Phase 10 ──
│   │   ├── engine.py           # loop รายวัน: data → strategy → risk → orders → fills → mark-to-market
│   │   ├── data.py             # โหลด bars + FX + ปันผล + fundamentals (as-of) → ปฏิทินรวม
│   │   ├── portfolio.py        # cash/positions/FIFO lots ภายใน simulation
│   │   ├── execution/
│   │   │   ├── fills.py        # fill mode, slippage, จำกัด % volume
│   │   │   ├── costs.py        # preset ค่าธรรมเนียม SET / US / crypto
│   │   │   ├── lots.py         # board lot / fractional
│   │   │   └── corporate.py    # ปันผล, WHT, reinvest, ดอกเบี้ยเงินสด, ภาษี
│   │   ├── risk/
│   │   │   ├── sizing.py       # fixed, % equity, equal, volatility target
│   │   │   ├── exits.py        # stop, trailing, TP, ATR stop, time exit
│   │   │   ├── limits.py       # max weight / holdings / sector, cash floor
│   │   │   └── filters.py      # regime filter, portfolio drawdown kill switch
│   │   ├── indicators/         # SMA, EMA, RSI, MACD, BB, ATR, Donchian, ROC ... (ใช้ร่วมกับ rules)
│   │   ├── strategies/
│   │   │   ├── registry.py     # key → class + param schema (JSON Schema)
│   │   │   ├── investing/      # buy_and_hold, dca, value_averaging, fixed_weight, replay_portfolio
│   │   │   ├── trend/          # sma_cross, ema_cross, macd, donchian, supertrend
│   │   │   ├── mean_reversion/ # rsi, bollinger
│   │   │   ├── allocation/     # momentum_rotation, dual_momentum, risk_parity
│   │   │   ├── fundamental/    # fundamental_screen
│   │   │   └── custom_rules.py # รัน DSL จาก rules/
│   │   ├── rules/
│   │   │   ├── dsl.py          # pydantic model ของกฎ (เงื่อนไข, AND/OR, ตัวเปรียบเทียบ)
│   │   │   └── evaluator.py    # ประเมินกฎแบบ vectorized, ห้ามมองข้อมูลหลังวัน t
│   │   ├── analysis/
│   │   │   ├── metrics.py      # return, CAGR, XIRR, Sharpe, Sortino, Calmar, DD, alpha/beta, trade stats
│   │   │   ├── breakdown.py    # รายเดือน/ปี, rolling, แยกตามสินทรัพย์, regime
│   │   │   └── warnings.py     # ตรวจข้อมูลขาด, bias
│   │   ├── robustness/
│   │   │   ├── sweep.py        # grid / random
│   │   │   ├── walk_forward.py
│   │   │   ├── monte_carlo.py
│   │   │   └── sensitivity.py  # cost ×2/×3
│   │   └── live/
│   │       └── deployment.py   # evaluate StrategyDeployment รายวัน → signal, เทียบ live vs backtest
│   │
│   ├── news/                   # ── Phase 11a ──
│   │   ├── sources/            # yahoo.py, rss.py (แหล่งละไฟล์, interface เดียวกัน)
│   │   ├── ingest.py           # ดึง, dedupe ด้วย urlHash, ผูก asset
│   │   └── sentiment.py        # Gemini batch → sentiment/relevance/eventType/summaryTh
│   │
│   ├── ml/                     # ── Phase 11b–c ──
│   │   ├── features.py         # สร้าง feature as-of วัน t (ห้ามใช้ข้อมูลหลัง t)
│   │   ├── labels.py           # excess return 20 วันเทียบ benchmark
│   │   ├── train.py            # walk-forward + purge/embargo, XGBoost
│   │   ├── evaluate.py         # AUC, logloss, calibration, เรียก backtest ML_SIGNAL
│   │   ├── predict.py          # โหลด model ACTIVE → ทำนาย → SHAP top features
│   │   ├── registry.py         # บันทึก MlModel, อัป/ดาวน์โหลด artifact จาก R2
│   │   └── outcomes.py         # เติม realizedExcess เมื่อครบ horizon
│   │
│   ├── tasks/                  # ฟังก์ชันที่ RQ เรียก (entry point ของงานเบื้องหลัง)
│   │   ├── backtest_tasks.py   # run_backtest(run_id), run_sweep(sweep_id)
│   │   ├── deployment_tasks.py # evaluate_deployments() รายวัน
│   │   ├── news_tasks.py       # ingest_news(), score_sentiment()
│   │   └── ml_tasks.py         # train_model(), predict_daily(), update_outcomes()
│   │
│   └── events.py               # publish ไป Redis channel quant:events
│
├── worker.py                   # rq worker: queues "backtest", "ml", "news"
├── scheduler.py                # cron (APScheduler / rq-scheduler) ตั้งเวลางานใน tasks/
│
└── tests/
    ├── backtest/               # golden tests ตัวเลขคำนวณมือ, test กัน lookahead,
    │                           #   test ค่าธรรมเนียม/lot แต่ละตลาด, test DSL
    ├── ml/                     # test feature ไม่รั่วอนาคต, label ถูกช่วง
    ├── api/                    # test blueprint ด้วย Flask test client
    └── fixtures/               # bars ตัวอย่าง CSV
```

หลักการแบ่ง layer: **api → schemas → (backtest | news | ml) → db/repositories** — engine/ML ไม่รู้จัก Flask และไม่รู้จัก DB ตรง (รับ DataFrame เข้า คืนผลออก) จึงเทสได้ด้วย fixture ล้วน

### ฝั่ง backend (Node) ที่ต้องเพิ่ม

```
backend/src/
├── common/integrations/quant.client.ts   # HTTP client ไป Flask (secret, timeout, retry)
├── modules/backtest/
│   ├── backtest.schema.ts                # Pothos: query/mutation ที่ frontend ใช้
│   └── backtest.service.ts               # ตรวจ ownership, ensureHistoryCoverage, เรียก quant.client
├── modules/insight/                      # (Phase 11) news + ML predictions ต่อ asset
│   ├── insight.schema.ts
│   └── insight.service.ts                # อ่านตารางตรงผ่าน Prisma (read path ไม่ต้องผ่าน Flask)
└── jobs/quant-events.listener.ts         # subscribe quant:events → notification (Discord)
```

กติกา: **เขียน/สั่งงาน → ผ่าน Flask**, **อ่านผลเพื่อแสดง → Node อ่าน DB ตรงด้วย Prisma** (ไม่ต้องเพิ่ม hop)

### ฝั่ง frontend

```
frontend/src/app/(app)/
├── backtests/
│   ├── page.tsx                 # รายการ run
│   ├── new/page.tsx             # ฟอร์ม: กลยุทธ์ (gen จาก param schema) + risk + execution
│   ├── [id]/page.tsx            # ผล: แท็บ ภาพรวม / กราฟ / การเทรด / แยกสินทรัพย์ / คำเตือน
│   ├── compare/page.tsx         # เทียบ 2–4 run
│   ├── sweeps/[id]/page.tsx     # heatmap พารามิเตอร์, walk-forward, Monte Carlo
│   ├── builder/page.tsx         # Strategy builder (กฎ IF/THEN)
│   ├── templates/page.tsx       # กลยุทธ์ที่บันทึกไว้
│   └── deployments/page.tsx     # กลยุทธ์ที่ deploy ไป PAPER + live vs backtest
├── portfolios/[id]/…            # ปุ่ม "Replay ย้อนหลัง" ในแท็บ Rebalance
├── (asset page)                 # การ์ด AI outlook + ข่าวพร้อม sentiment
└── system/                      # เพิ่มสถานะ quant service + model health
```

---

## 2. Contract ระหว่าง Node ↔ Flask (ระดับ endpoint)

| Method | Path | ใช้ทำ | ตอบ |
|---|---|---|---|
| GET | `/health`, `/ready` | healthcheck | 200 |
| GET | `/strategies` | catalog กลยุทธ์ + param schema (JSON Schema) | 200 |
| POST | `/backtests` | สร้าง run (Node ส่ง userId ที่ตรวจแล้ว + params) | 202 `{ runId }` |
| POST | `/backtests/{id}/cancel` | ยกเลิก | 200 |
| POST | `/backtests/replay-portfolio` | สร้าง run จาก target ของพอร์ตจริง | 202 |
| POST | `/sweeps` | sweep / walk-forward / Monte Carlo / cost sensitivity | 202 `{ sweepId }` |
| GET | `/indicators` | รายการ indicator + พารามิเตอร์ สำหรับ builder | 200 |
| POST | `/rules/validate` | ตรวจกฎ DSL ก่อนบันทึก | 200 |
| CRUD | `/templates` | StrategyTemplate | 200/201 |
| CRUD | `/deployments` | StrategyDeployment (PAPER เท่านั้น) | 200/201 |
| POST | `/news/refresh` | ดึงข่าวของ asset ที่ระบุทันที | 202 |
| POST | `/ml/train` | สั่ง train (admin) | 202 |
| POST | `/ml/models/{id}/promote` | CANDIDATE → ACTIVE (admin) | 200 |
| POST | `/jobs/run` | ปลุก: drain คิว + รัน scheduled job ที่ค้าง | 200 |

Event บน `quant:events`: `backtest.completed`, `backtest.failed`, `news.alert`, `ml.signal`, `ml.model_trained` — payload มี `userId` / `assetId` ให้ Node เลือกส่ง notification

---

## 3. Phase 10 — Backtest (ขอบเขตแบบครอบคลุม)

Backtest = ทดสอบกลยุทธ์กับราคาย้อนหลังก่อนใช้เงินจริง ครอบคลุมทั้ง **การเทรด** และ **การลงทุนระยะยาว**, ตั้งค่าความเสี่ยงได้, ตรวจได้ว่า overfit หรือไม่, และส่งกลยุทธ์ที่ผ่านไปพิสูจน์ต่อบนพอร์ต PAPER

### 3.1 ขอบเขต

| อยู่ใน Phase 10 | ไม่อยู่ (เหตุผล) |
|---|---|
| ทุกกลยุทธ์บนแท่ง **รายวัน** | Intraday — ข้อมูลมีแค่ `1D`, ต้องหาแหล่งข้อมูลใหม่ |
| Long-only, ถือเงินสดได้ | Short / Cover — รอหลัง frontend เสร็จตามแผนเดิม (engine เผื่อ weight ติดลบไว้) |
| หุ้น, ETF, crypto, ทอง, หลายสกุลเงิน | Margin / leverage, options, futures |
| ตั้ง Stop/TP/การกำหนดขนาดไม้ | ส่งคำสั่งเข้าโบรกจริง |
| Optimize พารามิเตอร์ + walk-forward + Monte Carlo | ML (Phase 11 พักไว้) |

### 3.2 คลังกลยุทธ์ (สำเร็จรูป)

ทุกกลยุทธ์รับข้อมูลถึงวัน t แล้วคืน **target weights** — engine เป็นคนแปลงเป็นคำสั่ง จึงกัน lookahead ได้ที่จุดเดียว

| กลุ่ม | กลยุทธ์ | พารามิเตอร์หลัก |
|---|---|---|
| **ลงทุนระยะยาว** | `BUY_AND_HOLD` (ใช้เป็น benchmark ด้วย) | — |
| | `DCA` ทยอยซื้อเป็นงวด | จำนวนเงิน, ความถี่ |
| | `VALUE_AVERAGING` ซื้อเพิ่ม/น้อยให้มูลค่าโตตามเป้า | เป้าเติบโตต่องวด |
| | `FIXED_WEIGHT_REBALANCE` ถือสัดส่วนคงที่ | weights, รอบ หรือ drift % |
| | `REPLAY_PORTFOLIO` ใช้สัดส่วนเป้าหมายของพอร์ตจริง | พอร์ต, รอบ rebalance |
| | `DIVIDEND_REINVEST` ปันผลซื้อเพิ่มอัตโนมัติ | (เป็นตัวเลือกที่ใส่กับกลยุทธ์อื่นได้) |
| **ตามเทรนด์** | `SMA_CROSS`, `EMA_CROSS` | fast, slow |
| | `MACD` | fast, slow, signal |
| | `DONCHIAN_BREAKOUT` ทะลุกรอบ N วัน | entry N, exit N |
| | `SUPERTREND` | ATR period, multiplier |
| **กลับสู่ค่าเฉลี่ย** | `RSI_MEAN_REVERSION` | period, buyBelow, sellAbove |
| | `BOLLINGER_REVERSION` | period, std |
| **หมุนเวียน / จัดพอร์ต** | `MOMENTUM_ROTATION` เลือก N ตัวที่แรงสุด | lookback, topN, รอบ |
| | `DUAL_MOMENTUM` เทียบตัวเอง + เทียบเงินสด | lookback, safe asset |
| | `INVERSE_VOLATILITY` / `RISK_PARITY` | lookback, รอบ |
| **ปัจจัยพื้นฐาน** | `FUNDAMENTAL_SCREEN` เลือกหุ้นตามเงื่อนไข P/E, ROE, ปันผล ฯลฯ (as-of `announcementDate`) | เงื่อนไข, topN, รอบ |
| **สร้างเอง** | `CUSTOM_RULES` (ดู 3.3) | กฎที่ผู้ใช้ตั้ง |

### 3.3 Strategy builder (สร้างกลยุทธ์เองโดยไม่ต้องเขียนโค้ด)

ผู้ใช้ประกอบกฎจากหน้าเว็บ เก็บเป็น JSON (DSL) — ไม่มีการรันโค้ดที่ผู้ใช้พิมพ์เอง

- **เงื่อนไขเข้า / ออก**: `[indicator] [เทียบ] [ค่าคงที่ | indicator อื่น]` รวมด้วย AND / OR / กลุ่มซ้อน
  - เช่น "RSI(14) < 30 AND close > SMA(200)" → ซื้อ, "RSI(14) > 70 OR ขาดทุน 8%" → ขาย
- **ตัวเปรียบเทียบ**: `>`, `<`, `ตัดขึ้น`, `ตัดลง`, `อยู่ในช่วง`, `เพิ่มขึ้น N วันติด`
- **Indicator ที่มีให้**: SMA, EMA, RSI, MACD, Bollinger, ATR, Donchian, ROC/momentum, volume avg, 52w high/low, ราคาเทียบ benchmark, ค่าปัจจัยพื้นฐาน
- **บันทึกเป็นเทมเพลต** ใช้ซ้ำ/โคลน/แก้ได้, ทุก run เก็บสำเนากฎ ณ ตอนรัน (แก้เทมเพลตทีหลังไม่ทำให้ผลเก่าเพี้ยน)

### 3.4 การบริหารความเสี่ยงและขนาดไม้ (ใส่กับทุกกลยุทธ์ได้)

| เรื่อง | ตัวเลือก |
|---|---|
| ขนาดไม้ | เงินคงที่ต่อไม้, % ของพอร์ต, เท่ากันทุกตัว, ตามความผันผวน (ATR / volatility target) |
| จุดออก | Stop loss %, Trailing stop %, Take profit %, ATR stop, ออกเมื่อถือครบ N วัน |
| ขีดจำกัด | สัดส่วนสูงสุดต่อตัว, จำนวนตัวที่ถือสูงสุด, สัดส่วนต่อ sector สูงสุด, เงินสดขั้นต่ำ |
| ตัดทั้งพอร์ต | หยุดเทรดเมื่อพอร์ต drawdown เกิน X% (กลับมาเมื่อ…) |
| ตัวกรองตลาด | เทรดเฉพาะตอน benchmark อยู่เหนือ SMA200 (regime filter) |

### 3.5 ความสมจริงของการจำลอง

- สัญญาณจาก close วัน t → fill ที่ open วัน t+1 (ตั้งเป็น close วันเดียวกันได้ แต่จะมีป้ายเตือน)
- **ค่าธรรมเนียมตามตลาด** มี preset: SET (คอมฯ + VAT + ขั้นต่ำต่อไม้), US (ต่อไม้/ต่อหุ้น), crypto (% maker/taker) — แก้เองได้, default จากพอร์ตอ้างอิง
- Slippage bps, จำกัดไม่ให้ซื้อเกิน X% ของ volume วันนั้น
- **หน่วยการซื้อขาย**: SET ขั้นละ 100 หุ้น (board lot), US/crypto ซื้อเศษได้ (ตั้งค่าได้)
- หลายสกุลเงินแปลงเป็น baseCurrency ด้วย `ExchangeRate` รายวัน — แยกกำไรจากราคากับจากค่าเงินให้เห็น (เหมือน realizedFxPL)
- ปันผลจาก `DividendAnnouncement` เข้าเป็นเงินสดหลังหัก WHT (หรือ reinvest)
- ดอกเบี้ยเงินสดที่พักไว้ (อัตราต่อปี ตั้งค่าได้, default 0)
- ภาษีกำไรจากการขาย: ตัวเลือก "หลังภาษี" ใช้กติกาจาก tax module
- ปฏิทินรวมหลายตลาด, forward-fill ราคา, ไม่ซื้อขายวันที่ตลาดตัวนั้นปิด
- คำเตือนในผล: survivorship bias, ข้อมูลราคา/ปันผลขาดช่วง, ใช้ fill แบบ close วันเดียวกัน

### 3.6 ผลลัพธ์และการวิเคราะห์

- **ภาพรวม**: Total return, CAGR, XIRR (กรณีมีเงินเข้าเป็นงวด), volatility, Sharpe, Sortino, Calmar, max drawdown + ระยะเวลาฟื้นตัว, เวลาที่ถือหุ้น (exposure)
- **เทียบ benchmark**: alpha, beta, correlation, tracking error, % ของเดือนที่ชนะ
- **การเทรด**: จำนวนไม้, win rate, กำไรเฉลี่ย/ขาดทุนเฉลี่ย, profit factor, expectancy, ไม้ที่ดีสุด/แย่สุด, ระยะถือเฉลี่ย, แพ้/ชนะติดกันสูงสุด, ค่าธรรมเนียมรวม
- **กราฟ**: equity vs benchmark (log toggle), drawdown, heatmap ผลตอบแทนรายเดือน/รายปี, rolling 12m return & Sharpe, สัดส่วนที่ถือตามเวลา, จุดซื้อขายบนกราฟราคา, histogram ผลแต่ละไม้
- **แยกตามสินทรัพย์**: แต่ละตัวทำกำไร/ขาดทุนเท่าไร, ส่วนที่มาจากค่าเงิน
- Export CSV (trades, equity curve)

### 3.7 ทดสอบความทนทาน (กัน overfit)

| เครื่องมือ | ทำอะไร |
|---|---|
| **Parameter sweep** | ลองพารามิเตอร์หลายชุด (grid/random, ไม่เกิน ~200 ชุด) → heatmap ของผล; เลือกโซนที่ดีทั้งแถบ ไม่ใช่จุดเดียว |
| **Walk-forward** | optimize ในช่วง in-sample แล้วทดสอบช่วงถัดไป เลื่อนไปเรื่อยๆ → รายงานผลเฉพาะ out-of-sample |
| **Out-of-sample holdout** | กันช่วงท้ายไว้ไม่ให้ optimize แล้วทดสอบทีเดียว |
| **Monte Carlo** | สลับลำดับไม้ / resample ผลตอบแทน 1,000 รอบ → ช่วงความเป็นไปได้ของ drawdown และผลตอบแทน |
| **Cost sensitivity** | รันซ้ำที่ค่าธรรมเนียม/slippage ×2, ×3 |
| **Regime breakdown** | ผลในช่วงตลาดขาขึ้น / ขาลง / sideways และช่วงวิกฤตที่รู้จัก (2020, 2022) |

แต่ละอย่างรันเป็นชุด run (ตาราง `BacktestSweep`) ใช้คิว + worker เดิม

### 3.8 จากผลทดสอบไปสู่การใช้งาน

1. **Deploy ไป PAPER**: รันกลยุทธ์เดียวกันกับข้อมูลล่าสุดทุกวัน → สร้าง `TradingSignal(source = "STRATEGY:<id>")` → execute เอง หรือ auto (เฉพาะ PAPER)
2. **Live vs backtest**: เทียบผลจริงบน PAPER กับที่ backtest คาดไว้ ถ้าห่างกันมาก → แจ้งเตือน (สัญญาณ overfit)
3. **แจ้งเตือนสัญญาณ** ผ่าน Discord สำหรับกลยุทธ์ที่ deploy (ใช้ช่วยตัดสินใจกับพอร์ตจริงได้ แต่ไม่ส่งคำสั่งเอง)

### 3.9 Flow

```
frontend → Node runBacktest / runSweep → ตรวจสิทธิ์ + ensureHistoryCoverage → POST /backtests | /sweeps
Flask → สร้าง BacktestRun / BacktestSweep (PENDING) → enqueue → 202
worker → PROCESSING (+progress) → engine → บันทึกผล → COMPLETED|FAILED → publish event
frontend poll ทุก 2 วิ ระหว่างยังไม่เสร็จ
Node listener → Discord "Backtest เสร็จแล้ว"
scheduler (รายวัน) → evaluate StrategyDeployment ที่ active → TradingSignal
```

จำกัด: ผู้ใช้ละ ≤ 3 งานค้าง, ≤ 20 ปี, universe ≤ 50 ตัว, sweep ≤ 200 ชุด; cache ผลด้วย `inputHash`

### 3.10 Schema changes (ใน Prisma)

| ตาราง | สาระสำคัญ |
|---|---|
| `BacktestRun` (แก้) | เพิ่ม `strategyDefinition` (สำเนากฎ/พารามิเตอร์ ณ ตอนรัน), `riskSettings`, `executionSettings` (ค่าธรรมเนียม, slippage, lot, fill mode), `universe`, `benchmarkAssetId`, `baseCurrency`, `progress`, `engineVersion`, `inputHash`, `sweepId?`, `segment?` (IN_SAMPLE/OUT_OF_SAMPLE), `startedAt`, `finishedAt`, metric เพิ่มเติม (Sortino, Calmar, volatility, benchmarkReturn, alpha, beta, profitFactor, exposure), `warnings` |
| `BacktestStatus` | เพิ่ม `CANCELLED` |
| `BacktestTrade` (ใหม่) | runId, assetId, side, executedAt, quantity, price, fee, reason (SIGNAL/STOP/TP/REBALANCE), pnl, fxPnl |
| `BacktestSweep` (ใหม่) | userId, ชนิด (GRID/WALK_FORWARD/MONTE_CARLO/COST_SENSITIVITY), base definition, ช่วงพารามิเตอร์, สถานะ, progress, สรุปผล (JSON) |
| `StrategyTemplate` (ใหม่) | userId, ชื่อ, คำอธิบาย, strategyKey หรือกฎ `CUSTOM_RULES`, riskSettings, version |
| `StrategyDeployment` (ใหม่) | portfolioId (PAPER), templateId, universe, autoExecute, isActive, lastEvaluatedAt, liveVsBacktest (JSON) |
| `NotificationEventType` | เพิ่ม `BACKTEST_COMPLETED`, `STRATEGY_SIGNAL`, `STRATEGY_DRIFT` |

### 3.11 ลำดับงาน (แต่ละข้อ ≈ 1 PR)

**10A — แกนหลัก (ใช้งานได้ครบ flow)**
1. โครง `quant/` + Flask factory + health + DB reflect + Docker/compose + CI pytest
2. engine + execution model (ค่าธรรมเนียม, lot, FX, ปันผล) + metrics + golden tests
3. กลยุทธ์ชุดแรก: Buy&Hold, DCA, Fixed-weight rebalance, SMA cross, RSI
4. Prisma migration + `/backtests` + RQ worker + events
5. Node `backtest` module + `quant.client` + listener
6. Frontend: รายการ, ฟอร์ม, หน้าผล (metrics + กราฟหลัก + trades)

**10B — กลยุทธ์และความเสี่ยงครบชุด**
7. Risk & sizing layer (stop/trailing/TP, sizing, limits, regime filter)
8. กลยุทธ์ที่เหลือ: EMA, MACD, Donchian, Supertrend, Bollinger, Momentum, Dual momentum, Risk parity, Value averaging
9. Replay portfolio (ปุ่มในแท็บ Rebalance) + Fundamental screen
10. หน้า Compare + การวิเคราะห์เพิ่ม (heatmap, rolling, แยกตามสินทรัพย์, export CSV)

**10C — Strategy builder**
11. DSL + ตัวประเมินกฎ + tests
12. UI สร้างกฎ + `StrategyTemplate`

**10D — ทดสอบความทนทาน**
13. `BacktestSweep` + parameter sweep + heatmap
14. Walk-forward + holdout + Monte Carlo + cost sensitivity + regime breakdown

**10E — ใช้งานจริง**
15. `StrategyDeployment` → TradingSignal รายวันบน PAPER + Discord
16. Live vs backtest tracking + แจ้งเตือนเมื่อเบี่ยง

---

## 4. Phase 11 — ML Prediction (⏸ พักไว้ก่อน)

### ตั้งความคาดหวัง
- ไม่ทำนาย "พรุ่งนี้ขึ้น/ลง" แต่ทำนาย **ความน่าจะเป็นที่ return 20 วันชนะ benchmark** พร้อมเหตุผล
- model ต้อง **ผ่าน backtest walk-forward ของ Phase 10 หลังหักค่าธรรมเนียม** จึงเป็น `ACTIVE` ไม่งั้นแสดงเป็น experimental
- ไม่ execute อัตโนมัติบนพอร์ต REAL

### 11a ข่าว + NLP (ส่งมอบคุณค่าได้ก่อนมี model)
- ดึงข่าวของ asset ที่ถือ/อยู่ใน watchlist (คุมโควตา) จาก Yahoo + RSS
- Gemini batch → `sentiment` −1..1, `relevance`, `eventType`, `summaryTh`; มีเพดานรายวัน
- แสดงในหน้า asset + news alert เมื่อข่าวแรง

### 11b Features (คำนวณสด ไม่เก็บลง DB)
ราคา (return หลายช่วง, SMA distance, RSI, volatility, volume z), ตลาด (benchmark regime, relative strength), ปัจจัยพื้นฐาน **as-of `announcementDate`**, ข่าว (sentiment 1/7/30 วัน, มี earnings event), FX (USDTHB)
model รุ่นแรกยังไม่ใช้ feature ข่าว จนกว่าจะสะสม ~6 เดือน

### 11c Model
- Target: excess return 20 วัน > 0, model เดียว pooled ทุก asset, XGBoost
- Walk-forward + purge/embargo 20 วัน
- วัด AUC, logloss, calibration, top-decile hit rate, backtest `ML_SIGNAL` vs `BUY_AND_HOLD`
- อธิบายด้วย SHAP top 5; artifact เก็บใน R2

### Schema (ใน Prisma)
`NewsArticle`, `NewsSentiment`, `MlModel` (+ enum `CANDIDATE/ACTIVE/RETIRED`), `MlPrediction` (probOutperform, topFeatures, realizedExcess)
`NotificationEventType` เพิ่ม `NEWS_ALERT`, `ML_SIGNAL`

### งานตามเวลา (scheduler)
| งาน | เวลา |
|---|---|
| ingest_news | ทุก 2 ชม. |
| score_sentiment | ต่อจาก ingest |
| predict_daily | ทุกวันหลัง history sync |
| update_outcomes | ทุกวัน |
| train_model | วันอาทิตย์ |

### การใช้ผล
- การ์ด **AI outlook** ในหน้า asset, คอลัมน์ prob ใน watchlist/holdings
- พอร์ต PAPER ที่ opt-in → `TradingSignal(source = "ML:<version>")`
- หน้า System: live AUC/hit rate 90 วัน (ตรวจ drift)

### ลำดับงาน
1. 11a news + sentiment + UI ข่าว + alert
2. features/labels + tests กันข้อมูลรั่ว
3. train/evaluate + `ML_SIGNAL` + model registry
4. predict รายวัน + การ์ด AI outlook
5. outcome tracking + model health + opt-in signals

---

## 5. สิ่งที่ต้องตัดสินใจก่อนเริ่ม

1. **Flask เป็น service แยกคู่กับ Node** (ตามที่ร่างนี้) หรือจะย้าย backend ทั้งหมดไป Flask
2. ที่ deploy ของ service Python (host ที่รันตลอด vs ปลุกด้วย GitHub Actions)
3. Benchmark default: `SPY` (US), `^SET.BK` (ไทย), `BTC-USD` (crypto)
4. ข่าวเก็บเฉพาะ asset ที่ถือ/watch หรือทุก asset ที่ `isPopular`
