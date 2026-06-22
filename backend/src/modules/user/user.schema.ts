import { builder } from '../../graphql/builder';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthService } from '../auth/auth.service';

export const UserType = builder.objectRef<User>('User').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    email: t.exposeString('email'),
    firstName: t.exposeString('firstName', { nullable: true }),
    lastName: t.exposeString('lastName', { nullable: true }),
    role: t.exposeString('role'),
  }),
});

builder.mutationFields((t) => ({

  // 🔒 เปลี่ยนรหัสผ่านด้วยตัวเอง (PATCH /users/me/password)
  changeMyPassword: t.field({
    type: builder.objectRef<{ success: boolean }>('ChangePasswordResponse').implement({
      fields: (t) => ({ success: t.exposeBoolean('success') }),
    }),
    args: {
      oldPassword: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_root, { oldPassword, newPassword }, context) => {
      if (!context.userId) throw new Error('Unauthorized');

      const user = await prisma.user.findUnique({ where: { id: context.userId } });
      if (!user) throw new Error('User not found');

      // 1. เช็คก่อนว่ารหัสผ่านเก่าถูกต้องไหม
      const isMatch = await AuthService.verifyPassword(oldPassword, user.passwordHash);
      if (!isMatch) throw new Error('Invalid old password');

      // 2. แฮชตัวใหม่แล้วเซฟทับ
      const newHash = await AuthService.hashPassword(newPassword);
      await prisma.user.update({
        where: { id: context.userId },
        data: { passwordHash: newHash },
      });

      return { success: true };
    },
  }),

  // 🗑️ ลบประวัติตัวเองแบบซอฟต์ๆ (DELETE /users/me)
  deleteMe: t.field({
    type: builder.objectRef<{ success: boolean }>('DeleteMeResponse').implement({
      fields: (t) => ({ success: t.exposeBoolean('success') }),
    }),
    resolve: async (_root, _args, context) => {
      if (!context.userId) throw new Error('Unauthorized');

      /**
       * 💡 คอนเซปต์ Soft Delete:
       * แนะนำให้ไปเพิ่มคอลัมน์ `deletedAt DateTime?` หรือ `isActive Boolean @default(true)` ไว้ใน schema.prisma
       * แล้วใช้การ Update แทนการ Delete ครับ ข้อมูลลูกค้าจะได้ไม่หายไปจากระบบจริง
       */
      await prisma.user.update({
        where: { id: context.userId },
        // ปรับตามโครงสร้างฟิลด์ใน Prisma ของคุณ เช่น isActive: false หรือ deletedAt: new Date()
        data: { isActive: false }, 
      });

      return { success: true };
    },
  }),

  // 👑 แอดมินเปลี่ยนรหัสผ่านให้สมาชิก (PATCH /users/:userId/password)
  adminChangePassword: t.field({
    type: UserType, // รีเทิร์นข้อมูลผู้ใช้ที่ถูกเปลี่ยนรหัสกลับไปดู
    args: {
      targetUserId: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: async (_root, { targetUserId, newPassword }, context) => {
      if (!context.userId) throw new Error('Unauthorized');

      // 1. ตรวจสอบก่อนว่าคนที่ยิงเข้ามาเนี่ย เป็น ADMIN ตัวจริงหรือเปล่า
      const currentUser = await prisma.user.findUnique({ where: { id: context.userId } });
      if (!currentUser || currentUser.role !== 'ADMIN') {
        throw new Error('Permission denied! Admin only.');
      }

      // 2. Bypass เปลี่ยนรหัสผ่านให้เป้าหมายได้ทันทีโดยไม่ต้องถามหารหัสเก่า
      const newHash = await AuthService.hashPassword(newPassword);
      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
        data: { passwordHash: newHash },
      });

      return updatedUser;
    },
  }),
}));