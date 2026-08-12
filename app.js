const DATA_ROOT = "https://raw.githubusercontent.com/ICPRplshelp/Enrollment-Data/master";
let SESSIONS = [];
let CURRENT_SESSION = null;
const form = document.querySelector("#oracle-form");
const results = document.querySelector("#results");
const courseInput = document.querySelector("#course");
const courseList = document.querySelector("#course-options");
const lectureInput = document.querySelector("#lecture-display");
const lectureValue = document.querySelector("#lecture");
const lectureList = document.querySelector("#lecture-options");
const positionInput = document.querySelector("#position");
const submitButton = form.querySelector('button[type="submit"]');
let courseOptions = [];
let activeOption = -1;
let modelPromise;
let isSubmitting = false;
let lectureRequestId = 0;
const lectureRankLimits = new Map();
const jsonCache = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formIsReady() {
  const position = Number(positionInput.value);
  const rankLimit = lectureRankLimits.get(lectureValue.value);
  return courseOptions.includes(courseInput.value.trim().toUpperCase())
    && Boolean(lectureValue.value)
    && Number.isInteger(position)
    && position > 0
    && Number.isFinite(rankLimit)
    && position < rankLimit;
}

function updateFormState() {
  submitButton.disabled = isSubmitting || !formIsReady();
}

function updateRankState() {
  updateFormState();
}

function applyPositionLimit() {
  if (!lectureValue.value) {
    document.querySelector("#position-help").textContent = "Your place on the waitlist";
    updateFormState();
    return;
  }
  const limit = Math.max(1, lectureRankLimits.get(lectureValue.value) ?? 1);
  document.querySelector("#position-help").textContent = `Current range: 1–${limit - 1}`;
  updateRankState();
}

function markQueryChanged() {
  updateFormState();
}

export function campusDigit(code) { return code.match(/[HY]([135])[FSY]$/)?.[1] ?? "1"; }
export function campusFaculty(code) { return campusDigit(code) === "3" ? "SCAR" : campusDigit(code) === "5" ? "ERIN" : "ARTSC"; }
const isSummer = session => session.endsWith("5");
const sessionLabel = session => isSummer(session) ? `Summer ${session.slice(0,4)}` : `Fall/Winter ${session.slice(0,4)}–${Number(session.slice(0,4)) + 1}`;
export function getTerm(code) { return code.at(-1); }
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

export function parseSessionManifest(manifest) {
  const sessions = manifest?.sessions?.map(item => String(item.sessionCode))
    .filter(session => /^\d{5}$/.test(session)) ?? [];
  const uniqueSessions = [...new Set(sessions)].sort();
  const current = String(manifest?.default ?? "");
  if (!uniqueSessions.length || !uniqueSessions.includes(current)) {
    throw new Error("session-manifest-invalid");
  }
  return {sessions: uniqueSessions, current};
}

async function loadSessionManifest() {
  const parsed = parseSessionManifest(await fetchJson("sessions.json"));
  SESSIONS = parsed.sessions;
  CURRENT_SESSION = parsed.current;
}

