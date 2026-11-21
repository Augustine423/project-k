import { useEffect, useState } from "react";

const EVENTS = ["pointermove", "pointerdown", "touchstart", "keydown", "wheel"] as const;

/** True after `ms` without pointer, touch or key input; only tracks while `active`. */
export function useIdleWhen(active: boolean, ms = 3000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    EVENTS.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [active, ms]);

  return idle;
}
