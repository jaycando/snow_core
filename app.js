const STORAGE_KEYS = {
  questions: "sf_questions",
  attempts: "sf_attempts",
  review: "sf_review"
};

const SAMPLE_QUESTIONS = [
  {
    id: "SAMPLE-001",
    category: "샘플",
    question: "샘플: 2 + 2 = ?",
    choices: [
      { key: "A", text: "3" },
      { key: "B", text: "4" },
      { key: "C", text: "5" }
    ],
    correct: ["B"],
    multiSelect: false,
    maxSelect: 1,
    tags: ["demo"],
    difficulty: "easy",
    priority: false,
    source: "sample"
  },
  {
    id: "SAMPLE-002",
    category: "샘플",
    question: "샘플: 학습 모드에서 정답을 확인하려면 무엇을 누르나요?",
    choices: [
      { key: "A", text: "정답 확인" },
      { key: "B", text: "시험 종료" },
      { key: "C", text: "가져오기" }
    ],
    correct: ["A"],
    multiSelect: false,
    maxSelect: 1,
    tags: ["demo"],
    difficulty: "easy",
    priority: false,
    source: "sample"
  },
  {
    id: "SF-001",
    category: "아키텍처 레이어",
    question:
      "Snowflake의 기본 클라우드 인프라와 관련하여 다음 중 사실인 진술은 무엇입니까? (3개 선택)",
    choices: [
      {
        key: "A",
        text: "Snowflake 데이터와 서비스는 클라우드 공급자 지역 내의 단일 가용성 영역에 배포됩니다."
      },
      {
        key: "B",
        text: "Snowflake 데이터와 서비스는 단일 클라우드 공급자와 단일 지역에서만 제공됩니다."
      },
      {
        key: "C",
        text: "Snowflake는 고객의 자체 컴퓨팅 및 스토리지 리소스를 사용하는 프라이빗 클라우드에 배포될 수 있습니다."
      }
    ],
    correct: [],
    multiSelect: true,
    maxSelect: 3,
    tags: [],
    difficulty: "medium",
    priority: false,
    source: "Snowflake_pool.pdf"
  },
  {
    id: "SF-002",
    category: "Snowsight",
    question:
      "Snowflake 웹 인터페이스(UI)의 쿼리 기록 페이지에 쿼리가 얼마나 오랫동안 표시되나요?",
    choices: [
      { key: "A", text: "60분" },
      { key: "B", text: "24시간" },
      { key: "C", text: "14일" },
      { key: "D", text: "30일" }
    ],
    correct: [],
    multiSelect: false,
    maxSelect: 1,
    tags: [],
    difficulty: "easy",
    priority: false,
    source: "Snowflake_pool.pdf"
  }
];

const HAS_SEED_QUESTIONS =
  typeof window !== "undefined" &&
  Array.isArray(window.SNOWFLAKE_QUESTIONS) &&
  window.SNOWFLAKE_QUESTIONS.length > 0;
const DEFAULT_QUESTIONS = HAS_SEED_QUESTIONS ? window.SNOWFLAKE_QUESTIONS : SAMPLE_QUESTIONS;

const state = {
  questions: [],
  attempts: [],
  review: {},
  view: "dashboard",
  usingSample: false,
  bankFilters: {
    search: "",
    category: "",
    difficulty: "",
    tag: "",
    onlyStarred: false,
    onlyWithKey: false
  },
  studySession: null,
  examSession: null,
  examTimer: null,
  pendingImport: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMultiline = (value) => escapeHtml(value).replace(/\n/g, "<br />");

const toast = (message) => {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
};

const saveJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const loadJson = (key, fallback) => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return fallback;
  }
};

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

const normalizeChoiceKey = (value) =>
  String(value || "")
    .trim()
    .replace(/[.\s]/g, "")
    .toUpperCase();

const isAnswerCorrect = (question, selected) => {
  if (!question.correct || question.correct.length === 0) return null;
  const normalizedSelected = [...new Set(selected.map(normalizeChoiceKey))].sort();
  const normalizedCorrect = [...new Set(question.correct.map(normalizeChoiceKey))].sort();
  if (normalizedSelected.length !== normalizedCorrect.length) return false;
  return normalizedSelected.every((value, index) => value === normalizedCorrect[index]);
};

const ensurePdfWorker = () => {
  if (!window.pdfjsLib) return;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
};

const buildId = (index) => `Q${String(index).padStart(4, "0")}`;

