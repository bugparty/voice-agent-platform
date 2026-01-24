function createVadMock({ onStart, onUpdate, onEnd }) {
  let speaking = false;
  let frameCount = 0;
  let silenceTimer = null;

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function scheduleSilenceCheck() {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (speaking) {
        speaking = false;
        frameCount = 0;
        onEnd();
      }
    }, 600);
  }

  function onAudioFrame() {
    if (!speaking) {
      speaking = true;
      onStart();
    }
    frameCount += 1;
    if (frameCount % 10 === 0) {
      onUpdate();
    }
    scheduleSilenceCheck();
  }

  function stop() {
    clearSilenceTimer();
    if (speaking) {
      speaking = false;
      onEnd();
    }
  }

  return {
    onAudioFrame,
    stop
  };
}

module.exports = {
  createVadMock
};
