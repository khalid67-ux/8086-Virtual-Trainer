
// =====================================
// MDA-8086 VIRTUAL TRAINER
// Manual Machine Code Simulator
// =====================================

let memory = {};

let startSegment = 0x0000;
let startAddress = 0x1000;

let writeSegment = 0x0000;
let writeAddress = 0x1000;

let cs = 0x0000;
let pc = 0x1000;

let al = 0;
let selectedMemoryAddress = null;

let inputBuffer = "";
let inputMode = "MON";
let addressInputStep = "SEGMENT";
let running = false;
let timer = null;

let ports = {
  A: 0xFF,
  B: 0xFF,
  C: 0x00,
  CTRL: 0x00
};

// =====================================
// INITIALIZE HARDWARE
// =====================================

const matrix = document.getElementById("matrix");

for (let i = 0; i < 64; i++) {
  const pixel = document.createElement("div");
  pixel.className = "pixel";
  pixel.id = "pixel" + i;
  matrix.appendChild(pixel);
}

// =====================================
// HELPER FUNCTIONS
// =====================================

function hex(value, digits = 2) {
  return Number(value)
    .toString(16)
    .toUpperCase()
    .padStart(digits, "0");
}

function showDisplay() {
  document.getElementById("segDisplay").textContent =
    hex(inputMode === "AD" && addressInputStep === "SEGMENT"
      ? (inputBuffer || "0")
      : writeSegment, 4);

  document.getElementById("offsetDisplay").textContent =
    hex(inputMode === "AD" && addressInputStep === "OFFSET"
      ? (inputBuffer || "0")
      : writeAddress, 4);

  document.getElementById("dataDisplay").textContent =
    inputBuffer || hex(memory[physicalAddress(writeSegment, writeAddress)] ?? 0xFF);
}

function physicalAddress(segment, offset) {
  return ((segment << 4) + offset) & 0xFFFFF;
}

function updateLCD() {
  showDisplay();
}

function setLog(message) {
  document.getElementById("log").textContent = message;
}

function setMode(value) {
  document.getElementById("mode").textContent = value;
}

function updateInfo() {
  document.getElementById("startAddress").textContent =
    hex(startSegment, 4) + ":" + hex(startAddress, 4);

  document.getElementById("pc").textContent =
    hex(cs, 4) + ":" + hex(pc, 4);

  document.getElementById("al").textContent = hex(al);

  document.getElementById("executionStatus").textContent =
    running ? "Running" : "Stopped";
}

// =====================================
// MEMORY VIEWER
// =====================================

function refreshMemory() {
  const box = document.getElementById("memory");
  box.innerHTML = "";

  const addresses = Object.keys(memory)
    .map(Number)
    .sort((a, b) => a - b);

  if (addresses.length === 0) {
    box.textContent = "No machine code entered.";

    document.getElementById("selectedAddress").textContent =
      "Selected: None";

    selectedMemoryAddress = null;
    return;
  }

  addresses.forEach(address => {
    const row = document.createElement("div");

    row.className = "memory-row";

    if (address === physicalAddress(cs, pc)) {
      row.classList.add("active");
    }

    if (address === selectedMemoryAddress) {
      row.classList.add("selected");
    }

    row.textContent =
      hex(Math.floor(address / 16), 4) +
      ":" + hex(address & 0xFFFF, 4) +
      " : " + hex(memory[address]);

    row.addEventListener("click", () => {
      selectedMemoryAddress = address;

      document.getElementById("selectedAddress").textContent =
        "Selected: " + hex(Math.floor(address / 16), 4) +
        ":" + hex(address & 0xFFFF, 4);

      refreshMemory();
    });

    box.appendChild(row);
  });
}

// =====================================
// KEYPAD INPUT
// =====================================

function press(key) {
  if (!/^[0-9A-F]$/.test(key)) return;
  if (inputBuffer.length >= 4) return;

  inputBuffer += key;
  updateLCD();
}

function clearInput() {
  inputBuffer = "";
  updateLCD();
}

