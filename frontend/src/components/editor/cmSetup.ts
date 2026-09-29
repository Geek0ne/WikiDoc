import { EditorView, keymap, drawSelection, highlightSpecialChars, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';

/**
 * Markdown 编辑器组装。配色全部走 CSS 变量——
 * 主题切换只改 documentElement 的 data-theme，编辑器无需重建。
 */

const tokenHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--text)', fontWeight: '600', fontSize: '1.1em' },
  { tag: tags.heading2, color: 'var(--text)', fontWeight: '600' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--text)', fontWeight: '510' },
  { tag: tags.strong, fontWeight: '600', color: 'var(--text)' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--text)' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: tags.link, color: 'var(--primary)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--warning)' },
  { tag: tags.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
]);

const surfaceTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'transparent',
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    lineHeight: '1.75',
    padding: '16px 4px 40vh',
  },
  '.cm-content': { caretColor: 'var(--primary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--primary)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--primary-soft)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--primary-soft)' },
  '.cm-panels': { backgroundColor: 'var(--bg-elevated)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-searchInput': { backgroundColor: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warning-soft)' },
  '.cm-button': { backgroundColor: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none' },
});

export interface EditorHandle {
  view: EditorView;
  insertSnippet(snippet: string, cursorOffset?: number): void;
  replaceSelection(text: string): void;
  focus(): void;
}

export interface CreateEditorOptions {
  parent: HTMLElement;
  initialValue: string;
  placeholderText?: string;
  onChange(value: string): void;
  /** Ctrl+S / Cmd+S 手动保存，返回 true 表示事件已消费 */
  onSave(): boolean;
}

/** 创建 Markdown 编辑器实例，供 EditorPage 持有与销毁 */
export function createMarkdownEditor(options: CreateEditorOptions): EditorHandle {
  const { parent, initialValue, onChange, onSave } = options;
  const markdownComp = new Compartment();

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) onChange(update.state.doc.toString());
  });

  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      history(),
      drawSelection(),
      highlightSpecialChars(),
      highlightSelectionMatches(),
      bracketMatching(),
      indentOnInput(),
      markdownComp.of(markdown({ base: markdownLanguage })),
      syntaxHighlighting(tokenHighlight),
      surfaceTheme,
      cmPlaceholder(options.placeholderText ?? ''),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      updateListener,
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => onSave(),
        },
      ]),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    focus: () => view.focus(),
    /** 在光标处插入文本片段，可选地把光标回移若干字符（模板尾部占位） */
    insertSnippet(snippet: string, cursorOffset = 0) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: snippet },
        selection: { anchor: pos + snippet.length - cursorOffset },
        scrollIntoView: true,
      });
      view.focus();
    },
    replaceSelection(text: string) {
      const range = view.state.selection.main;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from + text.length },
        scrollIntoView: true,
      });
      view.focus();
    },
  };
}
