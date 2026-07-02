import { cx } from "./classNames";

type SegmentedTabsProps<T extends string> = {
  label: string;
  value: T;
  items: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentedTabs<T extends string>({ label, value, items, onChange, className }: SegmentedTabsProps<T>) {
  return (
    <div className={cx("ui-segmented-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={value === item.id ? "selected" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
