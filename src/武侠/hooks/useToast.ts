import { useCallback, useState } from 'react';
import { ToastState } from '../components/StatusToast';

export function useToast() {
  const [toastState, setToastState] = useState<ToastState>({ status: 'idle', message: '' });

  const showLoading = useCallback((message: string) => {
    setToastState({ status: 'loading', message });
  }, []);

  const showError = useCallback((message: string) => {
    setToastState({ status: 'error', message });
  }, []);

  const dismissToast = useCallback(() => {
    setToastState({ status: 'idle', message: '' });
  }, []);

  return { toastState, showLoading, showError, dismissToast };
}
