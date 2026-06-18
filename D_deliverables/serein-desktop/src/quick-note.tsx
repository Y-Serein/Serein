import React from "react";
import ReactDOM from "react-dom/client";
import { QuickNoteWindow } from "./features/quick-note/QuickNoteWindow";
import "./features/quick-note/quick-note.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <QuickNoteWindow />,
);
