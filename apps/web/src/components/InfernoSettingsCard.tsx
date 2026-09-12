import { useCallback, useEffect, useRef, useState } from 'react';
import { INFERNO_BASE_URL } from '../inferno';
import { useT } from '../i18n';
import {
  clearInfernoApiKey,
  fetchInfernoStatus,
  notifyInfernoStatusChanged,
  saveInfernoApiKey,
  type InfernoStatusResponse,
} from '../providers/inferno-status';
import { Icon } from './Icon';

const EMPTY_STATUS: InfernoStatusResponse = {
  ready: false,
  models: [],
  apiKeyConfigured: false,
  apiKeyTail: null,
};

function infernoSaveErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === 'INFERNO_KEY_REJECTED') return 'Inferno rejected this key.';
  if (code === 'INFERNO_UNAVAILABLE') {
    return 'Cannot reach Inferno at router.tryopencomputer.com.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Cannot reach Inferno at router.tryopencomputer.com.';
}

export function InfernoSettingsCard({
  model,
  onModelChange,
}: {
  model: string;
  onModelChange: (model: string) => void;
}) {
  const t = useT();
  const [draftKey, setDraftKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<InfernoStatusResponse>(EMPTY_STATUS);
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;

  const applyStatus = useCallback((next: InfernoStatusResponse) => {
    setStatus(next);
    notifyInfernoStatusChanged(next);
    const ids = next.models.map((item) => item.id);
    if (ids.length === 0) return;
    if (!modelRef.current.trim() || !ids.includes(modelRef.current)) {
      onModelChangeRef.current(ids[0] ?? '');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchInfernoStatus()
      .then((next) => {
        if (!cancelled) applyStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(EMPTY_STATUS);
      });
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  const putKey = async (action: 'save' | 'test') => {
    const apiKey = draftKey.trim();
    if (!apiKey) {
      setError('Inferno API key is required');
      return;
    }
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const next = await saveInfernoApiKey(apiKey);
      applyStatus(next);
      setDraftKey('');
      if (next.models.length === 0) {
        setNotice('no models');
      } else if (action === 'test') {
        setNotice(`${next.models.length} model${next.models.length === 1 ? '' : 's'}`);
      } else {
        setNotice(null);
      }
    } catch (err) {
      setError(infernoSaveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    setBusy('clear');
    setError(null);
    setNotice(null);
    try {
      const next = await clearInfernoApiKey();
      applyStatus(next);
      setDraftKey('');
    } catch (err) {
      setError(infernoSaveErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const configured = status.apiKeyConfigured;
  const models = status.models;

  return (
    <section
      className="settings-section settings-section-card settings-section-byok"
      data-testid="inferno-settings-card"
    >
      <div className="section-head">
        <div>
          <div className="settings-byok-title">
            <h3>Inferno</h3>
          </div>
        </div>
      </div>
      <label className="field">
        <span className="field-label-row">
          <span className="field-label settings-byok-key-label">
            {t('settings.apiKey')}
            <span className="field-required" aria-label={t('settings.required')}>*</span>
          </span>
        </span>
        <div className="field-row settings-byok-key-row">
          <span className="settings-byok-key-input-wrap">
            <input
              aria-label={t('settings.apiKey')}
              type={showKey ? 'text' : 'password'}
              value={draftKey}
              autoComplete="off"
              spellCheck={false}
              placeholder={configured && status.apiKeyTail ? `••••${status.apiKeyTail}` : ''}
              onChange={(event) => setDraftKey(event.target.value)}
            />
            <button
              type="button"
              className="ghost icon-btn settings-byok-key-toggle"
              onClick={() => setShowKey((current) => !current)}
              title={showKey ? t('settings.hideKey') : t('settings.showKey')}
            >
              {showKey ? t('settings.hide') : t('settings.show')}
            </button>
          </span>
        </div>
        <span className="field-inline-status">{INFERNO_BASE_URL}</span>
      </label>
      <div className="field-row">
        <button
          type="button"
          className="primary"
          disabled={busy !== null || !draftKey.trim()}
          onClick={() => void putKey('save')}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy !== null || !draftKey.trim()}
          title={t('settings.testTitle')}
          onClick={() => void putKey('test')}
        >
          {busy === 'test' ? t('settings.testRunning') : t('settings.test')}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy !== null || !configured}
          onClick={() => void handleClear()}
        >
          {t('common.clear')}
        </button>
      </div>
      {error ? (
        <p className="settings-test-status error" role="alert">{error}</p>
      ) : null}
      {notice ? (
        <p className="settings-test-status" role="status">{notice}</p>
      ) : null}
      {models.length > 0 ? (
        <label className="field">
          <span className="field-label">{t('settings.model')}</span>
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            data-testid="inferno-model-select"
          >
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label || item.id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="hint">
          <Icon name="info" size={13} /> Paste a key, then Save or Test to load models.
        </p>
      )}
    </section>
  );
}
