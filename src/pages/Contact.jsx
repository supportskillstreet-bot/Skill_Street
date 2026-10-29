import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Contact() {
  const [formValues, setFormValues] = useState({ name: '', subject: '', email: '', message: '' });
  const [status, setStatus] = useState({ message: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ message: 'Sending your message...', type: '' });

    const formData = new FormData();
    formData.append('_subject', 'New SkillStreet Contact Message');
    formData.append('_captcha', 'false');
    formData.append('name', formValues.name);
    formData.append('subject', formValues.subject);
    formData.append('email', formValues.email);
    formData.append('message', formValues.message);

    try {
      const response = await fetch('https://formsubmit.co/ajax/support.skillstreet@gmail.com', {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      setFormValues({ name: '', subject: '', email: '', message: '' });
      setStatus({ message: 'Your message has been sent successfully.', type: 'success' });
    } catch (error) {
      setStatus({ message: 'Message could not be sent right now. Please try again.', type: 'error' });
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black pt-32 pb-8 px-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 backdrop-blur-sm p-5 sm:p-6 md:p-8 shadow-2xl">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-orange-500/10 border border-orange-500/30 px-4 py-1 text-sm font-semibold uppercase tracking-[0.3em] text-orange-300">Contact</span>
            <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold">Talk to the SkillStreet team</h1>
            <p className="mt-3 max-w-2xl text-slate-300">Have a question about our programs or need support? Fill out the form and our support team will get back to you shortly.</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-6 shadow-xl">
            <div className="flex items-start gap-4 rounded-2xl bg-blue-900/60 border border-blue-800/60 p-4">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-3xl bg-orange-500 text-white shadow-lg shadow-orange-500/20 shrink-0">
                <ion-icon name="home"></ion-icon>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Address</h2>
                <p className="mt-2 text-slate-300">Dwarka Mor, New Delhi 110059</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-2xl bg-blue-900/60 border border-blue-800/60 p-4">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-3xl bg-orange-500 text-white shadow-lg shadow-orange-500/20 shrink-0">
                <ion-icon name="mail"></ion-icon>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Email</h2>
                <p className="mt-2 text-slate-300">support.skillstreet@gmail.com</p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-2xl bg-blue-900/60 border border-blue-800/60 p-4">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-3xl bg-orange-500 text-white shadow-lg shadow-orange-500/20 shrink-0">
                <ion-icon name="call"></ion-icon>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold">Phone</h2>
                <p className="mt-2 text-slate-300">+91 96251 71326</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-blue-900/30 p-4 sm:p-6 shadow-xl">
            <div className="mb-4">
              <h2 className="text-2xl sm:text-3xl font-bold">Send us a message</h2>
              <p className="mt-1 text-sm text-slate-300">We aim to respond within 24 hours.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="name" className="block text-sm font-medium text-slate-300">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formValues.name}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="subject" className="block text-sm font-medium text-slate-300">Subject</label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  value={formValues.subject}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className="block text-sm font-medium text-slate-300">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formValues.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="message" className="block text-sm font-medium text-slate-300">Message</label>
                <textarea
                  id="message"
                  name="message"
                  value={formValues.message}
                  onChange={handleChange}
                  required
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </div>

              {status.message ? (
                <p className={`text-sm font-semibold ${status.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>{status.message}</p>
              ) : null}
            </form>

            <div className="mt-5 text-center">
              <Link to="/" className="text-sm font-medium text-orange-300 hover:text-orange-400">Back to Home</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
