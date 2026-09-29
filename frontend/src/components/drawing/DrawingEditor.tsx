import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  MousePointer2,
  Square,
  Circle,
  Minus,
  MoveUpRight,
  Type,
  Pencil,
  Undo2,
  Trash2,
} from 'lucide-react';
import { useT } from '../../i18n';
import { Tooltip } from '../ui';

/** 图形数据模型：坐标为画布坐标系，序列化时原样输出 */
interface Shape {
  id: string;
  kind: 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'pen';
  x: number;
  y: number;
  w: number;
  h: number;
  points: [number, number][];
  text: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
}

export type DrawTool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'pen';

export interface DrawingEditorHandle {
  /** 序列化为独立 SVG 文档（服务端仅存字符串） */
  getSvg(): string;
}

interface DrawingEditorProps {
  initialSvg?: string;
  width: number;
  height: number;
}

const CANVAS_W = 800;
const CANVAS_H = 450;

/** 主题令牌色板：var() 直接写入 SVG，文档内渲染时随主题联动 */
const TOKEN_COLORS = ['var(--text)', 'var(--primary)', 'var(--danger)', 'var(--success)', 'var(--warning)', 'var(--border-strong)'] as const;
const FILL_OPTIONS = ['none', 'var(--primary-soft)', 'var(--warning-soft)', 'var(--danger-soft)', 'var(--success-soft)'] as const;

let shapeSeq = 0;
const nextId = (): string => `s${Date.now().toString(36)}${shapeSeq++}`;

const blankShape = (
  kind: Exclude<DrawTool, 'select'>,
  x: number,
  y: number,
  stroke: string,
  fill: string,
  strokeWidth: number
): Shape => ({
  id: nextId(),
  kind,
  x,
  y,
  w: 0,
  h: 0,
  points: kind === 'pen' || kind === 'line' || kind === 'arrow' ? [[x, y]] : [],
  text: '',
  stroke,
  fill: kind === 'rect' || kind === 'ellipse' ? fill : 'none',
  strokeWidth,
});

