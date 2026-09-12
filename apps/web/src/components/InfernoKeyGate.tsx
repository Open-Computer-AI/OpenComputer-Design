import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useT } from '../i18n';

export const INFERNO_KEY_GATE_MESSAGE =
  'Add your Inferno API key in Settings to generate.';
export const INFERNO_KEY_GATE_ACTION = 'Open Settings';

export {
  INFERNO_KEY_REQUIRED_EVENT,
  INFERNO_STATUS_CHANGED_EVENT,
  notifyInfernoKeyRequired,
  notifyInfernoStatusChanged,
} from '../providers/inferno-status';

export function canGenerateWithInferno(status: {
  ready?: boolean;
  models?: unknown[] | null;
} | null | undefined): boolean {
  return status?.ready === true && Array.isArray(status.models) && status.models.length > 0;
}

type InfernoGenerateGateValue = {
  canGenerate: boolean;
  openGate: () => void;
  requestGenerate: () => boolean;
};

const InfernoGenerateGateContext = createContext<InfernoGenerateGateValue>({
  canGenerate: true,
  openGate: () => {},
  requestGenerate: () => true,
});

export function InfernoGenerateGateProvider({
  canGenerate,
  onOpenGate,
  children,
}: {
  canGenerate: boolean;
  onOpenGate: () => void;
  children: ReactNode;
}) {
  const openGate = useCallback(() => {
    onOpenGate();
  }, [onOpenGate]);
  const requestGenerate = useCallback(() => {
    if (canGenerate) return true;
    onOpenGate();
    return false;
  }, [canGenerate, onOpenGate]);
  const value = useMemo(
    () => ({ canGenerate, openGate, requestGenerate }),
    [canGenerate, openGate, requestGenerate],
  );
  return (
    <InfernoGenerateGateContext.Provider value={value}>
      {children}
    </InfernoGenerateGateContext.Provider>
  );
}

export function useInfernoGenerateGate(): InfernoGenerateGateValue {
  return useContext(InfernoGenerateGateContext);
}

export function InfernoGenerateGuard({ children }: { children: ReactNode }) {
  const { canGenerate, openGate } = useInfernoGenerateGate();
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (canGenerate) return;
    event.preventDefault();
    event.stopPropagation();
    openGate();
  };
  return (
    <span
      className={canGenerate ? 'inferno-generate-guard' : 'inferno-generate-guard is-blocked'}
      data-testid="inferno-generate-guard"
      onClickCapture={onClickCapture}
    >
      {children}
    </span>
  );
}

export function InfernoKeyGate({
  open,
  onOpenSettings,
  onClose,
}: {
  open: boolean;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inferno-key-gate-title"
      data-testid="inferno-key-gate"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="inferno-key-gate-title">{INFERNO_KEY_GATE_MESSAGE}</p>
        <div className="row">
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.close')}
          </button>
          <button type="button" className="primary" onClick={onOpenSettings}>
            {INFERNO_KEY_GATE_ACTION}
          </button>
        </div>
      </div>
    </div>
  );
}
