/**
 * 中文分词 —— 全站唯一实现。
 *
 * 背景（实测结论，改动前务必读完）：
 * 1. SQLite FTS5 的 trigram 分词器要求查询词至少 3 个字符，中文最高频的
 *    双字词（域控、登录、交换机）会静默返回 0 命中且不报错，故弃用 trigram。
 * 2. 改为「应用层 bigram 预分词 + FTS5 unicode61」：中文按相邻两字切分，
 *    英文数字按词切分。实测「域控」「登录」「交换机」「ldap」「createClient」均命中。
 * 3. 写端（索引）与查询端必须共用本文件的函数，任何一侧另写实现都会导致
 *    「能存不能搜」的静默故障。
 * 4. FTS5 的 snippet() 会返回带分词空格的文本（如"容器 器编 编排"），
 *    摘要禁止使用 snippet()，须从原文按命中位置自行截取。
 */

const CJK = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * 把任意文本切成待索引的 token 串。
 * 中文：按相邻两字滑窗切分（"域控登录" -> 域控 控登 登录）
 * 西文与数字：按词切分并小写化（"createClient" -> createclient）
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const text = input.toLowerCase();
  const tokens: string[] = [];
  const segments = text.match(/[㐀-䶿一-鿿豈-﫿]+|[a-z0-9_]+/g) || [];

  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (!CJK.test(seg)) {
      tokens.push(seg);
      continue;
    }
    if (seg.length === 1) {
      // 单字无法构成 bigram，直接入索引，靠 LIKE 兜底匹配
      tokens.push(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
  }
  return tokens;
}

/** 索引侧：把标题/正文/代码转成写入 FTS 的空格分隔串 */
export function toIndexText(input: string): string {
  return tokenize(input).join(' ');
}

/** FTS5 MATCH 串转义。裸双引号会导致 unterminated string 报错 */
export function escapeToken(token: string): string {
  return token.replace(/"/g, '""');
}

/**
 * 查询侧：构造 MATCH 表达式，多 token 之间取 AND（全命中才召回）。
 * 返回空串表示无法构造有效表达式，调用方应退化为 LIKE 查询。
 */
export function buildMatchExpression(query: string): string {
  const tokens = tokenize(query);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${escapeToken(t)}"`).join(' AND ');
}

/**
 * 判断是否应退化为 LIKE 兜底。
 * 场景：纯单字（"网"）、纯标点、或分词后无有效 token。
 */
export function shouldFallbackToLike(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const cjkChars = trimmed.match(/[㐀-䶿一-鿿豈-﫿]/g) || [];
  const alnum = trimmed.match(/[a-z0-9_]/gi) || [];
  // 仅含单个中文字符且没有西文数字时，bigram 无法成立
  if (cjkChars.length === 1 && alnum.length === 0) return true;
  return buildMatchExpression(trimmed) === '';
}

/** LIKE 查询用的转义，防止 % 与 _ 被当作通配符 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * 从原文中截取命中片段并标出命中位置。
 * 替代 FTS5 snippet()，避免返回带分词空格的脏文本。
 */
export function buildSnippet(text: string, query: string, radius = 40): string {
  if (!text) return '';
  const lowerText = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return text.slice(0, radius * 2);

  const hit = lowerText.indexOf(needle);
  const start = hit >= 0 ? Math.max(0, hit - radius) : 0;
  if (hit < 0) return text.slice(0, radius * 2);

  let end = Math.min(text.length, hit + needle.length + radius);
  // 尽量停在标点或换行，避免半截词
  const breakAt = text.slice(hit + needle.length, end).search(/[。！？\n；;.!?]/);
  if (breakAt > 0) end = hit + needle.length + breakAt + 1;

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

/** 命中位置，供前端 <mark> 高亮使用 */
export function findHitPositions(text: string, query: string): Array<[number, number]> {
  if (!text || !query.trim()) return [];
  const lowerText = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  const positions: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const idx = lowerText.indexOf(needle, from);
    if (idx < 0) break;
    positions.push([idx, idx + needle.length]);
    from = idx + needle.length;
    if (positions.length >= 20) break;
  }
  return positions;
}
