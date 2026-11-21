// Редактор коду (CodeMirror) з підсвіткою рядків, яких не було в попередньому кроці.
import {
  EditorView,
  basicSetup,
  javascript,
  oneDark,
  StateField,
  Decoration,
  RangeSetBuilder,
  keymap,
} from "../vendor/cm.js";

const isDark = matchMedia("(prefers-color-scheme: dark)").matches;

// Номери рядків у `current`, яких не було в `previous` — їх підсвічуємо як нові
export function newLines(previous, current) {
  const old = new Set(
    previous
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const fresh = new Set();
  current.split("\n").forEach((line, index) => {
    if (line.trim() && !old.has(line.trim())) fresh.add(index + 1);
  });
  return fresh;
}

function highlightLines(lineNumbers) {
  const mark = Decoration.line({ class: "cm-new" });
  return StateField.define({
    create(state) {
      const builder = new RangeSetBuilder();
      for (let n = 1; n <= state.doc.lines; n++) {
        if (lineNumbers.has(n)) builder.add(state.doc.line(n).from, state.doc.line(n).from, mark);
      }
      return builder.finish();
    },
    update(decorations, transaction) {
      return decorations.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

// Створює редактор. ⌘/Ctrl+Enter запускає код
export function createEditor(parent, code, freshLines, onRun) {
  const runShortcut = keymap.of([{ key: "Mod-Enter", run: () => (onRun(), true) }]);
  return new EditorView({
    doc: code,
    parent,
    extensions: [
      runShortcut,
      basicSetup,
      javascript(),
      highlightLines(freshLines),
      ...(isDark ? [oneDark] : []),
    ],
  });
}

// Підміняє код у редакторі (кнопки «Повернути код» і «Застосувати виправлення»)
export function replaceEditor(view, code, freshLines, onRun) {
  const parent = view.dom.parentElement;
  view.destroy();
  return createEditor(parent, code, freshLines, onRun);
}
