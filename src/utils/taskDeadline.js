const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const getTime = (value) => {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};

export const getTaskDeadlineAt = (task) => {
  const explicitDeadline = getTime(task?.deadlineAt);
  if (explicitDeadline) return explicitDeadline;

  const createdAt = getTime(task?.createdAt);
  const deadlineDays = Number.parseInt(task?.deadline, 10);
  if (!createdAt || !Number.isSafeInteger(deadlineDays) || deadlineDays < 1) return null;

  return createdAt + deadlineDays * DAY_IN_MILLISECONDS;
};

export const hasStoredTaskDeadline = (task) => getTime(task?.deadlineAt) > 0;

export const isTaskDeadlinePassed = (task, now = Date.now()) => {
  const deadlineAt = getTaskDeadlineAt(task);
  return deadlineAt !== null && deadlineAt <= now;
};

export const formatTaskDeadline = (task) => {
  const deadlineAt = getTaskDeadlineAt(task);
  return deadlineAt === null ? '' : new Date(deadlineAt).toLocaleString();
};

export const getDeadlineExtension = (task, extraDays, now = Date.now()) => {
  const deadlineDays = Number.parseInt(task?.deadline, 10);
  const currentDeadlineAt = getTaskDeadlineAt(task) ?? now;
  return {
    deadline: `${(Number.isSafeInteger(deadlineDays) && deadlineDays > 0 ? deadlineDays : 0) + extraDays}d`,
    deadlineAt: new Date(currentDeadlineAt + extraDays * DAY_IN_MILLISECONDS)
  };
};

export const getDeadlineFromNow = (days, now = Date.now()) =>
  new Date(now + days * DAY_IN_MILLISECONDS);
