import { auth } from '../firebase.js';

export async function authenticatedFetch(url, options = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to access files.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  return fetch(url, { ...options, headers });
}

export async function downloadProtectedFile(fileId, submissionId, fileName) {
  const params = new URLSearchParams({ id: String(fileId) });
  if (submissionId) params.set('submissionId', submissionId);

  const response = await authenticatedFetch(`/api/file.php?${params.toString()}`);
  if (!response.ok) {
    let error = null;
    try {
      error = await response.json();
    } catch (parseError) {
      // Use the HTTP status when the server response is not JSON.
    }
    throw new Error(error?.error || `HTTP ${response.status}`);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
