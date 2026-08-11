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
let modelPromise;
const jsonCache = new Map();

const campusDigit = code => code.match(/[HY]([135])[FSY]$/)?.[1] ?? "1";
const campusFaculty = code => campusDigit(code) === "3" ? "SCAR" : campusDigit(code) === "5" ? "ERIN" : "ARTSC";
const isSummer = session => session.endsWith("5");
const sessionLabel = session => isSummer(session) ? `Summer ${session.slice(0,4)}` : `Fall/Winter ${session.slice(0,4)}–${Number(session.slice(0,4)) + 1}`;
const getTerm = code => code.at(-1);
// Summer sessions reuse the fall/winter fields for their first/second subsessions.
const deadlineKey = code => getTerm(code) === "S" ? "winterWaitlistClosed" : "fallWaitlistClosed";

function fetchJson(path) {
  if (!jsonCache.has(path)) {
    const request = fetch(`${DATA_ROOT}/${path}`)
      .then(response => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.json();
      })
      .catch(error => {
        jsonCache.delete(path);
        throw error;
      });
    jsonCache.set(path, request);
  }
  return jsonCache.get(path);
}

function loadModel() {
  modelPromise ??= fetch("model/oracle-model.json")
    .then(response => {
      if (!response.ok) throw new Error(`Model ${response.status}`);
      return response.json();
    })
    .catch(() => null);
  return modelPromise;
}