function command(cmd) {

  if (cmd === "AD") {
    stopExecution();

    inputMode = "AD";
    addressInputStep = "SEGMENT";
    inputBuffer = "";

    setMode("ADDRESS");
    updateLCD();
    setLog("Enter Segment, then press :");
    return;
  }

  if (cmd === ":") {
    if (inputMode === "AD" && addressInputStep === "SEGMENT") {
      if (!inputBuffer) {
        setLog("Enter Segment first.");
        return;
      }

      startSegment = parseInt(inputBuffer, 16);
      writeSegment = startSegment;

      inputBuffer = "";
      addressInputStep = "OFFSET";

      updateLCD();
      setLog("Enter Offset, then press DA.");
      return;
    }

    setLog("Colon is used to separate Segment and Offset.");
    return;
  }

  if (cmd === "DA") {
    if (inputMode === "AD" &&
        addressInputStep !== "OFFSET") {
      setLog("Enter Segment and Offset first.");
      return;
    }

    if (inputMode === "AD") {
      if (!inputBuffer) {
        setLog("Enter Offset first.");
        return;
      }

      startAddress = parseInt(inputBuffer, 16);
      writeAddress = startAddress;
      pc = startAddress;
      cs = startSegment;
    }

    inputMode = "DA";
    inputBuffer = "";

    setMode("DATA");
    updateLCD();
    updateInfo();
    setLog("Enter one machine-code byte, then press + to store it.");
    return;
  }

  if (cmd === "+") {
    if (inputMode !== "DA") {
      setLog("Select DA mode first.");
      return;
    }
    if (inputBuffer === "") {
      setLog("Enter a machine-code byte first.");
      return;
    }

    const value = parseInt(inputBuffer, 16);

    if (inputBuffer.length > 2 || value > 0xFF) {
      setLog("Enter one byte only (00-FF).");
      return;
    }

    const address = physicalAddress(writeSegment, writeAddress);
    memory[address] = value;

    setLog(
      "Stored " + hex(value) +
      " at " + hex(writeSegment, 4) +
      ":" + hex(writeAddress, 4)
    );

    inputBuffer = "";
    writeAddress = (writeAddress + 1) & 0xFFFF;

    updateLCD();
    refreshMemory();
    updateInfo();
    return;
  }

  if (cmd === "GO") {
    if (inputMode === "DA" && inputBuffer) {
      const value = parseInt(inputBuffer, 16);

      if (inputBuffer.length > 2 || value > 0xFF) {
        setLog("Invalid final machine-code byte.");
        return;
      }

      memory[physicalAddress(writeSegment, writeAddress)] = value;

      inputBuffer = "";
      writeAddress = (writeAddress + 1) & 0xFFFF;

      refreshMemory();
      updateLCD();
    }

    startExecution();
    return;
  }

  if (cmd === "STP") {
    stopExecution();
    setLog("Program stopped by user.");
    return;
  }

  if (cmd === "REG") {
    setLog("CS:IP = " + hex(cs, 4) + ":" + hex(pc, 4) +
      " | AL = " + hex(al));
    return;
  }

  if (cmd === "MON") {
    inputMode = "MON";
    inputBuffer = "";
    setMode("MONITOR");
    updateLCD();
    setLog("Monitor mode.");
    return;
  }

  if (cmd === "-") {
    if (inputMode === "DA") {
      writeAddress = (writeAddress - 1) & 0xFFFF;
      inputBuffer = "";
      updateLCD();
      setLog("Previous memory address.");
    }
  }
}

// =====================================
// BUTTON EVENT LISTENERS
// =====================================

document.querySelectorAll("[data-key]").forEach(button => {
  button.addEventListener("click", () => {
    press(button.dataset.key);
  });
});

document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("click", () => {
    command(button.dataset.command);
  });
});

document.getElementById("lab").addEventListener("change", selectLab);

document.getElementById("resetBtn").addEventListener("click", resetTrainer);

document.getElementById("clearBtn").addEventListener("click", clearMemory);

document.getElementById("clearInputBtn")
  .addEventListener("click", clearInput);

// =====================================
// LAB SELECTION
// Selecting a lab does not preload code.
// =====================================

function selectLab() {
  stopExecution();
  clearHardware();

  setLog(
    "Lab " + document.getElementById("lab").value +
    " selected. Memory remains empty until you enter bytes."
  );
}

// =====================================
// 8255 PPI PORT MAPPING
// =====================================

