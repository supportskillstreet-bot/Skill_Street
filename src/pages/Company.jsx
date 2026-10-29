import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, getDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { authenticatedFetch, downloadProtectedFile } from '../utils/api.js';
import { formatTaskDeadline, getDeadlineExtension, getTaskDeadlineAt } from '../utils/taskDeadline.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const SKILLS_LIST = [
  'Figma', 'React', 'Node.js', 'Python', 'Canva', 'Writing', 'SEO', 'Sales', 'UI/UX', 'Data Analysis', 'Video Editing', 'Social Media'
];

const TASK_STARTER_TEMPLATES = {
  design: {
    category: 'Design',
    title: (topic) => `Design challenge: ${topic}`,
    skills: ['Figma', 'UI/UX'],
    description: (topic) => `Create a thoughtful design approach for ${topic}. Share a short explanation of the user need and design direction, then provide a wireframe or polished visual concept. Include any key assumptions and make the layout clear and accessible.`
  },
  tech: {
    category: 'Tech',
    title: (topic) => `Tech prototype: ${topic}`,
    skills: ['React', 'Node.js'],
    description: (topic) => `Build a focused prototype that addresses ${topic}. Outline the approach, deliver a working implementation or demo, and add brief setup and usage notes. Call out assumptions or limitations so the next steps are easy to understand.`
  },
  content: {
    category: 'Content',
    title: (topic) => `Content brief: ${topic}`,
    skills: ['Writing', 'Social Media'],
    description: (topic) => `Develop a clear content piece for ${topic}. Identify the intended audience and tone, then provide a ready-to-review draft with a strong opening and call to action. Add a short note explaining the message and any channel-specific choices.`
  },
  sales: {
    category: 'Sales',
    title: (topic) => `Sales challenge: ${topic}`,
    skills: ['Sales', 'Writing'],
    description: (topic) => `Create a practical sales approach for ${topic}. Define the target customer and value proposition, then prepare a concise outreach message or sequence. Include one likely objection with a response and a simple way to measure success.`
  }
};

const CATEGORY_LABELS = {
  design: 'Design',
  tech: 'Tech',
  content: 'Content',
  sales: 'Sales'
};

const getCategoryDisplayName = (value) => {
  if (!value) return 'General';
  const trimmedValue = String(value).trim();
  if (!trimmedValue) return 'General';
  const normalizedKey = trimmedValue.toLowerCase();
  return CATEGORY_LABELS[normalizedKey] || trimmedValue;
};

const SELECTION_PAYMENT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSebPhtsDN3cDizzGLOmKrqawGIARuaHpPp-iBfuUpAUBGEVKQ/viewform?usp=publish-editor';

const formatDateInput = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formatTimeInput = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const getFormDeadline = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) return null;
  return date;
};

const getTime = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};

const sortByNewest = (items, field) => [...items].sort((a, b) => getTime(b[field]) - getTime(a[field]));

const readHiddenSubmissionIds = (uid) => {
  if (!uid || typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(`hiddenSubmissions:${uid}`) || '[]');
  } catch (error) {
    console.error('Hidden submission read error:', error);
    return [];
  }
};

const visibleSubmissions = (items, uid) =>
  items.filter((submission) => {
    const hiddenIdSet = new Set(readHiddenSubmissionIds(uid));
    if (submission.deletedByStudent || hiddenIdSet.has(submission.id)) return false;
    return true;
  });

const mergeSubmissions = (items, uid) => {
  const byId = new Map();
  visibleSubmissions(items, uid).forEach((submission) => {
    byId.set(submission.id, submission);
  });
  return sortByNewest([...byId.values()], 'submittedAt');
};

const createInitialForm = () => {
  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    deadlineDate: formatDateInput(defaultDeadline),
    deadlineTime: formatTimeInput(defaultDeadline),
    maxWinners: '1',
    prize: '1500',
    category: '',
    urgent: 'no',
    skills: [],
    rewardTypes: [],
    startupName: ''
  };
};

