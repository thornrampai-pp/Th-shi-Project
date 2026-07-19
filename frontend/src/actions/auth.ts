"use server";

import { client } from "../graphql/client";
import { LOGIN_MUTATION } from "../graphql/mutations/loginMutation";
import { redirect } from "next/navigation";

interface LoginResponse {
  login: {
    accessToken: string;
    user: { id: string; email: string };
  };
}

// 🌟 รับ prevState เพิ่มเข้ามาเพื่อทำ useActionState
export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    if (!email || !password) {
      return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" };
    }
    // 🎯 เติม <LoginResponse> ตรงนี้ เพื่อให้รู้ว่ามี property 'login' แน่นอน
    const { data } = await client.mutate<LoginResponse>({
      mutation: LOGIN_MUTATION,
      variables: { email, password },
    });

    const token = data?.login?.accessToken;

    if (!token) {
      return { error: "Email หรือ Password ไม่ถูกต้อง" };
    }

    // 🏎️ ล็อกอินผ่าน สั่งย้ายหน้าได้เลย
    redirect("/dashboard");
  } catch (error) {
    console.error("Login Error:", error);

    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    return { error: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบหลังบ้าน" };
  }
}
