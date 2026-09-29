import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
const MAX_TOASTS = 4;
const AUTO_DISMISS_MS = 3200;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (kind, message) => {
    const id = ++seq;
    const next = [...get().toasts, { id, kind, message }].slice(-MAX_TOASTS);
    set({ toasts: next });
    window.setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },

  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** 全站快捷入口：toast.success('已保存') */
export const toast = {
  success: (msg: string) => useToastStore.getState().push('success', msg),
  error: (msg: string) => useToastStore.getState().push('error', msg),
  info: (msg: string) => useToastStore.getState().push('info', msg),
  warning: (msg: string) => useToastStore.getState().push('warning', msg),
};
