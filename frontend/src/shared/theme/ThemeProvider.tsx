import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { POS_THEME_MODE_KEY } from "../constants/keys";
import { storage } from "../lib/storage";

export type ThemeMode = "light" | "dark";

export type AppThemePalette = {
  mode: ThemeMode;
  primaryBlue: string;
  deepBlue: string;
  accentOrange: string;
  bg: string;
  card: string;
  textMain: string;
  textSub: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  soft: string;
};

const LIGHT_THEME: AppThemePalette = {
  mode: "light",
  primaryBlue: "#2A78BC",
  deepBlue: "#1F5E96",
  accentOrange: "#F3B221",
  bg: "#F3F8FC",
  card: "#FFFFFF",
  textMain: "#18324A",
  textSub: "#5E7285",
  border: "#D8E6F2",
  danger: "#C83C3C",
  success: "#1D8A58",
  warning: "#CC8A20",
  soft: "#EFF4F8",
};

const DARK_THEME: AppThemePalette = {
  mode: "dark",
  primaryBlue: "#4AA3E8",
  deepBlue: "#2A78BC",
  accentOrange: "#F3B221",
  bg: "#0F1720",
  card: "#16212E",
  textMain: "#E8F0F7",
  textSub: "#9CB2C6",
  border: "#2A3A4D",
  danger: "#EF6B6B",
  success: "#3CC98B",
  warning: "#E8B24A",
  soft: "#1A2735",
};

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppThemePalette;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const stored = await storage.getString(POS_THEME_MODE_KEY);
      if (!mounted) return;
      if (stored === "dark" || stored === "light") {
        setModeState(stored);
      }
      setReady(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void storage.setString(POS_THEME_MODE_KEY, nextMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      void storage.setString(POS_THEME_MODE_KEY, next);
      return next;
    });
  }, []);

  const theme = mode === "dark" ? DARK_THEME : LIGHT_THEME;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, theme, setMode, toggleMode, ready }),
    [mode, theme, setMode, toggleMode, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return context;
}
