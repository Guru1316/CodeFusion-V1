// api.js — talks to the Judge0 public API (CE instance). No backend, no key.
//
// Flow: create a submission (base64-encoded source/stdin), then poll the
// submission until Judge0 reports it is no longer queued/processing.

const JUDGE0_BASE_URL = "https://ce.judge0.com";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 20000;
const REQUEST_TIMEOUT_MS = 15000;

// Judge0 status IDs: 1 = In Queue, 2 = Processing. Anything >= 3 is a final state.
const STATUS_IN_QUEUE = 1;
const STATUS_PROCESSING = 2;

function toBase64(str) {
  // Handles unicode source code safely.
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(str) {
  if (!str) return "";
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return atob(str);
  }
}

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { promise: promise(controller.signal), clear: () => clearTimeout(timeoutId) };
}

/**
 * Custom error carrying a "friendly" flag so the UI knows the message is
 * already safe to show verbatim to the user.
 */
export class Judge0Error extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "Judge0Error";
    this.friendly = true;
    if (cause) this.cause = cause;
  }
}

async function createSubmission({ sourceCode, languageId, stdin }) {
  const url = `${JUDGE0_BASE_URL}/submissions?base64_encoded=true&wait=false&fields=token`;
  const { promise, clear } = withTimeout(
    (signal) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          source_code: toBase64(sourceCode),
          language_id: languageId,
          stdin: toBase64(stdin || ""),
        }),
      }),
    REQUEST_TIMEOUT_MS
  );

  let response;
  try {
    response = await promise;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Judge0Error("The request to the compiler service timed out. Please try again.");
    }
    throw new Judge0Error("Couldn't reach the compiler service. Check your internet connection.");
  } finally {
    clear();
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Judge0Error("The public compiler service is rate-limited right now. Please wait a moment and try again.");
    }
    throw new Judge0Error(`The compiler service returned an unexpected error (HTTP ${response.status}).`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Judge0Error("The compiler service sent back a response we couldn't understand.");
  }

  if (!data || !data.token) {
    throw new Judge0Error("The compiler service didn't return a valid submission token.");
  }

  return data.token;
}

async function fetchSubmission(token) {
  const url = `${JUDGE0_BASE_URL}/submissions/${token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status,time,memory`;
  const { promise, clear } = withTimeout(
    (signal) => fetch(url, { signal }),
    REQUEST_TIMEOUT_MS
  );

  let response;
  try {
    response = await promise;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Judge0Error("Timed out while checking your submission's status.");
    }
    throw new Judge0Error("Lost connection while checking your submission's status.");
  } finally {
    clear();
  }

  if (!response.ok) {
    throw new Judge0Error(`The compiler service returned an unexpected error (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new Judge0Error("The compiler service sent back a response we couldn't understand.");
  }
}

/**
 * Runs source code on Judge0 and resolves with a normalized result object.
 * @returns {Promise<{status: {id:number, description:string}, stdout: string,
 *   stderr: string, compileOutput: string, message: string, time: string|null,
 *   memory: number|null}>}
 */
export async function runCode({ sourceCode, languageId, stdin }) {
  if (!sourceCode || !sourceCode.trim()) {
    throw new Judge0Error("There's no code to run yet. Write something in the editor first.");
  }

  const token = await createSubmission({ sourceCode, languageId, stdin });

  const startTime = Date.now();
  let submission = await fetchSubmission(token);

  while (
    submission.status &&
    (submission.status.id === STATUS_IN_QUEUE || submission.status.id === STATUS_PROCESSING)
  ) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      throw new Judge0Error("Your code is taking longer than expected to run. Please try again.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    submission = await fetchSubmission(token);
  }

  return {
    status: submission.status || { id: 0, description: "Unknown" },
    stdout: fromBase64(submission.stdout),
    stderr: fromBase64(submission.stderr),
    compileOutput: fromBase64(submission.compile_output),
    message: fromBase64(submission.message),
    time: submission.time,
    memory: submission.memory,
  };
}
