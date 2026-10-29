import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDynamicStyleSheet } from '../hooks/useDynamicStyleSheet.jsx';

const quotes = [
  {
    text: 'Education is the most powerful weapon which you can use to change the world.',
    author: 'Nelson Mandela'
  },
  {
    text: 'The future belongs to those who learn more skills and combine them in creative ways.',
    author: 'Robert Greene'
  },
  {
    text: 'Your skills are the only capital that will never fail you.',
    author: 'Skill Street Philosophy'
  },
  {
    text: 'Bridge the gap between potential and performance.',
    author: 'Mission Statement'
  },
  {
    text: 'Learning is a treasure that will follow its owner everywhere.',
    author: 'Chinese Proverb'
  }
];

const heroTextParts = [
  'The Frontier of Learning',
  'The Street Where Skills',
  'Meet Opportunity.',
  'Build real skills, work on real projects, and unlock opportunities — before graduation'
];

const studentStories = [
  {
    studentName: 'Priyadarshini Pandey',
    startupName: 'Costerbox',
    story: 'Priyadarshini developed content creatives and 30 days content calender with clear content mix,captions and posting strategies.',
    image: '/Priyadarshini.jpeg'
  },
  {
    studentName: 'Rani Choudhary',
    startupName: 'EVOA',
    story: 'Rani captured the kind of thinking and signals we want to communicate to founders,not just surface level content.',
    image: '/Rani.jpeg'
  },
  {
    studentName: 'Manas Gakkar',
    startupName: 'ChocoAVA',
    story: 'Manas redesigned chocoavas website to make it more modern and user friendly.',
    image: '/Manas.png'
  },
  {
    studentName: 'Aditya Verma',
    startupName: 'Finovert',
    story: 'Aditya created outreach messages and communication drafts . He also explored ways to improve how the brand presents itself during early outreach.',
    image: '/Aditya.png'
  },
  {
    studentName: 'Prisha Dhawan',
    startupName: 'Necter Happy Drink',
    story: 'Prisha audited website experience,identified usability gap and provided practical recommendations to improve navigation,customer trust and mobile experience.',
    image: 'Prisha.png'
  },
  {
    studentName: 'Akansha Jain',
    startupName: 'Necter Happy Drink',
    story: 'Akansha created creative post concepts,content hooks and engagement driven storytelling ideas.',
    image: 'Akansha.png'
  },
  {
    studentName: 'Nitya Ratra',
    startupName: 'Myraq',
    story: 'Nitya researched on Gen-z relationshop behaviours,emotional challenges,user expectations,competitor analysis,trust factors and engagement oppurtunities.  ',
    image: 'Nitya.png'
  },
  {
    studentName: 'Palak Kashyap',
    startupName: 'Myraq',
    story: 'Palak created relatable social media content around modern relationships,overthinking,emotional confusion,and self awareness.',
    image: 'Palak.png'
  }
];

const introStorageKey = 'skillstreet-home-intro-seen';

