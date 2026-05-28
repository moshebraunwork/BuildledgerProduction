import { redirect } from "next/navigation";

// The bare domain has no content of its own — anyone landing here goes to
// /dashboard (which then enforces auth via middleware + the (app) layout).
export default function RootPage() {
  redirect("/dashboard");
}
