import { useRef } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Code2,
  Link2,
  Table,
  List,
  ListOrdered,
  Quote,
  Minus,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { Tooltip } from '../ui';

type Tool =
  | { kind: 'button'; key: string; icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }
  | { kind: 'sep'; key: string };

interface EditorToolbarProps {
  onInsert: (snippet: string, cursorOffset?: number) => void;
  onUploadImage: (file: File) => void;
  uploading: boolean;
}

/** 编辑工具栏：行内格式与块级模板通过回调插入，图片走上传流程 */
export function EditorToolbar({ onInsert, onUploadImage, uploading }: EditorToolbarProps) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const tools: Tool[] = [
    { kind: 'button', key: 'bold', icon: <Bold size={15} aria-hidden />, label: '加粗', onClick: () => onInsert('**加粗文本**', 2) },
    { kind: 'button', key: 'italic', icon: <Italic size={15} aria-hidden />, label: '斜体', onClick: () => onInsert('*斜体文本*', 1) },
    { kind: 'button', key: 'strike', icon: <Strikethrough size={15} aria-hidden />, label: '删除线', onClick: () => onInsert('~~删除文本~~', 2) },
    { kind: 'button', key: 'code', icon: <Code size={15} aria-hidden />, label: '行内代码', onClick: () => onInsert('`code`', 1) },
    { kind: 'sep', key: 'sep1' },
    {
      kind: 'button',
      key: 'link',
      icon: <Link2 size={15} aria-hidden />,
      label: t('editor.insertLink'),
      onClick: () => onInsert('[链接文本](https://)', 1),
    },
    {
      kind: 'button',
      key: 'image',
      icon: uploading ? <Loader2 size={15} aria-hidden className="animate-spin" /> : <ImagePlus size={15} aria-hidden />,
      label: t('editor.insertImage'),
      onClick: () => fileRef.current?.click(),
      disabled: uploading,
    },
    { kind: 'sep', key: 'sep2' },
    {
      kind: 'button',
      key: 'codeblock',
      icon: <Code2 size={15} aria-hidden />,
      label: t('editor.insertCode'),
      onClick: () => onInsert('\n```js\nconst answer = 42;\n```\n', 1),
    },
    {
      kind: 'button',
      key: 'table',
      icon: <Table size={15} aria-hidden />,
      label: t('editor.insertTable'),
      onClick: () => onInsert('\n| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |\n'),
    },
    { kind: 'button', key: 'ul', icon: <List size={15} aria-hidden />, label: '无序列表', onClick: () => onInsert('\n- 列表项\n') },
    { kind: 'button', key: 'ol', icon: <ListOrdered size={15} aria-hidden />, label: '有序列表', onClick: () => onInsert('\n1. 列表项\n') },
    { kind: 'button', key: 'quote', icon: <Quote size={15} aria-hidden />, label: '引用', onClick: () => onInsert('\n> 引用内容\n') },
    { kind: 'button', key: 'hr', icon: <Minus size={15} aria-hidden />, label: '分割线', onClick: () => onInsert('\n---\n') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-3 py-1.5" role="toolbar" aria-label="编辑工具栏">
      {tools.map((tool) =>
        tool.kind === 'sep' ? (
          <span key={tool.key} className="mx-1 h-4 w-px bg-line" aria-hidden />
        ) : (
          <Tooltip key={tool.key} content={tool.label}>
            <button
              type="button"
              aria-label={tool.label}
              disabled={tool.disabled}
              onClick={tool.onClick}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tool.icon}
            </button>
          </Tooltip>
        )
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadImage(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
