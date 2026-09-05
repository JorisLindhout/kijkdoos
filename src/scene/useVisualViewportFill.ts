import { useLayoutEffect, useRef, type RefObject } from "react";

/** Size the stage to the visible viewport, including iOS URL-bar show/hide. */
export function useVisualViewportFill(
  ref: RefObject<HTMLElement | null>,
): void {
  const raf = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (!vv) {
          el.style.position = "fixed";
          el.style.inset = "0";
          el.style.width = "100%";
          el.style.height = "100%";
          el.style.transform = "";
          return;
        }
        el.style.position = "fixed";
        el.style.left = "0";
        el.style.top = "0";
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.width = `${vv.width}px`;
        el.style.height = `${vv.height}px`;
        el.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`;
      });
    };

    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
    };
  }, [ref]);
}