const courseMeta = code => {
  const campus = campusDigit(code) === "3" ? "Scarborough" : campusDigit(code) === "5" ? "Mississauga" : "St. George";
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
    return lectures;
  } catch {
    lectureInput.placeholder = "LECTURES UNAVAILABLE";
    return [];
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
  const startDemand = meeting.enrollmentLogs[startIndex] ?? 0;
  const startWaitlist = Math.max(startDemand - capacityAt(meeting, startTime), 0);
  // A position that never existed in that offering is not evidence either way.
  if (startWaitlist < position) return null;
  // Count every visible downward change. Someone joining behind the student
  // later must not erase queue movement that has already happened.
  let movement = 0;
  let previousWaitlist = startWaitlist;
  const lastIndex = Math.min(endIndex, meeting.enrollmentLogs.length - 1, course.timeIntervals.length - 1);
  for (let index = startIndex + 1; index <= lastIndex; index += 1) {
    if (meeting.enrollmentLogs[index] == null) continue;
    const timestamp = course.timeIntervals[index];
    const demand = meeting.enrollmentLogs[index];
    const currentWaitlist = Math.max(demand - capacityAt(meeting, timestamp), 0);
    movement += Math.max(previousWaitlist - currentWaitlist, 0);
    previousWaitlist = currentWaitlist;
  }
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

function modelFeatures(code, current, meeting, position) {
  const course = current.course;
  const deadline = current.deadline;
  const index = snapshotAt(course, deadline, current.daysRemaining);
  const index3 = snapshotAt(course, deadline, current.daysRemaining + 3);
  const index7 = snapshotAt(course, deadline, current.daysRemaining + 7);
  const time = course.timeIntervals[index];
  const time7 = course.timeIntervals[index7];
  const capacity = capacityAt(meeting, time);
  const capacity7 = capacityAt(meeting, time7);
  const waitlistAt = snapshotIndex => Math.max(
    (meeting.enrollmentLogs[snapshotIndex] ?? 0) - capacityAt(meeting, course.timeIntervals[snapshotIndex]),
    0
  );
  const observedWaitlist = waitlistAt(index);
  // The collector can lag the user's live Acorn rank. Trust the entered rank as
  // evidence that the current queue contains at least that many people.
  const waitlist = Math.max(observedWaitlist, position);
  const movement3 = waitlistAt(index3) - observedWaitlist;
  const movement7 = waitlistAt(index7) - observedWaitlist;
  const days = current.daysRemaining;
  const near7 = days <= 7 ? 1 : 0;
  const secondSubsession = getTerm(code) === "S" ? 1 : 0;
  const positionToCapacity = capacity ? position / capacity : 0;
  const waitlistToCapacity = capacity ? waitlist / capacity : 0;
  return {
    position_to_capacity: positionToCapacity,
    waitlist_to_capacity: waitlistToCapacity,
    days_to_deadline: days,
    movement_3d: movement3,
    movement_7d: movement7,
    position,
    waitlist,
    capacity,
    capacity_changed_7d: Number(capacity !== capacity7),
    position_to_waitlist: waitlist ? position / waitlist : 0,
    days_squared: days ** 2,
    log_waitlist: Math.log1p(waitlist),
    movement_velocity_7d: movement7 / 7,
    near_deadline_7d: near7,
    days_under_7: Math.max(7 - days, 0),
    days_under_14: Math.max(14 - days, 0),
    days_over_60: Math.max(days - 60, 0),
    second_subsession_days: secondSubsession * days,
    second_subsession_near_7d: secondSubsession * near7,
    position_ratio_near_7d: positionToCapacity * near7,
    waitlist_ratio_near_7d: waitlistToCapacity * near7,
    course_code: code,
    campus: campusFaculty(code),
    term: getTerm(code) === "F" ? "fall" : getTerm(code) === "S" ? "winter" : "full_year"
  };
}

function applyCalibration(probability, calibration) {
  if (!calibration || calibration.method === "none") return probability;
  if (calibration.method === "platt") {
    const bounded = Math.min(Math.max(probability, 1e-6), 1 - 1e-6);
    const logit = Math.log(bounded / (1 - bounded));
    return 1 / (1 + Math.exp(-(calibration.intercept + calibration.coefficient * logit)));
  }
  if (calibration.method === "isotonic") {
    const x = calibration.x;
    const y = calibration.y;
    if (probability <= x[0]) return y[0];
    if (probability >= x.at(-1)) return y.at(-1);
    const upper = x.findIndex(value => value >= probability);
    const weight = (probability - x[upper - 1]) / (x[upper] - x[upper - 1]);
    return y[upper - 1] + weight * (y[upper] - y[upper - 1]);
  }
  return probability;
}

function predictModel(model, features) {
  let score = model.intercept;
  model.numeric_features.forEach((feature, index) => {
    const value = Number.isFinite(features[feature]) ? features[feature] : 0;
    const scale = model.numeric_scale[index] || 1;
    score += ((value - model.numeric_mean[index]) / scale) * model.numeric_coefficients[index];
  });
  model.categorical_features.forEach(feature => {
    const mapping = model.categorical_weights[feature];
    const value = String(features[feature]);
    if (Object.hasOwn(mapping, value)) score += mapping[value];
    else if (mapping.__infrequent_values__?.includes(value)) score += mapping.__infrequent__ ?? 0;
  });
  return applyCalibration(1 / (1 + Math.exp(-score)), model.calibration);
}

const DRIVER_GROUPS = {
  rank: {
    label: "Rank percentile",
    features: ["position_to_capacity", "position", "position_to_waitlist", "position_ratio_near_7d"]
  },
  waitlist: {
    label: "Waitlist size",
    features: ["waitlist_to_capacity", "waitlist", "log_waitlist", "waitlist_ratio_near_7d"]
  },
  timing: {
    label: "Time remaining",
    features: ["days_to_deadline", "days_squared", "near_deadline_7d", "days_under_7", "days_under_14", "days_over_60"]
  },
  movement: {
    label: "Recent movement",
    features: ["movement_3d", "movement_7d", "movement_velocity_7d"]
  },
  capacity: {
    label: "Section capacity",
    features: ["capacity", "capacity_changed_7d"]
  },
  course: { label: "Course history", features: ["course_code"] },
  campus: { label: "Campus context", features: ["campus"] },
  term: {
    label: "Course term",
    features: ["term", "second_subsession_days", "second_subsession_near_7d"]
  }
};

const DRIVER_GROUP_BY_FEATURE = Object.fromEntries(
  Object.entries(DRIVER_GROUPS).flatMap(([group, definition]) =>
    definition.features.map(feature => [feature, group])
  )
);

function categoricalContribution(model, feature, value) {
  const mapping = model.categorical_weights[feature];
  const category = String(value);
  if (Object.hasOwn(mapping, category)) return mapping[category];
  if (mapping.__infrequent_values__?.includes(category)) return mapping.__infrequent__ ?? 0;
  return 0;
}

function modelDrivers(model, features) {
  const totals = Object.fromEntries(Object.keys(DRIVER_GROUPS).map(group => [group, 0]));
  model.numeric_features.forEach((feature, index) => {
    const value = Number.isFinite(features[feature]) ? features[feature] : 0;
    const scale = model.numeric_scale[index] || 1;
    const contribution = ((value - model.numeric_mean[index]) / scale) * model.numeric_coefficients[index];
    totals[DRIVER_GROUP_BY_FEATURE[feature]] += contribution;
  });
  model.categorical_features.forEach(feature => {
    totals[DRIVER_GROUP_BY_FEATURE[feature]] += categoricalContribution(model, feature, features[feature]);
  });

  const ranked = Object.entries(totals)
    .map(([group, contribution]) => ({
      label: DRIVER_GROUPS[group].label,
      contribution,
      magnitude: Math.abs(contribution)
    }))
    .sort((left, right) => right.magnitude - left.magnitude);
  const thirdMagnitude = ranked[2]?.magnitude ?? 0;
  const closeThreshold = Math.max(0.05, thirdMagnitude * 0.70);
  return ranked.filter((driver, index) => index < 3 || (index < 7 && driver.magnitude >= closeThreshold));
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
      return { session, deadline, daysRemaining: Math.max(0, Math.round((deadline - Math.min(now, deadline)) / 86400)), course };
    } catch { /* Course is not offered in this session. */ }
  }
  throw new Error("course-not-found");
}