const normalizeQuestion = (raw, index = 0) => {
  const id = raw.id ? String(raw.id).trim() : buildId(index + 1);
  const category = raw.category ? String(raw.category).trim() : "";
  const question = raw.question ? String(raw.question).trim() : "";
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : String(raw.tags || "")
        .split(/[,|]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
  const difficulty = raw.difficulty ? String(raw.difficulty).trim() : "";
  const priority = Boolean(raw.priority);
  const starred = Boolean(raw.starred);
  const source = raw.source ? String(raw.source).trim() : "";
  const explanation = raw.explanation ? String(raw.explanation).trim() : "";

  let choices = raw.choices || raw.options || [];
  if (typeof choices === "string") {
    try {
      choices = JSON.parse(choices);
    } catch (error) {
      const parts = choices
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      choices = parts.map((part, idx) => {
        const match = part.match(/^([A-F])\s*[:.)-]{1,2}\s*(.+)$/);
        if (match) {
          return { key: match[1], text: match[2].trim() };
        }
        return {
          key: String.fromCharCode(65 + idx),
          text: part
        };
      });
    }
  }

  if (Array.isArray(choices)) {
    choices = choices
      .map((choice, idx) => {
        if (!choice) return null;
        if (typeof choice === "string") {
          return {
            key: String.fromCharCode(65 + idx),
            text: choice
          };
        }
        const key = normalizeChoiceKey(choice.key || choice.label || choice.option || "");
        return {
          key: key || String.fromCharCode(65 + idx),
          text: String(choice.text || choice.value || "").trim()
        };
      })
      .filter(Boolean)
      .filter((choice) => choice.text);
  }

  let correct = raw.correct || raw.correctAnswers || raw.answers || [];
  if (typeof correct === "string") {
    correct = correct
      .split(/[,|]/)
      .map((item) => normalizeChoiceKey(item))
      .filter(Boolean);
  }
  if (!Array.isArray(correct)) {
    correct = [];
  }

  const maxSelect = Number(raw.maxSelect || raw.max_select || raw.max) || (correct.length || 1);
  const multiSelect = Boolean(raw.multiSelect || raw.multi_select || maxSelect > 1);

  return {
    id,
    category,
    question,
    choices,
    correct: correct.map(normalizeChoiceKey),
    multiSelect,
    maxSelect: multiSelect ? Math.max(maxSelect, 2) : 1,
    tags,
    difficulty,
    priority,
    starred,
    source,
    explanation
  };
};

const collectMeta = () => {
  const categories = unique(state.questions.map((q) => q.category));
  const tags = unique(state.questions.flatMap((q) => q.tags || []));
  const difficulties = unique(state.questions.map((q) => q.difficulty));
  return { categories, tags, difficulties };
};

const buildQuestionPool = (filters) => {
  const search = filters.search?.toLowerCase() || "";
  return state.questions.filter((question) => {
    if (filters.category && question.category !== filters.category) return false;
    if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
    if (filters.tag && !(question.tags || []).includes(filters.tag)) return false;
    if (filters.onlyStarred && !question.priority && !question.starred) return false;
    if (filters.onlyWithKey && (!question.correct || question.correct.length === 0)) return false;
    if (!search) return true;
    const target = `${question.question} ${(question.tags || []).join(" ")}`.toLowerCase();
    return target.includes(search);
  });
};

