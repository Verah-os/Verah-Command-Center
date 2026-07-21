"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PortalNavLink({
  href,
  children,
  icon,
  className,
  activeClassName,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  activeClassName?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href as Route}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
    >
      {icon}
      {children}
    </Link>
  );
}
