# Tōshi — Frontend

Next.js (App Router) + Tailwind CSS 4 + Apollo Client คุยกับ backend GraphQL ใน `../backend`

> Next.js 16 ต่างจากเวอร์ชันเก่าหลายจุด (เช่น `middleware.ts` → `proxy.ts`) ดู docs ที่ตรงเวอร์ชันได้ใน `node_modules/next/dist/docs/`

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env.local
npm run dev                # http://localhost:3000 (ต้องรัน backend ที่ :4000 ด้วย)
```

| ตัวแปร | หมายเหตุ |
|---|---|
| `BACKEND_GRAPHQL_URL` | URL ของ backend GraphQL ใช้ฝั่ง server เท่านั้น browser ไม่ได้ยิงไปตรง ๆ |

## Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `npm start` | build / รัน production |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run codegen` | gen type จาก schema ของ backend ไปที่ `src/gql` (ต้องรัน backend อยู่) |
| `npm run codegen:watch` | เหมือนข้างบน แต่ gen ใหม่ทุกครั้งที่แก้ query |

## Auth (BFF)

Token ไม่ถึง JavaScript ฝั่ง browser เลย:

```
Browser ──cookie──▶ Next (/api/graphql, proxy.ts, Server Components) ──Bearer──▶ Backend
```

- **Cookie:** `toshi_at` (access) และ `toshi_rt` (refresh) เป็น httpOnly ทั้งคู่ อายุ cookie ตาม `exp` ใน JWT โดย access หมดก่อน JWT 30 วินาที
- **`src/proxy.ts`:** ทำงานทุกครั้งที่เปิดหน้า ถ้า access หมดแต่ยังมี refresh จะ refresh ให้ก่อน (Server Component ตั้ง cookie เองไม่ได้) แล้วเช็คว่าต้อง login ไหม
- **`/api/graphql`:** endpoint ของ Apollo ฝั่ง client ใส่ access token ให้ ถ้า backend ตอบ `UNAUTHORIZED` จะ refresh แล้วลองใหม่ 1 ครั้ง
- **Refresh token rotation:** backend revoke refresh token ทุกครั้งที่ใช้ `refreshTokens()` จึงรวม request ที่ refresh ด้วย token เดียวกันให้เหลือครั้งเดียว และจำผลไว้ 10 วินาที (เก็บใน memory ของ process ถ้ารันหลาย instance ต้องเปลี่ยนวิธี)
- **Login / register / logout:** Server Actions ใน `src/actions/auth.ts`

## ดึงข้อมูล

เขียน query ด้วย `graphql()` จาก `@/gql` แล้วรัน `npm run codegen` จะได้ type ของผลลัพธ์และตัวแปรอัตโนมัติ

```tsx
// Server Component
const MeQuery = graphql(`query Me { me { id email } }`);
const { me } = await serverQuery(MeQuery);

// Client Component
const { data } = useQuery(MeQuery);
```

`src/gql/` เป็นไฟล์ที่ gen ออกมาและ commit ไว้ด้วย build จึงไม่ต้องรัน backend

## โครงสร้าง

```
src/
├── proxy.ts            refresh token + route guard
├── actions/            Server Actions
├── app/
│   ├── (auth)/         login, register (เปิดได้ตอนยังไม่ login)
│   ├── (app)/          หน้าที่ต้อง login
│   ├── api/graphql/    BFF endpoint
│   └── providers.tsx   ApolloProvider
├── gql/                GraphQL Codegen output (ห้ามแก้เอง)
└── lib/
    ├── auth/tokens.ts  cookie + refresh
    ├── graphql/        backend fetch, serverQuery()
    ├── apollo/         Apollo Client
    └── utils.ts        cn() สำหรับรวม Tailwind class
```

Design token (สี ฟอนต์) อยู่ใน `src/app/globals.css` ใช้ผ่าน Tailwind เช่น `bg-background`, `text-muted-foreground`, `text-gain`, `text-loss`
