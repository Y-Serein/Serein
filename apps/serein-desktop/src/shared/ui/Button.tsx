import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type ButtonVariant = "ghost" | "soft" | "primary" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
};

export function Button({ className, variant = "soft", icon, children, ...props }: ButtonProps) {
  return (
    <button type="button" className={cx("ui-button", `ui-button-${variant}`, className)} {...props}>
      {icon ? <span className="ui-button-icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}
