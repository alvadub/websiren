const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const _escape = 27;
const spacebar = 32;
const numPadZero = 96;
const resizeWidth = 420;
const upperRowOffset = 48;
const numPadOffset = 96;

let delay;
let filter;
let feedback;
let currentPatch;
let mainOscillator;
let modulationOscillator;
let sirenPlaying = false;

const ctx = new window.AudioContext();
const root = document.documentElement;
const outputGain = ctx.createGain();
const modulationGain = ctx.createGain();
const mainFrequencySlider = $('input[name=mainFrequency]');
const delayCutoffFrequencySlider = $('input[name=delayCutoffFrequency]');
const modulationFrequencySlider = $('input[name=modulationFrequency]');
const modulationAmplitudeSlider = $('input[name=modulationAmplitude]');
const delayTimeSlider = $('input[name=delayTime]');
const delayFeedbackSlider = $('input[name=delayFeedback]');
const outputVolumeSlider = $('input[name=volume]');
const imageSelector = $('input[type=file]');
const colorSelector = document.getElementById('colors');
const stopTrigger = document.getElementById('disrupt');
const playButton = document.getElementById('trigger');
const resetButton = document.getElementById('reset');
const logoImage = document.getElementById('logo');
const javascriptNode = ctx.createScriptProcessor(2048, 1, 1);
const patchKeyMaps = getPatchKeyMaps();
const analyser = ctx.createAnalyser();

function getAverageVolume(array) {
  const length = array.length;
  let values = 0;
  let average;
  for (let i = 0; i < length; i++) values += array[i];
  average = values / length;
  return average;
}

function patchIndex(patchNumber) {
  return parseInt(patchNumber) - 1;
}

function selectPatch(patch) {
  currentPatch = patch;
  localStorage.setItem('patch:current', currentPatch);
  applyPatch(currentPatch);
}

function storeInputValue({target}) {
  const slider = target;
  const key = `patch:${currentPatch}:${slider.name}`;
  localStorage.setItem(key, slider.value);
}

const isPlayTrigger = ({ keyCode }) => keyCode === spacebar || keyCode === numPadZero;
const isPlayCancel = ({ keyCode }) => keyCode === _escape;

function applyPatch(patchNumber) {
  const prefix = `patch:${patchNumber}:`;
  const patchKeys = Object.keys(localStorage).forEach(key => {
    if (key.indexOf(prefix) === 0) {
      const param = key.replace(prefix, "");
      const input = $(`input[name=${param}]`);
      const storedValue = localStorage.getItem(key);

      if (input.type === "range") {
        input.value = storedValue;
        input.dispatchEvent(new Event('input', {
          bubbles: true,
          cancelable: true,
        }));
      } else if (input.type === "radio") {
        const selector = `input[name=${param}][value="${storedValue}"]`;
        $(selector).checked = true;
      }
    }
  });
}

function getPatchKeyMaps() {
  const values = Array.from($$('.patch-selection input')).map(({ value }) => value);

  const numPadMap = values.reduce((map, value) => {
    map[numPadOffset + parseInt(value)] = value;
    return map;
  }, {});

  const upperRowMap = values.reduce((map, value) => {
    map[upperRowOffset + parseInt(value)] = value;
    return map;
  }, {});

  return {
    numPad: numPadMap,
    upperRow: upperRowMap,
  };
}

function initVolume() {
  outputGain.gain.value = outputVolumeSlider.value / 2.0;

  javascriptNode.connect(ctx.destination);
  outputGain.connect(ctx.destination);
  outputGain.connect(analyser);
  analyser.connect(javascriptNode);

  outputVolumeSlider.addEventListener('input', () => {
    outputGain.gain.value = outputVolumeSlider.value / 2.0;
  });

  const canvasElement = document.getElementById('canvas');
  const { width, height } = canvasElement;
  const canvas = canvasElement.getContext('2d');
  const gradient = canvas.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, '#aaff00');
  gradient.addColorStop(0.5, '#fcdd09');
  gradient.addColorStop(1, '#da121a');

  javascriptNode.addEventListener('audioprocess', () => {
    const array = new Uint8Array(analyser.frequencyBinCount);

    analyser.getByteFrequencyData(array);

    const average = getAverageVolume(array);

    canvas.clearRect(0, 0, width, height);
    canvas.fillStyle = gradient;
    canvas.fillRect(0, 0, (0 + average) * 1.8, height);
  });
}


