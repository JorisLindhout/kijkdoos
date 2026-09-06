import { Kijkdoos } from "./scene/Kijkdoos";
import { ThemeProvider } from "./useTheme";

export function App() {
  return (
    <ThemeProvider>
      <Kijkdoos />
    </ThemeProvider>
  );
}
