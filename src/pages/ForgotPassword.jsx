import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase.js';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authType, setAuthType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showMessage = (message, type) => {
    setAuthMessage(message);
    setAuthType(type);
    setTimeout(() => {
      setAuthMessage('');
      setAuthType('');
    }, 5000);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage('If an account exists with this email, you will receive a password reset link shortly.', 'success');
      setEmail('');
    } catch (error) {
      let errorMessage = 'Failed to send reset email. Please try again.';
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many attempts. Please try again later.';
          break;
      }
      showMessage(errorMessage, 'error');
      console.error('Password reset error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white pt-32 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[1.5rem] border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold">Reset Your Password</h1>
          <p className="mt-2 text-sm text-slate-300">Enter the email address for your account and we'll send a reset link.</p>
        </div>
        {authMessage ? (
          <div className={`rounded-2xl px-4 py-3 text-sm ${authType === 'error' ? 'border border-red-400 bg-red-500/10 text-red-200' : 'border border-emerald-400 bg-emerald-500/10 text-emerald-200'}`}>
            {authMessage}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Sending reset link...' : 'Send Reset Link'}
          </button>
        </form>
        <div className="mt-4 text-center text-sm text-slate-300">
          <p>
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-orange-300 hover:text-orange-400">Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
