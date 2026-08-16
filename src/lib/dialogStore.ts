import { create } from 'zustand';

export type DialogType = 'danger' | 'warning' | 'info' | 'success';

export interface DialogOptions {
  title: string;
  message: string | React.ReactNode;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

interface DialogState {
  isOpen: boolean;
  options: DialogOptions | null;
  showDialog: (options: DialogOptions) => Promise<boolean>;
  closeDialog: () => void;
  confirm: () => void;
  cancel: () => void;
  resolvePromise: ((value: boolean) => void) | null;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  isOpen: false,
  options: null,
  resolvePromise: null,

  showDialog: (options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        options,
        resolvePromise: resolve,
      });
    });
  },

  closeDialog: () => {
    const { resolvePromise } = get();
    if (resolvePromise) resolvePromise(false);
    set({ isOpen: false, options: null, resolvePromise: null });
  },

  confirm: () => {
    const { options, resolvePromise } = get();
    if (options?.onConfirm) {
      options.onConfirm();
    }
    if (resolvePromise) resolvePromise(true);
    set({ isOpen: false, options: null, resolvePromise: null });
  },

  cancel: () => {
    const { options, resolvePromise } = get();
    if (options?.onCancel) {
      options.onCancel();
    }
    if (resolvePromise) resolvePromise(false);
    set({ isOpen: false, options: null, resolvePromise: null });
  },
}));

/**
 * Easy helper functions to call custom luxury modals from anywhere in the project
 */
export const showConfirmDialog = (options: DialogOptions): Promise<boolean> => {
  return useDialogStore.getState().showDialog(options);
};

export const showAlertDialog = (title: string, message: string, type: DialogType = 'info'): Promise<boolean> => {
  return useDialogStore.getState().showDialog({
    title,
    message,
    type,
    showCancel: false,
    confirmText: 'حسناً، فهمت',
  });
};
