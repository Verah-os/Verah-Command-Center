import Image from "next/image";
import { cn } from "@/lib/utils";

type VerahLogoProps = {
  kind?: "symbol" | "wordmark" | "signature";
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  className?: string;
  alt?: string;
};

const dimensions = {
  symbol: { width: 294, height: 249 },
  wordmark: { width: 919, height: 249 },
  signature: { width: 1031, height: 251 },
} as const;

const markSizes = {
  symbol: { sm: "h-9 w-11", md: "h-12 w-14", lg: "h-16 w-[4.75rem]" },
  wordmark: { sm: "w-[8.5rem]", md: "w-[11rem]", lg: "w-[14rem]" },
  signature: { sm: "w-[9rem]", md: "w-[12rem]", lg: "w-[15rem]" },
} as const;

const responsiveSizes = {
  wordmark: { sm: "136px", md: "176px", lg: "224px" },
  signature: { sm: "144px", md: "192px", lg: "240px" },
} as const;

export function VerahLogo({
  kind = "wordmark",
  tone = "light",
  size = "md",
  priority = false,
  className,
  alt = "VERAH",
}: VerahLogoProps) {
  const intrinsic = dimensions[kind];

  return (
    <Image
      src={`/brand/verah-${kind}-${tone}.png`}
      width={intrinsic.width}
      height={intrinsic.height}
      sizes={kind === "symbol" ? undefined : responsiveSizes[kind][size]}
      priority={priority}
      alt={alt}
      className={cn(
        "block shrink-0 object-contain",
        kind === "symbol" ? markSizes.symbol[size] : `${markSizes[kind][size]} h-auto`,
        className,
      )}
    />
  );
}
