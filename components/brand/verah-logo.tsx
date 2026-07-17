import Image from "next/image";
import { cn } from "@/lib/utils";

type VerahLogoProps = {
  variant?: "light" | "dark" | "icon";
  size?: "sm" | "md" | "lg";
  priority?: boolean;
  className?: string;
  alt?: string;
};

const logoSizes = {
  sm: "w-[7.5rem]",
  md: "w-[10rem]",
  lg: "w-[13rem]",
} as const;

const responsiveSizes = {
  sm: "120px",
  md: "160px",
  lg: "208px",
} as const;

const iconSizes = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
} as const;

const sources = {
  // The official source files have opaque backgrounds. Variants describe the
  // foreground contrast: light artwork for dark surfaces, and vice versa.
  light: "/brand/logo-dark.png",
  dark: "/brand/logo-light.png",
  icon: "/brand/icon.png",
} as const;

export function VerahLogo({
  variant = "light",
  size = "md",
  priority = false,
  className,
  alt = "VERAH",
}: VerahLogoProps) {
  const isIcon = variant === "icon";

  return (
    <Image
      src={sources[variant]}
      width={isIcon ? 400 : 1360}
      height={isIcon ? 400 : 356}
      sizes={isIcon ? undefined : responsiveSizes[size]}
      priority={priority}
      alt={alt}
      className={cn(
        "block shrink-0 object-contain",
        isIcon ? iconSizes[size] : `${logoSizes[size]} h-auto`,
        className,
      )}
    />
  );
}
