import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const PROOFS_DIR = path.join(process.cwd(), "public", "uploads", "proofs");

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeName) {
      return NextResponse.json(
        { error: "Nom de fichier invalide" },
        { status: 400 }
      );
    }

    const filePath = path.join(PROOFS_DIR, safeName);
    const buffer = await fs.readFile(filePath);

    const ext = path.extname(safeName).toLowerCase();
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
        ? "image/png"
        : "image/jpeg";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Fichier de preuve introuvable" },
      { status: 404 }
    );
  }
}

