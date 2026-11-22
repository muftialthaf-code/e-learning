import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { learningCookie } from "./lib/supabase";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookieOptions: { name: learningCookie },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (updates) => {
        for (const { name, value } of updates) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of updates) response.cookies.set(name, value, options);
      },
    },
  });
  await client.auth.getClaims();
  return response;
}

export const config = { matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"] };
