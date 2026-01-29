const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "snowflake_pool2.md");
const outPath = path.join(__dirname, "..", "questions-data.js");

const text = fs.readFileSync(sourcePath, "utf8");
const lines = text.split(/\r?\n/);

let section = "";
let subsection = "";
let current = null;
let questions = [];

const buildCategory = () => {
  if (section && subsection) return `${section} / ${subsection}`;
  return section || subsection || "기타";
};

const cleanInline = (value) =>
  String(value || "")
    .replace(/\*\*/g, "")
    .replace(/[_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isExplanationLine = (line) => /^—>|^->|^※|^참고/.test(line);

const parseQuestionMeta = (value) => {
  let textValue = value.replace(/\s+/g, " ").trim();
  let priority = false;
  if (textValue.includes("⭐️")) {
    textValue = textValue.replace(/⭐️/g, "").trim();
    priority = true;
  }
  let maxSelect = 1;
  const match = textValue.match(/(\d+)\s*개\s*선택/);
  if (match) {
    maxSelect = Number(match[1]);
    textValue = textValue.replace(match[0], "").trim();
  }
  textValue = textValue.replace(/\(\s*\)/g, "").trim();
  return { text: textValue, maxSelect, priority };
};

const startQuestion = (line) => {
  current = {
    questionLines: [],
    choices: [],
    correct: [],
    explanationLines: [],
    priority: false
  };
  if (line) current.questionLines.push(line);
};

const addChoice = (rawText, checked) => {
  const cleaned = cleanInline(rawText.replace(/\s+/g, " "));
  if (!cleaned) return;
  const normalized = cleaned.replace(/\s+/g, " ").trim();
  const optionMatch = normalized.match(/^([A-F])\s*[.)]\s*(.+)$/);
  const usedKeys = new Set(current.choices.map((choice) => choice.key));
  let key = null;
  let textValue = normalized;

  if (optionMatch) {
    key = optionMatch[1];
    textValue = optionMatch[2].trim();
  }

  if (!key || usedKeys.has(key)) {
    let index = current.choices.length;
    let candidate = String.fromCharCode(65 + index);
    while (usedKeys.has(candidate)) {
      index += 1;
      candidate = String.fromCharCode(65 + index);
    }
    key = candidate;
  }

  current.choices.push({ key, text: textValue });
  if (checked) current.correct.push(key);
};

const finalizeQuestion = () => {
  if (!current) return;
  const questionText = current.questionLines.join("\n").trim();
  if (!questionText || current.choices.length === 0) {
    current = null;
    return;
  }
  const meta = parseQuestionMeta(questionText);
  const correct = Array.from(new Set(current.correct));
  const maxSelect = Math.max(meta.maxSelect, correct.length || 1);
  const explanation = cleanInline(current.explanationLines.join(" "));

  questions.push({
    id: `Q${String(questions.length + 1).padStart(4, "0")}`,
    category: buildCategory(),
    question: meta.text,
    choices: current.choices,
    correct,
    multiSelect: maxSelect > 1,
    maxSelect,
    tags: [],
    difficulty: "",
    priority: current.priority || meta.priority,
    source: path.basename(sourcePath),
    explanation
  });
  current = null;
};

lines.forEach((raw) => {
  const line = raw.trim();
  if (!line) return;

  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    finalizeQuestion();
    const level = heading[1].length;
    const title = cleanInline(heading[2]);
    if (level === 2) {
      section = title;
      subsection = "";
    } else if (level === 3) {
      subsection = title;
    }
    return;
  }

  if (/^---/.test(line)) {
    finalizeQuestion();
    return;
  }

  const optionMatch = line.match(/^- \[(x|X| )\]\s+(.*)$/);
  if (optionMatch) {
    if (!current) startQuestion();
    const checked = optionMatch[1].toLowerCase() === "x";
    addChoice(optionMatch[2], checked);
    return;
  }

  if (!current) {
    startQuestion(line);
    return;
  }

  if (current.choices.length > 0) {
    if (isExplanationLine(line)) {
      current.explanationLines.push(line);
      return;
    }
    finalizeQuestion();
    startQuestion(line);
    return;
  }

  current.questionLines.push(line);
});

finalizeQuestion();

const output = `window.SNOWFLAKE_QUESTIONS = ${JSON.stringify(questions, null, 2)};\n`;
fs.writeFileSync(outPath, output, "utf8");

console.log(`Generated ${questions.length} questions -> ${outPath}`);
