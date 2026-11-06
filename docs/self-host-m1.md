# Self-host tōshi บน Mac mini / MacBook M1 (8GB)

สถานะ: คู่มือติดตั้ง · ตัวเลขทรัพยากรวัดจากการรันสแตกจริง (production mode)

## 0. ทำไมคุ้มกว่า free host

| เรื่อง | free host (Render free) | M1 ที่รันตลอด |
|---|---|---|
| in-process `node-cron` | ไม่ยิง (process sleep) → ต้องพึ่ง `.github/workflows/run-jobs.yml` ปลุกทุก 6 ชม. | ยิงตามจริง |
| `market-watch.job.ts` (`*/5 * * * *`) | แทบไม่ทำงานตามเจตนา | ทุก 5 นาทีจริง |
| `daily-snapshot` / `storage-usage` (UTC 00:30 / 01:00) | เลื่อนไปตามรอบปลุก | ตรงเวลา |
| Phase 10 (quant-api + worker + scheduler, ต้อง always-on) | ทำไม่ได้ / ช้ามาก | ทำได้ |
| Postgres | managed free tier มีลิมิต | local NVMe ไม่มีลิมิต |

เมื่อย้ายมา M1 แล้ว **ปิด workflow `run-jobs.yml` ได้** (หรือเก็บไว้เป็น safety net ก็ได้ เพราะ job ทุกตัว idempotent)

## 1. ทรัพยากรที่ใช้จริง (วัดเมื่อ 2026-11-06)

| process | RSS |
|---|---|
| `node dist/index.js` (backend production, หลัง history bootstrap) | 36–41 MB |
| `next-server` v16.4.2 (production) | 59 MB |
| `redis:7-alpine` | 10 MB |
| Postgres 17 | ~130 MB (shared_buffers 128MB) + ~10MB/connection |
| **รวม runtime** | **≈ 250–300 MB** |
| `next build` peak RSS | 705 MB (5 วิ บน M5 → คาด 12–20 วิ บน M1) |
| `tsc` (backend build) peak RSS | 45 MB |

สรุป: macOS headless ~2–2.5GB + สแตก ~0.3GB → **8GB เหลือว่าง 5GB+**

### กฎสำคัญของเครื่อง 8GB

**ห้ามใช้ Docker Desktop** — VM จองแรมล่วงหน้า (เครื่อง dev ปัจจุบันจองไว้ 7.7GiB เพื่อรัน redis 10MB) เลือก:

- **Colima** (แนะนำ): `brew install colima docker docker-compose && colima start --cpu 2 --memory 2 --disk 30`
  แล้วใช้ `backend/docker-compose.yml` เดิมได้ทันที
- **OrbStack**: เบากว่า Docker Desktop มาก, คืนแรมเมื่อ idle
- **Native**: `brew install postgresql@17 redis` + `brew services start postgresql@17 redis` → ไม่มี VM เลย เหมาะสุดกับ 8GB
  (ถ้าเลือกแบบนี้ ไม่ต้องรัน compose — แค่สร้าง role/db ให้ตรง `DATABASE_URL`)

> ⚠️ ถ้าเครื่องเคยลง Postgres native ไว้ (EDB installer / Postgres.app) พอร์ต 5432 จะชน → `docker compose up` จะ fail ด้วย `address already in use` เลือกทางเดียว หรือเปลี่ยน `POSTGRES_PORT` + `DATABASE_URL` ให้ตรงกัน

## 2. ความเข้ากันได้ arm64

ทุกอย่างในสแตกเป็น arm64 native ไม่ต้องใช้ Rosetta:

| ส่วน | หมายเหตุ |
|---|---|
| Node ≥ 20.19 | `brew install node` (arm64) |
| `postgres:17-alpine`, `redis:7-alpine` | official multi-arch มี `linux/arm64` |
| Prisma 7 + `@prisma/adapter-pg` | engine `darwin-arm64` / `linux-arm64-openssl-*` |
| `bcrypt` (native addon) | build จาก source ได้ ต้องมี `xcode-select --install` |
| Next 16 / React 19 / Tailwind 4 | arm64 binaries ครบ |
| Phase 10: xgboost, shap | มี arm64 wheels, ต้อง `brew install libomp` ก่อน |

## 3. เตรียมเครื่อง

```bash
xcode-select --install
brew install node git cloudflared        # + colima หรือ postgresql@17 redis ตามข้อ 1

# ไม่ให้หลับ / กลับมาเองหลังไฟดับ
sudo pmset -a sleep 0 disablesleep 1 autorestart 1 powernap 0 womp 1
sudo pmset -a hibernatemode 0
pmset -g                                 # ตรวจผล
```

