import { prisma } from "../../lib/prisma";

export class WatchListService {
  // ดึง WatchList ทั้งหมดของ User พร้อมรายการสินค้าและข้อมูล Asset
  static async getWatchLists(userId: string) {
    return await prisma.watchList.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            asset: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  // สร้างกลุ่ม WatchList ใหม่
  static async createWatchList(userId: string, name: string) {
    return await prisma.watchList.create({
      data: {
        userId,
        name,
      },
      include: {
        items: { include: { asset: true } },
      },
    });
  }

  // เพิ่มสินทรัพย์เข้า WatchList พร้อมบันทึก Note (Investment Thesis)
  static async addAssetToWatchList(watchListId: string, assetId: string, note?: string) {
    return await prisma.watchListItem.create({
      data: {
        watchListId,
        assetId,
        note: note ?? null
      },
      include: {
        asset: true,
      },
    });
  }

  // แก้ไขโน้ต / วิทยานิพนธ์การลงทุน (Investment Thesis)
  static async updateWatchListItemNote(itemId: string, note: string) {
    return await prisma.watchListItem.update({
      where: { id: itemId },
      data: { note },
      include: { asset: true },
    });
  }

  // ลบสินทรัพย์ออกจาก WatchList
  static async removeAssetFromWatchList(itemId: string): Promise<boolean> {
    await prisma.watchListItem.delete({
      where: { id: itemId },
    });
    return true;
  }

  // ดึงรายการ Alert ของ User
  static async getAlerts(userId: string) {
    return await prisma.alert.findMany({
      where: { userId },
      include: {
        asset: true,
      },
    });
  }

  // สร้างเงื่อนไขแจ้งเตือนใหม่
  static async createAlert(userId: string, assetId: string, condition: string, targetValue: number) {
    return await prisma.alert.create({
      data: {
        userId,
        assetId,
        condition,
        targetValue,
        isActive: true,
      },
      include: {
        asset: true,
      },
    });
  }

  // เปิด/ปิดการทำงานของ Alert
  static async toggleAlertStatus(alertId: string, isActive: boolean) {
    return await prisma.alert.update({
      where: { id: alertId },
      data: { isActive },
      include: {
        asset: true,
      },
    });
  }
}