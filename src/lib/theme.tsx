import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "bloomberg" | "dark" | "light" | "contrast";

const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: "bloomberg", label: "Bloomberg (défaut)", description: "Sombre navy, accents verts" },
  { id: "dark", label: "Sombre neutre", description: "Gris sombre, meilleur contraste texte" },
  { id: "light", label: "Clair", description: "Fond blanc, lecture diurne" },
  { id: "contrast", label: "Haut contraste", description: "Noir/blanc, lisibilité maximale" },
];

export const AVAILABLE_THEMES = THEMES;

const STORAGE_KEY = "cfo.theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("theme-bloomberg", "theme-dark", "theme-light", "theme-contrast");
  root.classList.add(`theme-${theme}`);
  // keep .dark for tailwind dark variant on all except light
  if (theme === "light") root.classList.remove("dark");
  else root.classList.add("dark");
}

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "bloomberg",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("bloomberg");

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "bloomberg";
    setThemeState(saved);
    apply(saved);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    apply(t);
  };

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
