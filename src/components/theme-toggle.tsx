"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// The server has no idea which theme is active, so the icon is only swapped
// after hydration — useSyncExternalStore flips to true on the client without
// a setState-in-effect cascade (which the React Compiler lint rules forbid).
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/**
 * Light/dark switch. `className` lets each call site restyle it — the
 * sidebar passes sidebar-token colors so it reads on the deep green.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={className}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}