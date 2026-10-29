import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ user, children, requiredRole, requireAdminApproval = false, authLoading }) {
  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-slate-900/90 px-6 py-4 text-center shadow-2xl shadow-black/30">Loading your session…</div>
      </div>
    );
  }

  // Extra guard: some pages (like Company) rely on user.uid.
  // During initial auth hydration, `user` may be set without uid.
  if (!user || !user.uid) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }
  if (requireAdminApproval && user.adminApproved !== true) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100">
        <div className="max-w-lg rounded-3xl border border-orange-400/30 bg-slate-900/90 px-6 py-8 text-center shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-bold">Admin approval required</h1>
          <p className="mt-3 text-slate-300">This account is not marked as an admin in Firestore. Set its <strong className="text-orange-300">role</strong> field to <strong className="text-orange-300">admin</strong>, then sign out and sign in again.</p>
        </div>
      </div>
    );
  }
  return children;
}