async function estimate(code, lecture, position) {
  const [current, artifact] = await Promise.all([getCurrentContext(code), loadModel()]);
  const selectedMeeting = current.course.meetings.find(meeting => meeting.meetingNumber === lecture && !meeting.isCancelled);
  if (!selectedMeeting) throw new Error("invalid-lecture");
  const features = modelFeatures(code, current, selectedMeeting, position);
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
  const historicalProbability = cleared / outcomes.length;
  const seasonalKey = isSummer(current.session) ? "summer" : "fall_winter";
  // Schema 4 is the first artifact trained on cumulative observed queue drops.
  const selectedModel = artifact?.schema_version >= 4 ? artifact.models?.[seasonalKey] : null;
  const modelProbability = selectedModel
    ? predictModel(selectedModel, features)
    : historicalProbability;
  return {
    current, selectedMeeting, outcomes, cleared,
    probability: Math.round(modelProbability * 100),
    drivers: selectedModel ? modelDrivers(selectedModel, features) : [],
    usedModel: Boolean(selectedModel),
    modelQuality: selectedModel?.quality ?? "legacy",
    seasonalKey
  };
}

function renderEstimate(code, lecture, position, data) {
  const term = getTerm(code) === "S" ? "Winter" : getTerm(code) === "F" ? "Fall" : "full-year";
  results.innerHTML = `<div class="result-grid">
    <div class="result-score"><div class="result-label">ORACLE'S ESTIMATE</div><div class="probability">${data.probability}%</div>${data.drivers.length ? `<div class="drivers"><div class="result-label driver-title">DRIVEN BY</div>${data.drivers.map(driver => `<div class="driver ${driver.contribution >= 0 ? "positive" : "negative"}"><span class="driver-sign">${driver.contribution >= 0 ? "+" : "−"}</span><span>${driver.label}</span></div>`).join("")}</div>` : ""}</div>
    <div><p class="result-summary">Position <strong>#${position}</strong> in ${code} cleared in <strong>${data.cleared} of ${data.outcomes.length}</strong> previous offerings.</p>
      <div class="outcomes">${data.outcomes.slice().reverse().map(item => `<div class="outcome"><span>${sessionLabel(item.session)} · ${item.meeting} · ${item.instructor}<br><small>${item.startWaitlist} waiting on the equivalent day · ${item.movement} spots moved</small></span><strong class="${item.cleared ? "" : "miss"}">${item.cleared ? "CLEARED" : "DID NOT CLEAR"}</strong></div>`).join("")}</div>
    </div>
    <p class="result-note">Compared ${data.current.daysRemaining} days before the ${term} waitlist deadline. Clearance is inferred from observed downward waitlist changes between collector snapshots. Some may be missed.${data.usedModel ? `${data.seasonalKey === "summer" ? " Summer estimates are less stable and should be treated with extra caution." : ""}` : " Historical percentage shown because the model is unavailable."}</p>
  </div>`;
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

function updateShareUrl(code, lecture, position) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("crs", code);
  url.searchParams.set("lec", lecture);
  url.searchParams.set("rnk", String(position));
  history.replaceState(null, "", url);
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
  try {
    renderEstimate(code, lecture, position, await estimate(code, lecture, position));
    updateShareUrl(code, lecture, position);
  }
  catch (error) { renderError(error); }
  finally { button.disabled = false; button.querySelector("span").textContent = "Ask the Oracle"; }
});

async function restoreSharedEstimate() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("crs") ?? "").trim().toUpperCase().replace(/\s/g, "");
  const lecture = (params.get("lec") ?? "").trim().toUpperCase();
  const position = Number(params.get("rnk"));
  if (!code || !lecture || !Number.isInteger(position) || position < 1) return;

  courseInput.value = code;
  const lectures = await loadLectures(code);
  if (!lectures.some(meeting => meeting.meetingNumber === lecture)) return;

  chooseLecture(lecture);
  form.position.value = position;
  form.requestSubmit();
}

loadModel();
loadCourseOptions().then(restoreSharedEstimate);

const methodologyDialog = document.querySelector("#methodology-dialog");
document.querySelector("#methodology-open").addEventListener("click", () => methodologyDialog.showModal());
methodologyDialog.addEventListener("click", event => {
  if (event.target === methodologyDialog) methodologyDialog.close();
});