function updateMainFrequency() {
  mainOscillator.frequency.value = mainFrequencySlider.value;
}
function updateModulationFrequency() {
  if (modulationOscillator) modulationOscillator.frequency.value = modulationFrequencySlider.value;
}
function updateModulationAmplitude() {
  modulationGain.gain.value = modulationAmplitudeSlider.value;
}

function play() {
  if (sirenPlaying === true) return;
  sirenPlaying = true;

  stopTrigger.classList.add('playing');

  mainOscillator = ctx.createOscillator();
  mainOscillator.type = $('input[name=mainOscillatorType]:checked').value;
  mainOscillator.frequency.value = mainFrequencySlider.value;

  modulationOscillator = ctx.createOscillator();
  modulationOscillator.type = $('input[name=modulationOscillatorType]:checked').value;
  modulationOscillator.frequency.value = modulationFrequencySlider.value;
  modulationOscillator.connect(modulationGain);

  modulationGain.connect(mainOscillator.frequency);
  modulationGain.gain.value = modulationAmplitudeSlider.value;
  mainFrequencySlider.addEventListener('input', updateMainFrequency);
  modulationFrequencySlider.addEventListener('input', updateModulationFrequency);
  modulationAmplitudeSlider.addEventListener('input', updateModulationAmplitude);
  mainOscillator.connect(outputGain);
  modulationOscillator.start();
  mainOscillator.start();
  createEcho(mainOscillator);
}


function stop() {
  if (sirenPlaying === false) return;
  sirenPlaying = false;

  stopTrigger.classList.remove('playing');

  mainFrequencySlider.removeEventListener('input', updateMainFrequency);
  mainOscillator.disconnect(outputGain);
  modulationOscillator.disconnect(modulationGain);
  modulationGain.disconnect(mainOscillator.frequency);
  mainOscillator.stop();
  modulationOscillator.stop();
}

function createEcho(source) {
  delay = delay || ctx.createDelay();
  updateDelayTime();

  feedback = feedback || ctx.createGain();
  feedback.gain.value = delayFeedbackSlider.value;

  filter = filter || ctx.createBiquadFilter();

  filter.frequency.value = delayCutoffFrequencySlider.value;
  filter.frequency.linearRampToValueAtTime(delayCutoffFrequencySlider.value - 1000, ctx.currentTime + 2);

  delayCutoffFrequencySlider.addEventListener('input', () => {
    filter.frequency.value = delayCutoffFrequencySlider.value;
    filter.frequency.linearRampToValueAtTime(delayCutoffFrequencySlider.value - 1000, ctx.currentTime + 2);
  });

  source.connect(delay);
  delay.connect(filter);
  filter.connect(feedback);
  feedback.connect(outputGain);
  feedback.connect(delay);
  return delay;
}


function updateDelayTime() {
  if (delay) {
    const selectedDelayFactorInput = $('input[name=delayFactor]:checked')
    const delayFactor = parseFloat(selectedDelayFactorInput.value);
    const delayTime = delayTimeSlider.value * delayFactor;

    delay.delayTime.value = delayTime;
  }
}

function initEchoControls() {
  delayTimeSlider.addEventListener('input', updateDelayTime);
  delayFeedbackSlider.addEventListener('input', () => {
    if (feedback) feedback.gain.value = delayFeedbackSlider.value;
  });

  $$('input[name=delayFactor]').forEach(delayFactorInput => delayFactorInput.addEventListener('change', updateDelayTime));
}

