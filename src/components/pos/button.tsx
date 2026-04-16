"use client";

import Link from "next/link";
import { type ComponentProps, type ReactNode } from "react";

export type PosButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type PosButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all border disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";

const sizes: Record<PosButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs h-8",
  md: "px-4 py-2 text-sm h-10",
  lg: "px-6 py-3 text-base h-12",
};

const variants: Record<PosButtonVariant, string> = {
  primary:
    "bg-[#4F46E5] text-white border-[#4F46E5] hover:bg-[#4338CA] hover:border-[#4338CA] shadow-sm shadow-[#4F46E5]/20",
  secondary:
    "bg-white text-[#4F46E5] border-[#4F46E5]/30 hover:bg-[#4F46E5]/5 hover:border-[#4F46E5]/60",
  ghost:
    "bg-transparent text-on-surface-variant border-transparent hover:bg-surface-container-low hover:text-on-surface",
  danger:
    "bg-[#DC2626] text-white border-[#DC2626] hover:bg-[#B91C1C] hover:border-[#B91C1C]",
  success:
    "bg-[#059669] text-white border-[#059669] hover:bg-[#047857] hover:border-[#047857]",
};

type BaseProps = {
  variant?: PosButtonVariant;
  size?: PosButtonSize;
  icon?: string;
  trailingIcon?: string;
  fullWidth?: boolean;
  children?: ReactNode;
};

type ButtonProps = BaseProps & ComponentProps<"button">;
type LinkProps = BaseProps & { href: string } & Omit<ComponentProps<typeof Link>, "href">;

function content(icon?: string, trailingIcon?: string, children?: ReactNode) {
  return (
    <>
      {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
      {children}
      {trailingIcon && (
        <span className="material-symbols-outlined text-[18px]">{trailingIcon}</span>
      )}
    </>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  fullWidth,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {content(icon, trailingIcon, children)}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  fullWidth,
  className = "",
  children,
  href,
  ...rest
}: LinkProps) {
  return (
    <Link
      href={href}
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {content(icon, trailingIcon, children)}
    </Link>
  );
}
