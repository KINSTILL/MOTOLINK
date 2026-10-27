import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AuthTokenPayload,
  verifyJwt,
} from "@/lib/auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/missions",
  "/tickets",
  "/subscription",
  "/kyc",
  "/drivers",
  "/admin",
];
const AUTH_ROUTES = ["/login", "/verify"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  const session = token ? await verifyJwt<AuthTokenPayload>(token) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Redirige vers /login si pas de session sur les routes /(app)/* et /admin/*
  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirige vers /dashboard/{role} si session active sur /login ou /verify
  if (AUTH_ROUTES.includes(pathname) && session) {
    const roleSlug = session.role.toLowerCase();
    return NextResponse.redirect(
      new URL(`/dashboard/${roleSlug}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/missions/:path*",
    "/tickets/:path*",
    "/subscription/:path*",
    "/kyc/:path*",
    "/drivers/:path*",
    "/admin/:path*",
    "/login",
    "/verify",
  ],
};
