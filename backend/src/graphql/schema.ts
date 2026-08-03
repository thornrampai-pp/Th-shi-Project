import { builder } from "./builder";

import "../modules/auth/auth.schema";
import "../modules/user/user.schema";
import "../modules/portfolio/portfolio.schema";
import "../modules/cash/cash.schema";
import "../modules/transaction/transaction.schema";
import "../modules/asset/asset.schema";
// Export ตัวแปรเดียวจบให้ไฟล์เปิดเซิร์ฟเวอร์หลักนำไปใช้
export const schema = builder.toSchema();
