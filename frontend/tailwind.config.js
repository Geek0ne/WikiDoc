/** Tailwind 配置：颜色全部映射到 CSS 变量，主题切换只改变量不动类名。 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
        fg: 'var(--text)',
        'fg-secondary': 'var(--text-secondary)',
        'fg-muted': 'var(--text-muted)',
        line: 'var(--border)',
        primary: 'var(--primary)',
        'primary-fg': 'var(--primary-fg)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'Consolas', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        DEFAULT: 'var(--shadow)',
        overlay: 'var(--shadow-overlay)',
      },
      transitionDuration: {
        fast: '150ms',
      },
      zIndex: {
        dropdown: '40',
        sticky: '30',
        'modal-backdrop': '50',
        modal: '60',
        toast: '70',
        tooltip: '80',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
        slideIn: 'slideIn 200ms ease-out',
      },
    },
  },
  plugins: [],
};
