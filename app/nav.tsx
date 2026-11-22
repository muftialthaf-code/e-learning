"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "./navigation";

export function Nav() {
  const path = usePathname();
  const links = [{ href: "/", title: "My Learning" }, ...Object.entries(sections).map(([slug, section]) => ({ href: "/" + slug, ...section }))];
  return <nav aria-label="Main navigation">
    {links.map(({ href, title }) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
      {title}
    </Link>)}
  </nav>;
}
