import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "articles");
const MAX_SIZE_BYTES = 1024 * 1024; // 1 Mo max après compression client
const ALLOWED_MIME = ["image/webp", "image/jpeg", "image/png"];

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Aucun fichier reçu." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non supporté (WebP, JPEG ou PNG requis)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "L'image dépasse la taille maximale de 1 Mo." },
        { status: 400 }
      );
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const ext =
      file.type === "image/webp"
        ? "webp"
        : file.type === "image/png"
        ? "png"
        : "jpg";
    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    const url = `/api/uploads/${filename}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/upload] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du téléversement de la photo." },
      { status: 500 }
    );
  }
}

