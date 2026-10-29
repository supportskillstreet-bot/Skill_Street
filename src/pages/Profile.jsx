import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

const normalizeSkills = (skills) => {
  const values = Array.isArray(skills) ? skills : typeof skills === 'string' ? skills.split(',') : [];
  const uniqueSkills = new Map();
  values.forEach((value) => {
    const skill = String(value || '').trim();
    if (skill && !uniqueSkills.has(skill.toLowerCase())) uniqueSkills.set(skill.toLowerCase(), skill);
  });
  return [...uniqueSkills.values()];
};

export default function Profile({ user, onUserUpdate }) {
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white">
        <div className="max-w-xl rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 text-center">
          <p className="text-lg">You must be logged in to view your profile.</p>
        </div>
      </div>
    );
  }

  const [currentRole, setCurrentRole] = useState(user.role || '');
  const [updatingRole, setUpdatingRole] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [userData, setUserData] = useState(null);
  const [skills, setSkills] = useState(() => normalizeSkills(user.skills));
  const [skillInput, setSkillInput] = useState('');
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState('');
  const [skillsMessageType, setSkillsMessageType] = useState('');
  const [ratings, setRatings] = useState([]);
  const [submissionRatings, setSubmissionRatings] = useState([]);
  const [approvalRatings, setApprovalRatings] = useState([]);
  const [averageRating, setAverageRating] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    setCurrentRole(user.role || '');
  }, [user.role]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data();
            setUserData(profile);
            setSkills(normalizeSkills(
              Object.prototype.hasOwnProperty.call(profile, 'skills') ? profile.skills : user.skills
            ));
          } else {
            setSkills(normalizeSkills(user.skills));
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      }
    };
    fetchUserData();
  }, [user?.uid]);

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill) return;
    if (skills.some((existingSkill) => existingSkill.toLowerCase() === skill.toLowerCase())) {
      setSkillsMessage('That skill is already on your list.');
      setSkillsMessageType('error');
      return;
    }
    setSkills((currentSkills) => [...currentSkills, skill]);
    setSkillInput('');
    setSkillsMessage('');
  };

  const saveSkills = async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser?.uid) {
      setSkillsMessage('Unable to save skills right now. Please sign in again and retry.');
      setSkillsMessageType('error');
      return;
    }

    setSavingSkills(true);
    setSkillsMessage('');
    try {
      const savedSkills = normalizeSkills(skills);
      await setDoc(doc(db, 'users', activeUser.uid), {
        uid: activeUser.uid,
        skills: savedSkills,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const savedUser = { ...user, uid: activeUser.uid, skills: savedSkills };
      localStorage.setItem('user', JSON.stringify(savedUser));
      onUserUpdate?.(savedUser);
      setSkills(savedSkills);
      setUserData((currentData) => ({ ...currentData, skills: savedSkills }));
      setSkillsMessage('Skills saved. Your task recommendations will use this list.');
      setSkillsMessageType('success');
    } catch (error) {
      console.error('Error saving student skills:', error);
      setSkillsMessage(error.code === 'permission-denied'
        ? 'Firestore rules are blocking skill updates. Publish the updated firestore.rules rules in Firebase Console, then try again.'
        : 'Could not save your skills. Please check your connection and try again.');
      setSkillsMessageType('error');
    } finally {
      setSavingSkills(false);
    }
  };

  useEffect(() => {
    if (!user?.uid || user.role !== 'student') {
      setRatings([]);
      setSubmissionRatings([]);
      setAverageRating(null);
      return undefined;
    }

    const ratingsQuery = query(
      collection(db, 'submissions'),
      where('studentId', '==', user.uid),
      where('selectedByCompany', '==', true)
    );

    const unsubscribeRatings = onSnapshot(
      ratingsQuery,
      (snapshot) => {
        const nextRatings = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data()
          }))
          .map((item) => ({
            ...item,
            startupRating: Number(item.startupRating)
          }))
          .filter((item) => item.startupRating >= 1 && item.startupRating <= 5);

        setSubmissionRatings(nextRatings);
      },
      (error) => {
        console.error('Student rating fetch error:', error);
      }
    );

    return () => unsubscribeRatings();
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (!user?.uid || user.role !== 'student') {
      setApprovalRatings([]);
      return undefined;
    }

    const approvalsQuery = query(collection(db, 'task_approvals'), where('studentId', '==', user.uid));
    return onSnapshot(approvalsQuery, (snapshot) => {
      const nextRatings = snapshot.docs.map((approvalDoc) => {
        const approval = approvalDoc.data();
        const selection = approval.selectionData || {};
        return {
          id: approval.submissionId || approvalDoc.id,
          taskTitle: approval.taskTitle || '',
          startupName: selection.startupName || approval.companyName || '',
          companyName: selection.companyName || approval.companyName || '',
          selectedAt: selection.selectedAt || approval.createdAt || '',
          startupRating: Number(selection.startupRating),
          selectionFeedback: selection.selectionFeedback || ''
        };
      }).filter((item) => item.startupRating >= 1 && item.startupRating <= 5);
      setApprovalRatings(nextRatings);
    }, (error) => {
      console.error('Student saved rating fetch error:', error);
    });
  }, [user?.uid, user?.role]);

  useEffect(() => {
    const bySubmission = new Map(approvalRatings.map((rating) => [rating.id, rating]));
    submissionRatings.forEach((rating) => bySubmission.set(rating.id, { ...bySubmission.get(rating.id), ...rating }));
    const combinedRatings = [...bySubmission.values()];
    setRatings(combinedRatings);
    setAverageRating(combinedRatings.length
      ? combinedRatings.reduce((sum, item) => sum + item.startupRating, 0) / combinedRatings.length
      : null);
  }, [approvalRatings, submissionRatings]);

  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
  const email = user.email || '—';
  const role = currentRole || '—';
  const isStudent = currentRole === 'student';
  const isAdmin = currentRole === 'admin';

  const handleRoleSelect = async (selectedRole) => {
    if (isAdmin) {
      setMessageType('error');
      setMessage('Admin accounts cannot change their account type here.');
      return;
    }

    setUpdatingRole(true);
    setMessageType('info');
    setMessage('Saving account type...');

    const activeUser = auth.currentUser || user;
    if (!activeUser?.uid) {
      console.error('No authenticated user available for role save:', activeUser);
      setMessageType('error');
      setMessage('Unable to save account type right now. Please sign out and sign back in.');
      setUpdatingRole(false);
      return;
    }

    try {
      const userRef = doc(db, 'users', activeUser.uid);
      await setDoc(
        userRef,
        {
          uid: activeUser.uid,
          email: activeUser.email || user.email || '',
          displayName,
          role: selectedRole,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      const savedUser = {
        ...user,
        uid: activeUser.uid,
        email: activeUser.email || user.email,
        displayName,
        role: selectedRole
      };
      localStorage.setItem('user', JSON.stringify(savedUser));
      onUserUpdate?.(savedUser);
      setCurrentRole(selectedRole);
      setMessageType('success');
      setMessage('Account type saved successfully. Refresh or navigate to your dashboard.');
    } catch (error) {
      console.error('Error saving role:', error);
      setMessageType('error');
      setMessage('Could not save account type. Please try again.');
    } finally {
      setUpdatingRole(false);
      window.setTimeout(() => setMessage(''), 5000);
    }
  };

  const missingRole = !['student', 'startup', 'admin'].includes(currentRole);

  const handleDeleteAccountType = async () => {
    if (isAdmin) {
      setMessageType('error');
      setMessage('Admin accounts cannot remove their account type here.');
      return;
    }

    const trimmedReason = deleteReason.trim();
    if (!trimmedReason) {
      setMessageType('error');
      setMessage('Please enter a reason before deleting your account type.');
      return;
    }

    setDeletingAccount(true);
    setMessageType('info');
    setMessage('Removing account type...');

    try {
      const activeUser = auth.currentUser || user;
      if (!activeUser?.uid) {
        throw new Error('No active user found.');
      }

      const userRef = doc(db, 'users', activeUser.uid);
      await setDoc(userRef, {
        uid: activeUser.uid,
        email: activeUser.email || user.email || '',
        displayName,
        role: null,
        deleteReason: trimmedReason,
        updatedAt: serverTimestamp()
      }, { merge: true });

      const savedUser = {
        ...user,
        uid: activeUser.uid,
        email: activeUser.email || user.email,
        displayName,
        role: null
      };

      localStorage.setItem('user', JSON.stringify(savedUser));
      onUserUpdate?.(savedUser);
      localStorage.removeItem(`ss_user_role_${activeUser.uid}`);
      localStorage.removeItem(`ss_user_role_${activeUser.email}`);
      setCurrentRole('');
      setDeleteReason('');
      setDeleteModalOpen(false);
      setMessageType('success');

      const mailFormData = new FormData();
      mailFormData.append('_subject', 'SkillStreet account deletion reason');
      mailFormData.append('_captcha', 'false');
      mailFormData.append('name', displayName);
      mailFormData.append('email', activeUser.email || user.email || 'no-reply@skillstreet.local');
      mailFormData.append('subject', 'Account deletion reason');
      mailFormData.append('message', [
        'User account deletion reason received on SkillStreet.',
        '',
        `User Name: ${displayName}`,
        `User Email: ${activeUser.email || user.email || 'N/A'}`,
        `User ID: ${activeUser.uid}`,
        `Selected Role: ${currentRole || 'N/A'}`,
        '',
        'Reason:',
        trimmedReason
      ].join('\n'));

      try {
        const emailResponse = await fetch('https://formsubmit.co/ajax/support.skillstreet@gmail.com', {
          method: 'POST',
          body: mailFormData,
          headers: {
            Accept: 'application/json'
          }
        });
        if (!emailResponse.ok) {
          throw new Error(`Support notification failed with status ${emailResponse.status}.`);
        }
        setMessage('Your selected account type has been removed and the reason was sent to support.');
      } catch (emailError) {
        console.error('Account type removed, but support notification failed:', emailError);
        setMessageType('error');
        setMessage('Your account type was removed, but we could not notify support. Please contact support with your reason.');
      }
    } catch (error) {
      console.error('Error deleting account type:', error);
      setMessageType('error');
      setMessage(error?.code === 'permission-denied'
        ? 'Firestore blocked this change. Publish the updated Firestore rules in Firebase Console, then try again.'
        : 'Could not delete your account type. Please try again.');
    } finally {
      setDeletingAccount(false);
      window.setTimeout(() => setMessage(''), 5000);
    }
  };

  return (
    <div className="profile-surface min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white pt-32 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="animated-border-surface mx-auto max-w-3xl rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur-sm shadow-2xl sm:p-8">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="h-16 w-16 sm:h-20 sm:w-20 flex-none overflow-hidden rounded-2xl bg-blue-900/60 border border-blue-800/60 flex items-center justify-center text-2xl sm:text-3xl text-orange-400">
            {user.photoURL ? (
              <img src={user.photoURL} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="font-bold">{(displayName || 'U')[0].toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-300">{email}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 divide-y divide-blue-800/50 border-y border-blue-800/50 sm:mt-8 sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:border-0 lg:grid-cols-3">
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">Account Type</dt>
            <dd className="text-right text-base font-semibold capitalize text-white sm:mt-2 sm:text-center sm:text-lg">{role}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">User ID</dt>
            <dd className="max-w-[65%] break-all text-right text-xs text-slate-300 sm:mt-2 sm:max-w-none sm:text-center">{user.uid || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">Email Verified</dt>
            <dd className="text-right text-base font-semibold text-white sm:mt-2 sm:text-center sm:text-lg">{user.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">Account Created</dt>
            <dd className="text-right text-base font-semibold text-white sm:mt-2 sm:text-center sm:text-lg">{userData?.createdAt ? new Date(userData.createdAt.seconds * 1000).toLocaleDateString() : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">Display Name</dt>
            <dd className="max-w-[65%] break-words text-right text-base font-semibold text-white sm:mt-2 sm:max-w-none sm:text-center sm:text-lg">{userData?.displayName || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 sm:block sm:rounded-2xl sm:border sm:border-blue-800/60 sm:bg-blue-900/30 sm:p-4 sm:text-center">
            <dt className="text-sm text-slate-300">Email</dt>
            <dd className="max-w-[65%] break-all text-right text-xs font-semibold text-white sm:mt-2 sm:max-w-none sm:text-center sm:text-sm">{userData?.email || '—'}</dd>
          </div>
        </dl>

        {isStudent ? (
        <div className="mt-8 space-y-6">
        <section aria-labelledby="student-skills-title" className="rounded-2xl border border-orange-400/25 bg-blue-900/30 p-5 sm:p-6">
          <div>
            <h2 id="student-skills-title" className="text-lg font-semibold text-white">Your Skills</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">Add the skills you have. We’ll use them to find startup tasks that fit you.</p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="student-skill-input">Add a skill</label>
            <input
              id="student-skill-input"
              type="text"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSkill();
                }
              }}
              placeholder="e.g. React, UI/UX, Writing"
              maxLength={50}
              className="min-h-12 flex-1 rounded-xl border border-blue-700/70 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-300/30"
            />
            <button
              type="button"
              onClick={addSkill}
              disabled={!skillInput.trim() || savingSkills}
              className="min-h-12 rounded-xl border border-orange-300/40 bg-orange-400/10 px-5 py-3 text-sm font-semibold text-orange-100 transition hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add skill
            </button>
          </div>
          {skills.length ? (
            <ul aria-label="Your skills" className="mt-4 flex flex-wrap gap-2">
              {skills.map((skill) => (
                <li key={skill} className="flex items-center gap-2 rounded-full border border-blue-700/70 bg-blue-950/70 py-1 pl-3 pr-1 text-sm text-blue-100">
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => setSkills((currentSkills) => currentSkills.filter((item) => item !== skill))}
                    disabled={savingSkills}
                    aria-label={`Remove ${skill}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-blue-700/70 px-4 py-3 text-sm text-slate-400">No skills added yet. Add a few to get tailored task recommendations.</p>
          )}
          <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={saveSkills}
              disabled={savingSkills}
              className="min-h-11 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-wait disabled:opacity-60"
            >
              {savingSkills ? 'Saving…' : 'Save skills'}
            </button>
            {skillsMessage ? (
              <p role="status" className={`text-sm ${skillsMessageType === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {skillsMessage}
              </p>
            ) : null}
          </div>
        </section>
        <div className="rounded-2xl border border-blue-800/60 bg-blue-900/30 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Startup Ratings</h2>
              <p className="mt-1 text-sm text-slate-400">Ratings from startups that selected your work.</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-300">Average rating</div>
              <div className="mt-1 text-xl font-semibold text-white">{averageRating ? averageRating.toFixed(1) : '—'}/5</div>
            </div>
          </div>

          {ratings.length === 0 ? (
            <p className="mt-4 text-slate-400">No ratings yet. Your profile will show each startup rating after a selection is saved.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {ratings.map((rating) => (
                <div key={rating.id} className="rounded-2xl border border-blue-800/60 bg-blue-900/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-slate-300">Startup</div>
                      <div className="mt-1 text-white font-semibold">{rating.startupName || rating.companyName || 'Startup'}</div>
                      <div className="mt-1 text-xs text-slate-400">{rating.taskTitle || 'Selected work'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-300">Rated</div>
                      <div className="mt-1 text-white font-semibold">{rating.startupRating}/5</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-orange-400 text-lg">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span key={index}>{index < rating.startupRating ? '\u2605' : '\u2606'}</span>
                    ))}
                  </div>
                  {rating.selectionFeedback ? (
                    <p className="mt-3 text-sm text-slate-300">{rating.selectionFeedback}</p>
                  ) : null}
                  {rating.selectedAt ? (
                    <p className="mt-3 text-xs text-slate-400">Selected on {new Date(rating.selectedAt).toLocaleDateString()}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        ) : null}

        {missingRole ? (
          <div className="mt-8 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 sm:p-6 text-sm text-orange-100">
            <p className="font-semibold">Your account is missing role data.</p>
            <p className="mt-2 text-slate-300">Please choose the correct account type so the app can send you to the right dashboard.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => handleRoleSelect('student')}
                disabled={updatingRole}
                className="rounded-2xl bg-blue-900/60 border border-blue-800/60 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-70"
              >
                Student Account
              </button>
              <button
                type="button"
                onClick={() => handleRoleSelect('startup')}
                disabled={updatingRole}
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-70"
              >
                Company Account
              </button>
            </div>
            {message ? (
              <p className={`mt-3 text-sm ${messageType === 'success' ? 'text-emerald-300' : messageType === 'error' ? 'text-rose-300' : 'text-slate-200'}`}>
                {message}
              </p>
            ) : null}
          </div>
        ) : isAdmin ? (
          <div className="mt-8 space-y-4 text-sm text-slate-300">
            <p>Your admin account type is managed by an approved administrator.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-4 text-sm text-slate-300">
            <p>If you need to update your information, please visit account settings or contact support.</p>
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
              >
                Delete Account
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteModalOpen ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-4">
          <div className="mobile-dialog-panel w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-white/10 bg-slate-900 p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-white">Delete account type</h3>
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteReason('');
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-white"
                aria-label="Close delete account dialog"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-300">Remove your current account type to choose a different one. Please tell us why before continuing.</p>
            <label htmlFor="delete-account-reason" className="mt-4 block text-sm font-medium text-slate-200">
              Reason for deletion <span className="text-red-300" aria-hidden="true">*</span>
            </label>
            <textarea
              id="delete-account-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={5}
              required
              aria-required="true"
              placeholder="Tell us why you are deleting your account type"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-blue-900/40 px-4 py-3 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
            />
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteReason('');
                }}
                className="rounded-2xl border border-blue-800/60 bg-blue-900/40 px-4 py-3 text-sm font-semibold text-white transition hover:border-orange-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingAccount || !deleteReason.trim()}
                onClick={handleDeleteAccountType}
                className="rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-70"
              >
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// `user` is provided by App via onAuthStateChanged and localStorage
