const TILE_NAMES = {
  "1m":"一万","2m":"二万","3m":"三万","4m":"四万","5m":"五万","6m":"六万","7m":"七万","8m":"八万","9m":"九万",
  "1p":"一筒","2p":"二筒","3p":"三筒","4p":"四筒","5p":"五筒","6p":"六筒","7p":"七筒","8p":"八筒","9p":"九筒",
  "1s":"一索","2s":"二索","3s":"三索","4s":"四索","5s":"五索","6s":"六索","7s":"七索","8s":"八索","9s":"九索",
  "1z":"东","2z":"南","3z":"西","4z":"北","5z":"白","6z":"发","7z":"中"
};

export function tileImage(id, prefix = "../") {
  if (!TILE_NAMES[id]) throw new Error(`unknown tile ${id}`);
  return `<img class="tile" src="${prefix}assets/tiles/${id}.svg" alt="${TILE_NAMES[id]}">`;
}

export function readLessonProgress(lessonId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`riichi-${lessonId}`) || "[]"));
  } catch {
    return new Set();
  }
}

function initializeLesson() {
  const lessonId = document.body.dataset.lesson;
  if (!lessonId) return;
  const completed = readLessonProgress(lessonId);
  const status = document.getElementById("lesson-status");
  const updateStatus = () => {
    if (status) status.textContent = `已掌握 ${completed.size} / 3`;
  };

  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.question;
      const correct = button.dataset.correct === "true";
      const feedback = document.getElementById(`feedback-${question}`);
      document.querySelectorAll(`[data-question="${question}"]`).forEach((option) => {
        option.classList.remove("correct", "wrong");
      });
      button.classList.add(correct ? "correct" : "wrong");
      feedback.textContent = `${correct ? "正确。" : "再想一层。"}${button.dataset.explanation}`;
      feedback.dataset.state = correct ? "correct" : "wrong";
      if (correct) {
        completed.add(question);
        localStorage.setItem(`riichi-${lessonId}`, JSON.stringify([...completed]));
        updateStatus();
      }
    });
  });
  updateStatus();
}

function initializeIndex() {
  const cards = document.querySelectorAll("[data-lesson-card]");
  if (cards.length === 0) return;
  let finished = 0;
  cards.forEach((card) => {
    const progress = readLessonProgress(card.dataset.lessonCard);
    if (progress.size === 3) {
      card.classList.add("done");
      finished += 1;
    }
  });
  const status = document.getElementById("course-status");
  if (status) status.textContent = `已完成 ${finished} / ${cards.length} 课`;
}

initializeLesson();
initializeIndex();
