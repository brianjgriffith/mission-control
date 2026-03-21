import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
