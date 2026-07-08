// rng.js — seeded, deterministic PRNG + helpers. Framework-free (no jsPsych) so the
// reproducibility-critical logic can be exercised in Node or dev/reproducibility.html.
//
// Reproducibility contract: same (participant id, stored pre-ratings) => identical
// selection / assignment / trial order, forever. We do NOT bit-match Python's RNG;
// instead each "purpose" gets its own independent stream keyed by a string tag, mirroring
// the in-lab per-phase seed scheme (_participant_seed(pid, tag)).
window.SP = window.SP || {};

(function () {
  // xmur3: string -> 32-bit seed generator (returns a function producing 32-bit ints).
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32: 32-bit seed -> () => float in [0, 1)
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One independent stream per purpose. tag e.g. 'select','assign','association',...
  function makeRNG(pid, tag) {
    const seedFn = xmur3(String(pid) + '|' + tag + '|sp_v1');
    return mulberry32(seedFn());
  }

  // Fisher–Yates shuffle (returns a new array; does not mutate input).
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // Sample k items without replacement.
  function sample(arr, k, rng) {
    return shuffle(arr, rng).slice(0, k);
  }

  function randFloat(lo, hi, rng) {
    return lo + rng() * (hi - lo);
  }

  // No-immediate-repeat sequence over a multiset — port (in spirit) of the in-lab
  // _no_repeat_sequence. entries = [[itemValue, count], ...]. Returns a flat array of
  // itemValues where no two consecutive entries are equal. Uses the greedy
  // "largest-remaining-first, random tie-break" rule, which always succeeds whenever a
  // valid arrangement exists (i.e. max count <= ceil(total/2)).
  function noRepeatSequence(entries, rng, maxAttempts) {
    maxAttempts = maxAttempts || 200;
    const total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remaining = entries.map(function (e) { return { item: e[0], n: e[1] }; });
      const seq = [];
      let prev = null;
      let ok = true;
      for (let i = 0; i < total; i++) {
        const cands = remaining.filter(function (r) { return r.n > 0 && r.item !== prev; });
        if (cands.length === 0) { ok = false; break; }
        const maxRem = Math.max.apply(null, cands.map(function (r) { return r.n; }));
        const top = cands.filter(function (r) { return r.n === maxRem; });
        const choice = top[Math.floor(rng() * top.length)];
        seq.push(choice.item);
        choice.n--;
        prev = choice.item;
      }
      if (ok) return seq;
    }
    throw new Error('noRepeatSequence: failed to build a no-immediate-repeat sequence');
  }

  SP.rng = {
    xmur3: xmur3,
    mulberry32: mulberry32,
    makeRNG: makeRNG,
    shuffle: shuffle,
    sample: sample,
    randFloat: randFloat,
    noRepeatSequence: noRepeatSequence
  };
})();
