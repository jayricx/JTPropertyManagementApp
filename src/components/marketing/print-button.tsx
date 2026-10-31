"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Save as PDF" is just the browser's print dialog — hand it to the user. */
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      {label}
    </Button>
  );
}
