// Toolbar sign-in / user chip. Cross-device sync follows the signed-in user.
import { useAuthStore } from '../store/authStore';
import { supabaseEnabled } from '../lib/supabase';

export function AuthButton() {
  const user = useAuthStore((s) => s.user);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);
  const signOut = useAuthStore((s) => s.signOut);

  if (user) {
    return (
      <div className="auth">
        {user.avatar && <img className="auth-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />}
        <span className="auth-name">{user.name ?? user.email}</span>
        <button onClick={() => signOut()} title="Sign out">
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="auth">
      <button
        className="signin"
        onClick={() => signInGoogle()}
        title={supabaseEnabled ? 'Sign in to sync across devices' : 'Cloud sync not set up yet'}
      >
        Sign in with Google
      </button>
    </div>
  );
}
