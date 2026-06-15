import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // text-base (16px) on mobile prevents iOS auto-zoom on focus; h-11 keeps
        // a 44px touch target. Both tighten on md+ to the desktop scale.
        "flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
export { Input };
