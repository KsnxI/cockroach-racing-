import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { AuthPage, Bets, History, RaceDetail, Racers, Races } from './pages.jsx';

function Layout() {
  const { user, logout } = useAuth();
  const bookmaker = user.role === 'BOOKMAKER';
  return (
    <>
      <header className="top">
        <div className="wrap bar">
          <b className="logo">🪳 Тараканьи бега</b>
          <nav>
            <NavLink to="/races">Заезды</NavLink>
            {!bookmaker && <NavLink to="/racers">Мои тараканы</NavLink>}
            {!bookmaker && <NavLink to="/bets">Мои ставки</NavLink>}
            <NavLink to="/history">Операции</NavLink>
          </nav>
          <div className="me">
            <span>
              {user.nickname} <span className="badge">{bookmaker ? 'букмекер' : 'игрок'}</span>
            </span>
            <b>💰 {user.balance}</b>
            <button className="ghost" onClick={logout}>Выйти</button>
          </div>
        </div>
      </header>
      <main className="wrap">
        <Outlet />
      </main>
    </>
  );
}

function Guard() {
  const { user } = useAuth();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();
  const home = <Navigate to="/races" replace />;
  return (
    <Routes>
      <Route path="/login" element={user ? home : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? home : <AuthPage mode="register" />} />
      <Route element={<Guard />}>
        <Route path="/races" element={<Races />} />
        <Route path="/races/:id" element={<RaceDetail />} />
        <Route path="/racers" element={<Racers />} />
        <Route path="/bets" element={<Bets />} />
        <Route path="/history" element={<History />} />
      </Route>
      <Route path="*" element={home} />
    </Routes>
  );
}