- **MacBook Air M1**: ต้องต่อไฟค้างไว้ และปิดฝาแล้วต้องไม่หลับ → `disablesleep 1` พอ (ไม่ต้องมีจอต่อ)
- **FileVault**: ถ้าเปิดไว้ เครื่อง reboot จะค้างรอรหัสผ่าน → service ไม่ขึ้นเอง
  ทางเลือก: ปิด FileVault (เครื่องอยู่บ้าน, ข้อมูลไม่ sensitive มาก) หรือยอม unlock มือทุกครั้งที่ reboot
- ปิด Spotlight indexing ที่โฟลเดอร์โปรเจกต์: `sudo mdutil -i off /Users/<user>/project`
- **เปิด SSH**: System Settings → General → Sharing → Remote Login (จะได้ไม่ต้องนั่งหน้าเครื่อง)

## 4. ติดตั้งโปรเจกต์

```bash
git clone <repo> ~/toshi && cd ~/toshi

# backend
cd backend
npm ci
cp .env.example .env         # แก้ค่าตามข้อ 5
docker compose up -d --wait  # (ถ้าใช้ colima/orbstack)
npx prisma generate
npx prisma migrate deploy    # production ใช้ deploy ไม่ใช่ migrate dev
npm run build

# frontend
cd ../frontend
npm ci
echo 'BACKEND_GRAPHQL_URL=http://127.0.0.1:4000/graphql' > .env.local
npm run build
```

## 5. ค่า env ที่ต้องเปลี่ยนจาก dev

backend/.env:

```ini
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://toshi:<pass>@localhost:5432/toshi_db?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>   # ต้องต่างจาก access
FRONTEND_URL=https://toshi.<your-domain>    # โดเมนจริง ไม่ใช่ localhost — CORS อ่านค่านี้
ENABLE_JOBS=true                            # เครื่องไม่ sleep แล้ว cron ทำงานเอง
ENABLE_HISTORY_BOOTSTRAP=true
# CRON_SECRET= ไม่ต้องใช้แล้วถ้าเลิกใช้ run-jobs.yml (จะเก็บไว้เป็น manual trigger ก็ได้)
```

frontend/.env.local: `BACKEND_GRAPHQL_URL=http://127.0.0.1:4000/graphql`
(frontend เป็น BFF — browser ไม่ได้ยิง backend ตรง จึงไม่ต้องเปิด 4000 ออกเน็ต)

## 6. เปิดให้เข้าถึงจากข้างนอก — Cloudflare Tunnel

จำเป็นเพราะ **Discord slash commands ต้องมี public HTTPS endpoint** (`discord-signature.ts` ตรวจ Ed25519 signature จาก `DISCORD_PUBLIC_KEY`) และบ้านมี NAT + IP ไม่นิ่ง Tunnel ฟรี ไม่ต้อง port forward และได้ TLS ให้

```bash
cloudflared tunnel login
cloudflared tunnel create toshi
cloudflared tunnel route dns toshi toshi.<your-domain>
cloudflared tunnel route dns toshi toshi-api.<your-domain>
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<user>/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: toshi.<your-domain>
    service: http://127.0.0.1:3000
  - hostname: toshi-api.<your-domain>
    service: http://127.0.0.1:4000
  - service: http_status:404
```

```bash
sudo cloudflared service install   # ขึ้นเองตอน boot
```

แล้วตั้ง Discord **Interactions Endpoint URL** = `https://toshi-api.<your-domain>/discord/interactions`
(เช็ค path จริงที่ route ใน `backend/src/modules/discord-bot`) และรัน `npm run discord:register-commands`

> อยากกันคนอื่นเข้าหน้าเว็บ: เปิด **Cloudflare Access** (Zero Trust, ฟรี 50 users) ครอบ `toshi.<domain>` แต่ **ห้ามครอบ `toshi-api`** เพราะ Discord ต้องยิงเข้ามาได้

## 7. ให้ขึ้นเองตอน boot — launchd

`~/Library/LaunchAgents/com.toshi.api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.toshi.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/<user>/toshi/backend/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/<user>/toshi/backend</string>
  <key>EnvironmentVariables</key>
  <dict><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/<user>/toshi/logs/api.log</string>
  <key>StandardErrorPath</key><string>/Users/<user>/toshi/logs/api.err.log</string>
</dict>
</plist>
```

`~/Library/LaunchAgents/com.toshi.web.plist` — เหมือนกันแต่:
`ProgramArguments` = `/opt/homebrew/bin/npm`, `start` และ `WorkingDirectory` = `.../frontend`

