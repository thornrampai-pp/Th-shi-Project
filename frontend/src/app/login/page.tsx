"use client";

import { useActionState, useRef } from "react";
import { loginAction } from "../../actions/auth";
import RegisterButton from "@/src/components/RegisterButton";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // 🌟 เปลี่ยนเป็น onMouseDown และใช้ e.preventDefault() เพื่อตัดวงจรการเด้งกลับตอนปล่อยเมาส์
  const handleRobotMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // ถ้าตั้งใจกดช่องกรอกข้อมูล หรือ ลิงก์ ให้ปล่อยให้ Focus ทำงานปกติ
    if (target.tagName === "INPUT" || target.tagName === "A") {
      return;
    }

    // 🛑 ป้องกันไม่ให้การกดพื้นที่อื่นไปกระตุ้นหรือกวน Focus ดั้งเดิมตอนปล่อยเมาส์
    e.preventDefault();

    const activeEl = document.activeElement;
    const isFocused = activeEl && activeEl.tagName === "INPUT";

    if (isFocused) {
      // ถ้าเปิดอยู่ -> สั่งปิดถาวร (ไม่เด้งกลับตอนปล่อยนิ้วแล้ว)
      (activeEl as HTMLElement).blur();
    } else {
      // ถ้าปิดอยู่ -> สั่งเปิด
      emailInputRef.current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col font-sans select-none">
      <div className="fixed bottom-8 right-8 z-50">
        <RegisterButton />
      </div>
      <main className="flex-1 flex items-center justify-center">
        <div
          className={`w-full min-h-screen bg-white flex flex-col items-center justify-center relative px-6 overflow-hidden group/form transition-all duration-700 ease-in-out
          ${isPending ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}
        >
          <form
            action={formAction}
            className="w-full flex flex-col items-center relative"
          >
            {/* 🔄 เปลี่ยนจาก onClick เป็น onMouseDown */}
            <div
              onMouseDown={handleRobotMouseDown}
              className="relative w-105 h-105 flex items-center justify-center transition-all duration-500 group-focus-within/form:-translate-y-4 outline-none cursor-pointer"
            >
              {/* 🌑 หัวหุ่นยนต์สีดำ */}
              <div className="w-100 h-100 bg-[#141414] rounded-full flex flex-col items-center justify-center relative shadow-lg group overflow-hidden">
                {/* 👀 ตาหุ่นยนต์ */}
                <div className="flex gap-16 mb-25 z-10 transition-all duration-500 group-focus-within/form:-translate-y-6 group-focus-within/form:opacity-0">
                  <div className="w-20 h-20 bg-[#646363] rounded-full transition-all duration-300 group-hover:scale-110 group-hover:bg-[#d9d9d9]" />
                  <div className="w-20 h-20 bg-[#646363] rounded-full transition-all duration-300 group-hover:scale-110 group-hover:bg-[#d9d9d9]" />
                </div>

                {/* 👄 ปากมหาภัย */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-27 h-7 bg-[#646363] rounded-sm transition-all duration-500 ease-in-out p-4 flex flex-col justify-center items-center mt-6
                                group-hover:w-32 group-hover:bg-[#d9d9d9]
                                group-focus-within/form:mt-0 group-focus-within/form:!w-[300px] group-focus-within/form:!h-[200px] group-focus-within/form:!bg-white group-focus-within/form:rounded-2xl group-focus-within/form:shadow-2xl z-0"
                >
                  {/* 📩 ฟอร์มด้านในปากที่ขยายใหญ่ */}
                  <div
                    className="form-inner-content w-full flex flex-col gap-3 h-0 opacity-0 pointer-events-none transition-all duration-500 ease-in-out 
                                  group-focus-within/form:h-auto group-focus-within/form:opacity-100 group-focus-within/form:pointer-events-auto"
                  >
                    <h3 className="text-center font-bold text-sm text-black mb-1 tracking-wider uppercase opacity-80">
                      Welcome Back
                    </h3>

                    <input
                      ref={emailInputRef}
                      type="email"
                      name="email"
                      placeholder="Email Address"
                      className="w-full py-2 px-3 text-xs border border-gray-200 rounded-lg outline-none bg-gray-50/50 transition-all text-black placeholder-gray-400 focus:border-black focus:bg-white focus:shadow-sm"
                      required
                      disabled={isPending}
                    />

                    <input
                      type="password"
                      name="password"
                      placeholder="Password"
                      className="w-full py-2 px-3 text-xs border border-gray-200 rounded-lg outline-none bg-gray-50/50 transition-all text-black placeholder-gray-400 focus:border-black focus:bg-white focus:shadow-sm"
                      required
                      disabled={isPending}
                    />

                    <a
                      href="#forgot"
                      className="text-[10px] text-[#5271ff] text-right opacity-60 hover:opacity-100 hover:underline transition-all tracking-wide mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Forget password?
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* ⚠️ Error Message */}
            {state?.error && (
              <p className="text-xs text-red-500 mt-4 animate-pulse">
                {state.error}
              </p>
            )}

            <button type="submit" className="hidden" disabled={isPending} />
          </form>
        </div>
      </main>
    </div>
  );
}
