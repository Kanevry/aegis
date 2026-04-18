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
        'flex h-screen w-64 shrink-0 flex-col border-r border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950',
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
  badge?: React.ReactNode;
}

export function SidebarNavItem({ href, icon, children, exact = false, badge }: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100',
      )}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      <span className="flex-1">{children}</span>
      {badge ? (
        <span className="inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/40">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
