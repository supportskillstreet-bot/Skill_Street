import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useDynamicStyleSheet } from '../hooks/useDynamicStyleSheet.jsx';

export default function Disclaimer() {
  useDynamicStyleSheet('/home.css');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <div id="disclaimer-page" className="page-content">
      <section className="bg-black text-zinc-300 px-6 py-32 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-5xl text-white font-light mb-8">Disclaimer</h1>
          <p className="mb-6 text-sm text-slate-400">Last Updated: June 2026</p>
          <p className="mb-8 leading-relaxed text-lg">
            The information provided by SkillStreet is for general educational and informational purposes only. All content is published in good faith, however we make no guarantees regarding completeness, reliability, or accuracy.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">1. No Professional Advice</h2>
          <p className="leading-relaxed mb-6">
            SkillStreet does not provide legal, financial, or professional advice. Any action you take based on the information on this platform is strictly at your own risk.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">2. Results Disclaimer</h2>
          <p className="leading-relaxed mb-6">
            We do not guarantee specific results from using our platform. Success depends on individual effort, skill level, and external factors.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">3. External Links Disclaimer</h2>
          <p className="leading-relaxed mb-6">
            Our website may contain links to external platforms. We are not responsible for the content, accuracy, or practices of third-party sites.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">4. Limitation of Liability</h2>
          <p className="leading-relaxed mb-6">
            Under no circumstances shall SkillStreet be liable for any loss or damage resulting from the use of the platform.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">5. Consent</h2>
          <p className="leading-relaxed mb-6">
            By using SkillStreet, you hereby consent to this disclaimer and agree to its terms.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">6. Contact</h2>
          <div className="mt-4 space-y-4">
            <a href="https://skillstreetofficial.in/" target="_blank" rel="noreferrer" className="block text-orange-300 hover:text-white transition-colors underline">
              Website: skillstreetoffical.in
            </a>
            <a href="https://www.linkedin.com/company/skill.street/" target="_blank" rel="noreferrer" className="block text-orange-300 hover:text-white transition-colors underline">
              LinkedIn: SkillStreet
            </a>
          </div>
          <div className="mt-12">
            <Link to="/" className="btn-glass px-8 py-3 rounded-xl text-white">Back to Home</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