function shouldPlayHomeIntro() {
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && window.sessionStorage.getItem(introStorageKey) !== 'true';
  } catch {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

function HomeIntro({ onComplete }) {
  const [phase, setPhase] = useState(() => (shouldPlayHomeIntro() ? 'playing' : 'done'));

  useEffect(() => {
    if (phase === 'done') {
      onComplete(true);
      return undefined;
    }

    if (phase === 'playing') {
      try {
        window.sessionStorage.setItem(introStorageKey, 'true');
      } catch {
        // The intro still works when browser storage is unavailable.
      }
    }

    const timeout = window.setTimeout(
      () => setPhase(phase === 'playing' ? 'closing' : 'done'),
      phase === 'playing' ? 13100 : 650
    );

    return () => window.clearTimeout(timeout);
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={`home-intro home-intro--${phase}`}
      aria-hidden={phase === 'closing'}
    >
      <div className="home-intro-scene" aria-hidden="true">
        <div className="home-intro-stars" />
        <div className="home-intro-horizon">
          <span className="home-intro-hill home-intro-hill--left" />
          <span className="home-intro-hill home-intro-hill--right" />
          <div className="home-intro-door-glow" />
          <div className="home-intro-door">
            <div className="home-intro-door-panel"><i /></div>
          </div>
        </div>
        <div className="home-intro-road">
          <span className="home-intro-road-mark home-intro-road-mark--one" />
          <span className="home-intro-road-mark home-intro-road-mark--two" />
          <span className="home-intro-road-mark home-intro-road-mark--three" />
        </div>

        <div className="home-intro-signs">
          <span className="home-intro-sign home-intro-sign--design">LEARN <b>✳</b></span>
          <span className="home-intro-sign home-intro-sign--code">DEVELOP <b>⌘</b></span>
          <span className="home-intro-sign home-intro-sign--create">JOIN <b>✦</b></span>
          <span className="home-intro-sign home-intro-sign--grow">GROW <b>↗</b></span>
        </div>

        <div className="home-intro-runner">
          <svg className="home-intro-person" viewBox="0 0 120 220" focusable="false">
            <ellipse cx="61" cy="208" rx="31" ry="6" fill="rgba(4, 12, 34, .32)" />
            <g className="home-intro-man-leg home-intro-man-leg--back">
              <path d="m51 133-15 34-18 22 9 7 29-20 15-31Z" fill="#243a57" />
              <path d="m18 188-8 10c-2 3 0 6 4 6h21c3 0 5-3 2-6l-9-9Z" fill="#f1c6a4" />
              <path d="m10 198 28 1-2 6H13c-4 0-5-4-3-7Z" fill="#f7f1e8" />
            </g>
            <g className="home-intro-man-leg home-intro-man-leg--front">
              <path d="m69 132 10 34 17 23-10 8-26-22-10-29Z" fill="#304d6d" />
              <path d="m92 187 9 8 9 8c3 3 1 6-3 6H89c-4 0-6-3-4-6l7-9Z" fill="#e9bd9a" />
              <path d="m87 201 27 3c0 4-2 6-6 6H89c-4 0-5-5-2-9Z" fill="#f7f1e8" />
            </g>
            <path d="m44 76-8 10-4 45c14 12 40 14 58 1l-7-46-13-10Z" fill="#e8643e" />
            <path d="m49 78 10 11 10-12 9 5-5 18 5 30-20 8-18-8 7-30-6-17Z" fill="#f47d53" />
            <path d="m59 89 3 4-2 35" fill="none" stroke="#ffd7ba" strokeWidth="2.5" />
            <g className="home-intro-man-arm home-intro-man-arm--back">
              <path d="m43 84-17 18-13 8-7-5-5 7 11 10c4 3 9 2 13-1l22-19Z" fill="#e8643e" />
              <path d="m9 106-7 5 5 8 8-5Z" fill="#bd7957" />
            </g>
            <g className="home-intro-man-arm home-intro-man-arm--reach">
              <path d="m76 83 15 12 10-2 9-18 8 4-5 25c-1 4-5 7-9 7l-19-1-17-13Z" fill="#f47d53" />
              <path d="m109 76 3-11 5-1 2 11 4 4-5 6-8-2-4-4Z" fill="#bd7957" />
            </g>
            <path d="m48 77-2-10 25-1 4 11-12 10Z" fill="#b97756" />
            <path d="M47 40c0-17 10-27 23-24 13 2 19 16 14 32l-5 17-23 1-9-14Z" fill="#bd7957" />
            <path d="M47 44c-5-17 4-31 18-35 14-3 26 7 24 20l-2 8-7-10-19 6-8 15Z" fill="#20293b" />
            <path d="m78 49 8-2-2 8-8 2Z" fill="#a96347" />
            <path d="m60 45 4-1" fill="none" stroke="#342b2d" strokeWidth="2" strokeLinecap="round" />
            <path d="m69 62 9-1" fill="none" stroke="#8d4e3d" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="home-intro-caption">
          <span>EVERY SKILL STARTS SOMEWHERE</span>
          <strong>Find your way forward.</strong>
        </div>
      </div>
      <div className="home-intro-welcome" role="status" aria-live="polite">
        <span>SKILL STREET · YOUR NEXT CHAPTER</span>
        <strong>Welcome to SkillStreet</strong>
        <i aria-hidden="true">Let’s make something happen.</i>
      </div>
      {phase === 'playing' && (
        <button className="home-intro-skip" type="button" onClick={() => setPhase('closing')}>
          Skip intro <span aria-hidden="true">↗</span>
        </button>
      )}
    </div>
  );
}

export default function Home() {
  useDynamicStyleSheet('/home.css');
  const location = useLocation();
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [heroTypingProgress, setHeroTypingProgress] = useState(0);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    if (!introComplete) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeroTypingProgress(100);
      return;
    }

    let progress = 0;
    let timeout;
    const typeNextCharacter = () => {
      if (progress < 100) {
        progress += 1;
        setHeroTypingProgress(progress);
        if (progress < 100) {
          timeout = setTimeout(typeNextCharacter, 40);
        }
      }
    };

    timeout = setTimeout(typeNextCharacter, 140);
    return () => clearTimeout(timeout);
  }, [introComplete]);

  useEffect(() => {
    const elements = document.querySelectorAll('#home-page [data-scroll-reveal]');
    const showAll = () => elements.forEach((element) => element.classList.add('is-visible'));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      showAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('scroll-reveal-pending');
          entry.target.classList.add('scroll-reveal-enter');
        } else {
          entry.target.classList.remove('scroll-reveal-enter');
          entry.target.classList.add('scroll-reveal-pending');
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -24px 0px' });

    elements.forEach((element, index) => {
      element.classList.add('scroll-reveal-pending');
      element.style.setProperty('--reveal-delay', `${(index % 4) * 90}ms`);
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = location.state?.scrollTo || location.hash.replace('#', '');
    if (target) {
      const section = document.getElementById(target);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location]);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quotes.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStoryIndex((current) => (current + 1) % studentStories.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const quote = quotes[quoteIndex];
  const activeStory = studentStories[activeStoryIndex];
  const renderHeroText = (partIndex) => {
    const text = heroTextParts[partIndex];
    const visibleCharacters = Math.floor((text.length * heroTypingProgress) / 100);
    const isTyping = heroTypingProgress > 0 && heroTypingProgress < 100;

    return (
      <span
        className={`hero-typing-text${isTyping ? ' hero-typing-active' : ''}`}
        aria-hidden="true"
      >
        {text.slice(0, visibleCharacters)}
      </span>
    );
  };

  const handleStorySwipe = (endX) => {
    if (touchStartX === null) return;

    const distance = touchStartX - endX;
    if (distance > 60) {
      setActiveStoryIndex((current) => (current + 1) % studentStories.length);
    } else if (distance < -60) {
      setActiveStoryIndex((current) => (current - 1 + studentStories.length) % studentStories.length);
    }
    setTouchStartX(null);
  };

  return (
    <main id="home-page" className="page-content active w-full">
      <HomeIntro onComplete={setIntroComplete} />
      <section className="relative flex min-h-[100vh] items-center bg-gradient-to-b from-blue-900 via-blue-950 to-black px-4 sm:px-6 pb-20 pt-32">
        <div className="hero-blob"></div>
        <div className="hero-skill-floats" aria-hidden="true">
          <span className="hero-skill-float hero-skill-float--code"><i className="fas fa-code"></i> React</span>
          <span className="hero-skill-float hero-skill-float--design"><i className="fas fa-pen-ruler"></i> UI / UX</span>
          <span className="hero-skill-float hero-skill-float--growth"><i className="fas fa-chart-line"></i> Growth</span>
        </div>
        <div className="relative z-10 mx-auto mt-10 max-w-7xl text-center">
          <span className="inline-block rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-orange-300 mb-6">
            <span className="sr-only">The Frontier of Learning</span>
            {renderHeroText(0)}
          </span>
          <h1 className="mb-8 text-5xl font-weight-500 leading-tight md:text-7xl">
            <span className="sr-only">The Street Where Skills Meet Opportunity.</span>
            {renderHeroText(1)}<br />
            <span className="gradient-text hero-highlight">
              {renderHeroText(2)}
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">
            <span className="sr-only">{heroTextParts[3]}</span>
            {renderHeroText(3)}
          </p>

          <div className="flex flex-col items-center justify-center space-y-4 md:flex-row md:space-x-4 md:space-y-0">
            <button
              type="button"
              onClick={() => window.open('https://www.linkedin.com/company/skill.street/', '_blank')}
              className="btn-glass-white flex w-full items-center justify-center rounded-xl px-8 py-4 font-bold md:w-auto"
            >
              Visit page <i className="fas fa-arrow-right ml-2 text-sm"></i>
            </button>
            <button
              type="button"
              onClick={() => window.open('https://chat.whatsapp.com/IiFlvLJ4TDO08Bjjg2X6N4?s=sw&p=a&mlu=2', '_blank')}
              className="btn-glass w-full rounded-xl px-8 py-4 font-bold text-white md:w-auto"
            >
              Join community
            </button>
          </div>
        </div>
      </section>

      <section id="about" className="py-24 px-4 sm:px-6 bg-white" data-scroll-reveal>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
            <div className="flex-1 md:pr-10">
              <h2 className="text-4xl font-bold mb-6"><span className="section-heading-dark">Redefining Your</span> <br /><span className="accent-text">Learning Path</span></h2>
              <p className="mb-8 text-lg font-semibold text-slate-800">Skill Street isn't just an education platform; it's an immersive career ecosystem designed to inspire, inform, and innovate.</p>

              <ul className="space-y-6">
                <li className="flex items-start space-x-4">
                  <div className="mt-1 rounded-xl bg-blue-950 p-2"><i className="fas fa-infinity text-sm accent-icon"></i></div>
                  <div>
                    <span className="block text-lg font-bold text-blue-950">Lifetime Access</span>
                    <span className="text-sm font-semibold text-slate-600">Gain permanent access to our exclusive vault of community resources, toolkits, and tournaments once you join.</span>
                  </div>
                </li>
                <li className="flex items-start space-x-4">
                  <div className="mt-1 rounded-xl bg-blue-950 p-2"><i className="fas fa-vr-cardboard text-sm accent-icon"></i></div>
                  <div>
                    <span className="block text-lg font-bold text-blue-950">Skill-First Learning</span>
                    <span className="text-sm font-semibold text-slate-600">Learn beyond academic definitions. Our curriculum focuses on "how to perform" in real-world scenarios.</span>
                  </div>
                </li>
                <li className="flex items-start space-x-4">
                  <div className="mt-1 rounded-xl bg-blue-950 p-2"><i className="fas fa-users text-sm accent-icon"></i></div>
                  <div>
                    <span className="block text-lg font-bold text-blue-950">Learn From Real life Projects</span>
                    <span className="text-sm font-semibold text-slate-600">Compete globally for various tasks from different founders and earn exciting oppurtunities .</span>
                  </div>
                </li>
              </ul>
            </div>
            <div className="flex-1 relative">
              <div className="w-full aspect-square glass rounded-3xl overflow-hidden animate-float relative">
                {/* Dark edge gradient (no explicit border) */}
                <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/20 to-black/10"></div>
                <div className="absolute inset-[1px] rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20"></div>
                <img src="learn.jpeg" alt="Learning" className="w-full h-full object-cover mix-blend-overlay relative z-10" />
              </div>
            </div>
          </div>

        </div>
      </section>

      <section id="student-stories" className="relative overflow-hidden py-24 px-4 sm:px-6 bg-blue-950 text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute -top-40 -left-40 h-[40rem] w-[40rem] rounded-full bg-gradient-to-br from-orange-500/20 via-purple-500/10 to-blue-500/0 blur-3xl" />
          <div className="absolute top-20 -right-48 h-[35rem] w-[35rem] rounded-full bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-indigo-500/0 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
        <div className="mb-12 text-center px-2" data-scroll-reveal>
            <span className="mb-6 inline-block rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-orange-300">
              Best performers list
            </span>
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">Work that actually matters</h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-300">
              Young students creating impact in early stage startups.
            </p>
          </div>

          <div
            className="story-card-shell animated-border-surface mx-auto max-w-7xl rounded-2xl border border-white/10 bg-white/10 p-3 shadow-none backdrop-blur-xl sm:rounded-[2rem] sm:p-5 sm:shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
            data-scroll-reveal
            onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
            onTouchEnd={(event) => handleStorySwipe(event.changedTouches[0].clientX)}
            onMouseDown={(event) => setTouchStartX(event.clientX)}
            onMouseUp={(event) => handleStorySwipe(event.clientX)}
          >
            <div className="overflow-hidden rounded-[1.5rem]">
              <div
                className="story-track flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(-${activeStoryIndex * 100}%)` }}
              >
                {studentStories.map((story) => (
                  <div key={story.studentName} className="story-slide w-full flex-shrink-0">
                    <div className="story-slide-card grid items-center gap-6 rounded-xl bg-gradient-to-br from-slate-900/70 via-blue-950/70 to-slate-900/70 p-5 sm:gap-10 sm:rounded-[1.5rem] sm:p-8 md:grid-cols-[1.05fr_0.95fr] md:p-14">
                      <div className="order-2 md:order-1">
                        <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Our Sprint's top performing students</p>
                        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.25em] text-sky-200/80">Introducing {activeStory.studentName}</p>
                        <h3 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">{story.studentName}</h3>
                        <p className="mt-3 text-xl font-semibold text-sky-300">{story.startupName}</p>
                        <p className="mt-6 text-lg leading-relaxed text-white">{story.story}</p>
                       
                      </div>

                      <div className="order-1 flex justify-center md:order-2">
                        <div className="story-image-wrap flex w-full max-w-[460px] items-center justify-center overflow-hidden rounded-xl bg-slate-950 shadow-lg sm:rounded-[1.5rem] sm:shadow-2xl">
                          <img src={story.image} alt={story.studentName} className="h-auto max-h-[62vh] w-full object-contain md:h-[560px]" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {studentStories.map((story, index) => (
                  <button
                    key={story.studentName}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    className={`story-dot ${activeStoryIndex === index ? 'active' : ''}`}
                    onClick={() => setActiveStoryIndex(index)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-3 sm:justify-end">
                <button
                  type="button"
                  className="story-nav-btn"
                  onClick={() => setActiveStoryIndex((current) => (current - 1 + studentStories.length) % studentStories.length)}
                >
                  <i className="fas fa-arrow-left"></i>
                </button>
                <button
                  type="button"
                  className="story-nav-btn"
                  onClick={() => setActiveStoryIndex((current) => (current + 1) % studentStories.length)}
                >
                  <i className="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-3 rounded-[1.5rem] border-0 bg-transparent p-0 sm:gap-4 sm:border sm:border-white/10 sm:bg-slate-900/70 sm:p-4 sm:grid-cols-2 md:grid-cols-2">
              <div className="rounded-[1rem] border border-white/10 bg-orange-500/90 p-4 text-center shadow-none backdrop-blur-sm sm:border-0 sm:p-5 sm:shadow-lg sm:shadow-orange-500/20">
                <p className="text-4xl font-bold text-orange-300 sm:text-white">10+</p>
                <p className="mt-2 text-sm uppercase tracking-[0.25em] text-slate-300 sm:text-orange-50">Startups Collaborated</p>
              </div>
              <div className="rounded-[1rem] border border-white/10 bg-orange-500/90 p-4 text-center shadow-none backdrop-blur-sm sm:border-0 sm:p-5 sm:shadow-lg sm:shadow-orange-500/20">
                <p className="text-4xl font-bold text-orange-300 sm:text-white">50+</p>
                <p className="mt-2 text-sm uppercase tracking-[0.25em] text-slate-300 sm:text-orange-50">Students Onboarded</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="why-flow-section py-24 bg-white border-y border-zinc-900 px-4 sm:px-6">
        <div className="why-flow-wrap">
          <header className="why-flow-intro" data-scroll-reveal>
            <span className="why-flow-kicker">A better way to find potential</span>
            <h2>Why <span className="accent-text">SkillStreet?</span></h2>
            <p>Students build through real startup work. Founders discover what people can do by seeing that work for themselves.</p>
          </header>

          <div className="why-flow-principle" data-scroll-reveal>
            <div className="why-flow-principle-mark" aria-hidden="true"><i className="fas fa-bolt"></i></div>
            <div>
              <span className="why-flow-eyebrow">The core idea</span>
              <h3>Proof over resumes.</h3>
              <p>Skills, shown in action — through work students actually create.</p>
            </div>
            <div className="why-flow-signal" aria-hidden="true">
              <span>skills</span><i className="fas fa-arrow-right"></i><span>real work</span><i className="fas fa-arrow-right"></i><span>proof</span>
            </div>
          </div>

          <div className="why-flow-lanes">
            <article className="why-flow-lane why-flow-lane--student" data-scroll-reveal>
              <header className="why-flow-lane-heading">
                <span className="why-flow-lane-icon" aria-hidden="true"><i className="fas fa-user-graduate"></i></span>
                <div><span className="why-flow-eyebrow">Build your proof</span><h3>For students</h3></div>
              </header>
              <ol className="why-flow-steps">
                <li><span className="why-flow-step-number">01</span><div><h4>Create a student account</h4><p>Set up your profile and share the skills you’re building.</p></div></li>
                <li><span className="why-flow-step-number">02</span><div><h4>Explore startup tasks</h4><p>See the skills, deadline and reward before you choose a task.</p></div></li>
                <li><span className="why-flow-step-number">03</span><div><h4>Do the work. Submit it.</h4><p>Show what you made with a link, written response or file.</p></div></li>
              </ol>
            </article>

            <article className="why-flow-lane why-flow-lane--startup" data-scroll-reveal>
              <header className="why-flow-lane-heading">
                <span className="why-flow-lane-icon" aria-hidden="true"><i className="fas fa-rocket"></i></span>
                <div><span className="why-flow-eyebrow">Find the right talent</span><h3>For startups</h3></div>
              </header>
              <ol className="why-flow-steps">
                <li><span className="why-flow-step-number">01</span><div><h4>Create a startup account</h4><p>Set up your company space to share the work you need done.</p></div></li>
                <li><span className="why-flow-step-number">02</span><div><h4>Post a real task</h4><p>Describe the work, relevant skills, deadline and reward.</p></div></li>
                <li><span className="why-flow-step-number">03</span><div><h4>Review student submissions</h4><p>See the work directly, then select promising submissions and share feedback.</p></div></li>
              </ol>
            </article>
          </div>

          <svg className="why-flow-converge" viewBox="0 0 1000 76" preserveAspectRatio="none" aria-hidden="true">
            <path d="M245 0 C245 42 500 25 500 70" />
            <path d="M755 0 C755 42 500 25 500 70" />
            <path className="why-flow-converge-arrow" d="M488 58 L500 72 L512 58" />
          </svg>

          <div className="why-flow-outcome" data-scroll-reveal>
            <span className="why-flow-outcome-label"><i className="fas fa-circle-nodes" aria-hidden="true"></i> Where both paths meet</span>
            <div className="why-flow-outcome-content">
              <h3>Real work. Clearer signals.</h3>
              <p>Startups can recognize talent through demonstrated work, not resume claims alone. Students gain practical project experience and a chance to show their strengths.</p>
            </div>
            <span className="why-flow-outcome-note">Selection and feedback come from the startup — never an automated score or a promise of a job.</span>
          </div>
        </div>
      </section>

      <section id="founders" className="relative overflow-hidden py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-7xl mx-auto text-center">
          <div data-scroll-reveal>
          <h2 className="mb-4 text-4xl font-bold text-blue-900">The Minds Behind <span className="accent-text">Skill Street</span></h2>
          <p className="max-w-xl mx-auto mb-16 text-slate-600">Visionaries dedicated to bridging the global skills gap.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div data-scroll-reveal className="animated-border-surface p-8 rounded-[2rem] text-center transition-all duration-300 hover:bg-blue-800 hover:border-orange-400/40 border border-blue-900/30 bg-blue-900">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden border-2 border-indigo-500/30" role="img" aria-label="Hanu Pandey">
                <span aria-hidden="true">HP</span>
              </div>
              <h3 className="text-xl font-semibold mb-1">Hanu Pandey</h3>
              <p className="text-orange-300 text-xs font-medium mb-4 uppercase tracking-wider">Founder</p>
              <a href="https://www.linkedin.com/in/hanu-pandey-827b05312" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-sm font-bold transition-all">
                LinkedIn <i className="fab fa-linkedin ml-2"></i>
              </a>
            </div>
            <div data-scroll-reveal className="animated-border-surface p-8 rounded-[2rem] text-center transition-all duration-300 hover:bg-blue-800 hover:border-orange-400/40 border border-blue-900/30 bg-blue-900">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden border-2 border-purple-500/30" role="img" aria-label="Ganesh Mishra">
                <span aria-hidden="true">GM</span>
              </div>
              <h3 className="text-xl font-semibold mb-1">Ganesh Mishra</h3>
              <p className="text-orange-300 text-xs font-weight-600 mb-4 uppercase tracking-wider">Co-Founder</p>
              <a href="https://www.linkedin.com/in/ganesh-mishra-287546246" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-sm font-bold transition-all">
                LinkedIn <i className="fab fa-linkedin ml-2"></i>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-section">
        <div id="quote-box" data-scroll-reveal>
          <p id="quote-text">"{quote.text}"</p>
          <span id="quote-author">{quote.author}</span>
        </div>
      </section>
    </main>
  );
}
