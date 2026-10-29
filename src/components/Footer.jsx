import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-blue-950 to-black py-16 px-6 border-t border-white/5 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-6">
              <span className="text-xl font-bold">SKILL STREET</span>
            </div>
            <p className="max-w-sm text-slate-400">Inspiring, informing, and innovating the way the world develops talent.</p>
            <div className="flex space-x-4 mt-6">
              <a href="https://www.linkedin.com/company/skill.street/" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <i className="fab fa-linkedin text-xl"></i>
              </a>

              <a href="https://www.instagram.com/skillstreet_official?igsh=Njl5Z3IzaWhxczlh" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <i className="fab fa-instagram text-xl"></i>
              </a>

              <a href="https://www.reddit.com/u/SkillStreetofficial/s/oEJ9IjSbz2" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
                <i className="fab fa-reddit text-xl"></i>
              </a>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-6">Quick Links</h4>
            <ul className="space-y-4 text-sm text-slate-400">
              <li>
                <Link to="/" className="cursor-pointer hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/contact" className="cursor-pointer hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6">Governance</h4>
            <ul className="space-y-4 text-sm text-slate-400">
              <li>
                <Link to="/disclaimer" className="cursor-pointer hover:text-white">
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link to="/terms" className="cursor-pointer hover:text-white">
                  Terms and Conditions
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-white/5 text-center text-xs text-slate-500">
          &copy; 2026 SkillStreet. Empowering the next generation of industry leaders.
        </div>
      </div>
    </footer>
  );
}
