import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ quotas: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
