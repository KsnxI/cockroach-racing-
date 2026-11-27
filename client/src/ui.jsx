import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const RACE_STATUS = {
  SCHEDULED: 'Запланирован',
  BETTING_OPEN: 'Приём ставок',
  RUNNING: 'Идёт',
  FINISHED: 'Завершён',
  CANCELLED: 'Отменён',
};
export const BET_STATUS = { PENDING: 'Ожидает', WON: 'Выигрыш', LOST: 'Проигрыш', REFUNDED: 'Возврат' };
export const TX_TYPE = {
  SIGNUP_BONUS: 'Бонус за регистрацию',
  BET: 'Ставка',
  BET_WIN: 'Выигрыш ставки',
  REFUND: 'Возврат ставки',
  RACER_PURCHASE: 'Покупка таракана',
  TRAINING: 'Тренировка',
  PRIZE: 'Приз владельцу',
};

export const fmtDate = (d) => new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, bad = false) => {
    setT({ msg, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={'toast ' + (t.bad ? 'bad' : 'ok')}>{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

// загрузка данных: { data, error, loading, reload }
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    try {
      const data = await fn();
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

export function Load({ s, children }) {
  if (s.loading) return <p className="muted">Загрузка…</p>;
  if (s.error) return <p className="err">{s.error}</p>;
  return children(s.data);
}

export function Pager({ meta, page, onPage }) {
  const total = meta?.totalPages || 1;
  if (total <= 1) return null;
  return (
    <div className="pager">
      <button className="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>←</button>
      <span>{page} / {total}</span>
      <button className="ghost" disabled={page >= total} onClick={() => onPage(page + 1)}>→</button>
    </div>
  );
}

export const Badge = ({ children, tone }) => <span className={'badge ' + (tone || '')}>{children}</span>;