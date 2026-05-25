import { useLayoutEffect, useRef, useState } from "react";

export function useStableElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    let animationFrame = 0;

    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        const nextWidth = Math.floor(entry.contentRect.width);
        const nextHeight = Math.floor(entry.contentRect.height);

        setSize((previous) => {
          const widthDelta = Math.abs(previous.width - nextWidth);
          const heightDelta = Math.abs(previous.height - nextHeight);

          if (widthDelta < 3 && heightDelta < 3) {
            return previous;
          }

          return {
            width: nextWidth,
            height: nextHeight,
          };
        });
      });
    });

    observer.observe(element);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return { ref, size };
}