```bash
mkdir -p ~/toshi/logs
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.toshi.api.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.toshi.web.plist
launchctl print gui/$(id -u)/com.toshi.api | head -20
```

> LaunchAgent ทำงานเมื่อ login แล้ว — ถ้าต้องการให้ขึ้นก่อน login ใช้ `LaunchDaemon` ใน `/Library/LaunchDaemons` แทน (แต่ต้องปิด FileVault เพื่อให้ boot ถึงจุดนั้นเอง)
> Postgres/Redis: ถ้าใช้ compose มี `restart: unless-stopped` อยู่แล้ว + สั่ง colima ให้ auto-start; ถ้า native ใช้ `brew services` (เป็น launchd ให้เรียบร้อย)

## 8. Backup (จุดอ่อนที่สุดของการ self-host)

ข้อมูลทั้งหมดอยู่ในเครื่องเดียว — SSD เสีย = พอร์ตหายหมด มีโค้ด R2 อยู่แล้วในโปรเจกต์ ใช้ bucket เดิมเก็บ dump ได้

`~/toshi/scripts/backup.sh`:

```bash
#!/bin/bash
set -euo pipefail
source /Users/<user>/toshi/backend/.env
OUT="/Users/<user>/toshi/backups/toshi-$(date +%Y%m%d-%H%M).sql.gz"
mkdir -p "$(dirname "$OUT")"

# ใช้ pg_dump ใน container (หรือ pg_dump ตรง ๆ ถ้าลง native)
docker exec toshi-postgres-1 pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$OUT"

# ส่งขึ้น R2 (ต้องมี awscli: brew install awscli)
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "$OUT" "s3://$R2_BUCKET/backups/" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# เก็บ local ไว้ 14 วัน
find /Users/<user>/toshi/backups -name 'toshi-*.sql.gz' -mtime +14 -delete
```

ตั้งเวลาด้วย launchd (`StartCalendarInterval` ชั่วโมง 3) หรือ `crontab -e`:
`0 3 * * * /Users/<user>/toshi/scripts/backup.sh >> /Users/<user>/toshi/logs/backup.log 2>&1`

**ซ้อม restore จริงหนึ่งครั้ง** ก่อนจะเชื่อ backup:
`gunzip -c dump.sql.gz | docker exec -i toshi-postgres-1 psql -U toshi -d toshi_db`

## 9. อัปเดตโค้ด

```bash
cd ~/toshi && git pull
cd backend  && npm ci && npx prisma migrate deploy && npm run build
cd ../frontend && npm ci && npm run build
launchctl kickstart -k gui/$(id -u)/com.toshi.api
launchctl kickstart -k gui/$(id -u)/com.toshi.web
```

(`next build` peak ~705MB — build บนเครื่อง 8GB ได้สบาย ไม่ต้อง build ที่อื่น)

## 10. ตรวจสุขภาพ

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4000/graphql \
  -H 'content-type: application/json' -d '{"query":"{ __typename }"}'   # ควรได้ 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/          # 200 หรือ 307 (redirect ไป login)
ps -axo rss=,command= | grep -E 'dist/index.js|next-server' | grep -v grep
docker stats --no-stream
```

`dataSyncedAt` ที่ footer ของหน้าเว็บ = ตัวบอกว่า job รันล่าสุดเมื่อไหร่ ใช้เช็คว่า cron ยังมีชีวิต

## 11. ข้อจำกัดที่ยังเหลือ

- **เน็ตบ้าน/ไฟดับ = ดาวน์** — `autorestart 1` ช่วยให้บูตเองหลังไฟกลับ แต่ถ้าอยากให้นิ่งจริงควรมี UPS เล็ก ๆ (M1 กินไฟ ~10W ต่อได้นานมาก)
- **macOS auto-update รีบูตเอง** → ปิด automatic install ของ macOS updates ไว้ ทำมือเวลาที่สะดวก
- **Yahoo Finance** ยังเป็น unofficial API และ rate-limit เหมือนเดิม การย้ายมา self-host ไม่ได้ช่วยเรื่องนี้ (`p-queue` ใน `yahoo-finance.ts` คุมอยู่แล้ว)
- **timezone**: `daily-snapshot` / `storage-usage` ระบุ `timezone: 'UTC'` ไว้ชัดเจนแล้ว ปลอดภัยไม่ว่าเครื่องตั้ง TZ อะไร; `market-watch` เป็น `*/5` จึงไม่สนใจ TZ
