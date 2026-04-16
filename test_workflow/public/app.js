const displayElement = document.querySelector("#display");
const expressionElement = document.querySelector("#expression");
const statusElement = document.querySelector("#connection-status");
const buttons = [...document.querySelectorAll(".key")];

const operatorLabels = {
  add: "+",
  subtract: "-",
  multiply: "×",
  divide: "÷",
};

function getDisplaySizeToken(value) {
  const length = String(value).length;

  if (length > 18) {
    return "tiny";
  }

  if (length > 13) {
    return "tight";
  }

  if (length > 9) {
    return "compact";
  }

  return "default";
}

function getExpressionSizeToken(value) {
  return String(value).length > 26 ? "compact" : "default";
}

function clearRepeatOperation() {
  state.lastOperator = null;
  state.lastOperand = null;
}

function createInitialState() {
  return {
    displayValue: "0",
    storedValue: null,
    pendingOperator: null,
    waitingForOperand: false,
    justEvaluated: false,
    lastOperator: null,
    lastOperand: null,
    expression: "Enter a value to begin",
    isBusy: false,
    isError: false,
  };
}

const state = createInitialState();

function setStatus(message, status = "default") {
  statusElement.textContent = message;
  statusElement.dataset.state = status;
}

function setBusy(isBusy) {
  state.isBusy = isBusy;
  buttons.forEach((button) => {
    button.disabled = isBusy;
  });

  if (state.isError) {
    return;
  }

  setStatus(isBusy ? "Calculating" : "Ready", isBusy ? "busy" : "default");
}

function updateDisplay() {
  displayElement.textContent = state.displayValue;
  expressionElement.textContent = state.expression || " ";

  if (displayElement.dataset) {
    displayElement.dataset.size = getDisplaySizeToken(state.displayValue);
  }

  if (expressionElement.dataset) {
    expressionElement.dataset.size = getExpressionSizeToken(state.expression || "");
  }

  if ("title" in displayElement) {
    displayElement.title = state.displayValue;
  }

  if ("title" in expressionElement) {
    expressionElement.title = state.expression || "";
  }
}

function resetCalculator() {
  Object.assign(state, createInitialState());
  setStatus("Ready", "default");
  updateDisplay();
}

function normalizeOutgoingValue(value) {
  if (value.endsWith(".")) {
    return value.slice(0, -1);
  }

  if (value === "-" || value === "") {
    return "0";
  }

  if (value === "-0.") {
    return "-0";
  }

  return value;
}

function setError(message) {
  state.isError = true;
  state.isBusy = false;
  state.displayValue = "Error";
  state.expression = message;
  setStatus("Check input", "error");
  buttons.forEach((button) => {
    button.disabled = false;
  });
  updateDisplay();
}

async function requestCalculation(operation, payload) {
  setBusy(true);

  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation,
        ...payload,
      }),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(responseBody.error || "Calculation failed.");
    }

    state.isError = false;
    return responseBody.result;
  } catch (error) {
    setError(error instanceof Error ? error.message : "Calculation failed.");
    throw error;
  } finally {
    setBusy(false);
  }
}

function clearIfError() {
  if (state.isError) {
    resetCalculator();
  }
}

function appendDigit(digit) {
  clearIfError();

  if (state.justEvaluated && !state.pendingOperator) {
    clearRepeatOperation();
    state.displayValue = digit;
    state.expression = "";
    state.justEvaluated = false;
    updateDisplay();
    return;
  }

  if (state.waitingForOperand) {
    state.displayValue = digit;
    state.waitingForOperand = false;
    state.justEvaluated = false;
    updateDisplay();
    return;
  }

  if (state.displayValue === "0") {
    state.displayValue = digit;
  } else if (state.displayValue === "-0") {
    state.displayValue = `-${digit}`;
  } else {
    state.displayValue += digit;
  }

  if (state.expression === "Enter a value to begin") {
    state.expression = "";
  }

  state.justEvaluated = false;
  updateDisplay();
}

function appendDecimal() {
  clearIfError();

  if (state.justEvaluated && !state.pendingOperator) {
    clearRepeatOperation();
    state.displayValue = "0.";
    state.expression = "";
    state.justEvaluated = false;
    updateDisplay();
    return;
  }

  if (state.waitingForOperand) {
    state.displayValue = "0.";
    state.waitingForOperand = false;
    state.justEvaluated = false;
    updateDisplay();
    return;
  }

  if (!state.displayValue.includes(".")) {
    state.displayValue += ".";
    if (state.expression === "Enter a value to begin") {
      state.expression = "";
    }
    updateDisplay();
  }
}

function backspace() {
  clearIfError();

  if (state.waitingForOperand) {
    return;
  }

  clearRepeatOperation();

  if (state.displayValue.length === 1) {
    state.displayValue = "0";
  } else {
    state.displayValue = state.displayValue.slice(0, -1);
  }

  if (state.displayValue === "-" || state.displayValue === "") {
    state.displayValue = "0";
  }

  state.justEvaluated = false;
  updateDisplay();
}

