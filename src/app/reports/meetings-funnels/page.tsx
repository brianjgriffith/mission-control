import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { MeetingsFunnelsReport } from "./report";

interface PageProps {
  searchParams: Promise<{ month?: string; reps?: string }>;
}

export default async function MeetingsFunnelsPage({ searchParams }: PageProps) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const initialMonth = params.month ?? currentMonth;
  const initialRepIds = params.reps
    ? params.reps.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  return <MeetingsFunnelsReport initialMonth={initialMonth} initialRepIds={initialRepIds} />;
}
