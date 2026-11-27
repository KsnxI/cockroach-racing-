import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { BET_STATUS, Badge, Load, Pager, RACE_STATUS, TX_TYPE, fmtDate, useLoad, useToast } from './ui.jsx';

/* ---------- вход и регистрация ---------- */
export function AuthPage({ mode }) {
  const { login, register } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const reg = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    setBusy(true);
    try {
      await (reg ? register(f) : login(f));
    } catch (err) {
      toast(err.message, true);
      setBusy(false);
    }
  };

  return (
    <div className="auth card">
      <h1>🪳 Тараканьи бега</h1>
      <p className="muted">Покупай тараканов, тренируй и делай ставки на заезды.</p>
      <form onSubmit={submit}>
        <input name="email" type="email" placeholder="Email" required />
        {reg && <input name="nickname" placeholder="Никнейм (3–20 символов)" required minLength={3} maxLength={20} />}
        <input name="password" type="password" placeholder={reg ? 'Пароль (от 8 символов)' : 'Пароль'} required minLength={reg ? 8 : 1} />
        <button disabled={busy}>{reg ? 'Зарегистрироваться' : 'Войти'}</button>
      </form>
      <p className="small">
        {reg ? <>Уже есть аккаунт? <Link to="/login">Войти</Link></> : <>Нет аккаунта? <Link to="/register">Регистрация</Link></>}
      </p>
      {!reg && <p className="muted small">Демо-игрок: player@race.com / password123</p>}
    </div>
  );
}

