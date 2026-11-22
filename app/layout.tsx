import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "./nav";
import "./style.css";

export const metadata: Metadata = { title: "AI Learning Engine", description: "Your personal learning space." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <aside className="rail">
      <Link className="brand" href="/"><span aria-hidden="true">✦</span><span>AI Learning<br /> Engine</span></Link>
      <Nav />
    </aside>
    <main>{children}</main>
  </body></html>;
}
