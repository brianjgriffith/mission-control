import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function Home() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user} />;
}