/* ---------- список заездов ---------- */
export function Races() {
  const { user } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const s = useLoad(
    () => api(`/races?limit=8&order=desc&page=${page}${status ? `&status=${status}` : ''}`),
    [page, status]
  );

  const create = async (e) => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form));
    try {
      await api('/races', { method: 'POST', body: { title: f.title, startsAt: new Date(f.startsAt).toISOString() } });
      toast('Заезд создан');
      form.reset();
      setPage(1);
      s.reload();
    } catch (err) {
      toast(err.message, true);
    }
  };

  return (
    <>
      {user.role === 'BOOKMAKER' && (
        <form className="card row" onSubmit={create}>
          <input name="title" placeholder="Название заезда" required minLength={3} maxLength={60} />
          <input name="startsAt" type="datetime-local" required />
          <button>Создать заезд</button>
        </form>
      )}
      <section className="card">
        <div className="row">
          <h2>Заезды</h2>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Все статусы</option>
            {Object.entries(RACE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Load s={s}>
          {({ data, meta }) => (
            <>
              {data.length === 0 ? (
                <p className="muted">Заездов нет</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Название</th><th>Старт</th><th>Статус</th><th>Участников</th><th></th></tr></thead>
                    <tbody>
                      {data.map((r) => (
                        <tr key={r.id}>
                          <td>{r.title}</td>
                          <td>{fmtDate(r.startsAt)}</td>
                          <td><Badge tone={r.status}>{RACE_STATUS[r.status]}</Badge></td>
                          <td>{r._count?.entries ?? 0}</td>
                          <td><Link className="btn ghost" to={`/races/${r.id}`}>Открыть</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager meta={meta} page={page} onPage={setPage} />
            </>
          )}
        </Load>
      </section>
    </>
  );
}

/* ---------- страница заезда ---------- */
function EntryRow({ e, canOdds, canBet, act, raceId }) {
  const [odds, setOdds] = useState(e.odds);
  const [amount, setAmount] = useState(50);
  return (
    <tr>
      <td><b>{e.racer.name}</b></td>
      <td className="muted">⚡{e.racer.speed} 💪{e.racer.stamina} 🍀{e.racer.luck}</td>
      <td>×{e.odds}</td>
      <td>
        <div className="row tight">
          {canOdds && (
            <>
              <input className="num" type="number" step="0.1" min="1.1" max="50" value={odds} onChange={(ev) => setOdds(ev.target.value)} />
              <button className="ghost" onClick={() => act(() => api(`/races/${raceId}/entries/${e.id}/odds`, { method: 'PATCH', body: { odds: Number(odds) } }), 'Коэффициент сохранён')}>Сохранить</button>
            </>
          )}
          {canBet && (
            <>
              <input className="num" type="number" min="10" max="500" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
              <button onClick={() => act(() => api('/bets', { method: 'POST', body: { entryId: e.id, amount: Number(amount) } }), 'Ставка принята')}>Поставить</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function RaceDetail() {
  const { id } = useParams();
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const s = useLoad(async () => {
    const { data: race } = await api(`/races/${id}`);
    const out = { race, result: null, myRacers: [] };
    if (race.status === 'FINISHED') out.result = (await api(`/races/${id}/result`)).data;
    if (user.role === 'PLAYER' && race.status === 'SCHEDULED') {
      const taken = new Set(race.entries.map((x) => x.racerId));
      const mine = (await api(`/racers?ownerId=${user.id}&limit=50`)).data;
      out.myRacers = mine.filter((r) => !taken.has(r.id));
    }
    return out;
  }, [id, user.id]);

  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      await s.reload();
      await refreshUser();
    } catch (e) {
      toast(e.message, true);
    }
  };
  const post = (path, body) => api(`/races/${id}/${path}`, { method: 'POST', body });

  const enter = (e) => {
    e.preventDefault();
    const { racerId } = Object.fromEntries(new FormData(e.target));
    act(() => post('entries', { racerId }), 'Таракан заявлен на заезд');
  };

  return (
    <>
      <Link to="/races" className="back">← К заездам</Link>
      <Load s={s}>
        {({ race, result, myRacers }) => {
          const mine = user.role === 'BOOKMAKER' && race.createdById === user.id;
          const canOdds = mine && ['SCHEDULED', 'BETTING_OPEN'].includes(race.status);
          const canBet = user.role === 'PLAYER' && race.status === 'BETTING_OPEN';
          return (
            <>
              <section className="card">
                <div className="row">
                  <h2>{race.title}</h2>
                  <Badge tone={race.status}>{RACE_STATUS[race.status]}</Badge>
                </div>
                <p className="muted small">
                  Старт: {fmtDate(race.startsAt)}
                  {race.seedHash && <><br />Хеш seed (опубликован до заезда): <code>{race.seedHash}</code></>}
                </p>

                {race.entries.length === 0 ? (
                  <p className="muted">Участников пока нет</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Таракан</th><th>Характеристики</th><th>Коэф.</th><th></th></tr></thead>
                      <tbody>
                        {race.entries.map((e) => (
                          <EntryRow key={e.id} e={e} raceId={race.id} canOdds={canOdds} canBet={canBet} act={act} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {myRacers.length > 0 && (
                  <form className="row top-gap" onSubmit={enter}>
                    <select name="racerId">{myRacers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                    <button>Заявить на заезд</button>
                  </form>
                )}
                {user.role === 'PLAYER' && race.status === 'SCHEDULED' && myRacers.length === 0 && (
                  <p className="muted small top-gap">Чтобы заявить таракана, купите его во вкладке «Мои тараканы».</p>
                )}
                {mine && race.status === 'SCHEDULED' && (
                  <button className="top-gap" onClick={() => act(() => post('open-betting'), 'Приём ставок открыт')}>Открыть приём ставок</button>
                )}
                {mine && race.status === 'BETTING_OPEN' && (
                  <button className="top-gap" onClick={() => act(() => post('run'), 'Заезд проведён')}>🏁 Запустить заезд</button>
                )}
              </section>

              {result && (
                <section className="card">
                  <h2>🏁 Результат</h2>
                  <ol className="stand">
                    {result.standings.map((x, i) => (
                      <li key={x.entryId}>
                        <span className="medal">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                        <b>{x.racer.name}</b>
                        <span className="muted">{x.finishTime} тиков · ×{x.odds}</span>
                      </li>
                    ))}
                  </ol>
                  <h3>Комментарий</h3>
                  <pre className="log">{result.commentary.join('\n')}</pre>
                  <h3>Проверка честности</h3>
                  <p className="small">seed: <code>{result.seed}</code></p>
                  <p>
                    sha256(seed) совпадает с опубликованным хешем: {result.verification.seedMatchesHash ? '✅' : '❌'}<br />
                    Повторный расчёт даёт тот же результат: {result.verification.replayMatches ? '✅' : '❌'}
                  </p>
                </section>
              )}
            </>
          );
        }}
      </Load>
    </>
  );
}

/* ---------- мои тараканы ---------- */
const STATS = [['speed', '⚡', 'Скорость'], ['stamina', '💪', 'Выносливость'], ['luck', '🍀', 'Удача']];

export function Racers() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const s = useLoad(() => api(`/racers?ownerId=${user.id}&limit=50`), [user.id]);

  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      await s.reload();
      await refreshUser();
    } catch (e) {
      toast(e.message, true);
    }
  };

  const buy = (e) => {
    e.preventDefault();
    const form = e.target;
    const f = Object.fromEntries(new FormData(form));
    act(() => api('/racers', { method: 'POST', body: f }), 'Таракан куплен').then(() => form.reset());
  };

  return (
    <>
      <form className="card row" onSubmit={buy}>
        <input name="name" placeholder="Имя нового таракана" required minLength={2} maxLength={30} />
        <button>Купить за 100 💰</button>
      </form>
      <Load s={s}>
        {({ data }) =>
          data.length === 0 ? (
            <p className="muted">У вас пока нет тараканов. Купите первого!</p>
          ) : (
            <div className="grid">
              {data.map((r) => (
                <article className="card" key={r.id}>
                  <h3>{r.name}</h3>
                  {STATS.map(([k, icon, label]) => (
                    <div className="stat" key={k} title={label}>
                      <span>{icon} {r[k]}</span>
                      <i><b style={{ width: Math.min(100, r[k] * 4) + '%' }} /></i>
                    </div>
                  ))}
                  <p className="muted small">Энергия {r.energy}/100 · побед {r.wins} из {r.races}</p>
                  <div className="row tight">
                    {STATS.map(([k, icon]) => (
                      <button key={k} className="ghost" title="Тренировка: 50 💰 и 20 энергии" onClick={() => act(() => api(`/racers/${r.id}/train`, { method: 'POST', body: { stat: k } }), 'Тренировка прошла')}>{icon} +1</button>
                    ))}
                    <button className="ghost danger" onClick={() => confirm('Удалить таракана?') && act(() => api(`/racers/${r.id}`, { method: 'DELETE' }), 'Таракан удалён')}>Удалить</button>
                  </div>
                </article>
              ))}
            </div>
          )
        }
      </Load>
    </>
  );
}

/* ---------- мои ставки ---------- */
export function Bets() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const s = useLoad(() => api(`/bets?limit=10&page=${page}${status ? `&status=${status}` : ''}`), [page, status]);
  return (
    <section className="card">
      <div className="row">
        <h2>Мои ставки</h2>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Все</option>
          {Object.entries(BET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Load s={s}>
        {({ data, meta }) => (
          <>
            {data.length === 0 ? (
              <p className="muted">Ставок пока нет</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Заезд</th><th>Таракан</th><th>Ставка</th><th>Коэф.</th><th>Итог</th></tr></thead>
                  <tbody>
                    {data.map((b) => (
                      <tr key={b.id}>
                        <td><Link to={`/races/${b.race.id}`}>{b.race.title}</Link></td>
                        <td>{b.entry.racer.name}</td>
                        <td>{b.amount}</td>
                        <td>×{b.oddsAtBet}</td>
                        <td><Badge tone={b.status}>{BET_STATUS[b.status]}</Badge>{b.payout ? ` +${b.payout}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager meta={meta} page={page} onPage={setPage} />
          </>
        )}
      </Load>
    </section>
  );
}

/* ---------- история операций ---------- */
export function History() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const s = useLoad(() => api(`/me/transactions?limit=10&page=${page}${type ? `&type=${type}` : ''}`), [page, type]);
  return (
    <section className="card">
      <div className="row">
        <h2>История операций</h2>
        <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">Все типы</option>
          {Object.entries(TX_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Load s={s}>
        {({ data, meta }) => (
          <>
            {data.length === 0 ? (
              <p className="muted">Операций нет</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th><th>Баланс после</th></tr></thead>
                  <tbody>
                    {data.map((t) => (
                      <tr key={t.id}>
                        <td>{fmtDate(t.createdAt)}</td>
                        <td>{TX_TYPE[t.type]}</td>
                        <td className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount > 0 ? '+' : ''}{t.amount}</td>
                        <td>{t.balanceAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager meta={meta} page={page} onPage={setPage} />
          </>
        )}
      </Load>
    </section>
  );
}