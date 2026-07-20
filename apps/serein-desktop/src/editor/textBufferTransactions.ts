import { EditorState, Transaction, type TransactionSpec } from "@codemirror/state";

export const textBufferPasteUserEvent = "input.paste";

export function textBufferPasteTransaction(
  state: EditorState,
  text: string,
): TransactionSpec {
  return {
    ...state.replaceSelection(text),
    annotations: Transaction.userEvent.of(textBufferPasteUserEvent),
  };
}
