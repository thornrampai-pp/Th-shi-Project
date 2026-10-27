import { redirect } from "next/navigation";

// Portfolios is the home screen; "/" stays as the post-login landing URL.
export default function HomePage() {
  redirect("/portfolios");
}