function loadModel() {
  modelPromise ??= fetch("model/oracle-model.json?v=8")
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
  const requestId = ++lectureRequestId;
  lectureRankLimits.clear();
  lectureValue.value = "";
  lectureInput.value = "";
  lectureInput.placeholder = "LOADING LECTURES…";
  lectureInput.disabled = true;
  lectureList.hidden = true;
  try {
    const current = await getCurrentContext(code);
    if (requestId !== lectureRequestId || courseInput.value.trim().toUpperCase() !== code) return [];
    const { course } = current;
    const lectures = course.meetings.filter(meeting =>
      !meeting.isCancelled && meeting.enrollmentLogs?.length && /^LEC/i.test(meeting.meetingNumber ?? "")
    );
    lectures.forEach(meeting => {
      const snapshotIndex = meetingSnapshotAt(course, meeting, current.deadline, current.daysRemaining);
      if (snapshotIndex < 0) return;
      const snapshotTime = course.timeIntervals[snapshotIndex];
      const demand = meeting.enrollmentLogs[snapshotIndex];
      const observedWaitlist = Math.max(demand - capacityAt(meeting, snapshotTime), 0);
      lectureRankLimits.set(meeting.meetingNumber, observedWaitlist + 6);
    });
    lectureList.innerHTML = lectures.map(meeting => {
      const instructors = meeting.instructors?.map(i => `${i.firstName} ${i.lastName}`).join(", ");
      const meetingNumber = escapeHtml(meeting.meetingNumber);
      return `<li role="option" data-lecture="${meetingNumber}"><b>${meetingNumber}</b><span>${escapeHtml(instructors || "Instructor unavailable")}</span></li>`;
    }).join("");
    lectureInput.placeholder = lectures.length ? "CHOOSE LECTURE" : "NO LECTURES FOUND";
    lectureInput.disabled = !lectures.length;
    return lectures;
  } catch {
    if (requestId !== lectureRequestId || courseInput.value.trim().toUpperCase() !== code) return [];
    lectureInput.placeholder = "LECTURES UNAVAILABLE";
    lectureInput.disabled = true;
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
  applyPositionLimit();
  markQueryChanged();
}

function chooseCourse(code) {
  courseInput.value = code;
  closeCourseList();
  loadLectures(code);
  courseInput.focus();
  markQueryChanged();
}

function showCourseMatches() {
  const query = courseInput.value.trim().toUpperCase().replace(/\s/g, "");
  const matches = courseOptions.filter(code => code.includes(query)).slice(0, 8);
  activeOption = -1;
  courseList.innerHTML = matches.length
    ? matches.map(code => `<li role="option" data-code="${escapeHtml(code)}"><b>${escapeHtml(code)}</b><span>${escapeHtml(courseMeta(code))}</span></li>`).join("")
    : `<li class="empty">No matching courses</li>`;
  courseList.hidden = false;
  courseInput.setAttribute("aria-expanded", "true");
}

async function loadCourseOptions() {
  try {
    courseOptions = flattenCourseList(await fetchJson(`${CURRENT_SESSION}/AAclistall.json`));
  } catch {
    document.querySelector("#course-help").textContent = "Course list unavailable — refresh to try again";
  }
  updateFormState();
}

courseInput.addEventListener("focus", showCourseMatches);
courseInput.addEventListener("input", () => {
  lectureRequestId += 1;
  courseInput.value = courseInput.value.toUpperCase().replace(/\s/g, "");
  lectureValue.value = "";
  lectureInput.value = "";
  lectureInput.placeholder = "CHOOSE COURSE FIRST";
  lectureInput.disabled = true;
  closeLectureList();
  showCourseMatches();
  markQueryChanged();
});
positionInput.addEventListener("input", () => {
  updateRankState();
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

export function capacityAt(meeting, timestamp) {
  const complex = meeting.enrollmentCapComplex;
  if (!complex) return meeting.enrollmentCap;
  let capacity = complex.initialCap ?? meeting.enrollmentCap;
  for (const change of complex.capChanges ?? []) {
    const time = change.time ?? change.timing ?? change.timestamp ?? 0;
    if (time <= timestamp) capacity = change.newCapacity ?? change.capAfter ?? change.newCap ?? change.capacity ?? capacity;
  }
  return capacity;
}

export function snapshotAt(course, deadline, daysRemaining, maximumIndex = course.timeIntervals.length - 1) {
  const target = deadline - daysRemaining * 86400;
  let index = 0;
  let distance = Infinity;
  course.timeIntervals.slice(0, maximumIndex + 1).forEach((time, i) => {
    if (time <= deadline && Math.abs(time - target) < distance) { index = i; distance = Math.abs(time - target); }
  });
  return distance === Infinity ? -1 : index;
}

export function meetingSnapshotAt(course, meeting, deadline, daysRemaining) {
  const available = Math.min(course.timeIntervals.length, meeting.enrollmentLogs?.length ?? 0);
  return available ? snapshotAt(course, deadline, daysRemaining, available - 1) : -1;
}

export function analyzeMeeting(course, meeting, deadline, daysRemaining, position) {
  const startIndex = meetingSnapshotAt(course, meeting, deadline, daysRemaining);
  const endIndex = meetingSnapshotAt(course, meeting, deadline, 0);
  if (startIndex < 0 || endIndex < 0) return null;
  const startTime = course.timeIntervals[startIndex];
  const startDemand = meeting.enrollmentLogs[startIndex];
  const startWaitlist = Math.max(startDemand - capacityAt(meeting, startTime), 0);
  // A position that never existed in that offering is not evidence either way.
  if (startWaitlist < position) return null;
  const endTime = course.timeIntervals[endIndex];
  const endWaitlist = Math.max(meeting.enrollmentLogs[endIndex] - capacityAt(meeting, endTime), 0);
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

export function modelFeatures(code, current, meeting, position) {
  const course = current.course;
  const deadline = current.deadline;
  const index = meetingSnapshotAt(course, meeting, deadline, current.daysRemaining);
  const index3 = meetingSnapshotAt(course, meeting, deadline, current.daysRemaining + 3);
  const index7 = meetingSnapshotAt(course, meeting, deadline, current.daysRemaining + 7);
  if (index < 0 || index3 < 0 || index7 < 0) throw new Error("lecture-data-unavailable");
  const time = course.timeIntervals[index];
  const time7 = course.timeIntervals[index7];
  const capacity = capacityAt(meeting, time);
  const capacity7 = capacityAt(meeting, time7);
  const waitlistAt = snapshotIndex => Math.max(
    meeting.enrollmentLogs[snapshotIndex] - capacityAt(meeting, course.timeIntervals[snapshotIndex]),
    0
  );
  const observedWaitlist = waitlistAt(index);
  const waitlist = Math.max(observedWaitlist, position);
  const movement3 = waitlistAt(index3) - observedWaitlist;
  const movement7 = waitlistAt(index7) - observedWaitlist;
  const days = current.daysRemaining;
  const near7 = days <= 7 ? 1 : 0;
  const secondSubsession = getTerm(code) === "S" ? 1 : 0;
  const campus = campusFaculty(code);
  const term = getTerm(code) === "F" ? "fall" : getTerm(code) === "S" ? "winter" : "full_year";
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
    position_to_waitlist: waitlist ? Math.min(position / waitlist, 1) : 1,
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
    rank_over_30pct: Number(positionToCapacity > 0.30),
    campus_erin: Number(campus === "ERIN"),
    campus_scar: Number(campus === "SCAR"),
    term_winter: Number(term === "winter"),
    term_full_year: Number(term === "full_year"),
    winter_near_7d: Number(term === "winter") * near7,
    scar_near_7d: Number(campus === "SCAR") * near7,
    course_code: code,
    campus,
    term
  };
}

function applyCalibration(probability, calibration) {
  if (!calibration || calibration.method === "none") return probability;
  if (calibration.method === "platt") {
    const bounded = Math.min(Math.max(probability, 1e-6), 1 - 1e-6);
    const logit = Math.log(bounded / (1 - bounded));
    const parameters = calibration.parameters ?? calibration;
    if (!Number.isFinite(parameters.intercept) || !Number.isFinite(parameters.coefficient)) {
      throw new Error("invalid-calibration");
    }
    return 1 / (1 + Math.exp(-(parameters.intercept + parameters.coefficient * logit)));
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
  if (model.trees) {
    const values = model.numeric_features.map((feature, index) =>
      Number.isFinite(features[feature]) ? features[feature] : model.imputation_values[index]
    );
    let score = model.baseline_log_odds;
    model.trees.forEach(tree => {
      let index = 0;
      while (!tree[index].leaf) {
        const node = tree[index];
        const value = values[node.feature];
        const goLeft = Number.isNaN(value) ? node.missing_left : value <= node.threshold;
        index = goLeft ? node.left : node.right;
      }
      score += tree[index].value;
    });
    return applyCalibration(1 / (1 + Math.exp(-score)), model.calibration);
  }
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
    features: ["position_to_capacity", "position", "position_to_waitlist", "position_ratio_near_7d", "rank_over_30pct"]
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
  campus: { label: "Campus context", features: ["campus", "campus_erin", "campus_scar", "scar_near_7d"] },
  term: {
    label: "Course term",
    features: ["term", "second_subsession_days", "second_subsession_near_7d", "term_winter", "term_full_year", "winter_near_7d"]
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

export function modelMedian(model, feature, fallback) {
  const index = model.numeric_features.indexOf(feature);
  const value = index >= 0 ? Number(model.imputation_values[index]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

export function coherentCounterfactual(model, features, group) {
  const counterfactual = {...features};
  const recomputeRankAndQueue = () => {
    counterfactual.position_to_capacity = counterfactual.capacity ? counterfactual.position / counterfactual.capacity : 0;
    counterfactual.waitlist_to_capacity = counterfactual.capacity ? counterfactual.waitlist / counterfactual.capacity : 0;
    counterfactual.position_to_waitlist = counterfactual.waitlist ? Math.min(counterfactual.position / counterfactual.waitlist, 1) : 1;
    counterfactual.log_waitlist = Math.log1p(counterfactual.waitlist);
    counterfactual.position_ratio_near_7d = counterfactual.position_to_capacity * counterfactual.near_deadline_7d;
    counterfactual.waitlist_ratio_near_7d = counterfactual.waitlist_to_capacity * counterfactual.near_deadline_7d;
    counterfactual.rank_over_30pct = Number(counterfactual.position_to_capacity > 0.30);
  };
  const recomputeTiming = () => {
    const days = counterfactual.days_to_deadline;
    counterfactual.days_squared = days ** 2;
    counterfactual.near_deadline_7d = Number(days <= 7);
    counterfactual.days_under_7 = Math.max(7 - days, 0);
    counterfactual.days_under_14 = Math.max(14 - days, 0);
    counterfactual.days_over_60 = Math.max(days - 60, 0);
    counterfactual.second_subsession_days = Number(counterfactual.term === "winter") * days;
    counterfactual.second_subsession_near_7d = Number(counterfactual.term === "winter") * counterfactual.near_deadline_7d;
    counterfactual.winter_near_7d = counterfactual.term_winter * counterfactual.near_deadline_7d;
    counterfactual.scar_near_7d = counterfactual.campus_scar * counterfactual.near_deadline_7d;
    recomputeRankAndQueue();
  };
  if (group === "rank") {
    counterfactual.position = Math.max(1, modelMedian(model, "position", counterfactual.position));
    counterfactual.waitlist = Math.max(counterfactual.waitlist, counterfactual.position);
    recomputeRankAndQueue();
  } else if (group === "waitlist") {
    counterfactual.waitlist = Math.max(counterfactual.position, modelMedian(model, "waitlist", counterfactual.waitlist));
    recomputeRankAndQueue();
  } else if (group === "timing") {
    counterfactual.days_to_deadline = Math.max(0, modelMedian(model, "days_to_deadline", counterfactual.days_to_deadline));
    recomputeTiming();
  } else if (group === "movement") {
    counterfactual.movement_3d = modelMedian(model, "movement_3d", counterfactual.movement_3d);
    counterfactual.movement_7d = modelMedian(model, "movement_7d", counterfactual.movement_7d);
    counterfactual.movement_velocity_7d = counterfactual.movement_7d / 7;
  } else if (group === "capacity") {
    counterfactual.capacity = Math.max(1, modelMedian(model, "capacity", counterfactual.capacity));
    counterfactual.capacity_changed_7d = Number(modelMedian(model, "capacity_changed_7d", counterfactual.capacity_changed_7d) >= 0.5);
    recomputeRankAndQueue();
  } else if (group === "campus") {
    const erin = modelMedian(model, "campus_erin", 0);
    const scar = modelMedian(model, "campus_scar", 0);
    counterfactual.campus = erin >= 0.5 ? "ERIN" : scar >= 0.5 ? "SCAR" : "ARTSC";
    counterfactual.campus_erin = Number(counterfactual.campus === "ERIN");
    counterfactual.campus_scar = Number(counterfactual.campus === "SCAR");
    counterfactual.scar_near_7d = counterfactual.campus_scar * counterfactual.near_deadline_7d;
  } else if (group === "term") {
    const winter = modelMedian(model, "term_winter", 0);
    const fullYear = modelMedian(model, "term_full_year", 0);
    counterfactual.term = winter >= 0.5 ? "winter" : fullYear >= 0.5 ? "full_year" : "fall";
    counterfactual.term_winter = Number(counterfactual.term === "winter");
    counterfactual.term_full_year = Number(counterfactual.term === "full_year");
    recomputeTiming();
  }
  return counterfactual;
}

function modelDrivers(model, features) {
  if (model.trees) {
    const probability = predictModel(model, features);
    const ranked = Object.entries(DRIVER_GROUPS).filter(([, definition]) =>
      definition.features.some(feature => model.numeric_features.includes(feature))
    ).map(([group, definition]) => {
      const counterfactual = coherentCounterfactual(model, features, group);
      const contribution = probability - predictModel(model, counterfactual);
      return {label: definition.label, contribution, magnitude: Math.abs(contribution)};
    }).sort((left, right) => right.magnitude - left.magnitude);
    const thirdMagnitude = ranked[2]?.magnitude ?? 0;
    const closeThreshold = Math.max(0.005, thirdMagnitude * 0.70);
    return ranked.filter((driver, index) => index < 3 || (index < 7 && driver.magnitude >= closeThreshold));
  }
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
  const session = CURRENT_SESSION;
  let course;
  try {
    course = await fetchJson(`${session}/${code}.json`);
  } catch (error) {
    if (error.message === "404") throw new Error("course-not-found");
    throw new Error("current-data-unavailable", {cause: error});
  }
  try {
    const deadline = await deadlineFor(session, code);
    if (!deadline) throw new Error("current-data-unavailable");
    const now = Math.floor(Date.now() / 1000);
    return {
      session,
      deadline,
      daysRemaining: Math.max(0, Math.round((deadline - Math.min(now, deadline)) / 86400)),
      course
    };
  } catch (error) {
    if (error.message === "current-data-unavailable") throw error;
    throw new Error("current-data-unavailable", {cause: error});
  }
}

async function estimate(code, lecture, position) {
  const [current, artifact] = await Promise.all([getCurrentContext(code), loadModel()]);
  const modelMaxPosition = Number(artifact?.training_support?.max_position);
  if (Number.isFinite(modelMaxPosition) && position > modelMaxPosition) {
    throw new Error("rank-outside-model");
  }
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
  const historyStatus = outcomes.length
    ? "available"
    : historical.some(item => item.found)
      ? "position-never-reached"
      : "no-history";
  const cleared = outcomes.filter(item => item.cleared).length;
  const historicalProbability = outcomes.length ? cleared / outcomes.length : null;
  const seasonalKey = isSummer(current.session) ? "summer" : "fall_winter";
  // Schema 4 introduced observed-drop targets; schema 7 switches to net shrinkage.
  const selectedModel = artifact?.schema_version >= 4 ? artifact.models?.[seasonalKey] : null;
  if (artifact?.schema_version >= 7 && !["validated", "experimental"].includes(selectedModel?.quality)) {
    throw new Error("model-not-validated");
  }
  const modelProbability = selectedModel
    ? predictModel(selectedModel, features)
    : historicalProbability;
  if (modelProbability === null) throw new Error("model-unavailable");
  return {
    current, selectedMeeting, outcomes, cleared, historyStatus,
    probability: Math.round(modelProbability * 100),
    drivers: selectedModel ? modelDrivers(selectedModel, features) : [],
    usedModel: Boolean(selectedModel),
    modelQuality: selectedModel?.quality ?? "legacy",
    seasonalKey
  };
}

function renderEstimate(code, lecture, position, data) {
  const term = getTerm(code) === "S" ? "Winter" : getTerm(code) === "F" ? "Fall" : "full-year";
  const safeCode = escapeHtml(code);
  const historyPane = data.historyStatus === "available"
    ? `<p class="result-summary">The waitlist shrank by at least <strong>${position} ${position === 1 ? "position" : "positions"}</strong> in ${safeCode} in <strong>${data.cleared} of ${data.outcomes.length}</strong> previous offerings.</p>
      <div class="outcomes">${data.outcomes.slice().reverse().map(item => `<div class="outcome"><span>${escapeHtml(sessionLabel(item.session))} · ${escapeHtml(item.meeting)} · ${escapeHtml(item.instructor)}<br><small>${Number(item.startWaitlist)} waiting on the equivalent day · ${Number(item.movement)} spots of net shrinkage</small></span><strong class="${item.cleared ? "" : "miss"}">${item.cleared ? "REACHED" : "DID NOT REACH"}</strong></div>`).join("")}</div>`
    : `<div class="history-empty"><p class="error-message">${data.historyStatus === "position-never-reached" ? "The course was found, but the waitlist has never been this high." : "The course was found, but it has no previous offerings in the archive."}</p></div>`;
  results.innerHTML = `<div class="result-grid">
    <div class="result-score"><div class="result-label">ORACLE'S ESTIMATE</div><div class="probability">${data.probability}%</div>${data.drivers.length ? `<div class="drivers"><div class="result-label driver-title">DRIVEN BY</div>${data.drivers.map(driver => `<div class="driver ${driver.contribution >= 0 ? "positive" : "negative"}"><span class="driver-sign">${driver.contribution >= 0 ? "+" : "−"}</span><span>${driver.label}</span></div>`).join("")}</div>` : ""}</div>
    <div>${historyPane}</div>
    <p class="result-note">Compared ${data.current.daysRemaining} days before the ${term} waitlist deadline. This estimates whether net waitlist shrinkage will be at least your position. It cannot tell whether you personally will get into the course. Departures behind you may be counted, while movement hidden by offsetting arrivals between snapshots may be missed.${data.usedModel ? `${data.modelQuality === "experimental" ? " The Summer model is experimental because it missed strict calibration checks, so treat its percentage with extra caution." : ""}` : " Historical percentage shown because the model is unavailable. It is the success rate of the previous lecture offerings listed above."}</p>
  </div>`;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderError(error) {
  const copy = error.message === "invalid-course"
      ? "Choose one of the courses shown in the list."
    : error.message === "invalid-lecture"
      ? "Choose one of the available lecture sections."
    : error.message === "lecture-data-unavailable"
      ? "This lecture does not have enough current history for an estimate."
    : error.message === "model-unavailable"
      ? "The model and historical percentage are both unavailable for this query."
    : error.message === "model-not-validated"
      ? "The latest model has not passed its release checks, so no estimate is available."
    : error.message === "current-data-unavailable"
      ? "The current session data could not be loaded. Refresh and try again."
      : "I couldn't find that exact course code in the public archive.";
  results.innerHTML = `<p class="result-label">THE ORACLE CAME UP EMPTY</p><p class="error-message">${copy}</p>`;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth" });
}

function renderRangeError() {
  results.innerHTML = `<p class="error-message">Your rank is outside the Oracle's range, and has probably never happened before in any lecture.</p>`;
  results.dataset.state = "range-error";
  results.hidden = false;
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
  const code = form.course.value.trim().toUpperCase().replace(/\s/g, "");
  const lecture = form.lecture.value;
  const position = Number(form.position.value);
  if (!formIsReady()) return;
  isSubmitting = true;
  updateFormState();
  submitButton.querySelector("span").textContent = "Reading history…";
  try {
    renderEstimate(code, lecture, position, await estimate(code, lecture, position));
    updateShareUrl(code, lecture, position);
  }
  catch (error) {
    if (error.message === "rank-outside-model") renderRangeError();
    else renderError(error);
  }
  finally { isSubmitting = false; submitButton.querySelector("span").textContent = "Ask the Oracle"; updateFormState(); }
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
  updateRankState();
  form.requestSubmit();
}

async function bootstrap() {
  loadModel();
  try {
    await loadSessionManifest();
    await loadCourseOptions();
    await restoreSharedEstimate();
  } catch {
    document.querySelector("#course-help").textContent = "Current course list unavailable — refresh to try again";
    updateFormState();
  }
}

bootstrap();

const methodologyDialog = document.querySelector("#methodology-dialog");
document.querySelector("#methodology-open").addEventListener("click", () => methodologyDialog.showModal());
methodologyDialog.addEventListener("click", event => {
  if (event.target === methodologyDialog) methodologyDialog.close();
});
