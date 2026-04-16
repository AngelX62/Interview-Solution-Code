"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { performCalculation } = require("../lib/calculator");
const { resolveStaticFile } = require("../server");

function createButton(dataset) {
  return {
    dataset,
    disabled: false,
    closest(selector) {
      return selector === "button" ? this : null;
    },
  };
}

function createAppHarness() {
  const displayElement = { textContent: "" };
  const expressionElement = { textContent: "" };
  const statusElement = { textContent: "", dataset: { state: "default" } };
  const keypad = {
    addEventListener(type, handler) {
      if (type === "click") {
        this.clickHandler = handler;
      }
    },
    clickHandler: null,
  };

  const buttons = [
    createButton({ action: "clear" }),
    createButton({ action: "backspace" }),
    createButton({ action: "percent" }),
    createButton({ operator: "divide" }),
    createButton({ digit: "7" }),
    createButton({ digit: "8" }),
    createButton({ digit: "9" }),
    createButton({ operator: "multiply" }),
    createButton({ digit: "4" }),
    createButton({ digit: "5" }),
    createButton({ digit: "6" }),
    createButton({ operator: "subtract" }),
    createButton({ digit: "1" }),
    createButton({ digit: "2" }),
    createButton({ digit: "3" }),
    createButton({ operator: "add" }),
    createButton({ action: "negate" }),
    createButton({ digit: "0" }),
    createButton({ action: "decimal" }),
    createButton({ action: "equals" }),
  ];

  const windowListeners = {};
  const context = {
    console,
    document: {
      querySelector(selector) {
        switch (selector) {
          case "#display":
            return displayElement;
          case "#expression":
            return expressionElement;
          case "#connection-status":
            return statusElement;
          case ".keypad":
            return keypad;
          default:
            return null;
        }
      },
      querySelectorAll(selector) {
        if (selector === ".key") {
          return buttons;
        }

        return [];
      },
    },
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body);

      try {
        const result = performCalculation(payload);

        return {
          ok: true,
          async json() {
            return result;
          },
        };
      } catch (error) {
        return {
          ok: false,
          async json() {
            return {
              error:
                error instanceof Error ? error.message : "Calculation failed.",
            };
          },
        };
      }
    },
    window: {
      addEventListener(type, handler) {
        windowListeners[type] = handler;
      },
    },
  };

  const source = fs.readFileSync(
    path.join(__dirname, "..", "public", "app.js"),
    "utf8"
  );

  vm.runInNewContext(source, context, {
    filename: "public/app.js",
  });

  async function clickButton(predicate) {
    const button = buttons.find(predicate);
    assert.ok(button, "Expected a matching button.");
    await keypad.clickHandler({ target: button });
  }

  return {
    async pressDigit(digit) {
      await clickButton((button) => button.dataset.digit === String(digit));
    },
    async pressOperator(operator) {
      await clickButton((button) => button.dataset.operator === operator);
    },
    async pressAction(action) {
      await clickButton((button) => button.dataset.action === action);
    },
    async pressKey(key) {
      await windowListeners.keydown({
        key,
        preventDefault() {},
      });
    },
    getDisplay() {
      return displayElement.textContent;
    },
    getExpression() {
      return expressionElement.textContent;
    },
    getStatus() {
      return {
        message: statusElement.textContent,
        state: statusElement.dataset.state,
      };
    },
  };
}

test("resolveStaticFile blocks paths outside the public directory", () => {
  assert.equal(resolveStaticFile("../public-leak/secret.txt"), null);
  assert.match(resolveStaticFile("/styles.css"), /public[\\/]styles\.css$/);
});

test("starting a fresh entry clears repeated equals history", async () => {
  const app = createAppHarness();

  await app.pressDigit(5);
  await app.pressOperator("add");
  await app.pressDigit(2);
  await app.pressAction("equals");

  assert.equal(app.getDisplay(), "7");
  assert.equal(app.getExpression(), "5 + 2 =");

  await app.pressDigit(9);
  assert.equal(app.getDisplay(), "9");

  await app.pressAction("equals");
  assert.equal(app.getDisplay(), "9");
  assert.equal(app.getExpression().trim(), "");
});

test("unary operations on a finished result do not replay an older binary operation", async () => {
  const app = createAppHarness();

  await app.pressDigit(5);
  await app.pressOperator("add");
  await app.pressDigit(2);
  await app.pressAction("equals");
  await app.pressAction("percent");

  assert.equal(app.getDisplay(), "0.07");
  assert.equal(app.getExpression(), "7%");

  await app.pressAction("equals");
  assert.equal(app.getDisplay(), "0.07");
});

test("keyboard input still drives calculator interactions", async () => {
  const app = createAppHarness();

  await app.pressKey("8");
  await app.pressKey("*");
  await app.pressKey("3");
  await app.pressKey("Enter");

  assert.equal(app.getDisplay(), "24");
  assert.equal(app.getStatus().state, "default");
});
