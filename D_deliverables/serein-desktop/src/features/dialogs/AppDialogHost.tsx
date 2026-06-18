import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { AppDialog, AppDialogResult } from "../../app/store/appStore";
import { Button } from "../../shared/ui";

type AppDialogHostProps = {
  dialog: AppDialog | null;
  input: string;
  inputRef: RefObject<HTMLInputElement>;
  onInputChange: (value: string) => void;
  onClose: (result: AppDialogResult) => void;
};

export function AppDialogHost({ dialog, input, inputRef, onInputChange, onClose }: AppDialogHostProps) {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(false);
  }, [dialog?.id]);

  if (!dialog) return null;

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={() => onClose(dialog.kind === "confirm" ? false : null)}>
      <form
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (dialog.kind === "input") {
            onClose(input);
            return;
          }
          if (dialog.kind === "choice") return;
          onClose(true);
        }}
      >
        <div className="app-dialog-header">
          <h2>{dialog.title}</h2>
        </div>
        {dialog.message ? <p className="app-dialog-message">{dialog.message}</p> : null}
        {dialog.kind === "input" ? (
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
          />
        ) : null}
        {dialog.kind === "choice" && dialog.choices ? (
          <div className="app-dialog-choice-list">
            {dialog.choices.map((choice, index) => (
              <button
                key={choice.value}
                type="button"
                className="app-dialog-choice"
                autoFocus={index === 0}
                onClick={() => {
                  onClose(dialog.rememberLabel ? { choice: choice.value, remember } : choice.value);
                }}
              >
                <span>{choice.label}</span>
                {choice.description ? <small>{choice.description}</small> : null}
              </button>
            ))}
          </div>
        ) : null}
        {dialog.kind === "choice" && dialog.rememberLabel ? (
          <label className="app-dialog-check">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            {dialog.rememberLabel}
          </label>
        ) : null}
        <div className="app-dialog-actions">
          {dialog.cancelLabel ? (
            <Button variant="soft" className="app-dialog-secondary" onClick={() => onClose(dialog.kind === "confirm" ? false : null)}>
              {dialog.cancelLabel}
            </Button>
          ) : null}
          {dialog.kind === "choice" ? null : (
            <Button type="submit" variant={dialog.danger ? "danger" : "primary"} className={dialog.danger ? "app-dialog-danger" : "app-dialog-primary"}>
              {dialog.confirmLabel}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
