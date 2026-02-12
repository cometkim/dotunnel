"use client";

import { LinkButton } from "@cloudflare/kumo/components/button";
import {
  ArrowLeft,
  CaretRight,
  Database,
  Gear,
  Globe,
  SignOut,
  SquaresFour,
  User,
} from "@phosphor-icons/react";
import type * as React from "react";
import { cn } from "#app/lib/utils.ts";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: <SquaresFour size={16} />,
  },
  {
    label: "Configuration",
    href: "/admin/config",
    icon: <Gear size={16} />,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: <User size={16} />,
  },
  {
    label: "Sessions",
    href: "/admin/sessions",
    icon: <Database size={16} />,
  },
];

type Breadcrumb = {
  label: string;
  href?: string;
};

type AdminLayoutProps = {
  currentPath: string;
  breadcrumbs?: Breadcrumb[];
  user: {
    name: string;
    email: string;
    image: string | null;
  };
  children: React.ReactNode;
};

export function AdminLayout({
  currentPath,
  breadcrumbs,
  user,
  children,
}: AdminLayoutProps): React.ReactElement {
  return (
    <div className="min-h-screen bg-kumo-base">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-kumo-line bg-kumo-base">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-kumo-line px-4">
            <a href="/admin" className="flex items-center gap-2 font-semibold">
              <Globe size={20} />
              <span>DOtunnel Admin</span>
            </a>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            <a
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-kumo-subtle transition-colors hover:bg-kumo-elevated hover:text-kumo-default"
            >
              <ArrowLeft size={16} />
              Back to DOtunnel
            </a>
            <div className="my-2 border-t border-kumo-line" />
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  currentPath === item.href ||
                    (item.href !== "/admin" &&
                      currentPath.startsWith(item.href))
                    ? "bg-kumo-brand text-white"
                    : "text-kumo-subtle hover:bg-kumo-elevated hover:text-kumo-default",
                )}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-kumo-line p-4">
            <div className="flex items-center gap-3">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kumo-elevated">
                  <User size={16} />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-kumo-subtle">
                  {user.email}
                </p>
              </div>
              <LinkButton
                href="/_auth/logout"
                title="Sign out"
                variant="ghost"
                shape="square"
                size="sm"
                icon={<SignOut size={16} />}
                aria-label="Sign out"
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="container max-w-6xl py-8">
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="mb-4 flex items-center gap-1 text-sm text-kumo-subtle">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.label} className="flex items-center gap-1">
                  {index > 0 && <CaretRight size={16} />}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-kumo-default">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-kumo-default">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
