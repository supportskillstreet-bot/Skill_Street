import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';

import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, deleteDoc, doc, getDoc, increment } from 'firebase/firestore';
import { db } from '../firebase.js';
import { authenticatedFetch, downloadProtectedFile } from '../utils/api.js';
import { formatTaskDeadline, getTaskDeadlineAt, hasStoredTaskDeadline, isTaskDeadlinePassed } from '../utils/taskDeadline.js';

const CATEGORY_LABELS = {
  design: 'Design',
  tech: 'Tech',
  content: 'Content',
  sales: 'Sales'
};

const MIN_RECOMMENDATION_MATCH_COUNT = 2;
const MIN_RECOMMENDATION_MATCH_PERCENT = 50;

const SKILL_OPTIONS = [
  'Figma',
  'React',
  'Node.js',
  'Python',
  'Canva',
  'Writing',
  'SEO',
  'Sales',
  'UI/UX',
  'Data Analysis',
  'Video Editing',
  'Social Media'
];

const getSubmissionTime = (submission) => {
  const value = submission.submittedAt;
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};

const sortSubmissions = (items) => [...items].sort((a, b) => getSubmissionTime(b) - getSubmissionTime(a));

const visibleSubmissions = (items) => items.filter((submission) => !submission.deletedByStudent);

const getHiddenSubmissionStorageKey = (uid) => `hiddenSubmissions:${uid}`;
const getSubmissionBackupStorageKey = (uid) => `studentSubmissions:${uid}`;

const readHiddenSubmissionIds = (uid) => {
  if (!uid || typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(getHiddenSubmissionStorageKey(uid)) || '[]');
  } catch (error) {
    console.error('Hidden submission read error:', error);
    return [];
  }
};

const writeHiddenSubmissionIds = (uid, ids) => {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getHiddenSubmissionStorageKey(uid), JSON.stringify([...new Set(ids)]));
  } catch (error) {
    console.error('Hidden submission write error:', error);
  }
};

const readSubmissionBackups = (uid) => {
  if (!uid || typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(getSubmissionBackupStorageKey(uid)) || '[]');
  } catch (error) {
    console.error('Submission backup read error:', error);
    return [];
  }
};

const writeSubmissionBackups = (uid, items) => {
  if (!uid || typeof window === 'undefined') return;
  try {
    const byId = new Map();
    items.forEach((item) => {
      if (item?.id) byId.set(item.id, item);
    });
    window.localStorage.setItem(getSubmissionBackupStorageKey(uid), JSON.stringify([...byId.values()]));
  } catch (error) {
    console.error('Submission backup write error:', error);
  }
};

const mergeSubmissions = (...groups) => {
  const byId = new Map();
  groups.flat().forEach((submission) => {
    if (submission?.id) byId.set(submission.id, submission);
  });
  return sortSubmissions(visibleSubmissions([...byId.values()]));
};

const formatSubmissionDate = (submission) => {
  const time = getSubmissionTime(submission);
  return time ? new Date(time).toLocaleString() : 'Just now';
};

const hasCashReward = (task) => {
  if (!task) return false;
  const rewards = [
    task.prize,
    ...(Array.isArray(task.rewardTypes) ? task.rewardTypes : [])
  ].filter(Boolean).join(' ');
  return /cash|prize|₹|inr|\brs\.?/i.test(rewards);
};

