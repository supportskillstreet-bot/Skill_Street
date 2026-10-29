import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Navbar({ user, onSectionSelect, onLogoutClick }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const closeTimer = useRef(null);

  const closeMobileMenu = () => {
    window.clearTimeout(closeTimer.current);
    setIsClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setMobileOpen(false);
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!mobileOpen && !isClosing) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, isClosing]);

  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    setMobileOpen(false);
    setIsClosing(false);
  }, [location.pathname]);

  const handleSectionClick = (section) => {
    closeMobileMenu();
    onSectionSelect(section);
  };

  const handleNavigate = (path) => {
    navigate(path);
    closeMobileMenu();
  };

  return (
    <nav className="fixed top-0 z-50 w-full px-4 sm:px-6 py-4">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between rounded-2xl bg-gradient-to-br from-blue-900/90 to-blue-950/85 backdrop-blur-xl border border-white/20 px-4 sm:px-6 lg:px-8 py-4 text-white shadow-2xl">


        <button type="button" className="flex items-center space-x-3 cursor-pointer group" onClick={() => handleSectionClick('home')}>
          <span className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent group-hover:from-blue-300 group-hover:to-orange-300 transition-all">SKILL STREET</span>
        </button>

        <button
          id="mobile-menu-button"
          type="button"
          className="md:hidden relative w-10 h-10 flex items-center justify-center focus:outline-none border border-slate-400/30 rounded-xl bg-slate-800/70"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => {
            if (mobileOpen) {
              closeMobileMenu();
            } else {
              window.clearTimeout(closeTimer.current);
              setIsClosing(false);
              setMobileOpen(true);
            }
          }}
        >
          <div className="relative w-6 h-5 flex flex-col justify-between">
            <span className={`block h-0.5 w-full bg-white transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
            <span className={`block h-0.5 w-full bg-white transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`}></span>
            <span className={`block h-0.5 w-full bg-white transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
          </div>
        </button>

        <div className="hidden items-center space-x-4 sm:space-x-6 text-sm font-medium md:flex" id="nav-links">
          <button type="button" onClick={() => handleSectionClick('about')} className="nav-link hover:text-orange-300 transition-colors">About</button>
          <button type="button" onClick={() => handleSectionClick('student-stories')} className="nav-link hover:text-orange-300 transition-colors">Students work</button>
          <button type="button" onClick={() => handleSectionClick('why')} className="nav-link hover:text-orange-300 transition-colors">Why Us</button>
          <button type="button" className="nav-link hover:text-orange-300 transition-colors" onClick={() => handleNavigate('/contact')}>Contact</button>
          <div className="h-6 w-px bg-white/20"></div>
          {user ? (
            user.role === 'student' ? (
              <Link to="/student" className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 sm:px-4 py-2 text-orange-300 hover:bg-orange-500/20 transition-all text-xs sm:text-sm">Student Dashboard</Link>
            ) : user.role === 'startup' ? (
              <Link to="/company" className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 sm:px-4 py-2 text-orange-300 hover:bg-orange-500/20 transition-all text-xs sm:text-sm">Company Dashboard</Link>
            ) : (
              <button type="button" className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 sm:px-4 py-2 text-orange-300 hover:bg-orange-500/20 transition-all text-xs sm:text-sm" onClick={() => handleNavigate('/profile')}>Complete Profile</button>
            )
          ) : (
            <button type="button" className="rounded-xl bg-orange-500 px-3 sm:px-4 py-2 text-slate-950 font-semibold hover:bg-orange-400 transition-all text-xs sm:text-sm" onClick={() => handleNavigate('/login')}>Login/Register</button>
          )}
          {user && (
            <div id="user-section" className="flex items-center space-x-3 sm:space-x-4">
              <span id="user-name" className="text-slate-300 text-xs sm:text-sm hidden sm:block">{user.displayName || user.email.split('@')[0]}</span>
              <button type="button" onClick={() => handleNavigate('/profile')} className="text-slate-300 hover:text-orange-300 transition-colors">
                <i className="fas fa-user-circle text-lg"></i>
              </button>
              <button onClick={onLogoutClick} className="text-slate-300 hover:text-red-400 transition-colors" title="Logout">
                <i className="fas fa-sign-out-alt text-lg"></i>
              </button>
            </div>
          )}
        </div>

      </div>

      <div id="mobile-navigation" className={`fixed inset-0 z-40 md:hidden ${mobileOpen || isClosing ? 'block' : 'hidden'}`}>
        <button
          type="button"
          aria-label="Close menu"
          className={`absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen && !isClosing ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeMobileMenu}
        ></button>
        <div className={`absolute left-0 top-0 h-[100dvh] w-80 max-w-[85vw] bg-blue-900/95 backdrop-blur-md border-r border-blue-800/60 shadow-2xl transform transition-transform duration-300 ease-out ${isClosing ? '-translate-x-full' : mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="flex shrink-0 items-center justify-between border-b border-blue-800/60 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-orange-400 bg-clip-text text-transparent">Menu</span>
              <button
                type="button"
                onClick={closeMobileMenu}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-800/60 hover:bg-blue-800 transition-colors"
                aria-label="Close menu"
              >
                <i className="fas fa-times text-white"></i>
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => handleSectionClick('about')} className="nav-link block min-h-11 py-3 px-4 rounded-xl hover:bg-blue-800/60 transition-all duration-200 w-full text-left">About</button>
              <button type="button" onClick={() => handleSectionClick('student-stories')} className="nav-link block min-h-11 py-3 px-4 rounded-xl hover:bg-blue-800/60 transition-all duration-200 w-full text-left">Students work</button>
              <button type="button" onClick={() => handleSectionClick('why')} className="nav-link block min-h-11 py-3 px-4 rounded-xl hover:bg-blue-800/60 transition-all duration-200 w-full text-left">Why Us</button>
              <button type="button" onClick={() => handleSectionClick('founders')} className="nav-link block min-h-11 py-3 px-4 rounded-xl hover:bg-blue-800/60 transition-all duration-200 w-full text-left">Founders</button>
              <button type="button" onClick={() => handleNavigate('/contact')} className="nav-link block min-h-11 py-3 px-4 rounded-xl hover:bg-blue-800/60 transition-all duration-200 w-full text-left">Contact</button>
              <div className="h-px bg-white/10 my-4"></div>
              {user ? (
                <>
                  {user.role === 'student' ? (
                    <Link to="/student" onClick={closeMobileMenu} className="nav-link block min-h-11 py-3 px-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 w-full text-left transition-all duration-200">Student Dashboard</Link>
                  ) : user.role === 'startup' ? (
                    <Link to="/company" onClick={closeMobileMenu} className="nav-link block min-h-11 py-3 px-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 w-full text-left transition-all duration-200">Company Dashboard</Link>
                  ) : (
                    <button type="button" onClick={() => handleNavigate('/profile')} className="nav-link block py-3 px-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 w-full text-left transform hover:scale-[1.02] transition-all duration-200">Complete Profile</button>
                  )}
                  <div className="py-4 px-4 mt-4 rounded-xl bg-blue-800/40 border border-blue-700/50">
                    <span id="mobile-user-name" className="text-orange-300 block mb-4 text-sm font-medium">{user.displayName || user.email.split('@')[0]}</span>
                    <div className="flex space-x-3">
                      <button type="button" onClick={() => handleNavigate('/profile')} className="flex-1 py-3 px-4 rounded-xl bg-blue-800/60 hover:bg-blue-800 transition-all duration-200 transform hover:scale-105">Profile</button>
                      <button onClick={() => { onLogoutClick(); closeMobileMenu(); }} className="flex-1 py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-all duration-200 transform hover:scale-105">Logout</button>
                    </div>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => handleNavigate('/login')} className="nav-link block py-4 px-4 rounded-xl bg-orange-500 text-slate-950 font-semibold w-full text-center hover:bg-orange-400 transition-all duration-200 transform hover:scale-105">Login/Register</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
