"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "./navigation";

const links = [{ href: "/", title: "My Learning" }, ...Object.entries(sections).map(([slug, section]) => ({ href: "/" + slug, ...section }))];

export function Nav() {
  const path = usePathname();
  return <nav aria-label="Main navigation" className="main-nav">
    {links.map(({ href, title }) => {
      const active = path === href || (href !== "/" && path.startsWith(href + "/"));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{title}</Link>;
    })}
  </nav>;
}
