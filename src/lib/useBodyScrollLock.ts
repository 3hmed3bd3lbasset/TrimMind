import { useEffect } from 'react';

// Global counter to support nested/stacked modals cleanly without premature unlocking
let activeScrollLocks = 0;
let originalOverflow = '';
let originalPaddingRight = '';

/**
 * Universal Hook to prevent background body scroll bleeding when modals/drawers are open
 * Supports smooth nested dialogs, prevents layout shift, and cleans up on unmount.
 */
export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked || typeof window === 'undefined') return;

    if (activeScrollLocks === 0) {
      originalOverflow = document.body.style.overflow || '';
      originalPaddingRight = document.body.style.paddingRight || '';

      // Compensate for scrollbar width to prevent page jitter/layout shift
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      document.body.classList.add('modal-open');
    }

    activeScrollLocks += 1;

    return () => {
      activeScrollLocks = Math.max(0, activeScrollLocks - 1);
      if (activeScrollLocks === 0) {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        document.documentElement.style.overscrollBehavior = '';
        document.body.classList.remove('modal-open');
      }
    };
  }, [isLocked]);
}
