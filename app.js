(() => {
  "use strict";

  const EMOTIONS = [
    { value: "anger", label: "Anger", hint: "irritation, frustration, fury" },
    { value: "fear", label: "Fear", hint: "anxiety, worry, apprehension" },
    { value: "joy", label: "Joy", hint: "happiness, delight, excitement" },
    { value: "love", label: "Love", hint: "affection, care, fondness" },
    { value: "sadness", label: "Sadness", hint: "sorrow, grief, hopelessness" },
    { value: "surprise", label: "Surprise", hint: "shock, awe, unexpectedness" }
  ];

  const el = (id) => document.getElementById(id);

  const instructionsScreen = el("instructionsScreen");
  const taskScreen = el("taskScreen");
  const completeScreen = el("completeScreen");
  const setupError = el("setupError");
  const headerProgress = el("headerProgress");

  const participantInput = el("participantId");
  const acknowledge = el("acknowledge");
  const startButton = el("startButton");
  const startError = el("startError");

  const itemCounter = el("itemCounter");
  const saveState = el("saveState");
  const tweetText = el("tweetText");
  const emotionOptions = el("emotionOptions");
  const previousButton = el("previousButton");
  const saveButton = el("saveButton");
  const taskError = el("taskError");

  let supabaseClient = null;
  let participantId = "";
  let assignment = [];
  let currentIndex = 0;

  function configLooksValid() {
    const cfg = window.STUDY_CONFIG || {};
    return (
      typeof cfg.supabaseUrl === "string" &&
      cfg.supabaseUrl.startsWith("https://") &&
      !cfg.supabaseUrl.includes("PASTE_") &&
      typeof cfg.supabasePublishableKey === "string" &&
      cfg.supabasePublishableKey.length > 20 &&
      !cfg.supabasePublishableKey.includes("PASTE_") &&
      typeof cfg.studyVersion === "string" &&
      cfg.studyVersion.length > 0
    );
  }

  function init() {
    if (!configLooksValid()) {
      setupError.textContent =
        "Study setup is incomplete. The researcher needs to configure the Supabase URL and publishable key in config.js.";
      setupError.classList.remove("hidden");
      startButton.disabled = true;
      return;
    }

    supabaseClient = window.supabase.createClient(
      window.STUDY_CONFIG.supabaseUrl,
      window.STUDY_CONFIG.supabasePublishableKey,
      {
        auth: { persistSession: false, autoRefreshToken: false }
      }
    );

    renderEmotionOptions();
  }

  function renderEmotionOptions() {
    emotionOptions.innerHTML = "";
    for (const emotion of EMOTIONS) {
      const label = document.createElement("label");
      label.className = "emotion-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "emotion";
      input.value = emotion.value;

      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = emotion.label;
      const hint = document.createElement("span");
      hint.textContent = emotion.hint;

      text.append(title, hint);
      label.append(input, text);
      emotionOptions.append(label);
    }
  }

  function normalizeParticipantId(value) {
    return value.trim();
  }

  function validateParticipantId(value) {
    // Matches the database function validation.
    return /^[A-Za-z0-9_-]{2,64}$/.test(value);
  }

  function showInlineError(node, message) {
    node.textContent = message;
    node.classList.remove("hidden");
  }

  function hideInlineError(node) {
    node.textContent = "";
    node.classList.add("hidden");
  }

  async function startStudy() {
    hideInlineError(startError);

    const pid = normalizeParticipantId(participantInput.value);

    if (!validateParticipantId(pid)) {
      showInlineError(
        startError,
        "Enter your assigned participant ID using 2–64 letters, numbers, hyphens, or underscores."
      );
      participantInput.focus();
      return;
    }

    if (!acknowledge.checked) {
      showInlineError(startError, "Please confirm that you have read and understood the instructions.");
      acknowledge.focus();
      return;
    }

    startButton.disabled = true;
    startButton.textContent = "Loading your task…";

    try {
      const { data, error } = await supabaseClient.rpc("start_or_resume_study", {
        p_participant_id: pid,
        p_study_version: window.STUDY_CONFIG.studyVersion
      });

      if (error) throw error;

      assignment = (data || [])
        .map((row) => ({
          tweet_id: row.tweet_id,
          text: row.tweet_text,
          position: Number(row.item_position),
          chosen_label: row.chosen_label || null
        }))
        .sort((a, b) => a.position - b.position);

      if (assignment.length !== 5) {
        throw new Error("The server did not return a complete five-item assignment.");
      }

      participantId = pid;

      const firstIncomplete = assignment.findIndex((x) => !x.chosen_label);
      if (firstIncomplete === -1) {
        showComplete();
        return;
      }

      currentIndex = firstIncomplete;
      instructionsScreen.classList.add("hidden");
      completeScreen.classList.add("hidden");
      taskScreen.classList.remove("hidden");
      headerProgress.classList.remove("hidden");
      renderCurrentItem();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      showInlineError(
        startError,
        "We could not start the task. Please check your internet connection and try again. If the problem continues, contact the researcher."
      );
    } finally {
      startButton.disabled = false;
      startButton.textContent = "Begin the 5-tweet task";
    }
  }

  function renderCurrentItem() {
    hideInlineError(taskError);
    saveState.textContent = "";

    const item = assignment[currentIndex];
    itemCounter.textContent = `Tweet ${currentIndex + 1} of 5`;
    headerProgress.textContent = `${completedCount()} / 5 saved`;
    tweetText.textContent = item.text;

    const radios = document.querySelectorAll('input[name="emotion"]');
    radios.forEach((radio) => {
      radio.checked = radio.value === item.chosen_label;
    });

    previousButton.disabled = currentIndex === 0;
    saveButton.textContent = currentIndex === 4 ? "Save final label" : "Save & continue";
  }

  function completedCount() {
    return assignment.filter((x) => x.chosen_label).length;
  }

  function selectedEmotion() {
    const selected = document.querySelector('input[name="emotion"]:checked');
    return selected ? selected.value : null;
  }

  async function saveCurrent() {
    hideInlineError(taskError);
    const choice = selectedEmotion();

    if (!choice) {
      showInlineError(taskError, "Choose one emotion before continuing.");
      return;
    }

    const item = assignment[currentIndex];
    saveButton.disabled = true;
    previousButton.disabled = true;
    saveState.textContent = "Saving…";

    try {
      const { error } = await supabaseClient.rpc("submit_annotation", {
        p_participant_id: participantId,
        p_study_version: window.STUDY_CONFIG.studyVersion,
        p_tweet_id: item.tweet_id,
        p_label: choice
      });

      if (error) throw error;

      item.chosen_label = choice;
      saveState.textContent = "Saved";
      headerProgress.textContent = `${completedCount()} / 5 saved`;

      if (completedCount() === 5 && currentIndex === 4) {
        setTimeout(showComplete, 250);
        return;
      }

      if (currentIndex < 4) {
        currentIndex += 1;
      } else {
        const firstIncomplete = assignment.findIndex((x) => !x.chosen_label);
        if (firstIncomplete >= 0) currentIndex = firstIncomplete;
        else {
          setTimeout(showComplete, 250);
          return;
        }
      }

      renderCurrentItem();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      saveState.textContent = "";
      showInlineError(
        taskError,
        "Your answer could not be saved. Please check your connection and try again."
      );
    } finally {
      saveButton.disabled = false;
      previousButton.disabled = currentIndex === 0;
    }
  }

  function goPrevious() {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderCurrentItem();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function showComplete() {
    instructionsScreen.classList.add("hidden");
    taskScreen.classList.add("hidden");
    completeScreen.classList.remove("hidden");
    headerProgress.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  startButton.addEventListener("click", startStudy);
  saveButton.addEventListener("click", saveCurrent);
  previousButton.addEventListener("click", goPrevious);

  participantInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startStudy();
  });

  init();
})();
