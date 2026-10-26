import { cn } from "@/lib/utils";

/** Small inverted version of the login-page face, for the dark header. */
export default function FaceLogo({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-block size-6 rounded-full bg-[#d9d9d9]", className)}>
      <span className="absolute top-[29%] left-[22%] size-[18%] rounded-full bg-black" />
      <span className="absolute top-[29%] left-[60%] size-[18%] rounded-full bg-black" />
      <span className="absolute top-[64%] left-[31%] h-[9%] w-[38%] bg-black" />
    </span>
  );
}
