import { db } from '../db';
import { toIndexText } from './segment';

/**
 * FTS 索引维护。doc_search 为 FTS5 虚表（unicode61 分词）。
 *
 * 关键：写入列必须是 toIndexText 产出的 bigram token 流，不能写原文。
 * unicode61 会把整段中文当成一个长 token，查询侧的 bigram MATCH 将永远
 * 无法命中——「能存不能搜」的静默故障。查询逻辑见 ./segment.ts。
 *   title → toIndexText(标题)
 *   body  → toIndexText(正文纯文本)
 *   code  → toIndexText(代码块)
 * 摘要展示所需的原文由 documents.content_text 提供，不入 FTS。
 */

/** 提取围栏代码块（``` 与 ~~~ 两种写法），返回拼接文本 */
export function extractCodeBlocks(markdown: string): string {
  const blocks: string[] = [];
  const fence = /(^|\n)(```|~~~)[^\n]*\n([\s\S]*?)\n?\2(?=\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown)) !== null) {
    blocks.push(m[3]);
    if (blocks.length > 200) break;
  }
  return blocks.join('\n');
}

/** Markdown 转纯文本，供 FTS body 列与摘要兜底使用 */
export function stripMarkdown(markdown: string): string {
  let text = markdown;
  // 先摘掉代码块，避免代码内容混入正文
  text = text.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n?\2(?=\n|$)/g, '\n');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/^\s*([-*+]|\d+\.)\s+/gm, '');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^\s*([-*_]\s*){3,}\s*$/gm, '\n');
  text = text.replace(/\|/g, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** 写入/刷新单篇文档的检索索引 */
export function indexDocument(docId: number, title: string, markdown: string): void {
  removeDocumentIndex(docId);
  db.prepare('INSERT INTO doc_search (title, body, code, doc_id) VALUES (?, ?, ?, ?)').run(
    toIndexText(title),
    toIndexText(stripMarkdown(markdown)),
    toIndexText(extractCodeBlocks(markdown)),
    docId
  );
}

export function removeDocumentIndex(docId: number): void {
  db.prepare('DELETE FROM doc_search WHERE doc_id = ?').run(docId);
}
