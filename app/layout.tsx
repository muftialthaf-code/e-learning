import type { Metadata } from "next";
import Link from "next/link";
import { Layers2 } from "lucide-react";
import { Nav } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import "./style.css";

export const metadata: Metadata = { title: "AI Learning Engine", description: "Your personal learning space." };

const restoreTheme = `try{var theme=localStorage.getItem("learning-engine-theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme}catch{}`;

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: restoreTheme }} /></head>
    <body>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/"><span className="brand-icon"><Layers2 size={19} aria-hidden="true" /></span>AI Learning Engine</Link>
          <Nav />
          <ThemeToggle />
        </div>
      </header>
      <main>{children}</main>
    </body>
  </html>;
}
