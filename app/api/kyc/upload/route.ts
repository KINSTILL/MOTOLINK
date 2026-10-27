import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { storeEncryptedPrivateFile } from "@/lib/storage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 Mo max

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const slot = String(formData.get("slot") || "doc").replace(/[^a-zA-Z0-9_-]/g, "");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Aucun fichier fourni." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Format d'image non supporté (JPEG, PNG ou WebP requis)." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 8 Mo)." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const key = await storeEncryptedPrivateFile(
      buffer,
      file.type,
      session.userId,
      slot
    );

    return NextResponse.json({ key, slot }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/kyc/upload] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors du téléversement sécurisé." },
      { status: 500 }
    );
  }
}

