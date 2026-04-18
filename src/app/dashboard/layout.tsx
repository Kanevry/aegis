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
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Sidebar, SidebarNav, SidebarNavItem } from '@/components/ui/sidebar';
import { usePendingApprovals } from '@/lib/use-pending-approvals';

interface NavItem {
  href: Route;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
  badge?: React.ReactNode;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { count } = usePendingApprovals();

  const pendingBadge = count > 0 ? <span>{count}</span> : undefined;

  const navItems: NavItem[] = [
    { href: '/dashboard' as Route, icon: <LayoutDashboard size={16} />, label: 'Overview', exact: true },
    { href: '/dashboard/testbed' as Route, icon: <Zap size={16} />, label: 'Testbed' },
    { href: '/dashboard/chat' as Route, icon: <MessageSquare size={16} />, label: 'Chat' },
    { href: '/dashboard/approvals' as Route, icon: <ShieldAlert size={16} />, label: 'Approvals', badge: pendingBadge },
    { href: '/dashboard/flow' as Route, icon: <GitBranch size={16} />, label: 'Flow' },
    { href: '/dashboard/sandbox' as Route, icon: <ShieldCheck size={16} />, label: 'Sandbox' },
    { href: '/dashboard/compare' as Route, icon: <GitCompareArrows size={16} />, label: 'Compare' },
    { href: '/dashboard/eval' as Route, icon: <Grid2X2Check size={16} />, label: 'Eval' },
    { href: '/dashboard/events' as Route, icon: <Activity size={16} />, label: 'Events' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar>
        <div className="flex h-14 items-center border-b border-neutral-200 px-6 dark:border-neutral-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-neutral-950 dark:text-white">
              Ægis
            </span>
            <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
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
              badge={item.badge}
            >
              {item.label}
            </SidebarNavItem>
          ))}
        </SidebarNav>
      </Sidebar>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-neutral-200 bg-white/70 px-6 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
          <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Ægis
            <span className="mx-2 text-neutral-300 dark:text-neutral-700">/</span>
          </span>
          <div className="flex-1" />
          <nav className="flex items-center gap-4">
            <a
              href="https://github.com/Kanevry/aegis"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
              aria-label="GitHub repository"
            >
              <GitBranch size={14} />
              GitHub
            </a>
            <a
              href="https://sentry.io/organizations/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
              aria-label="Sentry dashboard"
            >
              <Activity size={14} />
              Sentry
            </a>
          </nav>
        </header>

        <main className="flex-1 overflow-auto bg-gradient-to-b from-neutral-50 via-neutral-50 to-white p-6 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950">
          {children}
        </main>
      </div>
    </div>
  );
}
