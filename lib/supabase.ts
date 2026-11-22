import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const learningSchema = "learning_engine" as const;
export const learningCookie = "learning-engine-auth";

export async function supabase(writable = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const store = await cookies();
  if (!url || !key) return null;

  return createServerClient(url, key, {
    db: { schema: learningSchema },
    cookieOptions: { name: learningCookie },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (updates) => {
        if (writable) {
          for (const { name, value, options } of updates) store.set(name, value, options);
        }
      },
    },
  });
}
