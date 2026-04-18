'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  Activity,
  Grid2X2Check,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Sidebar, SidebarNav, SidebarNavItem } from '@/components/ui/sidebar';

const navItems: { href: Route; icon: React.ReactNode; label: string; exact?: boolean }[] = [
  { href: '/dashboard' as Route, icon: <LayoutDashboard size={16} />, label: 'Overview', exact: true },
  { href: '/dashboard/testbed' as Route, icon: <Zap size={16} />, label: 'Testbed' },
  { href: '/dashboard/flow' as Route, icon: <GitBranch size={16} />, label: 'Flow' },
  { href: '/dashboard/sandbox' as Route, icon: <ShieldCheck size={16} />, label: 'Sandbox' },
  { href: '/dashboard/compare' as Route, icon: <GitCompareArrows size={16} />, label: 'Compare' },
  { href: '/dashboard/eval' as Route, icon: <Grid2X2Check size={16} />, label: 'Eval' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar>
        <div className="flex h-14 items-center border-b border-neutral-800 px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-white">Ægis</span>
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-medium text-indigo-300">
              beta
            </span>
          </Link>
        </div>
        <SidebarNav>
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              exact={item.exact}
            >
              {item.label}
            </SidebarNavItem>
          ))}
        </SidebarNav>
      </Sidebar>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-neutral-800 px-6">
          <span className="text-sm font-medium text-neutral-400">
            Ægis
            <span className="mx-2 text-neutral-700">/</span>
          </span>
          <div className="flex-1" />
          <nav className="flex items-center gap-4">
            <a
              href="https://github.com/Kanevry/aegis"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-100"
              aria-label="GitHub repository"
            >
              <GitBranch size={14} />
              GitHub
            </a>
            <a
              href="#"
              className="flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-100"
              aria-label="Sentry dashboard"
            >
              <Activity size={14} />
              Sentry
            </a>
          </nav>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
