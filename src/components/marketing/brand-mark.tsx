import Image from "next/image";

/**
 * The app icon, reused as the wordmark's glyph. `public/icon.svg` wins over
 * `src/app/icon.svg`, so this is the mark browsers actually fetch.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      priority
    />
  );
}