const setView = (view) => {
  state.view = view;
  $$(".view").forEach((section) => section.classList.remove("active"));
  const active = $(`#view-${view}`);
  if (active) active.classList.add("active");

  $$(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  renderView(view);
};

const renderView = (view) => {
  if (view === "dashboard") renderDashboard();
  if (view === "bank") renderBank();
  if (view === "study") renderStudy();
  if (view === "exam") renderExam();
  if (view === "review") renderReview();
  if (view === "import") renderImport();
};

const renderDashboard = () => {
  const container = $("#dashboard-content");
  const total = state.questions.length;
  const withKey = state.questions.filter((q) => q.correct && q.correct.length > 0).length;
  const categories = unique(state.questions.map((q) => q.category)).length;
  const attempts = state.attempts.length;
  let correct = 0;
  let incorrect = 0;
  state.attempts.forEach((attempt) => {
    attempt.items.forEach((item) => {
      if (item.correct === true) correct += 1;
      if (item.correct === false) incorrect += 1;
    });
  });
  const accuracy = correct + incorrect > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0;

  container.innerHTML = "";

  if (state.usingSample) {
    const callout = document.createElement("div");
    callout.className = "callout";
    callout.textContent = "현재 샘플 데이터가 로드되어 있습니다. PDF/JSON/CSV를 가져와 실제 문제은행으로 교체하세요.";
    container.appendChild(callout);
  }

  const cards = [
    {
      title: "총 문제",
      value: total,
      detail: "문제은행에 등록된 전체 문항"
    },
    {
      title: "정답 키 보유",
      value: withKey,
      detail: "채점 가능한 문항 수"
    },
    {
      title: "카테고리",
      value: categories,
      detail: "섹션/주제 범위"
    },
    {
      title: "전체 정확도",
      value: `${accuracy}%`,
      detail: "학습/시험 모드 기준"
    },
    {
      title: "시험 기록",
      value: attempts,
      detail: "완료된 시험 모드 세션"
    }
  ];

  const grid = document.createElement("div");
  grid.className = "grid";
  cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <h3>${card.title}</h3>
      <div class="stat">${card.value}</div>
      <p>${card.detail}</p>
    `;
    grid.appendChild(el);
  });

  const quick = document.createElement("div");
  quick.className = "card";
  quick.innerHTML = `
    <h3>빠른 시작</h3>
    <p>바로 학습 또는 시험을 시작할 수 있습니다.</p>
    <div class="question-actions">
      <button class="btn" id="quick-study">학습 모드 시작</button>
      <button class="btn secondary" id="quick-exam">시험 모드 시작</button>
    </div>
  `;

  container.appendChild(grid);
  container.appendChild(quick);

  $("#quick-study").addEventListener("click", () => setView("study"));
  $("#quick-exam").addEventListener("click", () => setView("exam"));
};

const renderBank = () => {
  const controls = $("#bank-controls");
  const list = $("#bank-list");
  const meta = collectMeta();
  const { search, category, difficulty, tag, onlyStarred, onlyWithKey } = state.bankFilters;

  controls.innerHTML = `
    <div class="panel-row">
      <input class="input" id="bank-search" placeholder="질문 검색" value="${search}" />
      <select class="select" id="bank-category">
        <option value="">전체 카테고리</option>
        ${meta.categories.map((item) => `<option value="${item}" ${item === category ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <select class="select" id="bank-difficulty">
        <option value="">난이도 전체</option>
        ${meta.difficulties.map((item) => `<option value="${item}" ${item === difficulty ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <select class="select" id="bank-tag">
        <option value="">태그 전체</option>
        ${meta.tags.map((item) => `<option value="${item}" ${item === tag ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <label class="tag"><input type="checkbox" id="bank-star" ${onlyStarred ? "checked" : ""}/> 우선 학습</label>
      <label class="tag"><input type="checkbox" id="bank-key" ${onlyWithKey ? "checked" : ""}/> 정답 키 있음</label>
    </div>
  `;

  const updateFilters = () => {
    state.bankFilters.search = $("#bank-search").value;
    state.bankFilters.category = $("#bank-category").value;
    state.bankFilters.difficulty = $("#bank-difficulty").value;
    state.bankFilters.tag = $("#bank-tag").value;
    state.bankFilters.onlyStarred = $("#bank-star").checked;
    state.bankFilters.onlyWithKey = $("#bank-key").checked;
    renderBankList(list);
  };

  [
    "#bank-search",
    "#bank-category",
    "#bank-difficulty",
    "#bank-tag",
    "#bank-star",
    "#bank-key"
  ].forEach((selector) => {
    controls.querySelector(selector).addEventListener("input", updateFilters);
  });

  renderBankList(list);
};

const renderBankList = (list) => {
  const filtered = buildQuestionPool(state.bankFilters);
  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = "<div class=\"callout\">조건에 맞는 문제가 없습니다.</div>";
    return;
  }

  filtered.forEach((question) => {
    const card = document.createElement("div");
    card.className = "question-card";
    const correctCount = question.correct?.length || 0;
    const tags = (question.tags || [])
      .map((tag) => `<span class=\"chip\">${escapeHtml(tag)}</span>`)
      .join("");
    const questionText = formatMultiline(question.question);
    const categoryLabel = question.category ? escapeHtml(question.category) : "";
    const difficultyLabel = question.difficulty ? escapeHtml(question.difficulty) : "";
    card.innerHTML = `
      <div class="question-meta">
        ${categoryLabel ? `<span class=\"chip\">${categoryLabel}</span>` : ""}
        ${difficultyLabel ? `<span class=\"chip\">${difficultyLabel}</span>` : ""}
        ${question.priority || question.starred ? `<span class=\"pill\">우선</span>` : ""}
        ${correctCount > 0 ? `<span class=\"pill\">정답 ${correctCount}</span>` : `<span class=\"badge\">정답 미확정</span>`}
      </div>
      <div class="question-title">${questionText}</div>
      ${tags ? `<div class=\"question-meta\">${tags}</div>` : ""}
      <div class="choices">
        ${question.choices
          .map(
            (choice) => `
              <div class="choice">
                <strong>${choice.key}.</strong>
                <span>${escapeHtml(choice.text)}</span>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="question-actions">
        <button class="btn secondary" data-action="edit" data-id="${question.id}">정답 키 수정</button>
        <button class="btn ghost" data-action="star" data-id="${question.id}">${
          question.priority || question.starred ? "우선 해제" : "우선 등록"
        }</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => openAnswerKeyEditor(button.dataset.id));
  });
  list.querySelectorAll("[data-action='star']").forEach((button) => {
    button.addEventListener("click", () => {
      const question = state.questions.find((item) => item.id === button.dataset.id);
      if (!question) return;
      question.starred = !question.starred;
      saveJson(STORAGE_KEYS.questions, state.questions);
      renderBankList(list);
      toast(question.starred ? "우선 학습에 추가했습니다." : "우선 학습에서 제거했습니다.");
    });
  });
};

const renderStudy = () => {
  const container = $("#study-content");
  if (!state.studySession) {
    const meta = collectMeta();
    container.innerHTML = `
      <div class="panel session-panel">
        <div class="panel-row">
          <input class="input" id="study-count" type="number" min="1" max="200" value="10" />
          <select class="select" id="study-category">
            <option value="">전체 카테고리</option>
            ${meta.categories.map((item) => `<option value="${item}">${item}</option>`).join("")}
          </select>
          <select class="select" id="study-difficulty">
            <option value="">난이도 전체</option>
            ${meta.difficulties.map((item) => `<option value="${item}">${item}</option>`).join("")}
          </select>
          <label class="tag"><input type="checkbox" id="study-only-key" /> 정답 키 있는 문제만</label>
          <label class="tag"><input type="checkbox" id="study-shuffle" checked /> 무작위 섞기</label>
        </div>
        <div class="question-actions">
          <button class="btn" id="study-start">학습 시작</button>
        </div>
      </div>
    `;

    $("#study-start").addEventListener("click", () => {
      const count = Math.max(1, Number($("#study-count").value || 10));
      const filters = {
        search: "",
        category: $("#study-category").value,
        difficulty: $("#study-difficulty").value,
        tag: "",
        onlyStarred: false,
        onlyWithKey: $("#study-only-key").checked
      };
      const pool = buildQuestionPool(filters);
      if (pool.length === 0) {
        toast("선택한 조건에 맞는 문제가 없습니다.");
        return;
      }
      const selected = $("#study-shuffle").checked ? shuffle(pool) : pool;
      state.studySession = {
        questions: selected.slice(0, count),
        index: 0,
        selections: {},
        revealed: false,
        startedAt: Date.now()
      };
      renderStudy();
    });
    return;
  }

  const session = state.studySession;
  const question = session.questions[session.index];
  const selected = session.selections[question.id] || [];
  const evaluation = session.revealed ? isAnswerCorrect(question, selected) : null;
  const questionText = formatMultiline(question.question);

  container.innerHTML = `
    <div class="panel session-panel">
      <div class="session-header">
        <div>
          <div class="progress">${session.index + 1} / ${session.questions.length}</div>
          <div class="question-title">${questionText}</div>
        </div>
        <div>
          ${question.correct.length > 0 ? `<span class=\"pill\">정답 키 있음</span>` : `<span class=\"pill\">정답 미확정</span>`}
        </div>
      </div>
      <div class="choices" id="study-choices"></div>
      <div class="question-actions">
        <button class="btn" id="study-check">정답 확인</button>
        <button class="btn secondary" id="study-next">다음 문제</button>
        <button class="btn ghost" id="study-end">종료</button>
      </div>
    </div>
  `;

  const choicesContainer = $("#study-choices");
  choicesContainer.innerHTML = question.choices
    .map((choice) => {
      const isSelected = selected.includes(choice.key);
      let statusClass = "";
      if (session.revealed && question.correct.length > 0) {
        if (question.correct.includes(choice.key)) statusClass = "correct";
        else if (isSelected) statusClass = "wrong";
      }
      if (session.revealed && question.correct.length === 0 && isSelected) {
        statusClass = "unknown";
      }
      return `
        <label class="choice ${statusClass}">
          <input type="${question.multiSelect ? "checkbox" : "radio"}" name="study-choice" value="${choice.key}" ${
        isSelected ? "checked" : ""
      } />
          <strong>${choice.key}.</strong>
          <span>${escapeHtml(choice.text)}</span>
        </label>
      `;
    })
    .join("");

  choicesContainer.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const current = new Set(session.selections[question.id] || []);
      if (!question.multiSelect) {
        current.clear();
      }
      if (input.checked) {
        if (question.multiSelect && question.maxSelect && current.size >= question.maxSelect) {
          input.checked = false;
          toast(`최대 ${question.maxSelect}개까지 선택할 수 있습니다.`);
          return;
        }
        current.add(input.value);
      } else {
        current.delete(input.value);
      }
      session.selections[question.id] = Array.from(current);
    });
  });

  $("#study-check").addEventListener("click", () => {
    session.revealed = true;
    const result = isAnswerCorrect(question, session.selections[question.id] || []);
    if (result === false) {
      updateReview(question.id, false);
    }
    renderStudy();
  });

  $("#study-next").addEventListener("click", () => {
    session.revealed = false;
    if (session.index < session.questions.length - 1) {
      session.index += 1;
      renderStudy();
    } else {
      toast("학습 세션을 완료했습니다.");
      state.studySession = null;
      renderStudy();
    }
  });

  $("#study-end").addEventListener("click", () => {
    state.studySession = null;
    renderStudy();
  });

  if (session.revealed && evaluation === null) {
    const callout = document.createElement("div");
    callout.className = "callout";
    callout.textContent = "정답 키가 아직 없습니다. 문제은행에서 정답 키를 추가해주세요.";
    container.appendChild(callout);
  }
};

const renderExam = () => {
  const container = $("#exam-content");
  if (!state.examSession) {
    const meta = collectMeta();
    container.innerHTML = `
      <div class="panel session-panel">
        <div class="panel-row">
          <input class="input" id="exam-count" type="number" min="1" max="200" value="30" />
          <input class="input" id="exam-minutes" type="number" min="5" max="180" value="45" />
          <select class="select" id="exam-category">
            <option value="">전체 카테고리</option>
            ${meta.categories.map((item) => `<option value="${item}">${item}</option>`).join("")}
          </select>
          <select class="select" id="exam-difficulty">
            <option value="">난이도 전체</option>
            ${meta.difficulties.map((item) => `<option value="${item}">${item}</option>`).join("")}
          </select>
          <label class="tag"><input type="checkbox" id="exam-only-key" checked /> 정답 키 있는 문제만</label>
          <label class="tag"><input type="checkbox" id="exam-shuffle" checked /> 무작위 섞기</label>
        </div>
        <div class="question-actions">
          <button class="btn" id="exam-start">시험 시작</button>
        </div>
      </div>
    `;

    $("#exam-start").addEventListener("click", () => {
      const count = Math.max(1, Number($("#exam-count").value || 30));
      const minutes = Math.max(5, Number($("#exam-minutes").value || 45));
      const filters = {
        search: "",
        category: $("#exam-category").value,
        difficulty: $("#exam-difficulty").value,
        tag: "",
        onlyStarred: false,
        onlyWithKey: $("#exam-only-key").checked
      };
      const pool = buildQuestionPool(filters);
      if (pool.length === 0) {
        toast("선택한 조건에 맞는 문제가 없습니다.");
        return;
      }
      const selected = $("#exam-shuffle").checked ? shuffle(pool) : pool;
      state.examSession = {
        questions: selected.slice(0, count),
        index: 0,
        selections: {},
        flagged: {},
        startedAt: Date.now(),
        durationSec: minutes * 60,
        timeLeftSec: minutes * 60
      };
      startExamTimer();
      renderExam();
    });
    return;
  }

  const session = state.examSession;
  const question = session.questions[session.index];
  const selected = session.selections[question.id] || [];
  const questionText = formatMultiline(question.question);

  container.innerHTML = `
    <div class="session-panel">
      <div class="session-header">
        <div>
          <div class="progress">${session.index + 1} / ${session.questions.length}</div>
          <div class="question-title">${questionText}</div>
        </div>
        <div class="timer">${formatDuration(session.timeLeftSec)}</div>
      </div>
      <div class="exam-layout">
        <div class="exam-nav">
          <div class="exam-nav-grid" id="exam-nav-grid"></div>
          <div class="divider"></div>
          <button class="btn ghost" id="exam-submit">시험 종료</button>
        </div>
        <div>
          <div class="choices" id="exam-choices"></div>
          <div class="question-actions">
            <button class="btn secondary" id="exam-flag">${
              session.flagged[question.id] ? "마킹 해제" : "마킹"
            }</button>
            <button class="btn" id="exam-prev">이전</button>
            <button class="btn" id="exam-next">다음</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const navGrid = $("#exam-nav-grid");
  navGrid.innerHTML = session.questions
    .map((item, idx) => {
      const answered = (session.selections[item.id] || []).length > 0;
      const flagged = session.flagged[item.id];
      return `
        <button data-index="${idx}" class="${idx === session.index ? "active" : ""} ${flagged ? "flagged" : ""}">
          ${answered ? "●" : "○"} ${idx + 1}
        </button>
      `;
    })
    .join("");

  navGrid.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.index = Number(btn.dataset.index);
      renderExam();
    });
  });

  const choicesContainer = $("#exam-choices");
  choicesContainer.innerHTML = question.choices
    .map((choice) => {
      const isSelected = selected.includes(choice.key);
      return `
        <label class="choice">
          <input type="${question.multiSelect ? "checkbox" : "radio"}" name="exam-choice" value="${choice.key}" ${
        isSelected ? "checked" : ""
      } />
          <strong>${choice.key}.</strong>
          <span>${escapeHtml(choice.text)}</span>
        </label>
      `;
    })
    .join("");

  choicesContainer.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const current = new Set(session.selections[question.id] || []);
      if (!question.multiSelect) {
        current.clear();
      }
      if (input.checked) {
        if (question.multiSelect && question.maxSelect && current.size >= question.maxSelect) {
          input.checked = false;
          toast(`최대 ${question.maxSelect}개까지 선택할 수 있습니다.`);
          return;
        }
        current.add(input.value);
      } else {
        current.delete(input.value);
      }
      session.selections[question.id] = Array.from(current);
    });
  });

  $("#exam-flag").addEventListener("click", () => {
    session.flagged[question.id] = !session.flagged[question.id];
    renderExam();
  });

  $("#exam-prev").addEventListener("click", () => {
    if (session.index > 0) {
      session.index -= 1;
      renderExam();
    }
  });

  $("#exam-next").addEventListener("click", () => {
    if (session.index < session.questions.length - 1) {
      session.index += 1;
      renderExam();
    }
  });

  $("#exam-submit").addEventListener("click", () => finishExam());
};

const startExamTimer = () => {
  if (state.examTimer) clearInterval(state.examTimer);
  state.examTimer = setInterval(() => {
    if (!state.examSession) return;
    state.examSession.timeLeftSec -= 1;
    if (state.examSession.timeLeftSec <= 0) {
      finishExam(true);
      return;
    }
    const timerEl = $(".timer");
    if (timerEl) timerEl.textContent = formatDuration(state.examSession.timeLeftSec);
  }, 1000);
};

const finishExam = (autoSubmit = false) => {
  const session = state.examSession;
  if (!session) return;
  if (state.examTimer) clearInterval(state.examTimer);
  state.examTimer = null;

  let correct = 0;
  let incorrect = 0;
  let ungraded = 0;

  const items = session.questions.map((question) => {
    const selected = session.selections[question.id] || [];
    const result = isAnswerCorrect(question, selected);
    if (result === true) correct += 1;
    if (result === false) {
      incorrect += 1;
      updateReview(question.id, false);
    }
    if (result === null) ungraded += 1;
    return {
      questionId: question.id,
      selected,
      correct: result,
      flagged: Boolean(session.flagged[question.id])
    };
  });

  const attempt = {
    id: `attempt-${Date.now()}`,
    mode: "exam",
    startedAt: session.startedAt,
    finishedAt: Date.now(),
    durationSec: session.durationSec - session.timeLeftSec,
    items,
    score: {
      correct,
      incorrect,
      ungraded,
      total: session.questions.length
    }
  };

  state.attempts.unshift(attempt);
  saveJson(STORAGE_KEYS.attempts, state.attempts);

  state.examSession = null;
  renderExamResult(attempt, autoSubmit);
};

const renderExamResult = (attempt, autoSubmit) => {
  const container = $("#exam-content");
  const gradedTotal = attempt.score.correct + attempt.score.incorrect;
  const accuracy = gradedTotal > 0 ? Math.round((attempt.score.correct / gradedTotal) * 100) : 0;

  container.innerHTML = `
    <div class="panel session-panel">
      <div class="session-header">
        <div>
          <div class="question-title">시험 결과</div>
          <div class="muted">${autoSubmit ? "시간이 종료되어 자동 제출되었습니다." : "시험이 종료되었습니다."}</div>
        </div>
        <div class="timer">${formatDuration(attempt.durationSec)}</div>
      </div>
      <div class="result-grid">
        <div class="card">
          <h3>정답</h3>
          <div class="stat">${attempt.score.correct}</div>
          <p>채점 기준</p>
        </div>
        <div class="card">
          <h3>오답</h3>
          <div class="stat">${attempt.score.incorrect}</div>
          <p>복습 필요</p>
        </div>
        <div class="card">
          <h3>미채점</h3>
          <div class="stat">${attempt.score.ungraded}</div>
          <p>정답 키 없음</p>
        </div>
        <div class="card">
          <h3>정확도</h3>
          <div class="stat">${accuracy}%</div>
          <p>채점 가능한 문항 기준</p>
        </div>
      </div>
      <div class="divider"></div>
      <div class="question-actions">
        <button class="btn" id="exam-review">오답노트로 이동</button>
        <button class="btn secondary" id="exam-restart">새 시험 시작</button>
      </div>
    </div>
  `;

  $("#exam-review").addEventListener("click", () => setView("review"));
  $("#exam-restart").addEventListener("click", () => setView("exam"));
};

const updateReview = (questionId, correct) => {
  if (correct) return;
  const record = state.review[questionId] || { wrongCount: 0, lastWrongAt: 0 };
  record.wrongCount += 1;
  record.lastWrongAt = Date.now();
  state.review[questionId] = record;
  saveJson(STORAGE_KEYS.review, state.review);
};

const renderReview = () => {
  const container = $("#review-content");
  const wrongIds = Object.keys(state.review).filter((id) => state.review[id].wrongCount > 0);
  const questions = state.questions.filter((q) => wrongIds.includes(q.id));

  if (questions.length === 0) {
    container.innerHTML = `<div class="callout">현재 오답노트에 등록된 문제가 없습니다.</div>`;
    return;
  }

  container.innerHTML = questions
    .map((question) => {
      const record = state.review[question.id];
      const questionText = formatMultiline(question.question);
      return `
        <div class="question-card">
          <div class="question-meta">
            ${question.category ? `<span class=\"chip\">${escapeHtml(question.category)}</span>` : ""}
            <span class="pill">오답 ${record.wrongCount}회</span>
          </div>
          <div class="question-title">${questionText}</div>
          <div class="choices">
            ${question.choices
              .map(
                (choice) => `
                  <div class="choice ${question.correct.includes(choice.key) ? "correct" : ""}">
                    <strong>${choice.key}.</strong>
                    <span>${escapeHtml(choice.text)}</span>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="question-actions">
            <button class="btn secondary" data-action="edit" data-id="${question.id}">정답 키 수정</button>
            <button class="btn ghost" data-action="reset" data-id="${question.id}">오답 기록 초기화</button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openAnswerKeyEditor(btn.dataset.id));
  });
  container.querySelectorAll("[data-action='reset']").forEach((btn) => {
    btn.addEventListener("click", () => {
      delete state.review[btn.dataset.id];
      saveJson(STORAGE_KEYS.review, state.review);
      renderReview();
    });
  });
};

const renderImport = () => {
  const container = $("#import-content");
  const pending = state.pendingImport;

  container.innerHTML = `
    <div class="panel session-panel">
      <div class="panel-row">
        <label class="file-input">JSON 가져오기
          <input type="file" id="import-json" accept="application/json" />
        </label>
        <label class="file-input">CSV 가져오기
          <input type="file" id="import-csv" accept="text/csv" />
        </label>
        <label class="file-input">PDF 가져오기
          <input type="file" id="import-pdf" accept="application/pdf" />
        </label>
      </div>
      <div class="divider"></div>
      <div>
        <label class="file-input">텍스트 붙여넣기 (PDF 텍스트 추출본)
          <textarea class="textarea" id="import-text" placeholder="PDF에서 텍스트를 추출해 붙여넣기"></textarea>
        </label>
        <div class="question-actions">
          <button class="btn" id="import-text-parse">텍스트 파싱</button>
          <button class="btn ghost" id="import-export">현재 데이터 내보내기</button>
        </div>
      </div>
      <div class="divider"></div>
      <div class="callout">
        JSON 스키마 예시: { "id": "Q0001", "category": "아키텍처", "question": "...", "choices": [{"key":"A","text":"..."}], "correct": ["A"], "multiSelect": false, "maxSelect": 1 }
        <br />CSV 권장 컬럼: id, category, question, choices, correct, maxSelect, tags
        <br />choices 예시: A::옵션1|B::옵션2|C::옵션3
      </div>
    </div>
  `;

  if (pending) {
    const summary = document.createElement("div");
    summary.className = "panel";
    summary.innerHTML = `
      <h3>가져오기 미리보기</h3>
      <p>문항 수: <strong>${pending.questions.length}</strong> · 경고: ${pending.warnings.length}</p>
      ${pending.warnings.length > 0 ? `<div class=\"callout\">${pending.warnings.join("<br>")}</div>` : ""}
      <div class="question-actions">
        <button class="btn" id="import-replace">기존 데이터 교체</button>
        <button class="btn secondary" id="import-merge">기존 데이터에 합치기</button>
        <button class="btn ghost" id="import-cancel">취소</button>
      </div>
    `;
    container.appendChild(summary);

    $("#import-replace").addEventListener("click", () => finalizeImport("replace"));
    $("#import-merge").addEventListener("click", () => finalizeImport("merge"));
    $("#import-cancel").addEventListener("click", () => {
      state.pendingImport = null;
      renderImport();
    });
  }

  $("#import-json").addEventListener("change", (event) => handleJsonImport(event.target.files[0]));
  $("#import-csv").addEventListener("change", (event) => handleCsvImport(event.target.files[0]));
  $("#import-pdf").addEventListener("change", (event) => handlePdfImport(event.target.files[0]));
  $("#import-text-parse").addEventListener("click", () => {
    const text = $("#import-text").value;
    if (!text.trim()) {
      toast("텍스트를 입력해주세요.");
      return;
    }
    const result = parseTextToQuestions(text, "pasted-text");
    state.pendingImport = result;
    renderImport();
  });
  $("#import-export").addEventListener("click", () => exportQuestions());
};

const exportQuestions = () => {
  const blob = new Blob([JSON.stringify(state.questions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "snowflake_questions.json";
  link.click();
  URL.revokeObjectURL(url);
};

const finalizeImport = (mode) => {
  if (!state.pendingImport) return;
  const incoming = state.pendingImport.questions;
  if (mode === "replace") {
    state.questions = incoming;
    state.usingSample = false;
    state.attempts = [];
    state.review = {};
  } else {
    state.usingSample = false;
    const existingIds = new Set(state.questions.map((q) => q.id));
    incoming.forEach((question) => {
      let nextId = question.id;
      while (existingIds.has(nextId)) {
        nextId = `${nextId}-copy`;
      }
      question.id = nextId;
      existingIds.add(nextId);
      state.questions.push(question);
    });
  }
  saveJson(STORAGE_KEYS.questions, state.questions);
  if (mode === "replace") {
    saveJson(STORAGE_KEYS.attempts, state.attempts);
    saveJson(STORAGE_KEYS.review, state.review);
  }
  state.pendingImport = null;
  toast("데이터를 불러왔습니다.");
  renderImport();
  renderDashboard();
};

const handleJsonImport = async (file) => {
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.questions || [];
    const questions = list.map((item, index) => normalizeQuestion(item, index));
    state.pendingImport = { questions, warnings: [], source: file.name };
    renderImport();
  } catch (error) {
    console.error(error);
    toast("JSON 파일을 읽는 중 오류가 발생했습니다.");
  }
};

const handleCsvImport = async (file) => {
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    toast("CSV에서 데이터를 찾지 못했습니다.");
    return;
  }
  const headers = rows[0].map((header) => header.toLowerCase().trim());
  const dataRows = rows.slice(1);
  const list = dataRows.map((row) => {
    const entry = {};
    headers.forEach((header, idx) => {
      entry[header] = row[idx];
    });
    return entry;
  });
  const questions = list.map((item, index) => normalizeQuestion(item, index));
  state.pendingImport = { questions, warnings: [], source: file.name };
  renderImport();
};

const handlePdfImport = async (file) => {
  if (!file) return;
  if (!window.pdfjsLib) {
    toast("PDF 파서를 불러오지 못했습니다.");
    return;
  }
  ensurePdfWorker();
  try {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    let combined = "";
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines = content.items.map((item) => item.str);
      combined += `${lines.join("\n")}\n`;
    }
    const result = parseTextToQuestions(combined, file.name);
    state.pendingImport = result;
    renderImport();
  } catch (error) {
    console.error(error);
    toast("PDF를 처리하는 중 오류가 발생했습니다.");
  }
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if (char === "\n" && !inQuotes) {
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (char === "\r") continue;
    current += char;
  }
  if (current || row.length) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
};

const parseTextToQuestions = (rawText, source) => {
  const lines = rawText
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let category = "";
  let pendingQuestion = [];
  let current = null;
  let questions = [];
  let warnings = [];

  const flushCurrent = () => {
    if (current && current.question && current.choices.length >= 2) {
      questions.push(current);
    } else if (current) {
      warnings.push(`문제 파싱 실패: ${current.question || "(빈 질문)"}`);
    }
    current = null;
  };

  const startQuestion = () => {
    const rawQuestion = pendingQuestion.join(" ");
    if (!rawQuestion) return;
    const { text, maxSelect, priority } = normalizeQuestionText(rawQuestion);
    current = {
      id: buildId(questions.length + 1),
      category,
      question: text,
      choices: [],
      correct: [],
      multiSelect: maxSelect > 1,
      maxSelect,
      tags: [],
      difficulty: "",
      priority,
      source,
      explanation: ""
    };
    pendingQuestion = [];
  };

  lines.forEach((line) => {
    if (/^Snowflake\s+\d+/i.test(line)) return;
    if (isCategoryLine(line) && !current && pendingQuestion.length === 0) {
      category = line.replace(/[^\S\r\n]+/g, " ");
      return;
    }

    const optionMatch = line.match(/^([A-F])\./);
    if (optionMatch) {
      if (!current) startQuestion();
      if (!current) return;
      const key = optionMatch[1];
      const text = line.replace(/^([A-F])\./, "").trim();
      current.choices.push({ key, text });
      return;
    }

    if (current && current.choices.length > 0) {
      if (looksLikeNewQuestion(line)) {
        flushCurrent();
        pendingQuestion = [line];
      } else {
        const last = current.choices[current.choices.length - 1];
        last.text = `${last.text} ${line}`.trim();
      }
      return;
    }

    pendingQuestion.push(line);
  });

  if (current || pendingQuestion.length) {
    if (!current) startQuestion();
    flushCurrent();
  }

  questions = questions.map((item, idx) => ({
    ...item,
    id: item.id || buildId(idx + 1)
  }));

  return { questions, warnings, source };
};

const normalizeQuestionText = (text) => {
  let cleaned = text.replace(/\s+/g, " ").trim();
  let priority = false;
  if (cleaned.includes("⭐️")) {
    cleaned = cleaned.replace(/⭐️/g, "").trim();
    priority = true;
  }
  let maxSelect = 1;
  const match = cleaned.match(/(\d+)\s*개\s*선택/);
  if (match) {
    maxSelect = Number(match[1]);
    cleaned = cleaned.replace(match[0], "").trim();
  }
  cleaned = cleaned.replace(/\(\s*\)/g, "").trim();
  return { text: cleaned, maxSelect, priority };
};

const looksLikeNewQuestion = (line) => {
  return /\?|\d+\s*개\s*선택|⭐️/.test(line);
};

const isCategoryLine = (line) => {
  if (line.length > 40) return false;
  if (line.includes("?") || line.includes("선택")) return false;
  if (/^[A-F]\./.test(line)) return false;
  if (/^Snowflake\s+\d+/i.test(line)) return false;
  return true;
};

const openAnswerKeyEditor = (questionId) => {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;
  const modal = $("#modal");
  const body = $("#modal-body");
  const footer = $("#modal-footer");

  const questionText = formatMultiline(question.question);
  body.innerHTML = `
    <div class="question-title">${questionText}</div>
    <div class="choices">
      ${question.choices
        .map(
          (choice) => `
            <label class="choice">
              <input type="checkbox" name="answer-key" value="${choice.key}" ${
            question.correct.includes(choice.key) ? "checked" : ""
          } />
              <strong>${choice.key}.</strong>
              <span>${escapeHtml(choice.text)}</span>
            </label>
          `
        )
        .join("")}
    </div>
    <div class="panel-row">
      <label class="tag">최대 선택 수
        <input class="input" id="answer-max" type="number" min="1" max="6" value="${
          question.maxSelect || 1
        }" />
      </label>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn ghost" id="modal-cancel">취소</button>
    <button class="btn" id="modal-save">저장</button>
  `;

  const close = () => {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  };

  $("#modal-cancel").onclick = close;
  $("#modal-close").onclick = close;

  $("#modal-save").onclick = () => {
    const selected = $$('input[name="answer-key"]', body)
      .filter((input) => input.checked)
      .map((input) => input.value);
    const maxSelect = Math.max(1, Number($("#answer-max").value || 1));
    question.correct = selected;
    question.maxSelect = maxSelect;
    question.multiSelect = maxSelect > 1;
    saveJson(STORAGE_KEYS.questions, state.questions);
    close();
    renderView(state.view);
    toast("정답 키를 저장했습니다.");
  };

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
};

const init = () => {
  state.questions = loadJson(STORAGE_KEYS.questions, []);
  if (state.questions.length === 0) {
    state.questions = DEFAULT_QUESTIONS.map((item, index) => normalizeQuestion(item, index));
    state.usingSample = !HAS_SEED_QUESTIONS;
    saveJson(STORAGE_KEYS.questions, state.questions);
  } else {
    state.questions = state.questions.map((item, index) => normalizeQuestion(item, index));
  }
  state.attempts = loadJson(STORAGE_KEYS.attempts, []);
  state.review = loadJson(STORAGE_KEYS.review, {});

  const nav = $("#nav");
  nav.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-btn");
    if (!button) return;
    setView(button.dataset.view);
  });

  setView("dashboard");
};

init();
