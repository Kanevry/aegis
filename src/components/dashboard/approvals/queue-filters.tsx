'use client';

import { Input } from '@/components/ui/input';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'all';

export interface QueueFiltersProps {
  status: ApprovalStatus;
  tool: string;
  onStatusChange: (status: ApprovalStatus) => void;
  onToolChange: (tool: string) => void;
}

const STATUS_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

export function QueueFilters({ status, tool, onStatusChange, onToolChange }: QueueFiltersProps) {
  return (
    <div className="flex flex-col gap-2 p-3 border-b border-neutral-800">
      <div className="flex items-center gap-2">
        <label htmlFor="approval-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="approval-status-filter"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ApprovalStatus)}
          className="flex h-9 flex-1 rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-1 text-sm text-neutral-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-neutral-900 text-neutral-100">
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="approval-tool-filter" className="sr-only">
          Search by tool
        </label>
        <Input
          id="approval-tool-filter"
          type="search"
          placeholder="Filter by tool…"
          value={tool}
          onChange={(e) => onToolChange(e.target.value)}
          aria-label="Search by tool name"
        />
      </div>
    </div>
  );
}
