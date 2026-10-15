"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme state lives on the `<html>` element (`class="dark"`), so the server
 * render stays static and next-themes patches the class before hydration.
 * `suppressHydrationWarning` on <html> in the root layout covers that gap.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}