'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Sidebar({ className, children }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn(
        'flex h-screen w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950',
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarNav({ className, children }: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav className={cn('flex flex-col gap-1 px-3 py-4', className)}>
      {children}
    </nav>
  );
}

interface SidebarNavItemProps {
  href: Route;
  icon: React.ReactNode;
  children: React.ReactNode;
  exact?: boolean;
}

export function SidebarNavItem({ href, icon, children, exact = false }: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-neutral-800 text-white'
          : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100',
      )}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {children}
    </Link>
  );
}
