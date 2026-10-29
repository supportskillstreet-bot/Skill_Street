import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const providers = {
  google: new GoogleAuthProvider(),
  github: new GithubAuthProvider()
};

const getDashboardPath = (role, adminApproved = false) => {
  if (role === 'admin') return '/admin';
  if (role === 'startup') return '/company';
  return '/student';
};


export default function LoginRegister() {
  const navigate = useNavigate();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const [activeTab, setActiveTab] = useState('pills-login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerRepeatPassword, setRegisterRepeatPassword] = useState('');
  const [registerRole, setRegisterRole] = useState('student');
  const [passwordErrorVisible, setPasswordErrorVisible] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authType, setAuthType] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpRequestedEmail, setOtpRequestedEmail] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);


  const showMessage = (message, type) => {
    setAuthMessage(message);
    setAuthType(type);
    setTimeout(() => {
      setAuthMessage('');
      setAuthType('');
    }, 5000);
  };

  const switchTab = (tabId) => {
    setAuthMessage('');
    setAuthType('');
    setActiveTab(tabId);
  };

  const resendVerificationEmail = async () => {
    try {
      const email = loginEmail.trim();
      if (!email) {
        showMessage('Enter your email first to resend the verification link.', 'error');
        return;
      }

      setResendingVerification(true);

      // If user is already signed-in with this email, re-use that user.
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.email === email) {
        await sendEmailVerification(currentUser);
        showMessage('Verification email sent! Check your inbox.', 'success');
        return;
      }

      // Otherwise, we must sign in first to get a User object.
      // This keeps the existing emailVerification logic consistent.
      const userCredential = await signInWithEmailAndPassword(auth, email, loginPassword);
      const user = userCredential.user;

      if (!user.emailVerified) {
        await sendEmailVerification(user);
        showMessage('Verification email sent! Check your inbox.', 'success');
      } else {
        showMessage('Your email is already verified. Please log in.', 'success');
      }

      await auth.signOut();
    } catch (error) {
      let errorMessage = 'Failed to resend verification email. Please try again.';
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please use your password to resend the verification email.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many attempts. Please try again later.';
          break;
      }
      showMessage(errorMessage, 'error');
      console.error('Resend verification error:', error);
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSocialSignIn = async (providerName) => {
    try {

      const provider = providers[providerName] || providers.google;
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userRef);
      const cachedRole = localStorage.getItem(`ss_user_role_${user.uid}`) || localStorage.getItem(`ss_user_role_${user.email}`) || null;
      const role = userSnapshot.exists()
        ? userSnapshot.data()?.role || null
        : cachedRole || 'student';

      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        ...(!userSnapshot.exists() ? { role } : {}),
        lastLoginAt: serverTimestamp()
      }, { merge: true });

      if (role) {
        localStorage.setItem(`ss_user_role_${user.uid}`, role);
      } else {
        localStorage.removeItem(`ss_user_role_${user.uid}`);
        localStorage.removeItem(`ss_user_role_${user.email}`);
      }
      localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL, role }));
      showMessage(`Welcome ${user.displayName || user.email}! Redirecting...`, 'success');
      const targetDashboard = role ? getDashboardPath(role, role === 'admin') : '/profile';
      setTimeout(() => navigate(targetDashboard), 2000);
    } catch (error) {
      showMessage(error.message, 'error');
      console.error('Auth error:', error);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const user = userCredential.user;
      if (!user.emailVerified) {
        showMessage('Please verify your email before logging in. Check your inbox for the verification link.', 'error');
        await auth.signOut();
        return;
      }
      const userRef = doc(db, 'users', user.uid);
      const userSnapshot = await getDoc(userRef);
      const cachedRole = localStorage.getItem(`ss_user_role_${user.uid}`) || localStorage.getItem(`ss_user_role_${user.email}`) || null;
      const role = userSnapshot.exists()
        ? userSnapshot.data()?.role || null
        : cachedRole || 'student';
      const adminApproved = role === 'admin';
      const stored = { uid: user.uid, email: user.email, displayName: user.displayName, role, adminApproved };
      if (!userSnapshot.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          role,
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      }
      if (role) {
        localStorage.setItem(`ss_user_role_${user.uid}`, role);
      } else {
        localStorage.removeItem(`ss_user_role_${user.uid}`);
        localStorage.removeItem(`ss_user_role_${user.email}`);
      }
      localStorage.setItem('user', JSON.stringify(stored));
      showMessage('Login successful! Redirecting...', 'success');
      const targetDashboard = role ? getDashboardPath(role, adminApproved) : '/profile';
      setTimeout(() => navigate(targetDashboard), 1500);
    } catch (error) {
      let errorMessage = 'Login failed. Please try again.';
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many attempts. Please try again later.';
          break;
      }
      showMessage(errorMessage, 'error');
      console.error('Login error:', error);
    }
  };

  const parseApiResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(rawText);
      } catch (err) {
        throw new Error(`Invalid JSON response from server: ${rawText}`);
      }
    }

    throw new Error(`Unexpected response from server (${response.status}): ${rawText}`);
  };

  const postJson = async (url, payload) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await parseApiResponse(response);
    return { response, data };
  };

  const postOtpRequest = async (urls, payload) => {
    let lastError = null;

    for (const url of urls) {
      try {
        const result = await postJson(url, payload);
        if (result.response.status === 404 && url !== urls[urls.length - 1]) {
          lastError = new Error(result.data.error || 'OTP endpoint not found.');
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (!/Unexpected response from server \(404\)/.test(error.message) || url === urls[urls.length - 1]) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Unable to reach the OTP server.');
  };

  const otpUrls = (action) => {
    const nodePath = `${apiBaseUrl}/api/auth/${action}`;
    const phpPath = `${apiBaseUrl}/api/${action}.php`;
    return nodePath === phpPath ? [nodePath] : [nodePath, phpPath];
  };

  const handleSendOtp = async () => {
    const email = registerEmail.trim().toLowerCase();

    if (!email) {
      showMessage('Enter your email before requesting an OTP.', 'error');
      return;
    }

    try {
      setOtpSending(true);
      const { response, data } = await postOtpRequest(otpUrls('send-otp'), { email });

      if (!response.ok) {
        throw new Error(data.error || `Unable to send OTP right now. Response status ${response.status}.`);
      }

      setOtpRequestedEmail(email);
      setOtpSent(true);
      setOtpVerified(false);
      setOtpCode('');
      setOtpExpiresAt(data.expiresAt || null);
      showMessage(`OTP sent to ${email}. Enter the code below to verify your email.`, 'success');
    } catch (error) {
      showMessage(error.message, 'error');
      console.error('OTP send error:', error);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    const email = registerEmail.trim().toLowerCase();
    const code = otpCode.trim();

    if (!email) {
      showMessage('Enter your email before verifying the OTP.', 'error');
      return;
    }

    if (!code) {
      showMessage('Enter the OTP sent to your email.', 'error');
      return;
    }

    if (otpExpiresAt && Date.now() > otpExpiresAt) {
      setOtpVerified(false);
      setOtpSent(false);
      showMessage('Your OTP has expired. Please request a new one.', 'error');
      return;
    }

    try {
      setOtpVerifying(true);
      const { response, data } = await postOtpRequest(otpUrls('verify-otp'), { email, otp: code });

      if (!response.ok) {
        throw new Error(data.error || 'The OTP is invalid.');
      }

      setOtpVerified(true);
      setOtpCode('');
      showMessage('Email verified successfully. You can create your account now.', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
      console.error('OTP verify error:', error);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    if (registerPassword !== registerRepeatPassword) {
      setPasswordErrorVisible(true);
      return;
    }

    const email = registerEmail.trim().toLowerCase();

    if (!otpVerified || otpRequestedEmail !== email) {
      showMessage('Please verify your email with the OTP before creating your account.', 'error');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, registerPassword);
      const user = userCredential.user;
      await updateProfile(user, { displayName: registerUsername });
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: registerUsername,
        role: registerRole,
        createdAt: serverTimestamp()
      });
      const storedUser = {
        uid: user.uid,
        email: user.email,
        displayName: registerUsername,
        role: registerRole,
        photoURL: user.photoURL || null,
        emailVerified: user.emailVerified
      };
      localStorage.setItem(`ss_user_role_${user.uid}`, registerRole);
      localStorage.setItem('user', JSON.stringify(storedUser));
      await sendEmailVerification(user);
      showMessage('Account created! Redirecting to your dashboard...', 'success');
      setTimeout(() => navigate(registerRole === 'startup' ? '/company' : '/student'), 1500);
    } catch (error) {
      let errorMessage = 'Registration failed. Please try again.';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters.';
          break;
      }
      showMessage(errorMessage, 'error');
      console.error('Registration error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white pt-32 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 rounded-[1.5rem] border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-5 shadow-2xl">
        <div className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Welcome back to</p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">SkillStreet Login & Registration</h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-300">Access your student dashboard or company workspace with a secure login, or create a new account in seconds.</p>
        </div>

        <div className="flex flex-col gap-3 rounded-[1.25rem] bg-blue-900/30 p-3 sm:p-4">
          <div className="grid grid-cols-2 rounded-full bg-blue-900/60 border border-blue-800/60 p-1 text-sm text-slate-300 shadow-inner sm:text-base">
            <button
              type="button"
              className={`rounded-full py-2 font-semibold transition-all ${activeTab === 'pills-login' ? 'bg-blue-800 text-white shadow-lg' : 'text-slate-300 hover:text-white'}`}
              onClick={() => switchTab('pills-login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-full py-2 font-semibold transition-all ${activeTab === 'pills-register' ? 'bg-blue-800 text-white shadow-lg' : 'text-slate-300 hover:text-white'}`}
              onClick={() => switchTab('pills-register')}
            >
              Register
            </button>
          </div>

          {authMessage ? (
            <div className={`rounded-2xl border px-4 py-3 text-center text-sm ${authType === 'error' ? 'border-red-400 bg-red-500/10 text-red-200' : 'border-emerald-400 bg-emerald-500/10 text-emerald-200'}`}>
              {authMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[0.85fr_1fr]">
            <div className="space-y-4 rounded-[1.25rem] bg-blue-900/60 border border-blue-800/60 p-3 sm:p-4">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Quick access</h2>
                <p className="mt-1 text-sm text-slate-300">Choose your account type and use social sign-in or the secure form.</p>
              </div>
              <div className="grid gap-2">
                <button type="button" onClick={() => handleSocialSignIn('google')} className="social-sign-in-button rounded-xl border border-blue-800/60 bg-blue-900/50 px-4 py-2 text-left text-white transition hover:border-orange-400 hover:bg-blue-800">
                  <span className="font-semibold">Continue with Google</span>
                </button>
                <button type="button" onClick={() => handleSocialSignIn('github')} className="social-sign-in-button rounded-xl border border-blue-800/60 bg-blue-900/50 px-4 py-2 text-left text-white transition hover:border-orange-400 hover:bg-blue-800">
                  <span className="font-semibold">Continue with GitHub</span>
                </button>

              </div>
            </div>

            <div className="rounded-[1.25rem] bg-blue-900/30 p-3 sm:p-4 shadow-lg">
              {activeTab === 'pills-login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="loginEmail" className="block text-sm font-medium text-slate-300">Email</label>
                    <input
                      type="email"
                      id="loginEmail"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="loginPassword" className="block text-sm font-medium text-slate-300">Password</label>
                    <input
                      type="password"
                      id="loginPassword"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-blue-800/60 bg-blue-900/50 text-orange-400 focus:ring-orange-400" />
                      Remember me
                    </label>
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <Link to="/forgot-password" className="text-sm text-orange-300 hover:text-orange-400">Forgot password?</Link>
                      <button
                        type="button"
                        onClick={resendVerificationEmail}
                        disabled={resendingVerification}
                        className="text-sm text-orange-300 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {resendingVerification ? 'Sending...' : 'Resend verification email'}
                      </button>
                    </div>
                  </div>


                  <button type="submit" className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">Login</button>

                  <p className="text-center text-sm text-slate-300">Not a member? <button type="button" onClick={() => switchTab('pills-register')} className="font-semibold text-orange-300 hover:text-orange-400">Register now</button></p>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="registerUsername" className="block text-sm font-medium text-slate-300">Username</label>
                    <input
                      type="text"
                      id="registerUsername"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="registerEmail" className="block text-sm font-medium text-slate-300">Email</label>
                    <input
                      type="email"
                      id="registerEmail"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={registerEmail}
                      onChange={(e) => {
                        setRegisterEmail(e.target.value);
                        if (otpRequestedEmail && e.target.value.trim().toLowerCase() !== otpRequestedEmail) {
                          setOtpSent(false);
                          setOtpVerified(false);
                          setOtpCode('');
                          setOtpExpiresAt(null);
                        }
                      }}
                      required
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-blue-800/60 bg-blue-900/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="registerOtp" className="text-sm font-medium text-slate-300">Email verification OTP</label>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={otpSending}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {otpSending ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        id="registerOtp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className="w-full rounded-xl border border-white/10 bg-blue-900/30 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        disabled={!otpSent}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={!otpSent || otpVerifying}
                        className="rounded-xl border border-orange-400/50 px-4 py-2.5 text-sm font-semibold text-orange-300 transition hover:bg-orange-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {otpVerifying ? 'Verifying...' : otpVerified ? 'Verified' : 'Verify OTP'}
                      </button>
                    </div>
                    {otpSent ? (
                      <p className="text-xs text-slate-400">
                        OTP sent to {otpRequestedEmail || registerEmail}. It expires in 5 minutes.
                      </p>
                    ) : null}
                  </div>

                  <fieldset className="space-y-2 rounded-xl border border-blue-800/60 bg-blue-900/50 p-3">
                    <legend className="text-sm font-medium text-slate-300">Account Type</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="cursor-pointer rounded-xl border border-blue-800/60 bg-blue-900/30 px-4 py-2 text-sm text-white transition hover:border-orange-400">
                        <input
                          type="radio"
                          name="registerRole"
                          value="student"
                          checked={registerRole === 'student'}
                          onChange={() => setRegisterRole('student')}
                          className="mr-2 h-4 w-4 text-orange-400"
                        />
                        Student
                      </label>
                      <label className="cursor-pointer rounded-xl border border-blue-800/60 bg-blue-900/30 px-4 py-2 text-sm text-white transition hover:border-orange-400">
                        <input
                          type="radio"
                          name="registerRole"
                          value="startup"
                          checked={registerRole === 'startup'}
                          onChange={() => setRegisterRole('startup')}
                          className="mr-2 h-4 w-4 text-orange-400"
                        />
                        Startup / Company
                      </label>
                    </div>
                  </fieldset>

                  <div className="space-y-1">
                    <label htmlFor="registerPassword" className="block text-sm font-medium text-slate-300">Password</label>
                    <input
                      type="password"
                      id="registerPassword"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={registerPassword}
                      onChange={(e) => { setRegisterPassword(e.target.value); if (registerRepeatPassword === e.target.value) setPasswordErrorVisible(false); }}
                      required
                      minLength={6}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="registerRepeatPassword" className="block text-sm font-medium text-slate-300">Repeat password</label>
                    <input
                      type="password"
                      id="registerRepeatPassword"
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      value={registerRepeatPassword}
                      onChange={(e) => { setRegisterRepeatPassword(e.target.value); if (registerPassword === e.target.value) setPasswordErrorVisible(false); }}
                      required
                    />
                  </div>

                  {passwordErrorVisible ? (
                    <div className="rounded-xl bg-red-500/10 border border-red-400 px-4 py-2 text-sm text-red-200">Passwords do not match</div>
                  ) : null}

                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked
                      readOnly
                      className="h-4 w-4 rounded border-blue-800/60 bg-blue-900/50 text-orange-400"
                    />
                    <span>I have read and agree to the terms.</span>
                  </div>

                  <button type="submit" className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400">Register</button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
