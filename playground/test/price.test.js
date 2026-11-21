import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice } from "../src/price.js";

test("formats thousands and kopecks", () => {
  assert.equal(formatPrice(129900), "1 299,00 ₴");
  assert.equal(formatPrice(5), "0,05 ₴");
  assert.equal(formatPrice(-1000), "-10,00 ₴");
});

test("rejects non-integers", () => {
  assert.throws(() => formatPrice(1.5), TypeError);
});
