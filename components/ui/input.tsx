import * as React from "react";
import { dirtyFieldClass } from "@/components/ui/dirty-field";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & { dirty?: boolean };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dirty, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base (16px) on mobile prevents iOS Safari auto-zoom on focus;
          // shrinks back to text-sm (14px) at md+ where there's no zoom.
          "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium text-ellipsis placeholder:text-ellipsis placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          dirty && dirtyFieldClass,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
