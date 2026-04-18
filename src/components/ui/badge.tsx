import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
        secondary: 'bg-neutral-800 text-neutral-300 border border-neutral-700',
        destructive: 'bg-red-500/20 text-red-300 border border-red-500/30',
        outline: 'border border-neutral-700 text-neutral-300',
        success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
