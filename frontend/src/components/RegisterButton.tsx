import Link from "next/link";

/** Hidden easter-egg entry to /register: white-on-white until hovered or focused. */
export default function RegisterButton() {
  return (
    <Link
      href="/register"
      aria-label="Sign up"
      className="fixed right-8 bottom-8 z-50 size-16 rounded-full bg-white transition-all duration-300 outline-none hover:scale-110 hover:bg-[#141414] hover:shadow-2xl focus-visible:bg-[#141414]"
    />
  );
}
