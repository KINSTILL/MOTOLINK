import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "articles");

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const filePath = path.join(UPLOAD_DIR, safeName);
    const buffer = await fs.readFile(filePath);

    const mimeType = safeName.endsWith(".webp")
      ? "image/webp"
      : safeName.endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  }
}

