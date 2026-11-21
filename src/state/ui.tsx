import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Txn } from '../domain/types';

export type NewTxnKind = 'expense' | 'personnel' | 'contact_payment' | 'collection' | 'transfer' | 'income';

export interface TxnPreset {
  date?: string;
  contactId?: string;
  categoryId?: string;
  sourceAccountId?: string;
  targetAccountId?: string;
  paymentMethodId?: string;
  amount?: number;
  description?: string;
  direction?: 'pay' | 'receive';
  payStatus?: 'paid' | 'unpaid' | 'out_of_pocket';
  recurringId?: string;
  recurringPeriod?: string;
  dueDate?: string;
}

export type ModalState =
  | { type: 'menu'; preset?: TxnPreset }
  | { type: 'new'; kind: NewTxnKind; preset?: TxnPreset }
  | { type: 'edit'; txn: Txn }
  | { type: 'detail'; txnId: string }
  | null;

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface UICtx {
  modal: ModalState;
  openMenu: (preset?: TxnPreset) => void;
  openNew: (kind: NewTxnKind, preset?: TxnPreset) => void;
  openEdit: (txn: Txn) => void;
  openDetail: (txnId: string) => void;
  closeModal: () => void;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  confirmState: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  resolveConfirm: (v: boolean) => void;
}

const Ctx = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<UICtx['confirmState']>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    [],
  );

  const resolveConfirm = useCallback(
    (v: boolean) => {
      setConfirmState((s) => {
        s?.resolve(v);
        return null;
      });
    },
    [],
  );

  const value = useMemo<UICtx>(
    () => ({
      modal,
      openMenu: (preset) => setModal({ type: 'menu', preset }),
      openNew: (kind, preset) => setModal({ type: 'new', kind, preset }),
      openEdit: (txn) => setModal({ type: 'edit', txn }),
      openDetail: (txnId) => setModal({ type: 'detail', txnId }),
      closeModal: () => setModal(null),
      toasts,
      toast,
      confirm,
      confirmState,
      resolveConfirm,
    }),
    [modal, toasts, toast, confirm, confirmState, resolveConfirm],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UICtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}

/** Runs an async action and reports errors as a toast. Returns true on success. */
export function useRunner() {
  const { toast } = useUI();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
    },
    [toast],
  );
}
