"use client";

import {
  ArrowLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
  User,
} from "lucide-react";
import type * as React from "react";
import { buttonVariants } from "#app/components/ui/button.tsx";
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
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    label: "Configuration",
    href: "/admin/config",
    icon: <Settings className="h-4 w-4" />,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: <User className="h-4 w-4" />,
  },
  {
    label: "Sessions",
    href: "/admin/sessions",
    icon: <Database className="h-4 w-4" />,
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
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b px-4">
            <a href="/admin" className="flex items-center gap-2 font-semibold">
              <Network className="h-5 w-5" />
              <span>DOtunnel Admin</span>
            </a>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            <a
              href="/"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to DOtunnel
            </a>
            <div className="my-2 border-t" />
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  currentPath === item.href ||
                    (item.href !== "/admin" &&
                      currentPath.startsWith(item.href))
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4" />
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <a
                href="/_auth/logout"
                title="Sign out"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                )}
              >
                <LogOut className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="container max-w-6xl py-8">
          {/* Breadcrumbs */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.label} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight className="h-4 w-4" />}
                  {crumb.href ? (
                    <a href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
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
