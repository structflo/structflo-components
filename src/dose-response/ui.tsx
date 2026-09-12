"use client";

/**
 * The four shadcn/ui primitives the dose-response surfaces render, copied
 * here class-string for class-string.
 *
 * Why copies rather than a dependency or an injected component bag: the
 * picture is a contract across apps, and "each host passes its own Card"
 * is how two apps end up drawing the same curve differently. These are
 * presentational divs — the markup is the styling — so owning them costs
 * ~60 lines and buys zero runtime dependencies (no `radix-ui`, no
 * `lucide-react`, no `class-variance-authority`). Only the variants these
 * charts actually use are implemented.
 *
 * The class names resolve against the host app's Tailwind theme tokens
 * (`bg-card`, `border-input`, `text-muted-foreground`, …), which is what
 * lets a chart sit correctly in whichever app renders it.
 */

import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card py-4 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

/** Outline badge — the only variant these charts use. */
export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      data-variant="outline"
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
        "border-border text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Ghost / small button — the export actions and the class-badge popover. */
export function GhostButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="button"
      data-variant="ghost"
      data-size="sm"
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        className,
      )}
      {...props}
    />
  );
}

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * Checkbox with Radix's rendered contract — `role="checkbox"`,
 * `aria-checked`, `data-state` — so the `data-[state=checked]:` classes and
 * any consumer's test queries behave as they do against the real primitive.
 */
export function Checkbox({ checked, onCheckedChange, className, ...props }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-slot="checkbox"
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      {checked && (
        <span
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current transition-none"
        >
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

/** lucide-react's `Check`, inlined — one path, no dependency. */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide lucide-check size-3.5", className)}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** lucide-react's `Image`, inlined — the PNG export button's icon. */
export function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide lucide-image", className)}
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** lucide-react's `Download`, inlined — the SVG export button's icon. */
export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide lucide-download", className)}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

/** Convenience wrapper for the toggle rows: label text beside a checkbox. */
export function CheckboxLabel({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  // A <button> is a labelable element, so the browser forwards a click on the
  // text to the nested Checkbox — the same implicit association the Radix
  // primitive relies on. No onClick here, or the toggle would fire twice.
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      {children}
    </label>
  );
}
