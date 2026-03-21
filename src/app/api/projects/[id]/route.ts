import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({});
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
