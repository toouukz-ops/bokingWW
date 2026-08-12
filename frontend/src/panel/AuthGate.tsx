import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { initializeAuth, login, logout, type SessionUser, type UpdateRequiredDetail } from "../shared/auth";

export function AuthGate({ children, onAuthenticated }: { children: ReactNode; onAuthenticated: () => void }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "submitting">("checking");
  const [error, setError] = useState("");
  const [updateRequired, setUpdateRequired] = useState<UpdateRequiredDetail | null>(null);

  useEffect(() => {
    initializeAuth().then((nextUser) => {
      setUser(nextUser);
      setState("ready");
      if (nextUser) onAuthenticated();
    });
    const requireAuth = () => {
      setUser(null);
      setState("ready");
      setError("Сессия завершена. Войдите снова.");
    };
    window.addEventListener("gpb-auth-required", requireAuth);
    const requireUpdate = (event: Event) => {
      setUser(null);
      setState("ready");
      setUpdateRequired((event as CustomEvent<UpdateRequiredDetail>).detail);
    };
    window.addEventListener("gpb-update-required", requireUpdate);
    return () => { window.removeEventListener("gpb-auth-required", requireAuth); window.removeEventListener("gpb-update-required", requireUpdate); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("submitting");
    setError("");
    try {
      const nextUser = await login(String(form.get("username") || ""), String(form.get("password") || ""));
      setUser(nextUser);
      setState("ready");
      onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось войти.");
      setState("ready");
    }
  }

  if (updateRequired) return <div className="gpb-update-lock"><aside className="gpb-update-dialog"><strong>Требуется обновление</strong><p>Эта версия расширения заблокирована сервером. Для продолжения установите версию {updateRequired.minimumVersion} или новее.</p>{updateRequired.updateUrl ? <a href={updateRequired.updateUrl} target="_blank" rel="noreferrer">Скачать обновление</a> : <div className="gpb-auth-error">Получите новый архив у администратора.</div>}<small>До обновления доступ к системе полностью закрыт.</small></aside></div>;
  if (state === "checking") return <aside className="gpb-auth-panel"><strong>Проверка доступа…</strong></aside>;
  if (!user) {
    return (
      <aside className="gpb-auth-panel">
        <form onSubmit={submit}>
          <h2>Вход в GPB</h2>
          <p>Введите личную учётную запись оператора.</p>
          <input name="username" autoComplete="username" placeholder="Логин" required />
          <input name="password" type="password" autoComplete="current-password" placeholder="Пароль" required />
          {error ? <div className="gpb-auth-error">{error}</div> : null}
          <button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Входим…" : "Войти"}</button>
        </form>
      </aside>
    );
  }
  return <div data-gpb-auth-user={user.username}>{children}<button className="gpb-auth-logout" type="button" onClick={() => void logout().then(() => setUser(null))}>Выйти · {user.displayName}</button></div>;
}
