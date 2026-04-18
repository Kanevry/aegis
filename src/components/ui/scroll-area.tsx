/**
 * ScrollArea — native-overflow fallback (no @radix-ui/react-scroll-area installed).
 * Drop-in replacement that scrolls vertically with a styled scrollbar.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement>;

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('overflow-y-auto', className)}
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgb(64 64 64) transparent' }}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ScrollArea.displayName = 'ScrollArea';
