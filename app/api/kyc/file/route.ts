import { NextResponse } from "next/server";
import { readDecryptedPrivateFile, verifySignedKycUrl } from "@/lib/storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";
  const exp = searchParams.get("exp") || "";
  const sig = searchParams.get("sig") || "";

  if (!key || !exp || !sig || !verifySignedKycUrl(key, exp, sig)) {
    return NextResponse.json(
      { error: "Lien signé invalide ou expiré (validité max 1h)." },
      { status: 403 }
    );
  }

  const file = await readDecryptedPrivateFile(key);
  if (!file) {
    return NextResponse.json(
      { error: "Document introuvable." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