const normalizeSkills = (skills) => {
  const values = Array.isArray(skills)
    ? skills
    : typeof skills === 'string'
      ? skills.split(',')
      : [];
  const seen = new Set();
  return values
    .map((skill) => String(skill || '').trim())
    .filter((skill) => {
      const normalized = skill.toLowerCase();
      if (!normalized || normalized === 'general' || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
};

const getTaskTime = (task) => {
  const value = task.createdAt;
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};

export default function Student({ user }) {
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [approvalReviews, setApprovalReviews] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsLoadError, setSubmissionsLoadError] = useState(false);
  const [profileSkills, setProfileSkills] = useState(() => normalizeSkills(user.skills));
  const [profileSkillsLoading, setProfileSkillsLoading] = useState(true);
  const [profileSkillsError, setProfileSkillsError] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [viewingTaskDescription, setViewingTaskDescription] = useState(null);
  const [activeSubmitTab, setActiveSubmitTab] = useState('link');
  const [studentName, setStudentName] = useState(user.displayName || '');
  const [linkValue, setLinkValue] = useState('');
  const [textValue, setTextValue] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [currentFilter, setCurrentFilter] = useState('All');
  const [activeStudentTab, setActiveStudentTab] = useState('tasks');
  const [resumeDesign, setResumeDesign] = useState('modern');
  const [resumeBackground, setResumeBackground] = useState('#ffffff');
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const [editSubmitTab, setEditSubmitTab] = useState('link');
  const [editLinkValue, setEditLinkValue] = useState('');
  const [editTextValue, setEditTextValue] = useState('');
  const [editSelectedFiles, setEditSelectedFiles] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [editAgreedToTerms, setEditAgreedToTerms] = useState(false);
  const [deletingAllSubmissions, setDeletingAllSubmissions] = useState(false);
  const [hiddenSubmissionIds, setHiddenSubmissionIds] = useState(() => readHiddenSubmissionIds(user.uid));
  const [submissionBackups, setSubmissionBackups] = useState(() => readSubmissionBackups(user.uid));

  const [downloadUrls, setDownloadUrls] = useState({}); // { [fileId]: url }
  const downloadObjectUrls = useRef(new Set());

  useEffect(() => () => {
    downloadObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const taskCategories = useMemo(
    () => ['All', ...Array.from(new Set([
      'Design',
      'Tech',
      'Content',
      'Sales',
      ...tasks
        .map((task) => task.categoryLabel || task.category)
        .filter(Boolean)
    ]))],
    [tasks]
  );


  useEffect(() => {
    const taskQuery = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    setSubmissionsLoading(true);
    setSubmissionsLoadError(false);
    const unsubscribeProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        const profile = snapshot.exists() ? snapshot.data() : {};
        setProfileSkills(normalizeSkills(
          Object.prototype.hasOwnProperty.call(profile, 'skills') ? profile.skills : user.skills
        ));
        setProfileSkillsLoading(false);
        setProfileSkillsError(false);
      },
      (error) => {
        console.error('Student profile fetch error:', error);
        setProfileSkills(normalizeSkills(user.skills));
        setProfileSkillsLoading(false);
        setProfileSkillsError(true);
      }
    );
    const hiddenIds = readHiddenSubmissionIds(user.uid);
    setHiddenSubmissionIds(hiddenIds);
    const backups = readSubmissionBackups(user.uid);
    setSubmissionBackups(backups);
    setSubmissions(mergeSubmissions(backups).filter((submission) => !new Set(hiddenIds).has(submission.id)));
    const subsQuery = query(
      collection(db, 'submissions'),
      where('studentId', '==', user.uid)
    );
    const approvalQuery = query(
      collection(db, 'task_approvals'),
      where('studentId', '==', user.uid)
    );

    const unsubscribeTasks = onSnapshot(
      taskQuery,
      (snapshot) => {
        const nextTasks = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((t) => !t.deleted && !t.isDeleted);

        setTasks(nextTasks);
        setActiveTask((current) => current
          ? nextTasks.find((task) => task.id === current.id) || null
          : current);
        setViewingTaskDescription((current) => current
          ? nextTasks.find((task) => task.id === current.id) || null
          : current);
        const tasksMissingCompanyName = nextTasks.filter((task) =>
          !task.startupName?.trim() && !task.companyName?.trim() && (task.companyId || task.ownerId || task.userId)
        );
        Promise.all(tasksMissingCompanyName.map(async (task) => {
          const companyId = task.companyId || task.ownerId || task.userId;
          try {
            const companySnapshot = await getDoc(doc(db, 'users', companyId));
            if (!companySnapshot.exists()) return null;
            const company = companySnapshot.data();
            return [task.id, company.startupName || company.companyName || company.displayName || company.email || ''];
          } catch (error) {
            console.warn('Could not load task company name:', error);
            return null;
          }
        })).then((resolvedNames) => {
          const companyNames = Object.fromEntries(resolvedNames.filter(Boolean));
          if (Object.keys(companyNames).length) {
            setTasks((currentTasks) => currentTasks.map((task) =>
              companyNames[task.id] && !task.startupName && !task.companyName
                ? { ...task, companyName: companyNames[task.id] }
                : task
            ));
          }
        });
        setLoading(false);
      },
      (error) => {
        console.error('Task fetch error:', error);
        setLoading(false);
      }
    );

    const unsubscribeSubs = onSnapshot(
      subsQuery,
      (snapshot) => {
        const hiddenIdSet = new Set(readHiddenSubmissionIds(user.uid));
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const currentBackups = readSubmissionBackups(user.uid);
        const merged = mergeSubmissions(currentBackups, items).filter((submission) => !hiddenIdSet.has(submission.id));
        setSubmissionBackups(currentBackups);
        setSubmissions(merged);
        setSubmissionsLoading(false);
        setSubmissionsLoadError(false);
      },
      (error) => {
        console.error('Submission fetch error:', error);
        setSubmissionsLoading(false);
        setSubmissionsLoadError(true);
      }
    );

    const unsubscribeApprovals = onSnapshot(
      approvalQuery,
      (snapshot) => {
        const reviews = snapshot.docs.map((approvalDoc) => {
          const approval = approvalDoc.data();
          const selection = approval.selectionData || {};
          return {
            id: approval.submissionId || approvalDoc.id,
            taskTitle: approval.taskTitle || '',
            startupName: selection.startupName || selection.companyName || approval.companyName || '',
            companyName: selection.companyName || approval.companyName || '',
            submittedAt: selection.selectedAt || approval.createdAt || '',
            startupRating: Number(selection.startupRating),
            selectionFeedback: selection.selectionFeedback || ''
          };
        }).filter((review) => review.startupRating >= 1 && review.startupRating <= 5);
        setApprovalReviews(reviews);
      },
      (error) => {
        console.error('Student startup review fetch error:', error);
      }
    );

    return () => {
      unsubscribeProfile();
      unsubscribeTasks();
      unsubscribeSubs();
      unsubscribeApprovals();
    };
  }, [user.uid, user.skills]);

  const eligibleTasks = useMemo(() => {
    const submittedTaskIds = new Set(submissions.map((submission) => submission.taskId));
    return tasks.filter((task) => !submittedTaskIds.has(task.id));
  }, [tasks, submissions]);

  const filteredTasks = useMemo(
    () => eligibleTasks.filter((task) => {
      if (currentFilter === 'All') return true;
      const categoryName = task.categoryLabel || task.category || '';
      return categoryName === currentFilter || task.category === currentFilter;
    }),
    [eligibleTasks, currentFilter]
  );

  const recommendedTask = useMemo(() => {
    if (!profileSkills.length) return null;
    const studentSkillSet = new Set(profileSkills.map((skill) => skill.toLowerCase()));
    return eligibleTasks
      .filter((task) => hasStoredTaskDeadline(task) && !isTaskDeadlinePassed(task, currentTime))
      .map((task, index) => {
        const requiredSkills = normalizeSkills(task.skills);
        if (!requiredSkills.length) return null;
        const matchingSkills = requiredSkills.filter((skill) => studentSkillSet.has(skill.toLowerCase()));
        const matchPercent = Math.round((matchingSkills.length / requiredSkills.length) * 100);
        if (
          matchingSkills.length < MIN_RECOMMENDATION_MATCH_COUNT ||
          matchPercent < MIN_RECOMMENDATION_MATCH_PERCENT
        ) return null;
        return {
          task,
          matchingSkills,
          matchPercent,
          fitTier: matchPercent >= 80 ? 'Strong fit' : matchPercent >= 65 ? 'Good fit' : 'Potential fit',
          rationale: `Matches ${matchingSkills.length} of ${requiredSkills.length} requested skills in your profile.`,
          index
        };
      })
      .filter(Boolean)
      .sort((a, b) =>
        b.matchPercent - a.matchPercent ||
        b.matchingSkills.length - a.matchingSkills.length ||
        getTaskTime(b.task) - getTaskTime(a.task) ||
        a.index - b.index
      )[0] || null;
  }, [eligibleTasks, profileSkills, currentTime]);

  const showToast = (message) => {
    setToast({ message, visible: true });
    window.clearTimeout(window.toastTimer);
    window.toastTimer = window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3200);
  };

  const fetchDownloadUrl = useCallback(async (fileId, submissionId) => {
    if (!fileId) return null;

    if (downloadUrls[fileId]) return downloadUrls[fileId];

    try {
      const params = new URLSearchParams({ id: String(fileId) });
      if (submissionId) params.set('submissionId', submissionId);
      const resp = await authenticatedFetch(`/api/file.php?${params.toString()}`);
      if (!resp.ok) {
        let err = null;
        try {
          err = await resp.json();
        } catch (e) {}
        throw new Error(err?.error || err?.message || `HTTP ${resp.status}`);
      }
      const downloadUrl = URL.createObjectURL(await resp.blob());
      downloadObjectUrls.current.add(downloadUrl);
      setDownloadUrls((current) => ({ ...current, [fileId]: downloadUrl }));
      return downloadUrl;
    } catch (e) {
      console.error('fetchDownloadUrl error:', e);
      showToast('Cannot download file right now.');
      return null;
    }
  }, [downloadUrls]);

  const downloadSelectionFile = async (file, submission) => {
    try {
      await downloadProtectedFile(file.fileId, submission.id, file.name);
    } catch (error) {
      console.error('Selection file download error:', error);
      showToast(`Cannot download "${file.name}" right now.`);
    }
  };

  const openTaskModal = (task) => {
    setActiveTask(task);
    setActiveSubmitTab('link');
    setLinkValue('');
    setTextValue('');
    setSelectedFiles([]);
    setAgreedToTerms(false);
  };

  const closeTaskModal = () => {
    setActiveTask(null);
    setAgreedToTerms(false);
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    const MAX_FILES = 5;
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

    console.log('handleFileSelect called with files:', files);

    if (selectedFiles.length + files.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed per submission.`);
      return;
    }

    for (const file of files) {
      if (file.size >= MAX_FILE_SIZE) {
        showToast(`File "${file.name}" must be less than 200MB.`);
        continue;
      }

      try {
        console.log('Uploading file:', file.name);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('username', user.displayName || 'user');

        const response = await authenticatedFetch('/api/upload.php', {
          method: 'POST',
          body: formData,
        });

        console.log('Upload response status:', response.status);

        if (!response.ok) {
          let errorData = null;
          try {
            errorData = await response.json();
          } catch (e) {
            // ignore non-json errors
          }
          console.error('Upload failed:', errorData || { status: response.status });
          const reason = errorData?.message || errorData?.error || `HTTP ${response.status}`;
          const details = errorData?.details;
          throw new Error(details ? `${reason} - ${details}` : reason);
        }

        const data = await response.json();
        console.log('Upload successful:', data);
        setSelectedFiles((current) => [
          ...current,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            fileId: data.fileId,
          }

        ]);
        showToast(`"${file.name}" uploaded successfully`);
      } catch (error) {
        console.error('Upload error:', error);
        showToast(`Cannot upload a file right now: ${error?.message || 'unknown error'}`);
      }
    }
    event.target.value = null;
  };

  const handleEditFileSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    const MAX_FILES = 5;
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

    if (editSelectedFiles.length + files.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed per submission.`);
      return;
    }

    for (const file of files) {
      if (file.size >= MAX_FILE_SIZE) {
        showToast(`File "${file.name}" must be less than 200MB.`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('username', user.displayName || 'user');

        const response = await authenticatedFetch('/api/upload.php', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errorData = null;
          try {
            errorData = await response.json();
          } catch (e) {}
          const reason = errorData?.message || errorData?.error || `HTTP ${response.status}`;
          const details = errorData?.details;
          throw new Error(details ? `${reason} - ${details}` : reason);
        }

        const data = await response.json();
        setEditSelectedFiles((current) => [
          ...current,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            fileId: data.fileId,
          }
        ]);
      } catch (error) {
        console.error('Upload error:', error);
        showToast(`Cannot upload a file right now: ${error?.message || 'unknown error'}`);
      }
    }
    event.target.value = null;
  };

  const removeFile = (index) => {
    setSelectedFiles((current) => current.filter((_, idx) => idx !== index));
  };

  const removeEditFile = (index) => {
    setEditSelectedFiles((current) => current.filter((_, idx) => idx !== index));
  };

  const openEditSubmission = (submission) => {
    setEditingSubmission(submission);
    setEditSubmitTab(submission.type || 'link');
    setEditLinkValue(submission.url || '');
    setEditTextValue(submission.text || '');
    setEditSelectedFiles(submission.files || []);
    setEditAgreedToTerms(false);
  };

  const closeEditSubmission = () => {
    setEditingSubmission(null);
    setEditSubmitTab('link');
    setEditLinkValue('');
    setEditTextValue('');
    setEditSelectedFiles([]);
    setEditAgreedToTerms(false);
  };

  const openViewSubmission = (submission) => {
    setViewingSubmission(submission);
  };

  const closeViewSubmission = () => {
    setViewingSubmission(null);
  };

  const submitTaskEntry = async () => {
    if (submitting) return;
    if (!activeTask) return;
    if (!studentName.trim()) {
      showToast('Please enter your name.');
      return;
    }
    if (!agreedToTerms) {
      showToast('Please agree to the Terms and Conditions.');
      return;
    }
    if (activeSubmitTab === 'link' && !linkValue.trim()) {
      showToast('Please provide a submission link.');
      return;
    }
    if (activeSubmitTab === 'text' && !textValue.trim()) {
      showToast('Please add submission text.');
      return;
    }
    if (activeSubmitTab === 'file' && selectedFiles.length === 0) {
      showToast('Please upload at least one file.');
      return;
    }
    if (isTaskDeadlinePassed(activeTask)) {
      showToast('The deadline has finished. Submissions are closed.');
      return;
    }
    if (getTaskDeadlineAt(activeTask) === null) {
      showToast('The submission deadline is unavailable. Please contact the company.');
      return;
    }

    setSubmitting(true);
    try {
      const submittedAt = new Date().toISOString();
      const companyId = activeTask.companyId || activeTask.ownerId || activeTask.userId || '';
      const submissionData = {
        taskId: activeTask.id,
        taskTitle: activeTask.title,
        companyId,
        companyName: activeTask.companyName,
        studentId: user.uid,
        studentEmail: user.email,
        studentName: studentName.trim(),
        type: activeSubmitTab,
        url: activeSubmitTab === 'link' ? linkValue.trim() : '',
        text: activeSubmitTab === 'text' ? textValue.trim() : '',
        files: activeSubmitTab === 'file'
          ? selectedFiles.map((f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              fileId: f.fileId,
              ...(f.bucketId ? { bucketId: f.bucketId } : {}),
            }))
          : [],
        submittedAt
      };

      const submissionRef = await addDoc(collection(db, 'submissions'), submissionData);
      const savedSubmission = { id: submissionRef.id, ...submissionData };

      const nextHiddenIds = hiddenSubmissionIds.filter((id) => id !== submissionRef.id);
      setHiddenSubmissionIds(nextHiddenIds);
      writeHiddenSubmissionIds(user.uid, nextHiddenIds);

      const nextBackups = mergeSubmissions([savedSubmission], submissionBackups);
      setSubmissionBackups(nextBackups);
      writeSubmissionBackups(user.uid, nextBackups);

      setSubmissions((current) => {
        if (current.some((submission) => submission.id === submissionRef.id)) return current;
        return mergeSubmissions([savedSubmission], current);
      });

      setTasks((current) =>
        current.map((task) =>
          task.id === activeTask.id ? { ...task, participants: (task.participants || 0) + 1 } : task
        )
      );

      try {
        await updateDoc(doc(db, 'tasks', activeTask.id), {
          participants: increment(1)
        });
      } catch (error) {
        console.error('Participant count update error:', error);
      }

      showToast('Submission sent successfully.');
      closeTaskModal();
    } catch (error) {
      console.error('Submit error:', error);
      showToast('Unable to submit right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateSubmissionEntry = async () => {
    if (!editingSubmission) return;
    const relatedTask = tasks.find((task) => task.id === editingSubmission.taskId);
    if (!relatedTask || isTaskDeadlinePassed(relatedTask)) {
      showToast('The deadline has finished. This submission can no longer be changed.');
      return;
    }
    if (!editAgreedToTerms) {
      showToast('Please agree to the Terms and Conditions.');
      return;
    }
    if (editSubmitTab === 'link' && !editLinkValue.trim()) {
      showToast('Please provide a submission link.');
      return;
    }
    if (editSubmitTab === 'text' && !editTextValue.trim()) {
      showToast('Please add submission text.');
      return;
    }
    if (editSubmitTab === 'file' && editSelectedFiles.length === 0) {
      showToast('Please upload at least one file.');
      return;
    }

    setSavingEdit(true);
    try {
      const updateData = {
        type: editSubmitTab,
        url: editSubmitTab === 'link' ? editLinkValue.trim() : '',
        text: editSubmitTab === 'text' ? editTextValue.trim() : '',
        files: editSubmitTab === 'file'
          ? editSelectedFiles.map((f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              fileId: f.fileId,
              ...(f.bucketId ? { bucketId: f.bucketId } : {}),
            }))
          : [],
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'submissions', editingSubmission.id), updateData);

      setSubmissions((current) =>
        sortSubmissions(
          current.map((submission) =>
            submission.id === editingSubmission.id ? { ...submission, ...updateData } : submission
          )
        )
      );
      const nextBackups = mergeSubmissions(
        submissionBackups.map((submission) =>
          submission.id === editingSubmission.id ? { ...submission, ...updateData } : submission
        )
      );
      setSubmissionBackups(nextBackups);
      writeSubmissionBackups(user.uid, nextBackups);
      setViewingSubmission((current) =>
        current?.id === editingSubmission.id ? { ...current, ...updateData } : current
      );
      showToast('Submission updated successfully.');
      closeEditSubmission();
    } catch (error) {
      console.error('Update submission error:', error);
      showToast('Unable to update submission right now.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteSubmissionEntry = async (submission) => {
    if (!window.confirm('Delete this submission permanently?')) return;

    const nextHiddenIds = [...hiddenSubmissionIds, submission.id];
    setHiddenSubmissionIds(nextHiddenIds);
    writeHiddenSubmissionIds(user.uid, nextHiddenIds);
    setSubmissions((current) => current.filter((item) => item.id !== submission.id));
    const nextBackups = submissionBackups.filter((item) => item.id !== submission.id);
    setSubmissionBackups(nextBackups);
    writeSubmissionBackups(user.uid, nextBackups);
    setViewingSubmission((current) => (current?.id === submission.id ? null : current));
    setEditingSubmission((current) => (current?.id === submission.id ? null : current));
    setTasks((current) =>
      current.map((task) =>
        task.id === submission.taskId ? { ...task, participants: Math.max((task.participants || 1) - 1, 0) } : task
      )
    );

    setDeletingSubmissionId(submission.id);
    try {
      let firestoreDeleted = false;
      try {
        await updateDoc(doc(db, 'submissions', submission.id), {
          deletedByStudent: true,
          deletedAt: new Date().toISOString()
        });
        firestoreDeleted = true;
      } catch (error) {
        console.error('Submission soft delete update error:', error);
      }

      try {
        await deleteDoc(doc(db, 'submissions', submission.id));
        firestoreDeleted = true;
      } catch (error) {
        console.error('Submission hard delete error:', error);
      }

      if (!firestoreDeleted) {
        throw new Error('Firestore did not allow this submission to be deleted.');
      }

      try {
        await updateDoc(doc(db, 'tasks', submission.taskId), {
          participants: increment(-1)
        });
      } catch (error) {
        console.error('Participant count delete update error:', error);
      }

      showToast('Submission deleted.');
    } catch (error) {
      console.error('Delete submission error:', error);
      showToast('Submission hidden from your list.');
    } finally {
      setDeletingSubmissionId('');
    }
  };

  const deleteAllSubmissions = async () => {
    if (submissions.length === 0) return;
    if (!window.confirm('Delete all of your submissions permanently?')) return;

    const submissionsToDelete = [...submissions];
    const taskDeleteCounts = submissionsToDelete.reduce((counts, submission) => {
      if (!submission.taskId) return counts;
      return { ...counts, [submission.taskId]: (counts[submission.taskId] || 0) + 1 };
    }, {});

    const submissionIds = submissionsToDelete.map((submission) => submission.id);
    const nextHiddenIds = [...hiddenSubmissionIds, ...submissionIds];
    setHiddenSubmissionIds(nextHiddenIds);
    writeHiddenSubmissionIds(user.uid, nextHiddenIds);
    setSubmissions([]);
    setSubmissionBackups([]);
    writeSubmissionBackups(user.uid, []);
    setViewingSubmission(null);
    setEditingSubmission(null);
    setTasks((current) =>
      current.map((task) => {
        const deletedCount = taskDeleteCounts[task.id] || 0;
        if (!deletedCount) return task;
        return { ...task, participants: Math.max((task.participants || 0) - deletedCount, 0) };
      })
    );

    setDeletingAllSubmissions(true);
    try {
      await Promise.all(
        submissionsToDelete.map(async (submission) => {
          let firestoreDeleted = false;
          try {
            await updateDoc(doc(db, 'submissions', submission.id), {
              deletedByStudent: true,
              deletedAt: new Date().toISOString()
            });
            firestoreDeleted = true;
          } catch (error) {
            console.error('Submission soft delete update error:', error);
          }

          try {
            await deleteDoc(doc(db, 'submissions', submission.id));
            firestoreDeleted = true;
          } catch (error) {
            console.error('Submission hard delete error:', error);
          }

          if (!firestoreDeleted) {
            throw new Error(`Firestore did not allow submission ${submission.id} to be deleted.`);
          }
        })
      );

      await Promise.all(
        Object.entries(taskDeleteCounts).map(([taskId, deletedCount]) =>
          updateDoc(doc(db, 'tasks', taskId), {
            participants: increment(-deletedCount)
          }).catch((error) => {
            console.error('Participant count bulk delete update error:', error);
          })
        )
      );

      showToast('All submissions deleted.');
    } catch (error) {
      console.error('Delete all submissions error:', error);
      showToast('All submissions hidden from your list.');
    } finally {
      setDeletingAllSubmissions(false);
    }
  };

  const studentSubmissionCount = submissions.length;

  const downloadResume = () => {
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const name = studentName.trim() || user.displayName || 'Student';
    const email = user.email || '';
    const skills = profileSkills.length ? profileSkills.map(escapeHtml).join(' · ') : 'Not provided';
    const reviewsBySubmission = new Map(approvalReviews.map((review) => [review.id, review]));
    submissions
      .filter((submission) => submission.selectedByCompany && Number(submission.startupRating) >= 1 && Number(submission.startupRating) <= 5)
      .forEach((submission) => {
        const approvalReview = reviewsBySubmission.get(submission.id);
        reviewsBySubmission.set(submission.id, {
          ...approvalReview,
          id: submission.id,
          taskTitle: submission.taskTitle || approvalReview?.taskTitle || '',
          startupName: submission.startupName || submission.companyName || approvalReview?.startupName || 'Startup',
          companyName: submission.companyName || approvalReview?.companyName || '',
          submittedAt: submission.selectedAt || approvalReview?.submittedAt || '',
          startupRating: Number(submission.startupRating),
          selectionFeedback: submission.selectionFeedback || approvalReview?.selectionFeedback || ''
        });
      });
    const startupReviews = [...reviewsBySubmission.values()];
    const startupReviewEntries = startupReviews.map((review) => {
      const reviewTime = getSubmissionTime(review);
      const dateLabel = reviewTime ? new Date(reviewTime).toLocaleDateString() : 'Date unavailable';
      return `<article class="review">
        <div class="review-heading">
          <div>
            <h3>${escapeHtml(review.startupName || review.companyName || 'Startup')}</h3>
            <p class="meta">${escapeHtml(review.taskTitle || 'Selected work')}</p>
          </div>
          <strong class="rating">${escapeHtml(review.startupRating)}/5 ★</strong>
        </div>
        ${review.selectionFeedback ? `<blockquote>${escapeHtml(review.selectionFeedback)}</blockquote>` : ''}
        <p class="meta">Reviewed ${escapeHtml(dateLabel)}</p>
      </article>`;
    }).join('');
    const workDetails = (submission) => {
      if (submission.type === 'link' && submission.url) {
        const safeUrl = escapeHtml(submission.url);
        return `<a href="${safeUrl}">${safeUrl}</a>`;
      }
      if (submission.type === 'text' && submission.text) return `<p>${escapeHtml(submission.text).replace(/\n/g, '<br>')}</p>`;
      if (submission.type === 'file' && submission.files?.length) {
        return `<p>Files: ${submission.files.map((file) => escapeHtml(file.name)).join(', ')}</p>`;
      }
      return '';
    };
    const taskEntries = submissions.map((submission) => `
      <article class="task">
        <h2>${escapeHtml(submission.taskTitle || 'Submitted task')}</h2>
        <p class="meta">${escapeHtml(submission.companyName || 'Startup')} · Submitted ${escapeHtml(getSubmissionTime(submission) ? new Date(getSubmissionTime(submission)).toLocaleDateString() : 'Date unavailable')}</p>
        ${workDetails(submission)}
      </article>`).join('');
    const resumeWindow = window.open('', '_blank');
    if (!resumeWindow) {
      showToast('Allow pop-ups to create your resume.');
      return;
    }
    resumeWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name)} - Resume</title><style>
      body{font:15px/1.55 Arial,sans-serif;color:#172033;background:${resumeBackground};max-width:850px;margin:40px auto;padding:0 28px}header{border-bottom:3px solid #f97316;padding-bottom:18px;margin-bottom:24px}h1{font-size:32px;margin:0 0 4px}h2{font-size:19px;margin:0 0 4px}h3{font-size:16px;margin:0 0 4px}.contact,.meta{color:#526078}.section-title{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#b45309;margin:24px 0 10px}.task,.review{padding:14px 0;border-bottom:1px solid #dbe2ec;break-inside:avoid}.task p,.review p{margin:6px 0}.review-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.rating{font-weight:bold;color:#92400e;white-space:nowrap}blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid #f97316;background:#fff7ed;color:#364152}a{color:#1d4ed8;overflow-wrap:anywhere}
      ${resumeDesign === 'classic' ? 'body{font-family:Georgia,serif;color:#202020}header{border-color:#334155}h1{font-family:Georgia,serif}.section-title{color:#334155;letter-spacing:.08em}.task{border-bottom:1px solid #cbd5e1}blockquote{border-color:#64748b;background:#f8fafc}' : ''}
      ${resumeDesign === 'minimal' ? 'body{font-family:Arial,sans-serif;color:#30343b;max-width:760px}header{border:0;padding-bottom:8px}h1{font-size:28px}.section-title{color:#30343b;letter-spacing:.04em}.task{border:0;padding:10px 0}blockquote{border:0;background:#f3f4f6}' : ''}
      @media print{body{margin:0 auto;padding:0 12mm}a{color:inherit;text-decoration:none}}
      </style></head><body><header><h1>${escapeHtml(name)}</h1><div class="contact">${escapeHtml(email)}</div></header><section><h2 class="section-title">Skills</h2><p>${skills}</p></section><section><h2 class="section-title">Startup reviews (${startupReviews.length})</h2>${startupReviewEntries || '<p>No startup reviews yet.</p>'}</section><section><h2 class="section-title">Submitted work (${submissions.length})</h2>${taskEntries || '<p>No submitted work yet.</p>'}</section><script>window.onload=()=>window.print()</script></body></html>`);
    resumeWindow.document.close();
  };

  return (
    <div className="student-dashboard min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white pt-32 pb-8 px-3 sm:px-6 lg:px-8">

      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <section className="animated-border-surface relative isolate overflow-hidden rounded-2xl border border-blue-700/70 border-t-4 border-t-orange-400 bg-gradient-to-br from-[#10264b] via-blue-950 to-[#080f20] p-4 shadow-md sm:rounded-[1.5rem] sm:p-7 sm:shadow-2xl">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 select-none font-black leading-none text-white/[0.035] text-[11rem] sm:text-[15rem]">01</div>
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300">Student Dashboard</p>
              <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">Explore company tasks and submit your work</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/75 sm:text-base">Only students can see tasks here. Companies will receive your submissions privately.</p>
            </div>
            <div className="relative grid w-full grid-cols-2 divide-x divide-white/15 sm:w-auto sm:min-w-[14rem] sm:grid-cols-1 sm:gap-3 sm:divide-x-0">
              <div className="rounded-xl border border-white/10 bg-[#07152d]/65 px-3 py-3 text-left first:pl-3 sm:rounded-2xl sm:bg-[#07152d]/80 sm:px-5 sm:py-4 sm:shadow-inner sm:shadow-black/20">
                <div className="text-[0.62rem] font-semibold uppercase leading-4 tracking-[0.1em] text-orange-300 sm:text-[0.68rem] sm:tracking-[0.16em]">Available tasks</div>
                <div className="mt-1.5 text-2xl font-black leading-none tabular-nums tracking-[-0.04em] text-white sm:mt-2 sm:text-5xl sm:tracking-[-0.06em]">{tasks.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#07152d]/65 px-3 py-3 text-left sm:rounded-2xl sm:bg-[#07152d]/80 sm:px-5 sm:py-4 sm:shadow-inner sm:shadow-black/20">
                <div className="text-[0.62rem] font-semibold uppercase leading-4 tracking-[0.1em] text-orange-300 sm:text-[0.68rem] sm:tracking-[0.16em]">Your submissions</div>
                <div className="mt-1.5 text-2xl font-black leading-none tabular-nums tracking-[-0.04em] text-white sm:mt-2 sm:text-5xl sm:tracking-[-0.06em]">{studentSubmissionCount}</div>
              </div>
            </div>
          </div>
        </section>

        <nav
          role="tablist"
          aria-label="Student dashboard pages"
          aria-orientation="horizontal"
          className="flex gap-2 rounded-2xl border border-white/10 bg-blue-950/70 p-2"
          onKeyDown={(event) => {
            const tabIds = ['student-tasks-tab', 'student-submissions-tab'];
            const currentIndex = tabIds.indexOf(document.activeElement?.id);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabIds.length - 1;
            else return;
            event.preventDefault();
            setActiveStudentTab(nextIndex === 0 ? 'tasks' : 'submissions');
            document.getElementById(tabIds[nextIndex])?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id="student-tasks-tab"
            aria-selected={activeStudentTab === 'tasks'}
            aria-controls="student-tasks-panel"
            tabIndex={activeStudentTab === 'tasks' ? 0 : -1}
            onClick={() => setActiveStudentTab('tasks')}
            className={`min-h-12 flex-1 rounded-xl px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
              activeStudentTab === 'tasks'
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="block">Available Tasks</span>
            <span className={`mt-0.5 block text-xs font-normal ${activeStudentTab === 'tasks' ? 'text-slate-900/80' : 'text-slate-400'}`}>
              Browse and submit to open tasks
            </span>
          </button>
          <button
            type="button"
            role="tab"
            id="student-submissions-tab"
            aria-selected={activeStudentTab === 'submissions'}
            aria-controls="student-submissions-panel"
            tabIndex={activeStudentTab === 'submissions' ? 0 : -1}
            onClick={() => setActiveStudentTab('submissions')}
            className={`min-h-12 flex-1 rounded-xl px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
              activeStudentTab === 'submissions'
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="block">Your Submissions</span>
            <span className={`mt-0.5 block text-xs font-normal ${activeStudentTab === 'submissions' ? 'text-slate-900/80' : 'text-slate-400'}`}>
              Review and manage your work
            </span>
          </button>
        </nav>

        <div
          id="student-tasks-panel"
          role="tabpanel"
          aria-labelledby="student-tasks-tab"
          tabIndex={0}
          hidden={activeStudentTab !== 'tasks'}
          className="space-y-6"
        >
        <section
          aria-labelledby="student-recommendation-title"
          className="relative isolate overflow-hidden rounded-[1.35rem] border border-orange-300/25 bg-gradient-to-br from-[#172a4a] via-[#101f38] to-[#0a1425] p-4 shadow-sm sm:p-6 sm:shadow-xl sm:shadow-black/20"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-orange-200/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-7 h-28 w-28 rounded-full border border-orange-200/10" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-orange-300">Opportunity spotlight</p>
                <h2 id="student-recommendation-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Recommended opportunity</h2>
              </div>
              {recommendedTask ? (
                <div className="flex items-baseline gap-2 rounded-xl border border-orange-200/20 bg-black/20 px-3 py-2 sm:rounded-xl sm:px-3 sm:py-2">
                  <span className="text-2xl font-extrabold tabular-nums tracking-tight text-orange-300">{recommendedTask.matchPercent}%</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-100/75">skill match</span>
                </div>
              ) : null}
            </div>

            {loading || profileSkillsLoading || submissionsLoading ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-sm text-blue-100/75 sm:px-4 sm:py-5" role="status">
                Finding an opportunity that fits your skills…
              </div>
            ) : submissionsLoadError ? (
              <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-950/20 px-3 py-3 text-sm leading-6 text-rose-100/85 sm:px-4 sm:py-5" role="status">
                Your previous applications couldn't be checked, so we can't confirm which tasks are still available to you. You can still browse open tasks below.
              </div>
            ) : recommendedTask ? (
              <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-blue-100/65">
                    <span className="font-semibold text-orange-200">{recommendedTask.task.categoryLabel || recommendedTask.task.category || 'Startup task'}</span>
                    <span>· {recommendedTask.task.startupName || recommendedTask.task.companyName || 'Startup'}</span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold leading-snug text-white sm:text-2xl">{recommendedTask.task.title}</h3>
                  {recommendedTask.task.description ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-blue-100/75">
                      {recommendedTask.task.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1 text-xs font-semibold text-orange-100">
                      {recommendedTask.fitTier}
                    </span>
                    <p className="text-sm leading-5 text-blue-100/75">{recommendedTask.rationale}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-semibold text-blue-100/60">Your matching skills</span>
                    {recommendedTask.matchingSkills.slice(0, 4).map((skill) => (
                      <span key={skill} className="rounded-full border border-orange-300/25 bg-orange-300/10 px-3 py-1 text-xs font-semibold text-orange-100">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div
                    className="mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/10"
                    role="img"
                    aria-label={`${recommendedTask.matchPercent}% of the task's listed skills match your profile`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-200"
                      style={{ width: `${recommendedTask.matchPercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <button
                    type="button"
                    onClick={() => openTaskModal(recommendedTask.task)}
                    className="min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200"
                  >
                    Submit work
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingTaskDescription(recommendedTask.task)}
                    className="min-h-11 rounded-xl border border-blue-700/70 bg-blue-950/60 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-orange-300/60 hover:text-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                  >
                    View task details
                  </button>
                </div>
              </div>
            ) : profileSkillsError ? (
              <div className="mt-4 border-0 bg-transparent px-0 py-3 text-sm leading-6 text-rose-100/85 sm:rounded-xl sm:border sm:border-rose-300/20 sm:bg-rose-950/20 sm:px-4 sm:py-5" role="status">
                Your skill profile couldn't be loaded, so we can't make a reliable recommendation right now. You can still browse all open tasks below.
              </div>
            ) : !profileSkills.length ? (
              <div className="mt-4 border-0 bg-transparent px-0 py-3 text-sm leading-6 text-blue-100/75 sm:rounded-xl sm:border sm:border-dashed sm:border-blue-500/35 sm:bg-blue-950/30 sm:px-4 sm:py-5">
                No skills are listed in your student profile yet. Add your skills to get a tailored opportunity match.
              </div>
            ) : eligibleTasks.length === 0 ? (
              <div className="mt-4 border-0 bg-transparent px-0 py-3 text-sm leading-6 text-blue-100/75 sm:rounded-xl sm:border sm:border-dashed sm:border-blue-500/35 sm:bg-blue-950/30 sm:px-4 sm:py-5">
                There are no eligible open tasks to recommend right now. Check back as startups publish new opportunities.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-blue-500/35 bg-blue-950/30 px-4 py-5 text-sm leading-6 text-blue-100/75">
                None of the eligible tasks has a meaningful match with your listed skills yet. You can still explore every task below.
              </div>
            )}
          </div>
        </section>

        <section className="animated-border-surface rounded-2xl border border-blue-700/50 border-t-2 border-t-orange-400 bg-[#0a1931]/75 p-3.5 shadow-sm sm:rounded-[1.25rem] sm:bg-[#0a1931]/85 sm:p-6 sm:shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-white sm:text-2xl">Browse tasks</h2>
            <div className="flex flex-wrap gap-2">
              {taskCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:px-4 sm:text-sm ${currentFilter === category ? 'bg-orange-500 text-slate-950' : 'border border-blue-700/70 bg-blue-950/80 text-blue-100 hover:border-blue-500 hover:bg-blue-900'}`}
                  onClick={() => setCurrentFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
{loading ? (
              <div className="col-span-3 rounded-2xl border border-blue-800/70 bg-blue-950/60 p-8 text-center text-blue-100/75">Loading tasks…</div>
            ) : filteredTasks.length === 0 ? (
              <div className="col-span-3 rounded-2xl border border-dashed border-blue-700/70 bg-blue-950/50 p-8 text-center text-blue-100/75">No tasks match this filter yet.</div>
            ) : (
              filteredTasks.map((task) => {
                const deadlineAt = getTaskDeadlineAt(task);
                const deadlineFinished = deadlineAt !== null && deadlineAt <= currentTime;
                const deadlineUnavailable = deadlineAt === null || !hasStoredTaskDeadline(task);
                return (
              <div
                key={task.id}
                  className="group rounded-xl border border-blue-800/70 bg-[#09162c]/75 p-3.5 shadow-sm transition duration-200 hover:border-blue-500/70 hover:bg-blue-950/70 sm:rounded-2xl sm:bg-[#09162c]/90 sm:p-6 sm:shadow-lg"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full border border-blue-700/70 bg-blue-950/80 px-3 py-1 text-xs uppercase tracking-[0.16em] text-blue-100">{task.categoryLabel}</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${deadlineFinished || deadlineUnavailable ? 'border border-red-400/40 bg-red-950/50 text-red-100' : task.urgent ? 'bg-orange-500 text-slate-950' : 'border border-blue-700/70 bg-blue-950/80 text-blue-100'}`}
                    >
                      {deadlineFinished ? 'Deadline finished' : deadlineUnavailable ? 'Deadline unavailable' : task.deadline}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-white">{task.title}</h3>
                  {deadlineFinished || deadlineUnavailable ? (
                    <p role="status" className="mt-3 rounded-xl border border-red-400/30 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                      {deadlineFinished
                        ? 'The deadline has finished. Submissions are closed.'
                        : hasStoredTaskDeadline(task)
                          ? 'The submission deadline is unavailable. Submissions are closed.'
                          : 'This task deadline is being prepared. Submissions are paused; please try again shortly.'}
                    </p>
                  ) : null}
                  {formatTaskDeadline(task) ? (
                    <p className="mt-2 text-xs text-blue-100/65">Due {formatTaskDeadline(task)}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-xs leading-5 text-blue-100/65">
                    <span>{task.prize}</span>
                    <span>{task.participants || 0} submissions</span>
                    <span>{normalizeSkills(task.skills).join(', ')}</span>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={deadlineFinished || deadlineUnavailable}
                      onClick={() => openTaskModal(task)}
                      className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deadlineFinished ? 'Deadline finished' : deadlineUnavailable ? 'Submission unavailable' : 'Submit work'}
                    </button>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 [overflow-wrap:anywhere] rounded-full border border-blue-700/70 bg-blue-950/80 px-3 py-2 text-xs text-blue-100">
                        {task.startupName || task.companyName || 'Startup'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewingTaskDescription(task)}
                      className="rounded-xl border border-blue-700/70 bg-blue-950/80 px-4 py-3 text-sm font-semibold text-white transition hover:border-orange-400 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                    >
                      View description
                    </button>
                  </div>
                </div>
                  );
                })
            )}
          </div>
        </section>

        </div>

        <div
          id="student-submissions-panel"
          role="tabpanel"
          aria-labelledby="student-submissions-tab"
          tabIndex={0}
          hidden={activeStudentTab !== 'submissions'}
          className="space-y-6"
        >
        <section className="animated-border-surface rounded-2xl border border-blue-700/50 border-t-2 border-t-orange-400 bg-[#0a1931]/75 p-3.5 shadow-sm sm:rounded-[1.25rem] sm:bg-[#0a1931]/85 sm:p-6 sm:shadow-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-white sm:text-2xl">Your submissions</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-blue-700/70 bg-blue-950/80 px-3 py-2 text-xs text-blue-100 sm:px-4 sm:text-sm">{studentSubmissionCount} results</span>
              <label className="flex items-center gap-2 text-xs text-blue-100 sm:text-sm">
                <span className="sr-only">Resume design</span>
                <select
                  value={resumeDesign}
                  onChange={(event) => setResumeDesign(event.target.value)}
                  aria-label="Resume design"
                  className="rounded-xl border border-blue-700/70 bg-blue-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400 sm:text-sm"
                >
                  <option value="modern">Modern</option>
                  <option value="classic">Classic</option>
                  <option value="minimal">Minimal</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-blue-100 sm:text-sm">
                <span>Background</span>
                <input
                  type="color"
                  value={resumeBackground}
                  onChange={(event) => setResumeBackground(event.target.value)}
                  aria-label="Resume background color"
                  title="Choose resume background color"
                  className="h-9 w-10 cursor-pointer rounded-lg border border-blue-700/70 bg-blue-950 p-1"
                />
              </label>
              <button
                type="button"
                onClick={downloadResume}
                className="rounded-2xl bg-orange-500 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
              >
                Download resume
              </button>
              {studentSubmissionCount > 0 ? (
                <button
                  type="button"
                  disabled={deletingAllSubmissions}
                  onClick={deleteAllSubmissions}
                  className="rounded-2xl border border-red-500/40 bg-red-500/10 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {deletingAllSubmissions ? 'Deleting all...' : 'Delete all'}
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-8 space-y-4">
            {submissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-700/70 bg-blue-950/50 p-6 text-center text-blue-100/75 sm:p-8">You haven't submitted to any tasks yet.</div>
            ) : (
              submissions.map((submission) => (
                <div key={submission.id} className="rounded-xl border border-blue-800/70 bg-[#09162c]/75 p-3.5 transition-colors hover:border-blue-600/70 sm:rounded-2xl sm:bg-[#09162c]/90 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                      <div className="text-sm text-blue-100/70">{submission.taskTitle}</div>
                      
                      <div className="mt-1 text-base font-bold text-white sm:text-lg">{submission.type === 'link' ? 'Link submission' : submission.type === 'text' ? 'Text submission' : 'File submission'}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        role="status"
                        className={`rounded-full border px-2 py-1 text-xs font-semibold sm:px-3 sm:py-2 ${
                          submission.selectedByCompany
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
                        }`}
                      >
                        {submission.selectedByCompany ? 'Selected' : 'Not selected'}
                      </span>
                      <span className="rounded-full border border-blue-700/70 bg-blue-950/80 px-2 py-1 text-xs text-blue-100 sm:px-3 sm:py-2">{formatSubmissionDate(submission)}</span>
                    </div>
                  </div>
                  <div className="mt-4 text-sm leading-6 text-blue-100/75">
                    {submission.type === 'link' && (
                      <a href={submission.url} target="_blank" rel="noreferrer" className="text-orange-300 hover:text-orange-400 underline break-all">{submission.url}</a>
                    )}
                    {submission.type === 'text' && <p className="whitespace-pre-line">{submission.text}</p>}
                    {submission.type === 'file' && <p>{submission.files?.length || 0} file submitted</p>}
                  </div>
                  {submission.selectedByCompany && hasCashReward(tasks.find((task) => task.id === submission.taskId)) ? (
                    <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
                      <p>Your cash reward will be provided shortly.</p>
                      <p>
                        To receive it, please share your bank details with SkillStreet at{' '}
                        <a
                          href="mailto:support.skillstreet@gmail.com?subject=Bank%20details%20for%20selected%20cash%20reward"
                          className="font-semibold text-orange-300 underline hover:text-orange-200"
                        >
                          support.skillstreet@gmail.com
                        </a>.
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => openViewSubmission(submission)}
                      className="rounded-xl border border-blue-700/70 bg-blue-950/80 px-3 py-2 text-xs font-semibold text-white transition hover:border-blue-500 hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:px-4 sm:text-sm"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditSubmission(submission)}
                      className="rounded-xl border border-orange-400 bg-orange-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:px-4 sm:text-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletingSubmissionId === submission.id}
                      onClick={() => deleteSubmissionEntry(submission)}
                      className="rounded-2xl border border-red-500/40 bg-red-500/10 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {deletingSubmissionId === submission.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        </div>
      </div>

      {viewingTaskDescription ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={(event) => event.target === event.currentTarget && setViewingTaskDescription(null)}>
          <div className="mobile-dialog-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-blue-900/95 border border-blue-800/60 p-4 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Task description</p>
                <h3 className="mt-3 text-2xl font-bold text-white">{viewingTaskDescription.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{viewingTaskDescription.startupName || viewingTaskDescription.companyName || 'Startup'} - {viewingTaskDescription.categoryLabel}</p>
              </div>
              <button type="button" onClick={() => setViewingTaskDescription(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-300" aria-label="Close task description">×</button>
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-blue-900/60 border border-blue-800/60 p-5">
              <p className="whitespace-pre-line text-sm leading-6 text-slate-200">{viewingTaskDescription.description}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{viewingTaskDescription.deadline} deadline</span>
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{viewingTaskDescription.prize}</span>
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{normalizeSkills(viewingTaskDescription.skills).join(', ') || 'General'}</span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTask ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 sm:px-4 sm:py-6" onClick={(event) => event.target === event.currentTarget && closeTaskModal()}>
          <div className="mobile-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] bg-blue-900/95 border border-blue-800/60 backdrop-blur-sm p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Submit work</p>
                <h3 className="mt-3 text-2xl font-bold">{activeTask.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{activeTask.startupName || activeTask.companyName || 'Startup'} · {activeTask.categoryLabel}</p>
              </div>
              <button type="button" onClick={closeTaskModal} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-300" aria-label="Close submission form">×</button>
            </div>
            <div className="mt-4 rounded-[1.25rem] bg-blue-900/60 border border-blue-800/60 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-blue-900/50 p-3 text-sm text-white">
                  <div className="text-xs uppercase tracking-[0.2em]">Deadline</div>
                  <div className="mt-2 text-white">{formatTaskDeadline(activeTask) || activeTask.deadline}</div>
                </div>
                <div className="rounded-xl bg-blue-900/50 p-3 text-sm text-white">
                  <div className="text-xs uppercase tracking-[0.2em]">Reward</div>
                  <div className="mt-2 text-white">{activeTask.prize}</div>
                </div>
                <div className="rounded-xl bg-blue-900/50 p-3 text-sm text-white">
                  <div className="text-xs uppercase tracking-[0.2em]">Current entries</div>
                  <div className="mt-2 text-white">{activeTask.participants || 0}</div>
                </div>
              </div>
            </div>
            {getTaskDeadlineAt(activeTask) === null || !hasStoredTaskDeadline(activeTask) || isTaskDeadlinePassed(activeTask, currentTime) ? (
              <div role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100">
                {getTaskDeadlineAt(activeTask) === null
                  ? 'The submission deadline is unavailable. Please contact the company.'
                  : isTaskDeadlinePassed(activeTask, currentTime)
                    ? 'The deadline has finished. Submissions are closed.'
                    : 'This task deadline is being prepared. Submissions are paused; please try again shortly.'}
              </div>
            ) : null}
            {getTaskDeadlineAt(activeTask) !== null && hasStoredTaskDeadline(activeTask) && !isTaskDeadlinePassed(activeTask, currentTime) ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Your name</label>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full rounded-xl border-2 border-blue-800/60 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  placeholder="Your full name"
                  type="text"
                />
              </div>

              
              <div className="flex flex-wrap gap-2">
                {['link', 'text', 'file'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveSubmitTab(type)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${activeSubmitTab === type ? 'bg-orange-500 text-slate-950' : 'bg-blue-900/60 border border-blue-800/60 text-white hover:bg-blue-800'}`}
                  >
                    {type === 'link' ? 'Link' : type === 'text' ? 'Text' : 'File'}
                  </button>
                ))}
              </div>
              {activeSubmitTab === 'link' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Submission link</label>
<input
                    value={linkValue}
                    onChange={(e) => setLinkValue(e.target.value)}
                    placeholder="Paste a project link or portfolio URL"
                    className="w-full rounded-xl border-2 border-blue-800/60 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    type="url"
                  />
                </div>
              )}
              {activeSubmitTab === 'text' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Submission details</label>
<textarea
                    rows={3}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="Describe your work and what you submitted."
                    className="w-full rounded-xl border-2 border-blue-800/60 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              )}
              {activeSubmitTab === 'file' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Upload files</label>
<label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-blue-800/60 border-dashed bg-blue-900/30 px-4 py-4 text-center text-slate-300 transition hover:border-orange-400 hover:bg-blue-900/50">
                    <input type="file" multiple className="sr-only" onChange={handleFileSelect} />
                    Select files to upload
                  </label>
                  <p className="text-xs text-slate-400">File size must not exceed 200 MB.</p>
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-2xl bg-blue-900/50 px-4 py-3 text-sm text-white">
                        <span>{file.name}</span>
                        <button type="button" className="text-orange-300 hover:text-orange-200" onClick={() => removeFile(index)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-blue-800/60 bg-blue-900/50 text-orange-400 focus:ring-orange-400"
                />
                <span className="text-sm text-slate-300">
                  I agree to the <Link to="/terms" className="text-orange-300 hover:text-orange-400 underline">Terms and Conditions</Link> and <Link to="/privacy" className="text-orange-300 hover:text-orange-400 underline">Privacy Policy</Link>
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting || isTaskDeadlinePassed(activeTask, currentTime)}
                  onClick={submitTaskEntry}
                  className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="rounded-xl border border-blue-800/60 bg-blue-900 px-5 py-2.5 text-sm text-white transition hover:border-orange-400"
                >
                  Cancel
                </button>
              </div>
            </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingSubmission ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 sm:px-4 sm:py-6" onClick={(event) => event.target === event.currentTarget && closeEditSubmission()}>
          <div className="mobile-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-blue-800/60 bg-blue-950/95 p-4 sm:p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Edit submission</p>
                <h3 className="mt-2 text-xl sm:text-2xl font-bold text-white">{editingSubmission.taskTitle}</h3>
                <p className="mt-1 text-sm text-slate-400">Update the work you sent for this task.</p>
              </div>
              <button type="button" onClick={closeEditSubmission} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-400" aria-label="Close edit submission">×</button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {['link', 'text', 'file'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditSubmitTab(type)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${editSubmitTab === type ? 'bg-orange-500 text-slate-950' : 'bg-blue-900/60 border border-blue-800/60 text-white hover:bg-blue-800'}`}
                  >
                    {type === 'link' ? 'Link' : type === 'text' ? 'Text' : 'File'}
                  </button>
                ))}
              </div>

              {editSubmitTab === 'link' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Submission link</label>
                  <input
                    value={editLinkValue}
                    onChange={(e) => setEditLinkValue(e.target.value)}
                    placeholder="Paste a project link or portfolio URL"
                    className="w-full rounded-xl border-2 border-blue-800/60 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    type="url"
                  />
                </div>
              )}

              {editSubmitTab === 'text' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Submission details</label>
                  <textarea
                    rows={3}
                    value={editTextValue}
                    onChange={(e) => setEditTextValue(e.target.value)}
                    placeholder="Describe your work and what you submitted."
                    className="w-full rounded-xl border-2 border-blue-800/60 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              )}

              {editSubmitTab === 'file' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Submitted files</label>
                  <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border-2 border-blue-800/60 border-dashed bg-blue-900/30 px-4 py-4 text-center text-slate-300 transition hover:border-orange-400 hover:bg-blue-900/50">
                    <input type="file" multiple className="sr-only" onChange={handleEditFileSelect} />
                    Add files
                  </label>
                  <p className="text-xs text-slate-400">File size must not exceed 200 MB.</p>
                  <div className="space-y-2">
                    {editSelectedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-900/50 px-4 py-3 text-sm text-white">
                        <span className="break-all">{file.name}</span>
                        <div className="flex gap-3">
                          {file.fileId ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await downloadProtectedFile(file.fileId, editingSubmission.id, file.name);
                                } catch (error) {
                                  console.error('Download error:', error);
                                  showToast('Cannot download file right now.');
                                }
                              }}
                              className="rounded-lg border border-orange-400 bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                            >
                              Download
                            </button>
                          ) : null}
                          <button type="button" className="text-red-200 hover:text-red-100" onClick={() => removeEditFile(index)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAgreedToTerms}
                  onChange={(e) => setEditAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-blue-800/60 bg-blue-900/50 text-orange-400 focus:ring-orange-400"
                />
                <span className="text-sm text-slate-300">
                  I agree to the <Link to="/terms" className="text-orange-300 hover:text-orange-400 underline">Terms and Conditions</Link> and <Link to="/privacy" className="text-orange-300 hover:text-orange-400 underline">Privacy Policy</Link>
                </span>
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={updateSubmissionEntry}
                  className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingEdit ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={closeEditSubmission}
                  className="rounded-xl border border-blue-800/60 bg-blue-900 px-5 py-2.5 text-sm text-white transition hover:border-orange-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewingSubmission ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={(event) => event.target === event.currentTarget && closeViewSubmission()}>
          <div className="mobile-dialog-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-blue-800/60 bg-blue-950/95 p-4 sm:p-8 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">View submission</p>
                <h3 className="mt-3 text-2xl font-bold text-white">{viewingSubmission.taskTitle}</h3>
                <p className="mt-2 text-sm text-slate-400">{formatSubmissionDate(viewingSubmission)}</p>
              </div>
              <button type="button" onClick={closeViewSubmission} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-400" aria-label="Close submission details">×</button>
            </div>

            <div className="mt-6 rounded-[1.5rem] bg-blue-900/90 p-5 text-sm text-slate-300">
              {viewingSubmission.type === 'link' && (
                <a href={viewingSubmission.url} target="_blank" rel="noreferrer" className="break-all text-orange-300 underline hover:text-orange-400">
                  {viewingSubmission.url}
                </a>
              )}

              {viewingSubmission.type === 'text' && (
                <p className="whitespace-pre-line leading-6">{viewingSubmission.text}</p>
              )}

              {viewingSubmission.type === 'file' && (
                <div className="space-y-3">
                  {viewingSubmission.files?.length > 0 ? (

                    viewingSubmission.files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-950/80 p-4">
                        <span className="break-all">{file.name}</span>
                        {(() => {
                          const url = downloadUrls[file.fileId];
                          if (url) {
                            return (
                              <div className="flex gap-3">
                                <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-700/70 bg-blue-900/80 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-800">
                                  View
                                </a>
                                <a href={url} download={file.name} className="rounded-lg border border-orange-400 bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-orange-400">
                                  Download
                                </a>
                              </div>
                            );
                          }

                          if (file.fileId) {
                            return (
                              <button
                                type="button"
                                onClick={() => fetchDownloadUrl(file.fileId, viewingSubmission.id)}
                                className="rounded-lg border border-orange-400 bg-orange-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                              >
                                Get download link
                              </button>
                            );
                          }

                          return null;
                        })()}
                      </div>
                    ))
                  ) : (
                    <p>No files are attached to this submission.</p>
                  )}

                </div>
              )}
            </div>

            {viewingSubmission.selectedByCompany && viewingSubmission.selectedFiles?.length > 0 ? (
              <section className="mt-5 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-950/30 p-5">
                <h4 className="font-semibold text-emerald-200">Files shared by the startup</h4>
                <p className="mt-1 text-sm text-slate-300">Download the files attached to your selected submission.</p>
                <ul className="mt-3 space-y-2">
                  {viewingSubmission.selectedFiles.map((file, index) => (
                    <li
                      key={`${file.fileId || file.name}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-950/70 p-3"
                    >
                      <span className="break-all text-sm text-white">{file.name || 'Shared file'}</span>
                      {file.fileId ? (
                        <button
                          type="button"
                          onClick={() => downloadSelectionFile(file, viewingSubmission)}
                          className="rounded-full border border-orange-400 bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                        >
                          Download
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Download unavailable</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  openEditSubmission(viewingSubmission);
                  closeViewSubmission();
                }}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={deletingSubmissionId === viewingSubmission.id}
                onClick={() => deleteSubmissionEntry(viewingSubmission)}
                className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deletingSubmissionId === viewingSubmission.id ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={closeViewSubmission}
                className="rounded-2xl border border-blue-800/60 bg-blue-900 px-5 py-3 text-sm text-white transition hover:border-orange-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast.visible ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(90%,28rem)] -translate-x-1/2 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-2xl shadow-black/40">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
