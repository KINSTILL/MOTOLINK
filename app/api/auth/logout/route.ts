import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, ONBOARDING_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete(ONBOARDING_COOKIE_NAME);
  return response;
}

