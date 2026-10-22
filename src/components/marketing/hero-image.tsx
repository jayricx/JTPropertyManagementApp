"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Hero image with a graceful fallback when the file is missing. The page
 * stays looking intentional (placeholder text) instead of showing a broken
 * image icon while the real photo hasn't been dropped in yet.
 */
export function HeroImage() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Add your photo: save as{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            public/images/hero-property.jpg
          </code>
        </p>
      </div>
    );
  }

  return (
    <Image
      src="/images/hero-property.jpg"
      alt="Filipino landlord checking rent payments on their phone"
      fill
      className="object-cover"
      priority
      sizes="(max-width: 1024px) 100vw, 50vw"
      onError={() => setFailed(true)}
    />
  );
}