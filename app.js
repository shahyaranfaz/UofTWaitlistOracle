const DATA_ROOT = "https://raw.githubusercontent.com/ICPRplshelp/Enrollment-Data/master";
const SESSIONS = ["20229", "20235", "20239", "20245", "20249", "20255", "20259", "20265", "20269"];
const form = document.querySelector("#oracle-form");
const results = document.querySelector("#results");
const courseInput = document.querySelector("#course");
const courseList = document.querySelector("#course-options");
const lectureInput = document.querySelector("#lecture-display");
const lectureValue = document.querySelector("#lecture");
const lectureList = document.querySelector("#lecture-options");
let courseOptions = [];
let activeOption = -1;

const campusFaculty = code => code.includes("H3") ? "SCAR" : code.includes("H5") ? "ERIN" : "ARTSC";
const isSummer = session => session.endsWith("5");
const sessionLabel = session => isSummer(session) ? `Summer ${session.slice(0,4)}` : `Fall/Winter ${session.slice(0,4)}–${Number(session.slice(0,4)) + 1}`;
const getTerm = code => code.at(-1);
// Summer sessions reuse the fall/winter fields for their first/second subsessions.
const deadlineKey = code => getTerm(code) === "S" ? "winterWaitlistClosed" : "fallWaitlistClosed";

