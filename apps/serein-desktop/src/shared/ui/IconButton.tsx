import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./classNames";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
};

export function IconButton({ className, icon, label, ...props }: IconButtonProps) {
  return (
    <button type="button" className={cx("ui-icon-button", className)} aria-label={label} title={label} {...props}>
      {icon}
    </button>
  );
}
