"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { client } from "../graphql/client";
import { REGISTER_MUTATION } from "../graphql/mutations/registerMutation";
import { redirect } from "next/navigation";

// ปรับ Interface ให้ตรงกับที่ GraphQL ตอบกลับมา (ตามที่คุณส่งมาในคำถามก่อนหน้า)
interface RegisterResponse {
  register: {
    accessToken: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  };
}

export async function registerAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string; // เปลี่ยนจาก name
  const lastName = formData.get("lastName") as string; // เพิ่มส่วนนี้

  if (!email || !password || !firstName || !lastName) {
    return { error: "Please fill in all fields." };
  }

  try {
    const { data } = await client.mutate<RegisterResponse>({
      mutation: REGISTER_MUTATION,
      variables: { email, password, firstName, lastName },
    });

    if (!data?.register) {
      return { error: "Registration failed." };
    }

    // เมื่อถึงตรงนี้ Next.js จะโยน Redirect error
    redirect("/login");
  } catch (error: any) {
    // 🌟 ตรวจสอบว่าเป็น Error จากการ Redirect หรือไม่
    if (isRedirectError(error)) {
      throw error; // ให้โยนต่อไปเพื่อให้ Next.js จัดการ redirect ได้ปกติ
    }

    console.error("Register Error:", error);
    return {
      error: "An error occurred: " + (error.message || "Unable to connect."),
    };
  }
}
