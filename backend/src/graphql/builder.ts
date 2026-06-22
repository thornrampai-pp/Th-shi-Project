import SchemaBuilder from "@pothos/core";
import { GraphQLContext } from "./context";

// สร้างตัวสร้าง Schema โดยผูกกับ GraphQLContext ของเราไว้
// เพื่อให้ Resolvers ทุกตัวในแอปพลิเคชันรู้ว่ามี context.userId ให้ใช้
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
}>({});

// เปิดจองตารางสำหรับ Query และ Mutation ตั้งต้นไว้ให้โมดูลอื่นมาขยายต่อได้
builder.queryType({});
builder.mutationType({});
