import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useDynamicStyleSheet } from '../hooks/useDynamicStyleSheet.jsx';

export default function TermsAndConditions() {
  useDynamicStyleSheet('/home.css');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return (
    <div id="terms-page" className="page-content">
      <section className="bg-black text-zinc-300 px-6 py-32 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-5xl text-white font-light mb-8">Terms and Conditions</h1>
          <p className="mb-6 text-sm text-slate-400">Last Updated: June 2026</p>
          <p className="mb-8 leading-relaxed text-lg">
            Welcome to SkillStreet. By using our platform and submitting work, you agree to these Terms and Conditions.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">1. Acceptance of Terms</h2>
          <p className="leading-relaxed mb-6">
            By accessing or using SkillStreet, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our platform.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">2. User Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-3 mb-6">
            <li>You must be at least 18 years old to use this platform</li>
            <li>You agree to provide accurate and complete information</li>
            <li>You are responsible for maintaining the confidentiality of your account</li>
            <li>You must not submit plagiarized or copyrighted work without permission</li>
            <li>All submissions must be your original work unless properly credited</li>
          </ul>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">3. Submission Guidelines</h2>
          <ul className="list-disc pl-6 space-y-3 mb-6">
            <li>Submitted work must be relevant to the task requirements</li>
            <li>Files must not exceed the specified size limit (10MB)</li>
            <li>You agree that companies may review and evaluate your submissions</li>
            <li>Submissions become property of the platform for evaluation purposes</li>
            <li>You retain intellectual property rights to your original work</li>
          </ul>

         <h2 className="text-xl text-white mt-10 mb-4 font-bold">4. Payment Terms</h2>

<p className="leading-relaxed mb-4">
  Payments for approved submissions are processed through our payment partners. SkillStreet charges a platform commission of 10% on all transactions. Payment processing times may vary.
</p>

<p className="leading-relaxed mb-6 text-orange-300 font-medium">
  A commission fee of 10% will be deducted from the final payable amount.
</p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">5. Prohibited Activities</h2>
          <ul className="list-disc pl-6 space-y-3 mb-6">
            <li>Submitting false or misleading information</li>
            <li>Using the platform for fraudulent purposes</li>
            <li>Attempting to manipulate the payment system</li>
            <li>Harassing other users or companies</li>
            <li>Uploading malicious files or viruses</li>
          </ul>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">6. Intellectual Property</h2>
          <p className="leading-relaxed mb-6">
            You retain ownership of your original submissions. However, by submitting work, you grant SkillStreet and the relevant companies a non-exclusive license to review, evaluate, and display your work for the purpose of task assessment.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">7. Disclaimer</h2>
          <p className="leading-relaxed mb-6">
            SkillStreet is not responsible for the quality or accuracy of submissions. Companies are solely responsible for evaluating and selecting winners. We do not guarantee employment or payment opportunities.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">8. Limitation of Liability</h2>
          <p className="leading-relaxed mb-6">
            SkillStreet shall not be liable for any indirect, incidental, or consequential damages arising from the use of our platform.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">9. Privacy Policy</h2>
          <p className="leading-relaxed mb-6">
            Your use of SkillStreet is also governed by our Privacy Policy. Please review our Privacy Policy to understand how we collect, use, and protect your personal information.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">10. Changes to Terms</h2>
          <p className="leading-relaxed mb-6">
            We reserve the right to modify these terms at any time. Continued use of the platform constitutes acceptance of any changes.
          </p>

          <h2 className="text-xl text-white mt-10 mb-4 font-bold">11. Contact</h2>
          <div className="mt-4 space-y-4 mb-10">
            <a href="https://skillstreetofficial.in/" target="_blank" rel="noreferrer" className="block text-orange-300 hover:text-white transition-colors underline">
              Website: skillstreetofficial.in
            </a>
            <a href="https://www.linkedin.com/company/skill.street/" target="_blank" rel="noreferrer" className="block text-orange-300 hover:text-white transition-colors underline">
              LinkedIn: SkillStreet
            </a>
          </div>

          <p className="text-xs text-slate-500 mb-8">
            By submitting work on SkillStreet, you acknowledge that you have read, understood, and agree to these Terms and Conditions.
          </p>

          <Link to="/" className="btn-glass px-8 py-3 rounded-xl text-white">Back to Home</Link>
        </div>
      </section>
    </div>
  );
}
