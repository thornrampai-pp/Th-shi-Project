"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterButton() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      href="/register"
      className={`fixed bottom-8 right-8 w-16 h-16 rounded-full shadow-2xl z-50 transition-all duration-300 hover:scale-110 hover:shadow-black/50 cursor-pointer
        ${isHovered ? "bg-[#141414]" : "bg-white"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="Register"
    />
  );
}
