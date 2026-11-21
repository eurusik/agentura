// Збирається один раз у lab/public/vendor/cm.js (npm run lab:build) — тож редактор працює без інтернету.
export { EditorView, basicSetup } from "codemirror";
export { javascript } from "@codemirror/lang-javascript";
export { oneDark } from "@codemirror/theme-one-dark";
export { EditorState, StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
export { Decoration, keymap } from "@codemirror/view";
