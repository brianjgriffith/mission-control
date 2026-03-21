import { NextResponse } from "next/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