async function fetchJson(path) {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

const courseMeta = code => {
  const campus = code.includes("H3") ? "Scarborough" : code.includes("H5") ? "Mississauga" : "St. George";
  const term = code.endsWith("F") ? "Fall" : code.endsWith("S") ? "Winter" : "Full year";
  return `${campus} · ${term}`;
};

function flattenCourseList(data) {
  const codes = data.liDes.flatMap(group => group.courses.flatMap(course =>
    course.v.map(version => `${course.n}${version.w}${version.c}${version.s}`)
  ));
  return [...new Set(codes)].sort();
}

function closeCourseList() {
  courseList.hidden = true;
  courseInput.setAttribute("aria-expanded", "false");
  activeOption = -1;
}

async function loadLectures(code) {
  lectureValue.value = "";
  lectureInput.value = "";
  lectureInput.placeholder = "LOADING LECTURES…";
  lectureInput.disabled = true;
  lectureList.hidden = true;
  try {
    const { course } = await getCurrentContext(code);
    const lectures = course.meetings.filter(meeting =>
      !meeting.isCancelled && meeting.enrollmentLogs?.length && /^LEC/i.test(meeting.meetingNumber ?? "")
    );
    lectureList.innerHTML = lectures.map(meeting => {
      const instructors = meeting.instructors?.map(i => `${i.firstName} ${i.lastName}`).join(", ");
      return `<li role="option" data-lecture="${meeting.meetingNumber}"><b>${meeting.meetingNumber}</b><span>${instructors || "Instructor unavailable"}</span></li>`;
    }).join("");
    lectureInput.placeholder = lectures.length ? "CHOOSE LECTURE" : "NO LECTURES FOUND";
    lectureInput.disabled = !lectures.length;
  } catch {
    lectureInput.placeholder = "LECTURES UNAVAILABLE";
  }
}

function closeLectureList() {
  lectureList.hidden = true;
  lectureInput.setAttribute("aria-expanded", "false");
}

function chooseLecture(lecture) {
  lectureValue.value = lecture;
  lectureInput.value = lecture;
  closeLectureList();
}

function chooseCourse(code) {
  courseInput.value = code;
  closeCourseList();
  loadLectures(code);
  courseInput.focus();
}

function showCourseMatches() {
  const query = courseInput.value.trim().toUpperCase().replace(/\s/g, "");
  const matches = courseOptions.filter(code => code.includes(query)).slice(0, 8);
  activeOption = -1;
  courseList.innerHTML = matches.length
    ? matches.map(code => `<li role="option" data-code="${code}"><b>${code}</b><span>${courseMeta(code)}</span></li>`).join("")
    : `<li class="empty">No matching courses</li>`;
  courseList.hidden = false;
  courseInput.setAttribute("aria-expanded", "true");
}

async function loadCourseOptions() {
  try {
    courseOptions = flattenCourseList(await fetchJson(`${SESSIONS.at(-1)}/AAclistall.json`));
  } catch {
    document.querySelector("#course-help").textContent = "Course list unavailable — enter the exact code";
  }
}

courseInput.addEventListener("focus", showCourseMatches);
courseInput.addEventListener("input", () => {
  courseInput.value = courseInput.value.toUpperCase().replace(/\s/g, "");
  lectureValue.value = "";
  lectureInput.value = "";
  lectureInput.placeholder = "CHOOSE COURSE FIRST";
  lectureInput.disabled = true;
  closeLectureList();
  showCourseMatches();
});
courseInput.addEventListener("keydown", event => {
  const options = [...courseList.querySelectorAll("li[data-code]")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    activeOption = event.key === "ArrowDown" ? Math.min(activeOption + 1, options.length - 1) : Math.max(activeOption - 1, 0);
    options.forEach((option, index) => option.classList.toggle("active", index === activeOption));
    options[activeOption]?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter" && activeOption >= 0) {
    event.preventDefault();
    chooseCourse(options[activeOption].dataset.code);
  } else if (event.key === "Escape") closeCourseList();
});
courseList.addEventListener("pointerdown", event => {
  const option = event.target.closest("li[data-code]");
  if (option) { event.preventDefault(); chooseCourse(option.dataset.code); }
});
lectureInput.addEventListener("click", () => {
  lectureList.hidden = false;
  lectureInput.setAttribute("aria-expanded", "true");
});
lectureList.addEventListener("pointerdown", event => {
  const option = event.target.closest("li[data-lecture]");
  if (option) { event.preventDefault(); chooseLecture(option.dataset.lecture); }
});
document.addEventListener("pointerdown", event => {
  if (!event.target.closest(".course-field")) closeCourseList();
  if (!event.target.closest(".lecture-field")) closeLectureList();
});

function capacityAt(meeting, timestamp) {
  const complex = meeting.enrollmentCapComplex;
  if (!complex) return meeting.enrollmentCap;
  let capacity = complex.initialCap ?? meeting.enrollmentCap;
  for (const change of complex.capChanges ?? []) {
    const time = change.time ?? change.timing ?? change.timestamp ?? 0;
    if (time <= timestamp) capacity = change.newCapacity ?? change.capAfter ?? change.newCap ?? change.capacity ?? capacity;
  }
  return capacity;
}

function snapshotAt(course, deadline, daysRemaining) {
  const target = deadline - daysRemaining * 86400;
  let index = 0;
  let distance = Infinity;
  course.timeIntervals.forEach((time, i) => {
    if (time <= deadline && Math.abs(time - target) < distance) { index = i; distance = Math.abs(time - target); }
  });
  return index;
}

function analyzeMeeting(course, meeting, deadline, daysRemaining, position) {
  const startIndex = snapshotAt(course, deadline, daysRemaining);
  const endIndex = snapshotAt(course, deadline, 0);
  const startTime = course.timeIntervals[startIndex];
  const endTime = course.timeIntervals[endIndex];
  const startDemand = meeting.enrollmentLogs[startIndex] ?? 0;
  const endDemand = meeting.enrollmentLogs[endIndex] ?? 0;
  const startWaitlist = Math.max(startDemand - capacityAt(meeting, startTime), 0);
  const endWaitlist = Math.max(endDemand - capacityAt(meeting, endTime), 0);
  // A position that never existed in that offering is not evidence either way.
  if (startWaitlist < position) return null;
  const movement = Math.max(startWaitlist - endWaitlist, 0);
  return {
    meeting: meeting.meetingNumber,
    movement,
    cleared: movement >= position,
    startWaitlist,
    instructor: meeting.instructors?.map(i => `${i.firstName} ${i.lastName}`).join(", ") || "Instructor unavailable"
  };
}

function analyze(course, deadline, daysRemaining, position) {
  return course.meetings
    .filter(meeting => !meeting.isCancelled && meeting.enrollmentLogs?.length && /^LEC/i.test(meeting.meetingNumber ?? ""))
    .map(meeting => analyzeMeeting(course, meeting, deadline, daysRemaining, position))
    .filter(Boolean);
}

async function deadlineFor(session, code) {
  const constants = await fetchJson(`${session}/AAtcconstants.json`);
  const faculty = constants.find(item => item.faculty === campusFaculty(code)) ?? constants[0];
  return faculty?.importantTimestamps?.[deadlineKey(code)] ?? null;
}

async function getCurrentContext(code) {
  for (const session of [...SESSIONS].reverse()) {
    try {
      const [course, deadline] = await Promise.all([fetchJson(`${session}/${code}.json`), deadlineFor(session, code)]);
      if (!deadline) continue;
      const now = Math.floor(Date.now() / 1000);
      return { session, daysRemaining: Math.max(0, Math.round((deadline - Math.min(now, deadline)) / 86400)), course };
    } catch { /* Course is not offered in this session. */ }
  }
  throw new Error("course-not-found");
}

async function estimate(code, lecture, position) {
  const current = await getCurrentContext(code);
  const selectedMeeting = current.course.meetings.find(meeting => meeting.meetingNumber === lecture && !meeting.isCancelled);
  if (!selectedMeeting) throw new Error("invalid-lecture");
  const historicalSessions = SESSIONS.filter(session => session < current.session && isSummer(session) === isSummer(current.session));
  const historical = await Promise.all(historicalSessions.map(async session => {
    try {
      const [course, deadline] = await Promise.all([fetchJson(`${session}/${code}.json`), deadlineFor(session, code)]);
      if (!deadline) return { found: true, outcomes: [] };
      const outcomes = analyze(course, deadline, current.daysRemaining, position)
        .map(outcome => ({ session, ...outcome }));
      return { found: true, outcomes };
    } catch { return { found: false, outcomes: [] }; }
  }));
  const outcomes = historical.flatMap(item => item.outcomes);
  if (!outcomes.length) {
    throw new Error(historical.some(item => item.found) ? "position-never-reached" : "no-history");
  }
  const cleared = outcomes.filter(item => item.cleared).length;
  const probability = Math.round((cleared / outcomes.length) * 100);
  return { current, selectedMeeting, outcomes, cleared, probability };
}

function renderEstimate(code, lecture, position, data) {
  const term = getTerm(code) === "S" ? "Winter" : getTerm(code) === "F" ? "Fall" : "full-year";
  results.innerHTML = `<div class="result-grid">
    <div class="result-score"><div class="result-label">ORACLE'S ESTIMATE</div><div class="probability">${data.probability}%</div></div>
    <div><p class="result-summary">Position <strong>#${position}</strong> in ${code} ${lecture} cleared in <strong>${data.cleared} of ${data.outcomes.length}</strong> comparable lecture offerings.</p>
      <div class="outcomes">${data.outcomes.slice().reverse().map(item => `<div class="outcome"><span>${sessionLabel(item.session)} · ${item.meeting} · ${item.instructor}<br><small>${item.startWaitlist} waiting at the comparable date · ${item.movement} spots moved</small></span><strong class="${item.cleared ? "" : "miss"}">${item.cleared ? "CLEARED" : "DID NOT CLEAR"}</strong></div>`).join("")}</div>
      <p class="result-note">Compared ${data.current.daysRemaining} days before the ${term} waitlist deadline. </p>
    </div></div>`;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderError(error) {
  const copy = error.message === "position-never-reached"
    ? "The course was found, but the waitlist has never been this high."
    : error.message === "no-history"
      ? "The course was found, but it has no previous offerings in the archive."
    : error.message === "invalid-course"
      ? "Choose one of the courses shown in the list."
    : error.message === "invalid-lecture"
      ? "Choose one of the available lecture sections."
      : "I couldn't find that exact course code in the public archive.";
  results.innerHTML = `<p class="result-label">THE ORACLE CAME UP EMPTY</p><p class="error-message">${copy}</p>`;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth" });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  const code = form.course.value.trim().toUpperCase().replace(/\s/g, "");
  const lecture = form.lecture.value;
  const position = Number(form.position.value);
  if (courseOptions.length && !courseOptions.includes(code)) {
    renderError(new Error("invalid-course"));
    showCourseMatches();
    return;
  }
  button.disabled = true;
  button.querySelector("span").textContent = "Reading history…";
  try { renderEstimate(code, lecture, position, await estimate(code, lecture, position)); }
  catch (error) { renderError(error); }
  finally { button.disabled = false; button.querySelector("span").textContent = "Ask the Oracle"; }
});

loadCourseOptions();
