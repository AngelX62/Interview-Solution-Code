"use strict";

const MAX_INPUT_LENGTH = 64;
const DIVISION_PRECISION = 12;
const ONE_HUNDRED = parseDecimal("100");

function sanitizeDecimalInput(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Only finite numbers are allowed.");
    }

    value = String(value);
  }

  if (typeof value !== "string") {
    throw new Error("Values must be sent as strings or numbers.");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("A value is required.");
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new Error("The value is too long.");
  }

  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    throw new Error("Use a standard decimal number.");
  }

  if (trimmed.startsWith(".")) {
    return `0${trimmed}`;
  }

  if (trimmed.startsWith("-.")) {
    return `-0${trimmed.slice(1)}`;
  }

  return trimmed;
}

function parseDecimal(value) {
  const normalized = sanitizeDecimalInput(value);
  const negative = normalized.startsWith("-");
  const unsignedValue = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsignedValue.split(".");
  const digits = `${wholePart || "0"}${fractionPart}`.replace(/^0+(?=\d)/, "");
  const integerValue = BigInt(digits || "0");

  return normalizeDecimal({
    int: negative ? -integerValue : integerValue,
    scale: fractionPart.length,
  });
}

function normalizeDecimal(decimalValue) {
  let { int, scale } = decimalValue;

  if (int === 0n) {
    return { int: 0n, scale: 0 };
  }

  while (scale > 0 && int % 10n === 0n) {
    int /= 10n;
    scale -= 1;
  }

  return { int, scale };
}

function pow10(exponent) {
  if (exponent < 0) {
    throw new Error("Negative exponents are not supported.");
  }

  return 10n ** BigInt(exponent);
}

function add(left, right) {
  const scale = Math.max(left.scale, right.scale);
  const leftInt = left.int * pow10(scale - left.scale);
  const rightInt = right.int * pow10(scale - right.scale);

  return normalizeDecimal({
    int: leftInt + rightInt,
    scale,
  });
}

function subtract(left, right) {
  return add(left, {
    int: -right.int,
    scale: right.scale,
  });
}

function multiply(left, right) {
  return normalizeDecimal({
    int: left.int * right.int,
    scale: left.scale + right.scale,
  });
}

function divide(left, right, precision = DIVISION_PRECISION) {
  if (right.int === 0n) {
    throw new Error("Cannot divide by zero.");
  }

  const leftAbs = left.int < 0n ? -left.int : left.int;
  const rightAbs = right.int < 0n ? -right.int : right.int;
  const numerator = leftAbs * pow10(precision + right.scale);
  const denominator = rightAbs * pow10(left.scale);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (remainder * 2n >= denominator) {
    quotient += 1n;
  }

  return normalizeDecimal({
    int: left.int < 0n !== right.int < 0n ? -quotient : quotient,
    scale: precision,
  });
}

function negate(value) {
  return normalizeDecimal({
    int: -value.int,
    scale: value.scale,
  });
}

function percent(value) {
  return divide(value, ONE_HUNDRED);
}

function percentOf(base, rate) {
  return divide(multiply(base, rate), ONE_HUNDRED);
}

function formatDecimal(decimalValue) {
  const normalized = normalizeDecimal(decimalValue);

  if (normalized.scale === 0) {
    return normalized.int.toString();
  }

  const negative = normalized.int < 0n;
  const digits = (negative ? -normalized.int : normalized.int)
    .toString()
    .padStart(normalized.scale + 1, "0");
  const wholePart = digits.slice(0, digits.length - normalized.scale) || "0";
  const fractionPart = digits.slice(digits.length - normalized.scale);

  return `${negative ? "-" : ""}${wholePart}.${fractionPart}`;
}

function requireBinaryOperands(payload) {
  return {
    left: parseDecimal(payload.left),
    right: parseDecimal(payload.right),
  };
}

function requireUnaryOperand(payload) {
  return parseDecimal(payload.value);
}

function performCalculation(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Send a JSON object with an operation.");
  }

  const { operation } = payload;

  if (typeof operation !== "string" || !operation.trim()) {
    throw new Error("An operation is required.");
  }

  let result;

  switch (operation) {
    case "add": {
      const { left, right } = requireBinaryOperands(payload);
      result = add(left, right);
      break;
    }
    case "subtract": {
      const { left, right } = requireBinaryOperands(payload);
      result = subtract(left, right);
      break;
    }
    case "multiply": {
      const { left, right } = requireBinaryOperands(payload);
      result = multiply(left, right);
      break;
    }
    case "divide": {
      const { left, right } = requireBinaryOperands(payload);
      result = divide(left, right);
      break;
    }
    case "negate": {
      result = negate(requireUnaryOperand(payload));
      break;
    }
    case "percent": {
      result = percent(requireUnaryOperand(payload));
      break;
    }
    case "percentOf": {
      const base = parseDecimal(payload.base);
      const rate = parseDecimal(payload.rate);
      result = percentOf(base, rate);
      break;
    }
    default:
      throw new Error("Unsupported operation.");
  }

  return {
    result: formatDecimal(result),
  };
}

module.exports = {
  performCalculation,
  sanitizeDecimalInput,
};