/** 把 SVG 字符串解析回形状数组（仅接受本编辑器产出的结构化属性） */
function parseInitialShapes(svg: string | undefined): Shape[] {
  if (!svg) return [];
  const shapes: Shape[] = [];
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const attr = (el: Element, name: string, fallback = ''): string => el.getAttribute(name) ?? fallback;
  const num = (el: Element, name: string, fallback = 0): number => Number(el.getAttribute(name) ?? fallback) || fallback;
  doc.querySelectorAll('[data-shape]').forEach((el) => {
    const base = {
      id: attr(el, 'data-shape'),
      stroke: attr(el, 'stroke', 'var(--text)'),
      fill: attr(el, 'fill', 'none'),
      strokeWidth: num(el, 'stroke-width', 2),
    };
    if (el.tagName === 'rect') {
      shapes.push({ ...base, kind: 'rect', x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width'), h: num(el, 'height'), points: [], text: '' });
    } else if (el.tagName === 'ellipse') {
      const cx = num(el, 'cx');
      const cy = num(el, 'cy');
      const rx = num(el, 'rx');
      const ry = num(el, 'ry');
      shapes.push({ ...base, kind: 'ellipse', x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, points: [], text: '' });
    } else if (el.tagName === 'polyline') {
      const points = (attr(el, 'points').match(/-?[\d.]+,-?[\d.]+/g) ?? []).map((pair) => pair.split(',').map(Number) as [number, number]);
      shapes.push({ ...base, kind: 'pen', x: 0, y: 0, w: 0, h: 0, points, text: '' });
    } else if (el.tagName === 'line') {
      const x2 = num(el, 'x2');
      const y2 = num(el, 'y2');
      const arrow = attr(el, 'data-arrow') === '1';
      shapes.push({
        ...base,
        kind: arrow ? 'arrow' : 'line',
        x: num(el, 'x1'),
        y: num(el, 'y1'),
        w: x2,
        h: y2,
        points: [
          [num(el, 'x1'), num(el, 'y1')],
          [x2, y2],
        ],
        text: '',
      });
    } else if (el.tagName === 'text') {
      shapes.push({ ...base, kind: 'text', x: num(el, 'x'), y: num(el, 'y'), w: 0, h: 0, points: [], text: el.textContent ?? '' });
    }
  });
  return shapes;
}

function shapeBounds(s: Shape): { x: number; y: number; w: number; h: number } {
  if (s.kind === 'pen' || s.kind === 'line' || s.kind === 'arrow') {
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    return { x: minX, y: minY, w: Math.max(...xs, 0) - minX, h: Math.max(...ys, 0) - minY };
  }
  return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
}

/** 轻量 SVG 画板：选择/矩形/椭圆/直线/箭头/文字/画笔 + 撤销/清空 */
export const DrawingEditor = forwardRef<DrawingEditorHandle, DrawingEditorProps>(function DrawingEditor(
  { initialSvg, width = CANVAS_W, height = CANVAS_H },
  ref
) {
  const { t } = useT();
  const [shapes, setShapes] = useState<Shape[]>(() => parseInitialShapes(initialSvg));
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [tool, setTool] = useState<DrawTool>('rect');
  const [stroke, setStroke] = useState<string>(TOKEN_COLORS[0]);
  const [fill, setFill] = useState<string>('none');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: Shape } | null>(null);

  const commit = useCallback((next: Shape[]) => {
    setUndoStack((stack) => [...stack.slice(-49), shapes]);
    setShapes(next);
  }, [shapes]);

  useImperativeHandle(ref, () => ({
    getSvg: () => serialize(shapes, width, height),
  }));

  const toCanvasPoint = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const sx = width / rect.width;
    const sy = height / rect.height;
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (textInput) return; // 正在输入文字时不新建图形
    const [px, py] = toCanvasPoint(e);
    if (tool === 'select') {
      const hit = [...shapes].reverse().find((s) => {
        const b = shapeBounds(s);
        return px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4;
      });
      setSelectedId(hit?.id ?? null);
      if (hit) dragRef.current = { startX: px, startY: py, origin: { ...hit, points: hit.points.map((p) => [...p] as [number, number]) } };
      return;
    }
    const draftShape = blankShape(tool, px, py, stroke, fill, strokeWidth);
    if (tool === 'text') {
      setTextInput({ x: px, y: py, value: '' });
      return;
    }
    setDraft(draftShape);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const [px, py] = toCanvasPoint(e);
    if (dragRef.current) {
      const { startX, startY, origin } = dragRef.current;
      const dx = px - startX;
      const dy = py - startY;
      setShapes((prev) =>
        prev.map((s) =>
          s.id === origin.id
            ? origin.kind === 'pen' || origin.kind === 'line' || origin.kind === 'arrow'
              ? { ...origin, points: origin.points.map((p) => [p[0] + dx, p[1] + dy] as [number, number]) }
              : { ...origin, x: origin.x + dx, y: origin.y + dy }
            : s
        )
      );
      return;
    }
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === 'pen') return { ...prev, points: [...prev.points, [px, py] as [number, number]] };
      if (prev.kind === 'line' || prev.kind === 'arrow') return { ...prev, points: [[prev.x, prev.y], [px, py] as [number, number]], w: px, h: py };
      return { ...prev, w: px - prev.x, h: py - prev.y };
    });
  };

  const onPointerUp = (): void => {
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    if (draft) {
      const b = shapeBounds(draft);
      const meaningful = draft.kind === 'pen' ? draft.points.length > 2 : b.w > 3 || b.h > 3;
      if (meaningful) commit([...shapes, draft]);
      setDraft(null);
    }
  };

  const confirmText = (): void => {
    if (textInput && textInput.value.trim()) {
      const s: Shape = { ...blankShape('text', textInput.x, textInput.y, stroke, 'none', strokeWidth), text: textInput.value.trim() };
      commit([...shapes, s]);
    }
    setTextInput(null);
  };

  const undo = (): void => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      setShapes(stack[stack.length - 1] ?? []);
      return stack.slice(0, -1);
    });
    setSelectedId(null);
  };

  const clearAll = (): void => {
    if (!shapes.length) return;
    commit([]);
    setSelectedId(null);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const renderShape = (s: Shape, isDraft = false) => {
    const common = {
      stroke: s.stroke,
      strokeWidth: s.strokeWidth,
      opacity: isDraft ? 0.7 : 1,
      'data-shape': isDraft ? undefined : s.id,
      cursor: tool === 'select' ? 'move' : 'crosshair',
    };
    if (s.kind === 'rect') return <rect key={s.id} x={s.x} y={s.y} width={Math.abs(s.w)} height={Math.abs(s.h)} rx={3} {...common} fill={s.fill} />;
    if (s.kind === 'ellipse') return <ellipse key={s.id} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={Math.abs(s.w / 2)} ry={Math.abs(s.h / 2)} {...common} fill={s.fill} />;
    if (s.kind === 'pen') return <polyline key={s.id} points={s.points.map((p) => p.join(',')).join(' ')} strokeLinecap="round" strokeLinejoin="round" {...common} fill="none" />;
    if (s.kind === 'line' || s.kind === 'arrow') {
      const p1: [number, number] = s.points[0] ?? [s.x, s.y];
      const p2: [number, number] = s.points[1] ?? [s.w, s.h];
      return (
        <g key={s.id}>
          <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} strokeLinecap="round" {...common} fill="none" data-arrow={s.kind === 'arrow' ? '1' : undefined} />
          {s.kind === 'arrow' && renderArrowHead(p1, p2, s)}
        </g>
      );
    }
    if (s.kind === 'text') {
      return (
        <text key={s.id} x={s.x} y={s.y} fill={s.stroke} stroke="none" fontSize={14} fontFamily="inherit" data-shape={s.id} cursor={tool === 'select' ? 'move' : 'crosshair'}>
          {s.text}
        </text>
      );
    }
    return null;
  };

  const renderArrowHead = (p1: [number, number], p2: [number, number], s: Shape) => {
    const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const headLen = 8 + s.strokeWidth * 2;
    const a1 = angle + Math.PI - 0.45;
    const a2 = angle + Math.PI + 0.45;
    const p3: [number, number] = [p2[0] + headLen * Math.cos(a1), p2[1] + headLen * Math.sin(a1)];
    const p4: [number, number] = [p2[0] + headLen * Math.cos(a2), p2[1] + headLen * Math.sin(a2)];
    return <polygon points={`${p2[0]},${p2[1]} ${p3[0]},${p3[1]} ${p4[0]},${p4[1]}`} fill={s.stroke} stroke="none" />;
  };

  const tools: { value: DrawTool; icon: React.ReactNode; label: string }[] = [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, label: t('drawing.toolSelect') },
    { value: 'rect', icon: <Square size={14} aria-hidden />, label: t('drawing.toolRect') },
    { value: 'ellipse', icon: <Circle size={14} aria-hidden />, label: t('drawing.toolEllipse') },
    { value: 'line', icon: <Minus size={14} aria-hidden />, label: t('drawing.toolLine') },
    { value: 'arrow', icon: <MoveUpRight size={14} aria-hidden />, label: t('drawing.toolArrow') },
    { value: 'text', icon: <Type size={14} aria-hidden />, label: t('drawing.toolText') },
    { value: 'pen', icon: <Pencil size={14} aria-hidden />, label: t('drawing.toolPen') },
  ];

  const selected = shapes.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5" role="toolbar" aria-label={t('drawing.insertDrawing')}>
        {tools.map((item) => (
          <Tooltip key={item.value} content={item.label}>
            <button
              type="button"
              aria-label={item.label}
              aria-pressed={tool === item.value}
              onClick={() => {
                setTool(item.value);
                setSelectedId(null);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors duration-150 ${
                tool === item.value ? 'bg-primary-soft text-primary' : 'text-fg-muted hover:bg-hover hover:text-fg'
              }`}
            >
              {item.icon}
            </button>
          </Tooltip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <span className="text-2xs text-fg-muted">{t('drawing.colorStroke')}</span>
        {TOKEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`stroke ${c}`}
            onClick={() => {
              setStroke(c);
              if (selected) setShapes((prev) => prev.map((s) => (s.id === selected.id ? { ...s, stroke: c } : s)));
            }}
            className={`h-4 w-4 rounded-full border transition-transform duration-150 hover:scale-110 ${stroke === c ? 'border-primary ring-1 ring-primary' : 'border-line'}`}
            style={{ background: c }}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <span className="text-2xs text-fg-muted">{t('drawing.colorFill')}</span>
        {FILL_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`fill ${c}`}
            onClick={() => {
              setFill(c);
              if (selected) setShapes((prev) => prev.map((s) => (s.id === selected.id ? { ...s, fill: c } : s)));
            }}
            className={`h-4 w-4 rounded-full border transition-transform duration-150 hover:scale-110 ${fill === c ? 'border-primary ring-1 ring-primary' : 'border-line'}`}
            style={{ background: c === 'none' ? 'transparent' : c }}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <span className="text-2xs text-fg-muted">{t('drawing.strokeWidth')}</span>
        <input
          type="range"
          min={1}
          max={8}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          className="w-20 accent-[var(--primary)]"
          aria-label={t('drawing.strokeWidth')}
        />
        <span className="flex-1" />
        <Tooltip content={`${t('drawing.undo')} (Ctrl+Z)`}>
          <button type="button" aria-label={t('drawing.undo')} disabled={!undoStack.length} onClick={undo} className="flex h-7 w-7 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40">
            <Undo2 size={14} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content={t('drawing.clear')}>
          <button type="button" aria-label={t('drawing.clear')} onClick={clearAll} className="flex h-7 w-7 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-danger">
            <Trash2 size={14} aria-hidden />
          </button>
        </Tooltip>
      </div>

      {/* 画布 */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-bg-sunken">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto block h-full w-full touch-none select-none"
          style={{ maxWidth: width }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="img"
          aria-label={t('drawing.insertDrawing')}
        >
          {shapes.map((s) => renderShape(s))}
          {draft && renderShape(draft, true)}
          {selectedId && (() => {
            const s = shapes.find((x) => x.id === selectedId);
            if (!s) return null;
            const b = shapeBounds(s);
            return <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />;
          })()}
        </svg>
        {textInput && (
          <input
            autoFocus
            value={textInput.value}
            onChange={(e) => setTextInput((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmText();
              if (e.key === 'Escape') setTextInput(null);
            }}
            onBlur={confirmText}
            className="absolute rounded border border-primary bg-bg-elevated px-1.5 py-0.5 text-xs text-fg shadow-sm outline-none"
            style={{ left: `${(textInput.x / width) * 100}%`, top: `${(textInput.y / height) * 100 - 3}%` }}
            placeholder={t('drawing.toolText')}
          />
        )}
        {!shapes.length && !draft && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-2xs text-fg-muted">{t('drawing.emptyHint')}</p>
        )}
      </div>
    </div>
  );
});

/** 序列化为独立 SVG 文档 */
function serialize(shapes: Shape[], width: number, height: number): string {
  const inner = shapes
    .map((s) => {
      const common = `stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth}" fill="${esc(s.fill)}"`;
      if (s.kind === 'rect') return `<rect data-shape="${s.id}" x="${r(s.x)}" y="${r(s.y)}" width="${r(Math.abs(s.w))}" height="${r(Math.abs(s.h))}" rx="3" ${common}/>`;
      if (s.kind === 'ellipse') return `<ellipse data-shape="${s.id}" cx="${r(s.x + s.w / 2)}" cy="${r(s.y + s.h / 2)}" rx="${r(Math.abs(s.w / 2))}" ry="${r(Math.abs(s.h / 2))}" ${common}/>`;
      if (s.kind === 'pen') return `<polyline data-shape="${s.id}" points="${s.points.map((p) => `${r(p[0])},${r(p[1])}`).join(' ')}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${common}/>`;
      if (s.kind === 'line' || s.kind === 'arrow') {
        const p1: [number, number] = s.points[0] ?? [s.x, s.y];
        const p2: [number, number] = s.points[1] ?? [s.w, s.h];
        const head =
          s.kind === 'arrow'
            ? (() => {
                const angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
                const headLen = 8 + s.strokeWidth * 2;
                const p3: [number, number] = [p2[0] + headLen * Math.cos(angle + Math.PI - 0.45), p2[1] + headLen * Math.sin(angle + Math.PI - 0.45)];
                const p4: [number, number] = [p2[0] + headLen * Math.cos(angle + Math.PI + 0.45), p2[1] + headLen * Math.sin(angle + Math.PI + 0.45)];
                return `<polygon points="${r(p2[0])},${r(p2[1])} ${r(p3[0])},${r(p3[1])} ${r(p4[0])},${r(p4[1])}" fill="${esc(s.stroke)}" stroke="none"/>`;
              })()
            : '';
        return `<line data-shape="${s.id}" data-arrow="${s.kind === 'arrow' ? 1 : 0}" x1="${r(p1[0])}" y1="${r(p1[1])}" x2="${r(p2[0])}" y2="${r(p2[1])}" stroke-linecap="round" ${common}/>${head}`;
      }
      return `<text data-shape="${s.id}" x="${r(s.x)}" y="${r(s.y)}" font-size="14" fill="${esc(s.stroke)}" stroke="none">${esc(s.text)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${inner}</svg>`;
}

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r = (v: number): number => Math.round(v * 100) / 100;
