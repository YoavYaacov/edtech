import CodeMirror from '@uiw/react-codemirror';
import { java } from '@codemirror/lang-java';
import { indentUnit, StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { EditorView } from '@codemirror/view';
import styles from './CodeEditor.module.css';

// Code is always LTR. 4-space indentation, no auto-formatter
// (a formatter would break the Allman brace convention).
const theme = EditorView.theme({
  '&': { fontSize: '14.5px', backgroundColor: 'var(--surface)' },
  '.cm-content, .cm-gutters': { fontFamily: 'var(--font-code)' },
  '.cm-scroller': { lineHeight: '1.6' },
  '.cm-gutters': { backgroundColor: 'var(--surface-sunken)', color: 'var(--text-muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(91, 83, 201, 0.05)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--lavender-50)' },
  '&.cm-focused': { outline: 'none' },
});

const languageExtensions = { java: [java()], csharp: [StreamLanguage.define(csharp)] };

export default function CodeEditor({ value, onChange, language = 'java', readOnly = false, minHeight = '180px', label }) {
  const extensions = [theme, indentUnit.of('    '), EditorView.lineWrapping, ...(languageExtensions[language] ?? [])];
  return (
    <div className={`${styles.wrap} ${readOnly ? styles.readOnly : ''}`} dir="ltr">
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        editable={!readOnly}
        minHeight={minHeight}
        extensions={extensions}
        aria-label={label}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly, autocompletion: false, tabSize: 4 }}
      />
    </div>
  );
}