export default function Company({ user }) {
  const [tasks, setTasks] = useState([]);
  const [companySubmissions, setCompanySubmissions] = useState([]);
  const [taskScopedSubmissions, setTaskScopedSubmissions] = useState([]);
  const [activePage, setActivePage] = useState('tasks');
  const [studentUsers, setStudentUsers] = useState({});
  const [formValues, setFormValues] = useState(createInitialForm);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [viewingTaskDescription, setViewingTaskDescription] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedSubmissionFiles, setSelectedSubmissionFiles] = useState([]);
  const [selectionFeedback, setSelectionFeedback] = useState('');
  const [selectionRating, setSelectionRating] = useState(0);
  const [paymentAdded, setPaymentAdded] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState('');
  const [extendingDeadlineTaskId, setExtendingDeadlineTaskId] = useState('');
  const [deadlineExtensionDays, setDeadlineExtensionDays] = useState('7');
  const [extendingDeadline, setExtendingDeadline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [taskStarterPrompt, setTaskStarterPrompt] = useState('');
  const [toast, setToast] = useState({ message: '', visible: false });
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [tasksError, setTasksError] = useState(false);
  const [submissionsError, setSubmissionsError] = useState(false);

  useEffect(() => {
    const taskQuery = query(
      collection(db, 'tasks'),
      where('companyId', '==', user.uid)
    );
    const submissionsQuery = query(
      collection(db, 'submissions'),
      where('companyId', '==', user.uid)
    );

    const unsubscribeTasks = onSnapshot(
      taskQuery,
      (snapshot) => {
        const nextTasks = snapshot
          .docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((t) => !t.deleted && !t.isDeleted);
        setTasks(sortByNewest(nextTasks, 'createdAt'));
        setViewingTaskDescription((current) => current
          ? nextTasks.find((task) => task.id === current.id) || null
          : current);
        nextTasks
          .filter((task) => !task.deadlineAt)
          .forEach(async (task) => {
            const deadlineAt = getTaskDeadlineAt(task);
            if (deadlineAt === null) {
              console.error(`Cannot migrate task deadline: task ${task.id} has no valid creation date or deadline.`);
              return;
            }
            try {
              await updateDoc(doc(db, 'tasks', task.id), { deadlineAt: new Date(deadlineAt) });
            } catch (error) {
              console.error(`Task deadline migration failed for ${task.id}:`, error);
            }
          });
        setTasksError(false);
        setLoading(false);
      },
      (error) => {
        console.error('Task fetch error:', error);
        setTasksError(true);
        setLoading(false);
      }
    );

    const unsubscribeCompanySubmissions = onSnapshot(
      submissionsQuery,
      async (snapshot) => {
        const submissions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        console.log('Company submissions fetched:', submissions);
        setCompanySubmissions(submissions);
        setSubmissionsLoading(false);
        setSubmissionsError(false);

        // Fetch student user data for each submission
        const studentIds = [...new Set(submissions.map(s => s.studentId))];
        console.log('Student IDs to fetch:', studentIds);
        const studentData = {};
        await Promise.all(studentIds.map(async (studentId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', studentId));
            if (userDoc.exists()) {
              studentData[studentId] = userDoc.data();
              console.log('Student data fetched for', studentId, ':', userDoc.data());
            } else {
              console.log('No student data found for', studentId);
            }
          } catch (error) {
            console.error('Error fetching student data for', studentId, ':', error);
          }
        }));
        console.log('Final student data:', studentData);
        setStudentUsers(studentData);
      },
      (error) => {
        console.error('Company submission fetch error:', error);
        setSubmissionsLoading(false);
        setSubmissionsError(true);
      }
    );

    return () => {
      unsubscribeTasks();
      unsubscribeCompanySubmissions();
    };
  }, [user.uid]);

  useEffect(() => {
    if (tasks.length === 0) {
      setTaskScopedSubmissions([]);
      return undefined;
    }

    const taskIds = tasks.map((task) => task.id);
    const unsubscribeByTask = taskIds.map((taskId) => {
      const submissionsQuery = query(
        collection(db, 'submissions'),
        where('taskId', '==', taskId)
      );

      return onSnapshot(
        submissionsQuery,
        (snapshot) => {
          const taskSubmissions = visibleSubmissions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), user.uid);
          console.log('Task submissions for taskId', taskId, ':', taskSubmissions);
          setTaskScopedSubmissions((current) => {
            const otherTaskSubmissions = current.filter((submission) => submission.taskId !== taskId);
            return sortByNewest([...otherTaskSubmissions, ...taskSubmissions], 'submittedAt');
          });
        },
        (error) => {
          console.error('Submission fetch error:', error);
        }
      );
    });

    return () => {
      unsubscribeByTask.forEach((unsubscribe) => unsubscribe());
    };
  }, [tasks]);

  const submissions = useMemo(
    () => {
      const merged = mergeSubmissions([...companySubmissions, ...taskScopedSubmissions], user.uid);
      console.log('Merged submissions:', merged);
      console.log('Company submissions count:', companySubmissions.length);
      console.log('Task scoped submissions count:', taskScopedSubmissions.length);
      return merged;
    },
    [companySubmissions, taskScopedSubmissions, user.uid]
  );

  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const selectedSubmissionTask = selectedSubmission
    ? tasks.find((task) => task.id === selectedSubmission.taskId)
    : null;
  const taskSubmissionCounts = useMemo(
    () =>
      submissions.reduce((counts, submission) => {
        if (!submission.taskId) return counts;
        return { ...counts, [submission.taskId]: (counts[submission.taskId] || 0) + 1 };
      }, {}),
    [submissions]
  );
  const taskSubmissionTotal = tasks.reduce(
    (total, task) => total + (taskSubmissionCounts[task.id] || 0),
    0
  );
  const selectedSubmissionCount = submissions.filter((submission) => submission.selectedByCompany).length;
  const taskSubmissions = useMemo(
    () => submissions.filter((submission) => submission.taskId === selectedTaskId),
    [submissions, selectedTaskId]
  );

  const showToast = (message) => {
    setToast({ message, visible: true });
    window.clearTimeout(window.toastTimer);
    window.toastTimer = window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3200);
  };

  const handleFormChange = (field, value) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const applyOfflineTaskStarter = () => {
    const prompt = taskStarterPrompt.trim();
    if (!prompt) {
      showToast('Tell us what you need help with before using a task template.');
      return;
    }

    const category = String(formValues.category || '').trim();
    if (!category) {
      showToast('Enter a task category before using a task template.');
      return;
    }

    const topic = prompt.replace(/[.!?]+$/, '');
    if (!topic.trim()) {
      showToast('Add a few words about the task so the template has useful context.');
      return;
    }
    const categoryKey = category.toLowerCase();
    const template = TASK_STARTER_TEMPLATES[categoryKey] || {
      category,
      title: (taskTopic) => `${category} task: ${taskTopic}`,
      description: (taskTopic) => `Help us with ${taskTopic} in the ${category} area. Explain your approach, complete the key deliverables, and share a brief summary of your decisions and any assumptions. Make your work clear and ready for review.`,
      skills: []
    };
    const relevantSkills = template.skills.filter((skill) => SKILLS_LIST.includes(skill));
    setFormValues((current) => ({
      ...current,
      title: template.title(topic),
      description: template.description(topic),
      category: current.category.trim() ? current.category : template.category,
      skills: [...new Set([...current.skills, ...relevantSkills])]
    }));
    showToast('Offline template added. Review and edit the task details before publishing.');
  };

  const toggleSkill = (skill) => {
    setFormValues((current) => ({
      ...current,
      skills: current.skills.includes(skill)
        ? current.skills.filter((item) => item !== skill)
        : [...current.skills, skill]
    }));
  };

  const addCustomSkill = () => {
    const trimmedSkill = customSkillInput.trim();
    if (!trimmedSkill) return;

    setFormValues((current) => {
      const nextSkills = current.skills.includes(trimmedSkill)
        ? current.skills
        : [...current.skills, trimmedSkill];

      return { ...current, skills: nextSkills };
    });
    setCustomSkillInput('');
  };

  const toggleReward = (reward) => {
    setFormValues((current) => ({
      ...current,
      rewardTypes: current.rewardTypes.includes(reward)
        ? current.rewardTypes.filter((item) => item !== reward)
        : [...current.rewardTypes, reward]
    }));
  };

  const getPrizeInputValue = (prize) => {
    if (!prize) return '';
    const digits = String(prize).match(/\d+/g);
    return digits ? digits.join('') : String(prize).replace(/^Rs\s*/i, '');
  };

  const startEditingTask = (task) => {
    setEditingTaskId(task.id);
    setFormValues({
      title: task.title || '',
      description: task.description || '',
      deadlineDate: formatDateInput(new Date(getTaskDeadlineAt(task) ?? Date.now())),
      deadlineTime: formatTimeInput(new Date(getTaskDeadlineAt(task) ?? Date.now())),
      maxWinners: String(task.maxWinners || 1),
      prize: getPrizeInputValue(task.prize),
      category: task.category || task.categoryLabel || '',
      urgent: task.urgent ? 'yes' : 'no',
      skills: task.skills || [],
      rewardTypes: task.rewardTypes || [],
      startupName: task.startupName || ''
    });
    setAgreedToTerms(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const extendTaskDeadline = async (task) => {
    const extraDays = Number(deadlineExtensionDays);
    if (!Number.isSafeInteger(extraDays) || extraDays < 1) {
      showToast('Enter a whole number of at least 1 day.');
      return;
    }

    setExtendingDeadline(true);
    try {
      const extension = getDeadlineExtension(task, extraDays);
      if (!Number.isFinite(extension.deadlineAt.getTime())) {
        showToast('The requested deadline is too far in the future.');
        return;
      }
      await updateDoc(doc(db, 'tasks', task.id), {
        ...extension,
        updatedAt: serverTimestamp()
      });
      setTasks((current) => current.map((item) =>
        item.id === task.id ? { ...item, ...extension } : item
      ));
      setExtendingDeadlineTaskId('');
      showToast(`Deadline increased by ${extraDays} ${extraDays === 1 ? 'day' : 'days'}.`);
    } catch (error) {
      console.error('Increase task deadline error:', error);
      showToast('Unable to increase the task deadline right now.');
    } finally {
      setExtendingDeadline(false);
    }
  };

  const cancelEditingTask = () => {
    setEditingTaskId(null);
    setFormValues(createInitialForm());
    setAgreedToTerms(false);
  };

  const publishTask = async () => {
    if (!formValues.title.trim()) {
      showToast('Enter a task title.');
      return;
    }
    if (!formValues.description.trim()) {
      showToast('Enter a task description.');
      return;
    }
    if (!formValues.category.trim()) {
      showToast('Enter a task category.');
      return;
    }
    if (!agreedToTerms) {
      showToast('Please confirm that you have read the terms and conditions.');
      return;
    }
    const deadlineAt = getFormDeadline(formValues.deadlineDate, formValues.deadlineTime);
    if (!deadlineAt || deadlineAt.getTime() <= Date.now()) {
      showToast('Choose a valid deadline date and time in the future.');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const createdAt = new Date(now).toISOString();
      const currentTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : null;
      const taskCreatedAt = currentTask ? getTime(currentTask.createdAt) || now : now;
      const deadlineDays = Math.max(1, Math.ceil((deadlineAt.getTime() - taskCreatedAt) / (24 * 60 * 60 * 1000)));
      const categoryValue = formValues.category.trim();
      const taskData = {
        title: formValues.title.trim(),
        description: formValues.description.trim(),
        deadline: `${deadlineDays}d`,
        maxWinners: Number(formValues.maxWinners) || 1,
        prize: formValues.prize.trim() ? `₹${formValues.prize.trim()}` : 'Certificate',
        category: categoryValue,
        categoryLabel: getCategoryDisplayName(categoryValue),
        urgent: formValues.urgent === 'yes',
        skills: formValues.skills.length ? formValues.skills : ['General'],
        rewardTypes: formValues.rewardTypes.length ? formValues.rewardTypes : [formValues.prize.trim() ? `₹${formValues.prize.trim()}` : 'Certificate'],
        startupName: formValues.startupName ? formValues.startupName.trim() : (user.displayName || user.email || 'Company'),
        companyId: user.uid,
        companyName: user.displayName || user.email || 'Company',
        participants: 0
      };

      if (editingTaskId) {
        const { participants, ...editableTaskData } = {
          ...taskData,
          deadlineAt: new Date(deadlineAt)
        };
        await updateDoc(doc(db, 'tasks', editingTaskId), {
          ...editableTaskData,
          updatedAt: serverTimestamp()
        });
        setTasks((current) =>
          sortByNewest(
            current.map((task) =>
              task.id === editingTaskId ? { ...task, ...editableTaskData, updatedAt: createdAt } : task
            ),
            'createdAt'
          )
        );
        setSelectedTaskId(editingTaskId);
        setEditingTaskId(null);
        setFormValues(createInitialForm());
        setAgreedToTerms(false);
        showToast('Task updated successfully.');
        return;
      }

      const taskRef = await addDoc(collection(db, 'tasks'), {
        ...taskData,
        deadlineAt: new Date(deadlineAt),
        createdAt: serverTimestamp()
      });

      setTasks((current) => {
        if (current.some((task) => task.id === taskRef.id)) return current;
        return sortByNewest([{ id: taskRef.id, ...taskData, deadlineAt: new Date(deadlineAt), createdAt }, ...current], 'createdAt');
      });
      setSelectedTaskId(taskRef.id);
      setFormValues(createInitialForm());
      setAgreedToTerms(false);
      showToast('Task published successfully. Students can now see it.');
    } catch (error) {
      console.error('Publish task error:', error);
      showToast('Unable to publish task right now.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (task) => {
    if (!window.confirm('Delete this task and its submissions permanently?')) return;

    const previousTasks = tasks;
    const previousCompanySubmissions = companySubmissions;
    const previousTaskScopedSubmissions = taskScopedSubmissions;

    // Hide immediately in UI (optimistic)
    setDeletingTaskId(task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setCompanySubmissions((current) => current.filter((submission) => submission.taskId !== task.id));
    setTaskScopedSubmissions((current) => current.filter((submission) => submission.taskId !== task.id));
    setViewingTaskDescription((current) => (current?.id === task.id ? null : current));
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    if (editingTaskId === task.id) cancelEditingTask();

    try {
      // Soft-delete first so every dashboard that filters by deleted/isDeleted hides it instantly.
      // If soft-delete fails (permissions/doc missing), still proceed with hard delete.
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          deleted: true,
          isDeleted: true,
          deletedAt: serverTimestamp()
        });
      } catch (softError) {
        console.error('Soft-delete task step failed (continuing with hard delete):', softError);
      }

      let submissionResults = [];
      try {
        const submissionSnapshot = await getDocs(
          query(collection(db, 'submissions'), where('taskId', '==', task.id))
        );

        // Delete submissions (best-effort), but ALWAYS attempt deleting the task doc.
        submissionResults = await Promise.allSettled(
          submissionSnapshot.docs.map(async (submissionDoc) => {
            // Optional: mark submissions as deleted too
            try {
              await updateDoc(submissionDoc.ref, {
                deletedByStudent: true,
                deletedAt: serverTimestamp()
              });
            } catch (e) {
              // ignore; still hard delete below
            }
            return deleteDoc(submissionDoc.ref);
          })
        );
      } catch (subErr) {
        console.error('Delete task submissions fetch step failed (continuing with task delete):', subErr);
      }

      const submissionsFailed = submissionResults.length > 0 && submissionResults.some((r) => r.status === 'rejected');

      // Finally delete the task doc itself (this is the critical requirement)
      await deleteDoc(doc(db, 'tasks', task.id));

      showToast(submissionsFailed ? 'Task deleted (submissions cleanup may be delayed).' : 'Task deleted successfully.');
    } catch (error) {
      console.error('Delete task error:', error);

      // revert optimistic UI
      setTasks(previousTasks);
      setCompanySubmissions(previousCompanySubmissions);
      setTaskScopedSubmissions(previousTaskScopedSubmissions);

      const msg = error?.message ? String(error.message) : 'unknown error';
      showToast(`Unable to delete task right now: ${msg}`);
    } finally {
      setDeletingTaskId('');
    }
  };

  const openSelectSubmission = (submission) => {
    setSelectedSubmission(submission);
    setSelectedSubmissionFiles(submission.selectedFiles || []);
    setSelectionFeedback(submission.selectionFeedback || '');
    setSelectionRating(submission.startupRating || 0);
    setPaymentAdded(Boolean(submission.paymentAdded));
  };

  const closeSelectSubmission = () => {
    setSelectedSubmission(null);
    setSelectedSubmissionFiles([]);
    setSelectionFeedback('');
    setSelectionRating(0);
    setPaymentAdded(false);
    setSavingSelection(false);
  };

  const handleSelectionFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const MAX_FILES = 5;
    const MAX_FILE_SIZE = 200 * 1024 * 1024;

    if (selectedSubmissionFiles.length + files.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed for a selection.`);
      event.target.value = null;
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

        const response = await authenticatedFetch('/api/upload.php', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errorData = null;
          try {
            errorData = await response.json();
          } catch (e) {
            // ignore non-json errors
          }
          const reason = errorData?.message || errorData?.error || `HTTP ${response.status}`;
          const details = errorData?.details;
          throw new Error(details ? `${reason} - ${details}` : reason);
        }

        const data = await response.json();
        setSelectedSubmissionFiles((current) => [
          ...current,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            fileId: data.fileId,
            bucketId: data.bucketId,
            fileUrl: data.fileUrl,
          }
        ]);
        showToast(`"${file.name}" uploaded successfully.`);
      } catch (error) {
        console.error('Selection upload error:', error);
        showToast(`Cannot upload a file right now: ${error?.message || 'unknown error'}`);
      }
    }

    event.target.value = null;
  };

  const removeSelectionFile = (index) => {
    setSelectedSubmissionFiles((current) => current.filter((_, idx) => idx !== index));
  };

  const sendSelectionNotification = async (submission) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== user.uid) {
      throw new Error('Your sign-in session has expired. Please sign in again.');
    }

    const token = await currentUser.getIdToken();
    const notificationResponse = await fetch(`${API_BASE_URL}/api/notifications/student-selection.php`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ submissionId: submission.id })
    });

    if (!notificationResponse.ok) {
      const contentType = notificationResponse.headers.get('content-type') || '';
      let notificationResult = {};
      if (contentType.includes('application/json')) {
        notificationResult = await notificationResponse.json().catch(() => ({}));
      }

      if (notificationResult.error) {
        throw new Error(notificationResult.error);
      }

      if (notificationResponse.status === 404) {
        throw new Error('Selection notification API route not found. Deploy the updated backend files and try again.');
      }

      throw new Error(
        `Selection notification request failed with HTTP ${notificationResponse.status}. ` +
        'Check that the updated backend is deployed and reachable.'
      );
    }
  };

  const saveSelectedSubmission = async () => {
    if (!selectedSubmission) return;

    setSavingSelection(true);
    try {
      if (!selectionRating) {
        showToast('Please rate the student work before saving the selection.');
        setSavingSelection(false);
        return;
      }

      const startupName = user.displayName || user.email || selectedSubmission.companyName || selectedSubmissionTask?.companyName || 'Startup';
      const selectionData = {
        selectedByCompany: true,
        selectedAt: new Date().toISOString(),
        paymentAdded,
        selectionFeedback: selectionFeedback.trim(),
        startupRating: Number(selectionRating),
        startupId: user.uid,
        startupName,
        startupEmail: user.email || '',
        companyName: startupName,
        selectedFiles: selectedSubmissionFiles.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          fileId: file.fileId,
          ...(file.bucketId ? { bucketId: file.bucketId } : {}),
          ...(file.fileUrl ? { fileUrl: file.fileUrl } : {}),
        })),
      };

      // Keep the selection save resilient even when deployed Firestore rules
      // have not yet been updated for company-side selection writes.
      let selectionPersisted = false;
      try {
        await addDoc(collection(db, 'task_approvals'), {
          submissionId: selectedSubmission.id,
          taskId: selectedSubmission.taskId,
          taskTitle: selectedSubmission.taskTitle || selectedSubmissionTask?.title || '',
          studentId: selectedSubmission.studentId,
          companyId: user.uid,
          companyName: user.displayName || user.email || '',
          selectionData,
          createdAt: new Date().toISOString()
        });
        selectionPersisted = true;
      } catch (approvalErr) {
        console.error('Creating task_approvals record failed:', approvalErr);
      }

      // Try to update the submission document to reflect selection, but don't fail the whole flow
      try {
        await updateDoc(doc(db, 'submissions', selectedSubmission.id), selectionData);
        selectionPersisted = true;
      } catch (updateErr) {
        console.warn('Could not update submission document (permission may be restricted):', updateErr);
      }

      let notificationError = null;
      try {
        await sendSelectionNotification(selectedSubmission);
      } catch (error) {
        // The selection is already saved in Firestore. A notification outage
        // should not make the company repeat the selection and create duplicate records.
        notificationError = error;
        console.error('Selection notification failed:', error);
      }

      const updateLocalSubmission = (submission) =>
        submission.id === selectedSubmission.id ? { ...submission, ...selectionData } : submission;

      setCompanySubmissions((current) => current.map(updateLocalSubmission));
      setTaskScopedSubmissions((current) => current.map(updateLocalSubmission));
      setSelectedSubmission((current) => (current ? { ...current, ...selectionData } : current));
      showToast(notificationError
        ? selectionPersisted
          ? `Submission selected, but SkillStreet support could not be notified: ${notificationError.message}`
          : `Selection recorded in this session, but could not be saved or notify support: ${notificationError.message}`
        : selectionPersisted
          ? 'Submission selected and SkillStreet support has been notified.'
          : 'SkillStreet support has been notified. Update Firebase rules to save it in the dashboard.'
      );
      closeSelectSubmission();
    } catch (error) {
      console.error('Select submission error:', error);
      showToast(`Unable to complete selection right now: ${error?.message || 'unknown error'}`);
    } finally {
      setSavingSelection(false);
    }
  };

  return (
    <div className="company-dashboard min-h-screen bg-gradient-to-b from-blue-900 via-blue-950 to-black text-white pt-32 pb-8 px-3 sm:px-6 lg:px-8">

      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <section className={`animated-border-surface relative isolate overflow-hidden rounded-2xl border border-blue-700/70 p-4 shadow-md sm:rounded-[1.5rem] sm:p-7 sm:shadow-2xl ${
          activePage === 'tasks'
            ? 'border-l-4 border-l-orange-400 bg-gradient-to-br from-blue-900 via-blue-950 to-[#07101f]'
            : 'border-t-4 border-t-orange-400 bg-gradient-to-br from-[#10264b] via-blue-950 to-[#080f20]'
        }`}>
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 select-none font-black leading-none text-white/[0.035] text-[11rem] sm:text-[15rem]">
            {activePage === 'tasks' ? '01' : '02'}
          </div>
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-300">
                Company workspace
              </p>
              <h1 className="mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                {activePage === 'tasks' ? <>Post a challenge.<br /><span className="text-orange-400">Open a door.</span></> : <>Student work,<br /><span className="text-orange-400">ready for review.</span></>}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/75 sm:text-base">
                {activePage === 'tasks'
                  ? 'Shape real opportunities for students. Your live challenge and response totals stay close at hand.'
                  : 'A clear view of the people and ideas behind every submission. Open work, then make your selection.'}
              </p>
            </div>
            <div className="relative grid min-w-[13rem] grid-cols-[auto_1fr] items-center gap-x-4 rounded-2xl border border-white/10 bg-[#07152d]/80 px-4 py-3 shadow-none sm:min-w-[14rem] sm:px-5 sm:py-4 sm:shadow-inner sm:shadow-black/20">
              <div className="row-span-2 text-5xl font-black leading-none tabular-nums tracking-[-0.08em] text-white sm:text-6xl" aria-live="polite">
                {activePage === 'tasks'
                  ? (loading || tasksError ? '—' : tasks.length)
                  : (submissionsLoading || submissionsError ? '—' : submissions.length)}
              </div>
              <div className="self-end text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-orange-300">
                {activePage === 'tasks' ? 'Posted' : 'Received'}
              </div>
              <div className="self-start text-sm font-medium text-white">
                {activePage === 'tasks' ? (tasks.length === 1 ? 'active task' : 'active tasks') : (submissions.length === 1 ? 'submission' : 'submissions')}
              </div>
              <div className="col-span-2 mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
                {activePage === 'tasks'
                  ? (loading ? 'Updating task totals…' : tasksError ? 'Task totals unavailable' : `${taskSubmissionTotal} student ${taskSubmissionTotal === 1 ? 'response' : 'responses'} across these tasks`)
                  : (submissionsLoading ? 'Updating submission totals…' : submissionsError ? 'Submission totals unavailable' : `${selectedSubmissionCount} selected · ${submissions.length - selectedSubmissionCount} awaiting review`)}
              </div>
            </div>
          </div>
        </section>

        <nav
          role="tablist"
          aria-label="Company dashboard pages"
          aria-orientation="horizontal"
          className="flex gap-2 rounded-2xl border border-white/10 bg-blue-950/70 p-2"
          onKeyDown={(event) => {
            const tabIds = ['company-tasks-tab', 'company-submissions-tab'];
            const currentIndex = tabIds.indexOf(document.activeElement?.id);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabIds.length - 1;
            else return;
            event.preventDefault();
            const nextTabId = tabIds[nextIndex];
            setActivePage(nextIndex === 0 ? 'tasks' : 'submissions');
            document.getElementById(nextTabId)?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id="company-tasks-tab"
            aria-selected={activePage === 'tasks'}
            aria-controls="company-tasks-panel"
            tabIndex={activePage === 'tasks' ? 0 : -1}
            onClick={() => setActivePage('tasks')}
            className={`min-h-12 flex-1 rounded-xl px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
              activePage === 'tasks'
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="block">Posted Tasks</span>
            <span className={`mt-0.5 block text-xs font-normal ${activePage === 'tasks' ? 'text-slate-900/80' : 'text-slate-400'}`}>
              Create and manage tasks
            </span>
          </button>
          <button
            type="button"
            role="tab"
            id="company-submissions-tab"
            aria-selected={activePage === 'submissions'}
            aria-controls="company-submissions-panel"
            tabIndex={activePage === 'submissions' ? 0 : -1}
            onClick={() => setActivePage('submissions')}
            className={`min-h-12 flex-1 rounded-xl px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${
              activePage === 'submissions'
                ? 'bg-orange-500 text-slate-950 shadow-md'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="block">Student Submissions</span>
            <span className={`mt-0.5 block text-xs font-normal ${activePage === 'submissions' ? 'text-slate-900/80' : 'text-slate-400'}`}>
              Review student work
            </span>
          </button>
        </nav>

          <div id="company-tasks-panel" role="tabpanel" aria-labelledby="company-tasks-tab" tabIndex={0} hidden={activePage !== 'tasks'} className="space-y-6">
        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="animated-border-surface rounded-2xl border border-blue-700/50 border-t-2 border-t-orange-400 bg-[#0a1931]/75 p-3.5 shadow-sm sm:rounded-[1.25rem] sm:border-blue-700/50 sm:bg-[#0a1931]/85 sm:p-6 sm:shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">{editingTaskId ? 'Refine the brief' : 'Start an opportunity'}</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{editingTaskId ? 'Edit task' : 'Build a challenge'}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-300">{editingTaskId ? 'Update the details students will see for this task.' : 'Give students a real problem to solve and a clear reason to get involved.'}</p>
            </div>
            <section className="mb-5 rounded-xl border border-blue-800/60 bg-blue-950/45 p-3 sm:rounded-2xl sm:border-blue-800/70 sm:bg-blue-950/70 sm:p-5" aria-labelledby="offline-task-starter-heading">
              <div className="mb-3">
                <h3 id="offline-task-starter-heading" className="text-base font-semibold text-white">Offline task starter</h3>
                <p className="mt-1 text-sm text-slate-300">Start with a curated template, then review and edit the draft below.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-1">
                  <label htmlFor="task-starter-category" className="block text-sm font-medium text-slate-300">Task category</label>
                  <input
                    id="task-starter-category"
                    type="text"
                    value={formValues.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    placeholder="e.g. Design, Marketing, Research"
                    className="w-full rounded-xl border border-white/10 bg-blue-900/70 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="task-starter-prompt" className="block text-sm font-medium text-slate-300">What do you need help with?</label>
                  <input
                    id="task-starter-prompt"
                    type="text"
                    value={taskStarterPrompt}
                    onChange={(e) => setTaskStarterPrompt(e.target.value)}
                    placeholder="e.g. improving our student onboarding"
                    className="w-full rounded-xl border border-white/10 bg-blue-900/70 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-xs leading-relaxed text-slate-400">Uses offline templates for Design, Tech, Content, and Sales, plus a generic starter for other categories. This is not AI-powered and does not send your prompt anywhere.</p>
                <button
                  type="button"
                  onClick={applyOfflineTaskStarter}
                  className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                >
                  Use offline template
                </button>
              </div>
            </section>
            <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300" aria-label="Or create a task manually">
              <span className="h-px flex-1 bg-white/10" />
              <span>Or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Task title</label>
                <input
                  type="text"
                  value={formValues.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="Design a mobile landing page"
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Startup name</label>
                <input
                  type="text"
                  value={formValues.startupName}
                  onChange={(e) => handleFormChange('startupName', e.target.value)}
                  placeholder="Your startup or company name"
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Task description</label>
                <textarea
                  rows={3}
                  value={formValues.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Add a short brief for students."
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Category</label>
                  <input
                    type="text"
                    value={formValues.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    placeholder="Enter category such as Design, AI, Marketing"
                    className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="block text-sm font-medium text-slate-300">Submission deadline</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="task-deadline-date" className="block text-xs text-slate-400">Date</label>
                    <input
                      id="task-deadline-date"
                      type="date"
                      required
                      value={formValues.deadlineDate}
                      onChange={(event) => handleFormChange('deadlineDate', event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="task-deadline-time" className="block text-xs text-slate-400">Time (your local time)</label>
                    <input
                      id="task-deadline-time"
                      type="time"
                      required
                      value={formValues.deadlineTime}
                      onChange={(event) => handleFormChange('deadlineTime', event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Submissions close at the selected date and time. Useful for short tournaments and timed challenges.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Reward amount</label>
                  <input
                    type="text"
                    value={formValues.prize}
                    onChange={(e) => handleFormChange('prize', e.target.value)}
                    placeholder="1500"
                    className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Max winners</label>
                  <input
                    type="number"
                    min="1"
                    value={formValues.maxWinners}
                    onChange={(e) => handleFormChange('maxWinners', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Urgent</label>
                  <select
                    value={formValues.urgent}
                    onChange={(e) => handleFormChange('urgent', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Skills</label>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS_LIST.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`rounded-full px-3 py-1 text-sm transition ${formValues.skills.includes(skill) ? 'bg-orange-500 text-slate-950' : 'bg-blue-900/60 border border-blue-800/60 text-white hover:bg-blue-800'}`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                  <div className="flex min-w-0 items-stretch gap-2">
                    <input
                      type="text"
                      value={customSkillInput}
                      onChange={(e) => setCustomSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomSkill();
                        }
                      }}
                      placeholder="Add your own skill"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                    <button
                      type="button"
                      onClick={addCustomSkill}
                      className="flex shrink-0 items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-orange-400"
                    >
                      Add
                    </button>
                  </div>
                  {formValues.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {formValues.skills.map((skill) => (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-sm text-orange-200 transition hover:bg-orange-500/20"
                        >
                          {skill}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Rewards</label>
                <div className="flex flex-wrap gap-2">
                  {['💰 Cash Prize', '📜 Certificate', '🚀 Internship', '🏅 Digital Badge'].map((reward) => (
                    <button
                      key={reward}
                      type="button"
                      onClick={() => toggleReward(reward)}
                      className={`rounded-full px-3 py-1 text-sm transition ${formValues.rewardTypes.includes(reward) ? 'bg-orange-500 text-slate-950' : 'bg-blue-900/60 border border-blue-800/60 text-white hover:bg-blue-800'}`}
                    >
                      {reward}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-blue-900/40 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-orange-500"
                />
                <span className="text-sm text-slate-200">I have read the terms and conditions</span>
              </label>
              <button
                type="button"
                onClick={publishTask}
                disabled={saving}
                className="w-full rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {saving ? (editingTaskId ? 'Saving...' : 'Publishing...') : editingTaskId ? 'Save Task' : 'Publish Task'}
              </button>
              {editingTaskId ? (
                <button
                  type="button"
                  onClick={cancelEditingTask}
                  className="w-full rounded-xl border border-blue-800/60 bg-blue-900/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-orange-400"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>

          <div className="animated-border-surface rounded-2xl border border-blue-700/50 bg-[#09162c]/75 p-3.5 shadow-sm sm:rounded-[1.25rem] sm:border-blue-700/50 sm:bg-[#09162c]/90 sm:p-6 sm:shadow-xl">
            <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">Live board</p>
                <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Challenges in play</h2>
                <p className="mt-2 text-sm text-slate-300">Only students can see and respond to these challenges.</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-px w-8 bg-orange-400" aria-hidden="true" />
                <span>{loading ? 'Syncing your board' : tasksError ? 'Board unavailable' : `${taskSubmissionTotal} student ${taskSubmissionTotal === 1 ? 'response' : 'responses'} received`}</span>
              </div>
            </div>
            <div className="space-y-4">
              {loading ? (
                <div className="rounded-3xl border border-dashed border-blue-800/60 bg-blue-900/30 p-6 text-center text-slate-300">Loading your posted tasks…</div>
              ) : tasksError ? (
                <div className="rounded-3xl border border-dashed border-red-400/40 bg-red-950/30 p-6 text-center text-red-100">Your tasks could not be loaded. Refresh the page to try again.</div>
              ) : tasks.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-blue-800/60 bg-blue-900/30 p-6 text-center text-slate-300">
                  No company tasks yet. Publish one to make it visible to students.
                </div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedTaskId === task.id}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedTaskId(task.id);
                      }
                    }}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`w-full cursor-pointer rounded-xl border border-l-2 p-3.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:rounded-2xl sm:border-l-4 sm:p-5 ${selectedTaskId === task.id ? 'border-orange-300 border-l-orange-300 bg-blue-900/55 shadow-sm sm:bg-blue-900/80 sm:shadow-lg sm:shadow-orange-950/20' : 'border-blue-800/60 border-l-blue-700 bg-blue-950/35 hover:border-l-orange-400 hover:bg-blue-900/45 sm:border-blue-800/60 sm:border-l-blue-700 sm:bg-gradient-to-r sm:from-blue-900/70 sm:to-blue-950/50 sm:hover:bg-blue-900/70'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm uppercase tracking-[0.2em] text-orange-300">{task.categoryLabel}</div>
                        <h3 className="mt-2 text-xl font-semibold">{task.title}</h3>
                      </div>
                      <span className="inline-flex min-w-[4.75rem] flex-col items-center rounded-lg border border-blue-700/50 bg-[#061329]/55 px-2 py-1.5 text-center text-white sm:min-w-24 sm:rounded-xl sm:border-blue-700/70 sm:bg-[#061329]/70 sm:px-3 sm:py-2">
                        <span className="text-2xl font-bold leading-none tabular-nums text-orange-300">{taskSubmissionCounts[task.id] || 0}</span>
                        <span className="mt-1 text-[0.65rem] uppercase tracking-[0.14em] text-slate-400">responses</span>
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>{task.deadline} deadline · {formatTaskDeadline(task) || 'Date unavailable'}</span>
                      {getTaskDeadlineAt(task) !== null && getTaskDeadlineAt(task) <= Date.now() ? (
                        <span className="font-semibold text-amber-200">Deadline finished</span>
                      ) : null}
                      <span>{task.prize}</span>
                      <span>{task.urgent ? 'Urgent' : 'Normal'}</span>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2 text-xs text-white">{task.companyName}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewingTaskDescription(task);
                        }}
                        className="rounded-2xl bg-blue-900/60 border border-blue-800/60 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-800"
                      >
                        View description
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingTask(task);
                        }}
                        className="rounded-2xl border border-orange-400 bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExtendingDeadlineTaskId((current) => current === task.id ? '' : task.id);
                          setDeadlineExtensionDays('7');
                        }}
                        className="rounded-2xl border border-orange-400 bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                      >
                        Increase deadline
                      </button>
                      <button
                        type="button"
                        disabled={deletingTaskId === task.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteTask(task);
                        }}
                        className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {deletingTaskId === task.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                    {extendingDeadlineTaskId === task.id ? (
                      <div
                        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-orange-400/30 bg-orange-500/5 p-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <label className="space-y-1 text-xs font-medium text-slate-300">
                          <span className="block">Add days to this task</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={deadlineExtensionDays}
                            onChange={(event) => setDeadlineExtensionDays(event.target.value)}
                            className="w-32 rounded-xl border border-white/10 bg-blue-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-400"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={extendingDeadline}
                          onClick={() => extendTaskDeadline(task)}
                          className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {extendingDeadline ? 'Saving...' : 'Add days'}
                        </button>
                        <button
                          type="button"
                          disabled={extendingDeadline}
                          onClick={() => setExtendingDeadlineTaskId('')}
                          className="rounded-xl border border-blue-700/70 px-4 py-2 text-xs font-semibold text-white hover:border-orange-400 disabled:opacity-70"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {selectedTask ? (
              <div className="mt-6 rounded-2xl border border-blue-800/60 bg-blue-900/30 p-4 sm:mt-8 sm:rounded-3xl sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold">{selectedTask.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">Submissions remain available for review and student selection after the deadline.</p>
                  </div>
                  <div className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-1 text-sm text-white">{taskSubmissions.length} submissions</div>
                </div>
                {getTaskDeadlineAt(selectedTask) !== null && getTaskDeadlineAt(selectedTask) <= Date.now() ? (
                  <div role="status" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Deadline finished. All received submissions remain available below so you can review and select students.
                  </div>
                ) : null}
                <div className="mt-6 space-y-4">
                  {taskSubmissions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-blue-800/60 bg-blue-900/30 p-6 text-slate-300">No submissions yet. Students will see your task in their dashboard.</div>
                  ) : (
                    taskSubmissions.map((submission) => (
                      <div key={submission.id} className="rounded-3xl border border-blue-800/60 bg-blue-900/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm text-slate-300">{submission.studentName}</div>
                            {submission.startupName ? (
                              <div className="text-sm text-slate-300">Startup: {submission.startupName}</div>
                            ) : null}
                            <div className="text-lg font-semibold">{submission.type === 'link' ? 'Link submission' : submission.type === 'text' ? 'Text submission' : 'File submission'}</div>
                          </div>
                          <div className="text-xs text-slate-400">{new Date(submission.submittedAt).toLocaleString()}</div>
                        </div>
                        <div className="mt-3 text-sm text-slate-300">
                          {submission.type === 'link' && (
                            <a href={submission.url} target="_blank" rel="noreferrer" className="text-orange-300 hover:text-orange-400 underline">{submission.url}</a>
                          )}
                          {submission.type === 'text' && <p className="whitespace-pre-line">{submission.text}</p>}
                          {submission.type === 'file' && submission.files?.length ? (
                            <div className="mt-3 space-y-2">
                              {submission.files.map((file) => (
                                <div key={file.name} className="rounded-2xl bg-blue-900/50 p-3 text-sm text-slate-300">
                                  <div>{file.name}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => openSelectSubmission(submission)}
                            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                          >
                            {submission.selectedByCompany ? 'Review selection' : 'Select student'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>

          </div>
          <div id="company-submissions-panel" role="tabpanel" aria-labelledby="company-submissions-tab" tabIndex={0} hidden={activePage !== 'submissions'} className="space-y-6">
        <section className="animated-border-surface overflow-hidden rounded-[1.5rem] border border-blue-700/60 bg-[#09162c]/90 p-3 shadow-md sm:p-7 sm:shadow-xl">
          <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-300">Review desk</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">The work behind the numbers</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Open each submission, get to know its creator, and make a considered selection.</p>
            </div>
            {!submissionsLoading && !submissionsError ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                <span><span className="mr-2 text-emerald-300">{selectedSubmissionCount}</span>Selected</span>
                <span><span className="mr-2 text-orange-300">{submissions.length - selectedSubmissionCount}</span>To review</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-4" aria-live="polite">
            {submissionsLoading ? (
              <div className="rounded-3xl border border-dashed border-blue-800/60 bg-blue-900/30 p-6 text-center text-slate-300">Loading student submissions…</div>
            ) : submissionsError ? (
              <div className="rounded-3xl border border-dashed border-red-400/40 bg-red-950/30 p-6 text-center text-red-100">Student submissions could not be loaded. Refresh the page to try again.</div>
            ) : submissions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-blue-800/60 bg-blue-900/30 p-6 text-center text-slate-300">No submissions yet.</div>
            ) : (
              submissions.map((submission) => {
                const studentData = studentUsers[submission.studentId] || {};
                return (
                  <div key={submission.id} className={`min-w-0 overflow-hidden rounded-2xl border border-l-4 bg-gradient-to-br from-blue-900/65 to-[#08152a] p-4 sm:p-6 ${submission.selectedByCompany ? 'border-emerald-700/50 border-l-emerald-400' : 'border-blue-800/60 border-l-orange-400'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className="rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs uppercase tracking-[0.16em] text-orange-300">{submission.type} submission</span>
                          {submission.selectedByCompany ? (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs uppercase tracking-[0.16em] text-emerald-200">Selected</span>
                          ) : null}
                          <span className="break-words text-xs text-slate-400">{new Date(submission.submittedAt).toLocaleString()}</span>
                        </div>
                        <h3 className="break-words text-lg font-semibold text-white [overflow-wrap:anywhere]">{submission.taskTitle}</h3>
                        <p className="mt-1 break-words text-sm text-slate-300 [overflow-wrap:anywhere]">Submitted by: {submission.studentName}</p>
                        {submission.startupName ? <p className="mt-1 break-words text-sm text-slate-300 [overflow-wrap:anywhere]">Startup: {submission.startupName}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openSelectSubmission(submission)}
                        className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                      >
                        Select
                      </button>
                    </div>

                    <div className="mb-4 min-w-0 overflow-hidden rounded-xl border border-blue-700/50 bg-[#0c2141]/75 p-4">
                      <h4 className="text-sm font-semibold text-orange-300 mb-3">Student Information</h4>
                      <div className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div className="min-w-0">
                          <span className="block text-slate-400">Name:</span>
                          <span className="block break-words text-white [overflow-wrap:anywhere]">{studentData.displayName || submission.studentName || 'N/A'}</span>
                        </div>
                        
                        <div className="min-w-0">
                          <span className="block text-slate-400">Startup:</span>
                          <span className="block break-words text-white [overflow-wrap:anywhere]">{submission.startupName || 'N/A'}</span>
                        </div>
                        
                        <div className="min-w-0">
                          <span className="block text-slate-400">Role:</span>
                          <span className="block break-words text-white capitalize [overflow-wrap:anywhere]">{studentData.role || 'N/A'}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-slate-400">Account Created:</span>
                          <span className="block break-words text-white">{studentData.createdAt ? new Date(studentData.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                      {Object.keys(studentData).length === 0 && (
                        <div className="mt-3 text-xs text-slate-400">No detailed student data available in database</div>
                      )}
                    </div>

                    <div className="min-w-0 break-words border-l-2 border-blue-700/70 pl-4 text-sm text-slate-300 [overflow-wrap:anywhere]">
                      {submission.type === 'link' && (
                        <a href={submission.url} target="_blank" rel="noreferrer" className="text-orange-300 hover:text-orange-400 underline break-all">{submission.url}</a>
                      )}
                      {submission.type === 'text' && <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{submission.text}</p>}
                      {submission.type === 'file' && submission.files?.length ? (
                        <div className="mt-3 space-y-2">
                          {submission.files.map((file, index) => (
                            <div key={index} className="rounded-2xl bg-blue-900/50 p-3 text-sm text-slate-300">
                              <div className="flex items-center justify-between">
                                <div>{file.name}</div>
                                {file.fileId && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await downloadProtectedFile(file.fileId, submission.id, file.name);
                                      } catch (error) {
                                        console.error('Download error:', error);
                                        showToast('Cannot download file right now.');
                                      }
                                    }}
                                    className="rounded-xl border border-orange-400 bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 transition-all hover:bg-orange-400"
                                  >
                                    Download
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
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
                <p className="mt-2 text-sm text-slate-300">{viewingTaskDescription.companyName} - {viewingTaskDescription.categoryLabel}</p>
              </div>
              <button type="button" onClick={() => setViewingTaskDescription(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-300" aria-label="Close task description">×</button>
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-blue-900/60 border border-blue-800/60 p-5">
              <p className="whitespace-pre-line text-sm leading-6 text-slate-200">{viewingTaskDescription.description}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{viewingTaskDescription.deadline} deadline</span>
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{viewingTaskDescription.prize}</span>
              <span className="rounded-full bg-blue-900/60 border border-blue-800/60 px-3 py-2">{viewingTaskDescription.skills?.join(', ') || 'General'}</span>
            </div>
          </div>
        </div>
      ) : null}

      {selectedSubmission ? (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 sm:px-4 sm:py-6" onClick={(event) => event.target === event.currentTarget && closeSelectSubmission()}>
          <div className="mobile-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] bg-blue-900/95 border border-blue-800/60 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Select submission</p>
                <h3 className="mt-2 text-xl sm:text-2xl font-bold text-white">{selectedSubmission.taskTitle}</h3>
                <p className="mt-1 text-sm text-slate-300">Review the student and task details before saving the selection.</p>
              </div>
              <button type="button" onClick={closeSelectSubmission} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-3xl text-slate-300" aria-label="Close submission selection">×</button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Student name</label>
                <input
                  type="text"
                  readOnly
                  value={selectedSubmission.studentName || ''}
                  className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none"
                />
              </div>
             
            </div>

            <div className="mt-3 space-y-1">
              <label className="block text-sm font-medium text-slate-300">Rewards</label>
              <textarea
                rows={3}
                readOnly
                value={[
                  `Reward amount: ${selectedSubmission.prize || selectedSubmissionTask?.prize || 'N/A'}`,
                  `Reward types: ${(selectedSubmission.rewardTypes || selectedSubmissionTask?.rewardTypes || []).join(', ') || 'N/A'}`,
                ].filter(Boolean).join('\n')}
                className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none"
              />
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-slate-300">Upload files for this selection</label>
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-blue-800/60 bg-blue-900/30 px-4 py-4 text-center text-slate-300 transition hover:border-orange-400 hover:bg-blue-900/50">
                <input type="file" multiple className="sr-only" onChange={handleSelectionFileUpload} />
                Select files to upload
              </label>
              <p className="text-xs text-slate-400">File size must not exceed 200 MB.</p>
              <div className="space-y-2">
                {selectedSubmissionFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-900/50 px-4 py-2.5 text-sm text-white">
                    <span className="break-all">{file.name}</span>
                    <button type="button" className="text-orange-300 hover:text-orange-200" onClick={() => removeSelectionFile(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <label className="block text-sm font-medium text-slate-300">Startup rating</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectionRating(value)}
                    className={`text-3xl leading-none ${selectionRating >= value ? 'text-orange-400' : 'text-slate-600'}`}
                    aria-label={`${value} star${value > 1 ? 's' : ''}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">Rate the student work from 1 to 5 stars.</p>
            </div>

            <div className="mt-4 space-y-1">
              <label className="block text-sm font-medium text-slate-300">Feedback for the student (required)</label>
              <textarea
                rows={3}
                value={selectionFeedback}
                onChange={(event) => setSelectionFeedback(event.target.value)}
                placeholder="Write feedback for the submitted work."
                className="w-full rounded-xl border border-white/10 bg-blue-900/50 px-4 py-2.5 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
              />
            </div>


            <div className="mt-4 rounded-xl border border-blue-800/60 bg-blue-900/30 p-3">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={paymentAdded}
                  onChange={(event) => setPaymentAdded(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-blue-800/60 bg-blue-900 text-orange-500 focus:ring-orange-400"
                />
                <span>Payment added for this selected task</span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={savingSelection}
                onClick={saveSelectedSubmission}
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingSelection ? 'Saving...' : 'Save selection'}
              </button>
              {paymentAdded ? (
                <button
                  type="button"
                  onClick={() => window.open(SELECTION_PAYMENT_FORM_URL, '_blank', 'noopener,noreferrer')}
                  className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Pay now
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeSelectSubmission}
                className="rounded-xl border border-blue-800/60 bg-blue-900/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-orange-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast.visible ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(90%,28rem)] -translate-x-1/2 rounded-2xl bg-blue-900/95 border border-blue-800/60 backdrop-blur-sm px-4 py-3 text-sm text-white shadow-2xl">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