function toggleSign() {
  clearIfError();
  clearRepeatOperation();

  if (state.waitingForOperand) {
    state.displayValue = "-0";
    state.waitingForOperand = false;
    state.justEvaluated = false;
    updateDisplay();
    return;
  }

  if (state.displayValue.startsWith("-")) {
    state.displayValue = state.displayValue.slice(1);
  } else {
    state.displayValue = state.displayValue === "0" ? "-0" : `-${state.displayValue}`;
  }

  if (state.displayValue === "") {
    state.displayValue = "0";
  }

  state.justEvaluated = false;
  updateDisplay();
}

async function applyPercent() {
  clearIfError();

  const currentValue = normalizeOutgoingValue(state.displayValue);
  let result;

  try {
    if (
      state.pendingOperator &&
      state.storedValue !== null &&
      !state.waitingForOperand &&
      ["add", "subtract"].includes(state.pendingOperator)
    ) {
      result = await requestCalculation("percentOf", {
        base: state.storedValue,
        rate: currentValue,
      });
      state.expression = `${state.storedValue} ${operatorLabels[state.pendingOperator]} ${currentValue}%`;
    } else {
      result = await requestCalculation("percent", {
        value: currentValue,
      });
      state.expression = `${currentValue}%`;
    }
  } catch {
    return;
  }

  clearRepeatOperation();
  state.displayValue = result;
  state.waitingForOperand = false;
  state.justEvaluated = false;
  state.isError = false;
  updateDisplay();
}

async function chooseOperator(nextOperator) {
  clearIfError();

  const currentValue = normalizeOutgoingValue(state.displayValue);

  if (state.pendingOperator && state.storedValue !== null) {
    if (state.waitingForOperand) {
      state.pendingOperator = nextOperator;
      state.expression = `${state.storedValue} ${operatorLabels[nextOperator]}`;
      updateDisplay();
      return;
    }

    const leftValue = state.storedValue;
    const activeOperator = state.pendingOperator;
    let result;

    try {
      result = await requestCalculation(activeOperator, {
        left: leftValue,
        right: currentValue,
      });
    } catch {
      return;
    }

    state.displayValue = result;
    state.storedValue = result;
  } else {
    state.storedValue = currentValue;
  }

  state.pendingOperator = nextOperator;
  state.waitingForOperand = true;
  state.justEvaluated = false;
  state.lastOperator = null;
  state.lastOperand = null;
  state.expression = `${state.storedValue} ${operatorLabels[nextOperator]}`;
  state.isError = false;
  updateDisplay();
}

async function evaluate() {
  clearIfError();

  if (state.pendingOperator && state.storedValue !== null) {
    const leftValue = state.storedValue;
    const rightValue = state.waitingForOperand
      ? state.storedValue
      : normalizeOutgoingValue(state.displayValue);
    const activeOperator = state.pendingOperator;
    let result;

    try {
      result = await requestCalculation(activeOperator, {
        left: leftValue,
        right: rightValue,
      });
    } catch {
      return;
    }

    state.displayValue = result;
    state.expression = `${leftValue} ${operatorLabels[activeOperator]} ${rightValue} =`;
    state.lastOperator = activeOperator;
    state.lastOperand = rightValue;
    state.pendingOperator = null;
    state.storedValue = null;
    state.waitingForOperand = false;
    state.justEvaluated = true;
    state.isError = false;
    updateDisplay();
    return;
  }

  if (state.lastOperator && state.lastOperand !== null) {
    const leftValue = normalizeOutgoingValue(state.displayValue);
    let result;

    try {
      result = await requestCalculation(state.lastOperator, {
        left: leftValue,
        right: state.lastOperand,
      });
    } catch {
      return;
    }

    state.displayValue = result;
    state.expression = `${leftValue} ${operatorLabels[state.lastOperator]} ${state.lastOperand} =`;
    state.justEvaluated = true;
    state.isError = false;
    updateDisplay();
  }
}

async function handleButtonPress(button) {
  if (state.isBusy) {
    return;
  }

  if (button.dataset.digit) {
    appendDigit(button.dataset.digit);
    return;
  }

  if (button.dataset.operator) {
    await chooseOperator(button.dataset.operator);
    return;
  }

  switch (button.dataset.action) {
    case "clear":
      resetCalculator();
      break;
    case "backspace":
      backspace();
      break;
    case "decimal":
      appendDecimal();
      break;
    case "negate":
      toggleSign();
      break;
    case "percent":
      await applyPercent();
      break;
    case "equals":
      await evaluate();
      break;
    default:
      break;
  }
}

document.querySelector(".keypad").addEventListener("click", async (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  await handleButtonPress(button);
});

window.addEventListener("keydown", async (event) => {
  if (state.isBusy) {
    return;
  }

  if (/^\d$/.test(event.key)) {
    appendDigit(event.key);
    return;
  }

  if (event.key === "." || event.key === ",") {
    appendDecimal();
    return;
  }

  if (event.key === "Enter" || event.key === "=") {
    event.preventDefault();
    await evaluate();
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    backspace();
    return;
  }

  if (event.key === "Escape") {
    resetCalculator();
    return;
  }

  if (event.key === "%") {
    await applyPercent();
    return;
  }

  const keyboardOperator = {
    "+": "add",
    "-": "subtract",
    "*": "multiply",
    "/": "divide",
  }[event.key];

  if (keyboardOperator) {
    event.preventDefault();
    await chooseOperator(keyboardOperator);
  }
});

resetCalculator();
