import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { applyTheme, dayAmount, mixPalette, type Palette } from "./theme";

const ThemeContext = createContext<Palette>(mixPalette());

function readPalette() {
  return mixPalette(dayAmount());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(readPalette);

  useEffect(() => {
    const tick = () => {
      const next = readPalette();
      applyTheme(next);
      setPalette(next);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    const onWake = () => tick();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

/** R3F has its own tree, so the outer provider must be re-bridged inside Canvas. */
export function PaletteBridge({
  palette,
  children,
}: {
  palette: Palette;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function usePalette() {
  return useContext(ThemeContext);
}
