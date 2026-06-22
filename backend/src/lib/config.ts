import '../lib/prisma'; // มั่นใจว่าแอปเริ่มโหลดค่าแล้ว

const getEnvMeta = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`บั๊กจากระบบ: ลืมตั้งค่าตัวแปร "${key}" ในไฟล์ .env หรือเปล่าครับ?`);
  }
  return value;
};

export const config = {
  databaseUrl: getEnvMeta('DATABASE_URL'),
  port: parseInt(process.env.PORT || '4000', 10),
  jwt: {
    accessSecret: getEnvMeta('JWT_ACCESS_SECRET'),
    refreshSecret: getEnvMeta('JWT_REFRESH_SECRET'),
  },
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
};