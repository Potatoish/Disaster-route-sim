// "How to use" step-by-step tutorial (templates/_tutorial_modal.html), shared
// by the homepage/About pages and the simulator page. Load before home.js /
// script.js: its Escape handler runs first, and marks the event handled so
// the page's own Escape handling leaves it alone.
(function initTutorial() {
  const TUTORIAL_STEPS = 5;
  let tutorialStep = 1;

  function renderTutorialStep() {
    document.querySelectorAll('.tutorial-slide').forEach((el) => {
      el.classList.toggle('is-active', Number(el.dataset.step) === tutorialStep);
    });
    document.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i + 1 === tutorialStep);
    });
    const stepNum = document.getElementById('tutorialStepNum');
    if (stepNum) stepNum.textContent = String(tutorialStep);

    const back = document.getElementById('tutorialBack');
    if (back) back.disabled = tutorialStep === 1;

    const next = document.getElementById('tutorialNext');
    if (next) next.textContent = tutorialStep === TUTORIAL_STEPS ? 'Done' : 'Next';
  }

  function goToTutorialStep(step) {
    tutorialStep = Math.min(TUTORIAL_STEPS, Math.max(1, step));
    renderTutorialStep();
  }

  function tutorialNext() {
    if (tutorialStep === TUTORIAL_STEPS) {
      closeTutorial();
      return;
    }
    goToTutorialStep(tutorialStep + 1);
  }

  function tutorialPrev() {
    goToTutorialStep(tutorialStep - 1);
  }

  function openTutorial() {
    const modal = document.getElementById('tutorialModal');
    if (!modal) return;
    goToTutorialStep(1);
    modal.hidden = false;
    document.body.classList.add('tutorial-modal-open');
  }

  function closeTutorial() {
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('tutorial-modal-open');
  }

  // The nav's / panel's "How to use" button: always opens in place.
  function handleNavHowToUse(event) {
    event.preventDefault();
    openTutorial();
    return false;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.getElementById('tutorialModal')?.hidden !== false) return;
    event.preventDefault();
    closeTutorial();
  });

  Object.assign(window, {
    openTutorial,
    closeTutorial,
    goToTutorialStep,
    tutorialNext,
    tutorialPrev,
    handleNavHowToUse,
  });
})();
