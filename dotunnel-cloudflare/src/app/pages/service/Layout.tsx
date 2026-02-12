"use client";

import { Button } from "@cloudflare/kumo/components/button";
import { Gear, Globe, Plug, SignOut, User } from "@phosphor-icons/react";
import type * as React from "react";
import { cn } from "#app/lib/utils.ts";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    label: "My Tunnels",
    href: "/",
    icon: <Plug size={16} />,
  },
];

type ServiceLayoutProps = {
  currentPath: string;
  user: {
    name: string;
    email: string;
    image: string | null;
  };
  children: React.ReactNode;
};

export function ServiceLayout({
  currentPath,
  user,
  children,
}: ServiceLayoutProps): React.ReactElement {
  return (
    <div className="min-h-screen bg-kumo-base">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-kumo-line bg-kumo-elevated">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-kumo-line px-4">
            <a href="/" className="flex items-center gap-2 font-semibold">
              <Globe size={20} />
              <span>DOtunnel</span>
            </a>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  currentPath === item.href
                    ? "bg-kumo-brand text-white"
                    : "text-kumo-subtle hover:bg-kumo-elevated hover:text-kumo-default",
                )}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
            <div className="my-2 border-t border-kumo-line" />
            <a
              href="/admin"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-kumo-subtle transition-colors hover:bg-kumo-elevated hover:text-kumo-default"
            >
              <Gear size={16} />
              Admin
            </a>
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
              <a href="/_auth/logout" title="Sign out">
                <Button
                  variant="ghost"
                  shape="square"
                  size="sm"
                  aria-label="Sign out"
                  icon={<SignOut size={16} />}
                />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="container max-w-6xl py-8">{children}</div>
      </main>
    </div>
  );
}
