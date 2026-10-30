import { useEffect, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const key = "kbase-react-theme";
function initialTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === "light" || value === "dark" || value === "system")
      return value;
  } catch {
    /* A restricted browser can still use an in-memory theme. */
  }
  return "light";
}

// This is a client-only Vite app, so theme initialization does not need an SSR script.
export function useAppearance() {
  const [theme, updateTheme] = useState<Theme>(initialTheme);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);
  function setTheme(value: string) {
    if (value !== "light" && value !== "dark" && value !== "system") return;
    updateTheme(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep the current theme usable. */
    }
  }
  return { theme, resolvedTheme, setTheme };
}
