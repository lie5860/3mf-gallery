"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "切换到亮色模式" : "切换到暗黑模式"}
      className="
        relative w-9 h-9 rounded-full flex items-center justify-center
        text-stone-800 dark:text-stone-300
        hover:bg-stone-200/80 dark:hover:bg-stone-700
        transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400
      "
    >
      <span className="block dark:hidden">
        <Moon className="w-4.5 h-4.5" />
      </span>
      <span className="hidden dark:block">
        <Sun className="w-4.5 h-4.5" />
      </span>
    </button>
  );
}