function outputPort(address, value) {

  const lab = document.getElementById("lab").value;

  if (lab === "9") {

    if (address === 0x1E) {
      ports.CTRL = value;
    }

    if (address === 0x18) {
      ports.A = value;
      renderMatrix();
    }

    if (address === 0x1A) {
      ports.B = value;
      renderMatrix();
    }

    if (address === 0x1C) {
      ports.C = value;
      renderMatrix();
    }
  }

  if (lab === "10") {

    if (address === 0x1F) {
      ports.CTRL = value;
    }

    if (address === 0x19) {
      ports.A = value;
      renderSevenSegment(value);
    }

    if (address === 0x1B) {
      ports.B = value;
      renderFourLEDs(value);
    }

    if (address === 0x1D) {
      ports.C = value;
    }
  }
}

// =====================================
// DOT MATRIX SIMULATION
// =====================================

function renderMatrix() {
  const rowValue = ports.C;
  const orange = ports.A;
  const green = ports.B;

  for (let i = 0; i < 64; i++) {
    const pixel = document.getElementById("pixel" + i);

    pixel.className = "pixel";

    const row = Math.floor(i / 8);
    const col = i % 8;

    const rowMask = 1 << row;
    const colMask = 1 << col;

    // Port C HIGH selects an LED row.
    const rowActive = (rowValue & rowMask) !== 0;

    // Port A/B LOW selects an LED column.
    const orangeActive = (orange & colMask) === 0;
    const greenActive = (green & colMask) === 0;

    if (rowActive && orangeActive) {
      pixel.classList.add("orange");
    } else if (rowActive && greenActive) {
      pixel.classList.add("green");
    }
  }

  document.getElementById("matrixInfo").textContent =
    "Port C: " + hex(ports.C) +
    " | Port A: " + hex(ports.A) +
    " | Port B: " + hex(ports.B);
}

// =====================================
// SEVEN SEGMENT SIMULATION
// Common Anode: LOW = ON
// =====================================

function renderSevenSegment(value) {

  const names = ["a", "b", "c", "d", "e", "f", "g"];

  const bits = [0, 1, 2, 3, 4, 5, 6];

  names.forEach((name, index) => {

    const segment = document.getElementById("s" + name);

    const isOn = ((value >> bits[index]) & 1) === 0;

    segment.classList.toggle("on", isOn);
  });

  document.getElementById("sevenInfo").textContent =
    "Port A: " + hex(value);
}

// =====================================
// FOUR LED SIMULATION - EXPERIMENT 10
// Port B: PB4, PB5, PB6, PB7
// Active LOW = LED ON
// =====================================

function renderFourLEDs(value) {

  const ledBits = [4, 5, 6, 7];

  ledBits.forEach((bit, index) => {

    const led = document.getElementById("led" + (index + 1));

    // Active LOW
    const isOn = ((value >> bit) & 1) === 0;

    led.classList.toggle("on", isOn);
  });

  const activeLEDs = ledBits
    .map((bit, index) =>
      ((value >> bit) & 1) === 0 ? "LED" + (index + 1) : null
    )
    .filter(Boolean);

  document.getElementById("ledInfo").textContent =
    "Port B: " + hex(value) +
    " | " +
    (activeLEDs.length
      ? "ON: " + activeLEDs.join(", ")
      : "All LEDs OFF");
}

// =====================================
// CLEAR HARDWARE OUTPUT
// =====================================

function clearHardware() {

  ports = {
    A: 0xFF,
    B: 0xFF,
    C: 0x00,
    CTRL: 0x00
  };

  document.querySelectorAll(".pixel").forEach(pixel => {
    pixel.className = "pixel";
  });

  document.querySelectorAll(".seg").forEach(segment => {
    segment.classList.remove("on");
  });

  document.getElementById("matrixInfo").textContent = "No output";
  document.getElementById("sevenInfo").textContent = "No output";

  renderFourLEDs(0xF0);
}

// =====================================
// MACHINE CODE EXECUTION
//
// B0 = MOV AL, immediate
// E6 = OUT immediate port, AL
// EA = JMP FAR
// 90 = NOP
// F4 = HLT
// =====================================

function getByte(address) {
  const physical = physicalAddress(cs, address);

  if (!Object.prototype.hasOwnProperty.call(memory, physical)) {
    throw new Error(
      "Missing machine-code byte at " +
      hex(cs, 4) + ":" + hex(address, 4)
    );
  }

  return memory[physical];
}

