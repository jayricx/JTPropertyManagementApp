"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog (Save as PDF lives there too). */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <PrinterIcon />
      Print / Save PDF
    </Button>
  );
}