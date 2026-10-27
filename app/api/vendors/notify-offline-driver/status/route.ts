import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canNotifyOffline } from "@/lib/offline-notification";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "VENDOR") {
      return NextResponse.json(
        { error: "Accès réservé aux vendeurs." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { error: "Le paramètre driverId est requis." },
        { status: 400 }
      );
    }

    const statusResult = await canNotifyOffline(session.userId, driverId);

    return NextResponse.json(statusResult);
  } catch (error) {
    console.error("[/api/vendors/notify-offline-driver/status GET] Erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la vérification du statut de notification." },
      { status: 500 }
    );
  }
}

