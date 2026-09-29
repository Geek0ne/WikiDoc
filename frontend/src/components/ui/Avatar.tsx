export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

/** 首字符头像：有头像图用图，否则渲染显示名首字并按名字哈希取色 */
export function Avatar({ name, src, size = 30, className = '' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full border border-line object-cover ${className}`}
      />
    );
  }
  const first = (name || '?').trim().charAt(0).toUpperCase();
  // 以名字做简易哈希，从固定的柔和色板里取色，保证同人同色
  const palette = ['#4c7fd0', '#3f9d74', '#c07a3d', '#9b6cc4', '#cf6f7e'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = palette[hash % palette.length];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.44 }}
    >
      {first}
    </span>
  );
}
