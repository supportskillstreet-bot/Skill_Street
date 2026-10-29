import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebase.js';

const getTime = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return new Date(value).getTime() || 0;
};

const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(getTime(value)));
};

export default function Admin({ user }) {
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const activeTasksQuery = query(collection(db, 'tasks'));
    const submissionsQuery = query(collection(db, 'submissions'));
    const usersQuery = query(collection(db, 'users'));
    let loaded = 0;
    const markLoaded = () => {
      loaded += 1;
      if (loaded === 3) setLoading(false);
    };
    const handleError = (source, snapshotError) => {
      console.error('Admin dashboard data error:', snapshotError);
      const errorCode = snapshotError?.code ? ` (${snapshotError.code})` : '';
      setError(`${source} data could not be loaded${errorCode}. Deploy the current Firestore rules and sign in again.`);
      setLoading(false);
    };

    const unsubscribeTasks = onSnapshot(activeTasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((task) => !task.isDeleted));
      markLoaded();
    }, (snapshotError) => handleError('Startup tasks', snapshotError));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      setSubmissions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      markLoaded();
    }, (snapshotError) => handleError('Student submissions', snapshotError));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      markLoaded();
    }, (snapshotError) => handleError('User profiles', snapshotError));

    return () => {
      unsubscribeTasks();
      unsubscribeSubmissions();
      unsubscribeUsers();
    };
  }, [user.uid]);

  const startupRows = useMemo(() => {
    const usersById = new Map(users.map((profile) => [profile.uid || profile.id, profile]));
    const submissionsByTask = new Map();
    submissions
      .filter((submission) => !submission.deletedByStudent)
      .forEach((submission) => {
        if (!submissionsByTask.has(submission.taskId)) submissionsByTask.set(submission.taskId, []);
        submissionsByTask.get(submission.taskId).push(submission);
      });

    const startups = new Map();
    tasks.forEach((task) => {
      const companyId = task.companyId || 'unknown-company';
      const profile = usersById.get(companyId) || {};
      const row = startups.get(companyId) || {
        id: companyId,
        name: task.startupName || task.companyName || profile.companyName || profile.displayName || profile.email || 'Unnamed startup',
        email: profile.email || task.companyEmail || '',
        taskCount: 0,
        submissions: [],
        latestTask: task.createdAt
      };
      row.taskCount += 1;
      row.latestTask = getTime(task.createdAt) > getTime(row.latestTask) ? task.createdAt : row.latestTask;
      row.submissions.push(...(submissionsByTask.get(task.id) || []));
      startups.set(companyId, row);
    });

    return [...startups.values()]
      .map((startup) => ({
        ...startup,
        submissionCount: startup.submissions.length,
        studentCount: new Set(startup.submissions.map((submission) => submission.studentId).filter(Boolean)).size
      }))
      .sort((a, b) => b.studentCount - a.studentCount || b.submissionCount - a.submissionCount);
  }, [tasks, submissions, users]);

  const activeTaskIds = new Set(tasks.map((task) => task.id));
  const activeSubmissions = submissions.filter((submission) => activeTaskIds.has(submission.taskId) && !submission.deletedByStudent);
  const totalStudents = new Set(activeSubmissions.map((submission) => submission.studentId).filter(Boolean)).size;
  const totalSubmissions = activeSubmissions.length;

  return (
    <div className="admin-dashboard min-h-screen bg-gradient-to-b from-slate-950 via-blue-950 to-slate-950 px-4 pb-16 pt-32 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Operations overview</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Admin dashboard</h1>
            <p className="mt-2 text-slate-300">Live data from the startups, tasks, and submissions currently on SkillStreet.</p>
          </div>
          <div className="break-all text-sm text-slate-400 sm:break-normal">Signed in as {user.email}</div>
        </header>

        {error ? <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-red-200">{error}</div> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ['Listed startups', startupRows.length],
            ['Active tasks', tasks.length],
            ['Students submitted', totalStudents]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">{label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{loading ? '...' : value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Currently listed startups</h2>
              <p className="mt-1 text-sm text-slate-400">A startup appears here when it has at least one active task.</p>
            </div>
            <span className="text-sm text-slate-400">{totalSubmissions} total submissions</span>
          </div>
          {loading ? <div className="px-5 py-10 text-center text-slate-400">Loading live data...</div> : startupRows.length === 0 ? <div className="px-5 py-10 text-center text-slate-400">No active startups are listed yet.</div> : (
            <>
              <p className="px-5 py-2 text-xs text-slate-400 sm:hidden">Swipe horizontally to see all startup details.</p>
              <div className="overflow-x-auto overscroll-x-contain" role="region" aria-label="Startup overview table" tabIndex={0}>
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.16em] text-slate-400">
                  <tr><th className="px-5 py-4">Startup</th><th className="px-5 py-4">Active tasks</th><th className="px-5 py-4">Students</th><th className="px-5 py-4">Submissions</th><th className="px-5 py-4">Latest task</th></tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {startupRows.map((startup) => (
                    <tr key={startup.id} className="text-slate-200">
                      <td className="px-5 py-4"><div className="font-semibold text-white">{startup.name}</div><div className="mt-1 text-xs text-slate-500">{startup.email || 'No email listed'}</div></td>
                      <td className="px-5 py-4">{startup.taskCount}</td>
                      <td className="px-5 py-4 font-semibold text-orange-300">{startup.studentCount}</td>
                      <td className="px-5 py-4">{startup.submissionCount}</td>
                      <td className="px-5 py-4 text-slate-400">{formatDate(startup.latestTask)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}