function executeInstruction() {

  const opcode = getByte(pc);

  pc = (pc + 1) & 0xFFFF;

  // MOV AL, immediate
  if (opcode === 0xB0) {

    al = getByte(pc);
    pc = (pc + 1) & 0xFFFF;

    setLog("MOV AL, " + hex(al));
  }

  // OUT immediate port, AL
  else if (opcode === 0xE6) {

    const port = getByte(pc);

    pc = (pc + 1) & 0xFFFF;

    outputPort(port, al);

    setLog("OUT " + hex(port) + ", AL (" + hex(al) + ")");
  }

  // JMP FAR
  else if (opcode === 0xEA) {

    const offsetLow = getByte(pc);
    const offsetHigh = getByte((pc + 1) & 0xFFFF);
    const segmentLow = getByte((pc + 2) & 0xFFFF);
    const segmentHigh = getByte((pc + 3) & 0xFFFF);

    const offset = offsetLow | (offsetHigh << 8);
    const segment = segmentLow | (segmentHigh << 8);

    cs = segment;
    pc = offset;

    setLog(
      "FAR JMP to " + hex(segment, 4) + ":" + hex(offset, 4)
    );
  }

  // NOP
  else if (opcode === 0x90) {
    setLog("NOP");
  }

  // HLT
  else if (opcode === 0xF4) {
    stopExecution();
    setLog("HLT: Program stopped.");
    return false;
  }

  else {
    throw new Error(
      "Unsupported opcode " + hex(opcode) +
      " at " + hex(cs, 4) + ":" + hex((pc - 1) & 0xFFFF, 4)
    );
  }

  updateInfo();
  refreshMemory();

  return true;
}

// =====================================
// RUN PROGRAM
// =====================================

function startExecution() {

  if (running) return;

  if (Object.keys(memory).length === 0) {
    setLog("ERROR: No machine code entered.");
    return;
  }

  cs = startSegment;
  pc = startAddress;
  running = true;

  setMode("RUNNING");
  updateInfo();

  setLog("Program started at " + hex(cs, 4) + ":" + hex(pc, 4));

  let instructionCount = 0;

  timer = setInterval(() => {

    try {

      if (!running) return;

      const keepRunning = executeInstruction();

      instructionCount++;

      if (!keepRunning) return;

      // Prevent unlimited execution
      if (instructionCount > 10000) {
        stopExecution();
        setLog("Execution safety limit reached.");
      }

    } catch (error) {

      stopExecution();

      setLog("EXECUTION ERROR: " + error.message);
    }

  }, 350);
}

// =====================================
// STOP EXECUTION
// =====================================

function stopExecution() {

  running = false;

  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }

  setMode("STOPPED");
  updateInfo();
}

// =====================================
// CLEAR MEMORY
// =====================================

function clearMemory() {

  stopExecution();

  memory = {};

  startSegment = 0x0000;
  startAddress = 0x1000;

  writeSegment = 0x0000;
  writeAddress = 0x1000;

  cs = 0x0000;
  pc = 0x1000;
  al = 0;

  refreshMemory();
  updateInfo();
  updateLCD();

  setLog("Memory cleared. No program is loaded.");
}

// =====================================
// RESET TRAINER
// =====================================

function resetTrainer() {

  stopExecution();

  memory = {};

  startSegment = 0x0000;
  startAddress = 0x1000;

  writeSegment = 0x0000;
  writeAddress = 0x1000;

  cs = 0x0000;
  pc = 0x1000;
  al = 0;

  inputBuffer = "";
  inputMode = "MON";
  addressInputStep = "SEGMENT";

  clearHardware();
  clearInput();

  setMode("MONITOR");

  refreshMemory();
  updateInfo();
  updateLCD();

  setLog("Trainer reset. Memory is empty.");
}

function deleteSelectedMemory() {

  if (selectedMemoryAddress === null) {
    alert("Please select a memory address first.");
    return;
  }

  const address = selectedMemoryAddress;

  if (!Object.prototype.hasOwnProperty.call(memory, address)) {
    alert("No machine code exists at this address.");
    return;
  }

  const confirmed = confirm(
    "Delete only the byte at " + hex(address, 4) + "?"
  );

  if (!confirmed) return;

  stopExecution();

  delete memory[address];

  selectedMemoryAddress = null;

  refreshMemory();
  updateInfo();
  updateLCD();

  setLog(
    "Deleted only the byte at " +
    hex(Math.floor(address / 16), 4) + ":" +
    hex(address & 0xFFFF, 4)
  );
}

document.getElementById("deleteFromHereBtn")
  .addEventListener("click", deleteSelectedMemory);

// =====================================
// INITIAL SCREEN
// =====================================

refreshMemory();
updateInfo();
clearHardware();
updateLCD();
