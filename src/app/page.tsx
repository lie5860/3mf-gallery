import React from "react";
import LandingUI from "@/components/LandingUI";

export const dynamic = 'force-static';

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-page)" }}>
      <LandingUI />
    </div>
  );
}
