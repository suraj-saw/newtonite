import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant = "primary", ...props }, ref) => {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-muted text-foreground hover:bg-slate-200",
    ghost: "bg-transparent hover:bg-muted",
    danger: "bg-destructive text-white hover:opacity-90",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";
