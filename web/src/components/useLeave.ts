import { useState } from 'react';

/** Lets a pop-up play a short exit animation before it is removed: `leave(fn)` runs `fn` after it. */
export function useLeave(ms = 160) {
  const [leaving, setLeaving] = useState(false);
  const leave = (fn: () => void) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(fn, ms);
  };
  return { leaving, leave };
}