function initPreferences() {
  const schemeColor = localStorage.getItem('scheme:color');
  const localImage = localStorage.getItem('canvas:image');

  if (schemeColor) {
    root.style.setProperty('--scheme-color', schemeColor);
  }
  if (localImage) {
    resetButton.classList.add('changed');
    logoImage.src = localImage;
  }

  logoImage.style.opacity = 1;

  imageSelector.addEventListener('change', e => {
    const node = e.target;
    const image = node.files[0];
    const reader = new FileReader();

    if (!(image instanceof Blob)) return;

    reader.readAsDataURL(image);
    reader.name = image.name;
    reader.size = image.size;
    reader.onload = event => {
      const img = new Image();

      img.src = event.target.result;
      img.name = event.target.name;
      img.size = event.target.size;
      img.onload = e => {
        const elem = document.createElement('canvas');
        const ctx = elem.getContext('2d');

        elem.width = resizeWidth;
        elem.height = e.target.height * (resizeWidth / e.target.width);

        ctx.drawImage(e.target, 0, 0, elem.width, elem.height);
        logoImage.src = ctx.canvas.toDataURL('image/png', 1);
        localStorage.setItem('canvas:image', logoImage.src);
        resetButton.classList.add('changed');
        node.value = '';
      };
    };
  });

  colorSelector.addEventListener('change', e => {
    e.target.closest('details').open = false;
    root.style.setProperty('--scheme-color', e.target.value);
    if (e.target.value) {
      localStorage.setItem('scheme:color', e.target.value);
    } else {
      localStorage.removeItem('scheme:color');
    }
  });

  resetButton.addEventListener('click', () => {
    logoImage.src = 'alvadub.png';
    resetButton.classList.remove('changed');
    localStorage.removeItem('canvas:image');
  });
}

function initPatches() {
  const patchRadioButtons = $$('input[name=patch]');

  currentPatch = localStorage.getItem('patch:current');

  if (!currentPatch) {
    currentPatch = 1;
    $$('input[type=range], input[name=mainOscillatorType]:checked, input[name=modulationOscillatorType]:checked, input[name=delayFactor]:checked')
      .forEach(input => {
        Object.values(patchKeyMaps.upperRow).forEach(patch => {
          localStorage.setItem(`patch:${patch}:${input.name}`, input.value);
        })
        input.addEventListener('change', storeInputValue);
      });
  }

  const currentPatchRadioButton = patchRadioButtons[patchIndex(currentPatch)];
  currentPatchRadioButton.setAttribute('checked', 'checked');
  applyPatch(currentPatch);

  patchRadioButtons.forEach(radioButton => {
      radioButton.addEventListener('click', () => {
        stop();
        selectPatch(radioButton.value);
      });
  });

  $$('input[type=range], input[name=mainOscillatorType], input[name=modulationOscillatorType], input[name=delayFactor]')
      .forEach(input => input.addEventListener('change', storeInputValue));

  window.addEventListener('keydown', evt => {
    const e = evt || window.event;
    const keyCode = e.which || e.keyCode;
    const patch = patchKeyMaps.upperRow[keyCode] || patchKeyMaps.numPad[keyCode];
    if (patch) {
      stop();
      selectPatch(patch);
      $(`input[name=patch][value='${patch}']`).checked = true;
    }
  });
}

function bindSpaceBar() {
  window.addEventListener('keydown', evt => {
    if (isPlayCancel(evt)) {
      stop();
      evt.preventDefault();
    }
    if (isPlayTrigger(evt)) {
      play();
      evt.preventDefault();
    }
  });

  window.addEventListener('keyup', evt => {
    if (isPlayTrigger(evt)) {
      stop();
      evt.preventDefault();
    }
  });
}

function bindButtons() {
  playButton.addEventListener('mousedown', play);
  playButton.addEventListener('mouseup', stop);
  playButton.addEventListener('touchstart', play);
  playButton.addEventListener('touchend', play);
  disrupt.addEventListener('click', stop);
}

initEchoControls();
initPreferences();
initVolume();
initPatches();
bindSpaceBar();
bindButtons();
