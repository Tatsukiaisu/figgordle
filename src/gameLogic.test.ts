import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGuess, confirmedCorrectPositions } from "./gameLogic.ts";

test("confirmedCorrectPositions: empty when no guesses", () => {
  const set = confirmedCorrectPositions([], "MAISON");
  assert.equal(set.size, 0);
});

test("confirmedCorrectPositions: marks positions guessed in the right place", () => {
  // Target MAISON. Guess MAILLE → M,A,I correct at 0,1,2.
  const set = confirmedCorrectPositions(["MAILLE"], "MAISON");
  assert.deepEqual([...set].sort((a, b) => a - b), [0, 1, 2]);
});

test("confirmedCorrectPositions: unions across several guesses", () => {
  // MAILLE → 0,1,2 ; ??SON? style guess adding position 3 (S).
  const set = confirmedCorrectPositions(["MAILLE", "XXISON"], "MAISON");
  // MAILLE: 0(M),1(A),2(I). XXISON: 2(I),3(S),4(O),5(N).
  assert.deepEqual([...set].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
});

test("confirmedCorrectPositions: never includes space positions", () => {
  const target = "NOTE DE FRAIS";
  // A guess equal to the target would mark every non-space position correct.
  const set = confirmedCorrectPositions([target], target);
  for (let i = 0; i < target.length; i++) {
    if (target[i] === " ") assert.equal(set.has(i), false, `space at ${i}`);
    else assert.equal(set.has(i), true, `letter at ${i}`);
  }
});

test("confirmedCorrectPositions: present-but-misplaced letters are not confirmed", () => {
  // Target MAISON, guess SXXXXX → S is present (in target) but wrong place → not confirmed.
  const set = confirmedCorrectPositions(["SXXXXX"], "MAISON");
  assert.equal(set.has(0), false);
  // sanity: checkGuess agrees S at 0 is "present", not "correct"
  assert.equal(checkGuess("SXXXXX", "MAISON")[0], "present");
});
