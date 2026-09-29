import MarkdownIt from 'markdown-it';
// 按需引入常用语言集合，避免全量包把 chunk 撑到 1MB+
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/**
 * Markdown 渲染管线：markdown-it → highlight.js → DOMPurify 消毒。
 * - html: false，原始 HTML 一律不当 HTML 解析，XSS 面收敛到最小；
 * - 代码块按语言高亮，包装 .code-block 容器并注入复制按钮（事件由容器委托处理）；
 * - 标题 h1-h4 注入 id 锚点，供右侧目录滚动联动。
 */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    if (language) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        /* 高亮失败退回纯文本 */
      }
    }
    return ''; // 返回空让 markdown-it 默认 escape
  },
});

const ESCAPE_RE = /&|<|>/g;
function escapeHtml(s: string): string {
  return s.replace(ESCAPE_RE, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/** 重写 fenced 渲染：容器 + 语言角标 + 复制按钮 */
md.renderer.rules.fence = (tokens, idx, options) => {
  const token = tokens[idx];
  if (!token) return '';
  const info = (token.info || '').trim().split(/\s+/)[0] || '';
  const highlighted = options.highlight?.(token.content, info, '') ?? '';
  const body = highlighted || escapeHtml(token.content);
  return (
    `<div class="code-block">` +
    (info ? `<span class="code-lang">${escapeHtml(info)}</span>` : '') +
    `<button type="button" class="code-copy" aria-label="copy code">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>` +
    `</button>` +
    `<pre><code class="hljs">${body}</code></pre>` +
    `</div>`
  );
};

/** 内部链接统一走 hash 路由的文档页；外链新窗口打开 */
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  if (token) {
    const href = token.attrGet('href') ?? '';
    if (href.startsWith('/api/attachments/')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener');
    } else if (!/^https?:\/\//.test(href)) {
      token.attrSet('href', `/#${href}`);
    } else {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
  }
  return defaultLinkOpen(tokens, idx, options, _env, self);
};

const ANCHOR_RE = /[^a-zA-Z0-9\u4e00-\u9fa5-]+/g;

/** 渲染 markdown → 已消毒、已锚点化、已代码块包装的 HTML */
export function renderMarkdown(source: string): string {
  const raw = md.render(source ?? '');
  const dom = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['id', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel|data:image\/(?:png|gif|jpeg|webp)|\/|#|\.\/|\.\.\/))/i,
  });

  // 给 h1-h4 注入锚点 id（同一标题重复时追加序号）
  const parser = new DOMParser();
  const doc = parser.parseFromString(dom, 'text/html');
  const seen = new Map<string, number>();
  doc.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
    const base = (el.textContent ?? 'section').trim().replace(/\s+/g, '-').replace(ANCHOR_RE, '-') || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    el.id = count === 0 ? base : `${base}-${count}`;
  });
  return doc.body.innerHTML;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/** 从渲染后的 DOM 容器提取目录（h1-h4） */
export function extractToc(container: HTMLElement | null): TocItem[] {
  if (!container) return [];
  const items: TocItem[] = [];
  container.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
    const level = Number(el.tagName.slice(1));
    const text = (el.textContent ?? '').trim();
    if (el.id && text) items.push({ id: el.id, text, level });
  });
  return items;
}

/** 代码块复制按钮的事件委托：绑定一次即可 */
export function bindCodeCopy(container: HTMLElement): () => void {
  const handler = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.code-copy');
    if (!btn) return;
    const pre = btn.parentElement?.querySelector('pre code');
    const text = pre?.textContent ?? '';
    void navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      window.setTimeout(() => btn.classList.remove('copied'), 800);
    });
  };
  container.addEventListener('click', handler);
  return () => container.removeEventListener('click', handler);
}
