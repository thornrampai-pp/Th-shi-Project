import { builder } from './builder';

import '../modules/auth/auth.schema';
import '../modules/user/user.schema';

// Export ตัวแปรเดียวจบให้ไฟล์เปิดเซิร์ฟเวอร์หลักนำไปใช้
export const schema = builder.toSchema();