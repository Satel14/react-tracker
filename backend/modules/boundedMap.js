// A Map with a ceiling.
//
// Every in-process cache in this codebase is swept only on a read of the SAME
// key -- get() checks the timestamp and deletes an expired entry -- so an entry
// for a key nobody asks about again is never collected at all. A long-lived
// process serving a stream of distinct players therefore grows until it is
// restarted, and the entries are whole mapped payloads. The failure is an OOM
// on a small instance rather than a wrong answer, which is why it went unseen.
//
// Oldest-in first. Map preserves insertion order and re-setting a key does not
// move it, so a hot key can still age out -- acceptable for a bound whose job
// is the heap rather than the hit rate.
class BoundedMap extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  set(key, value) {
    super.set(key, value);
    while (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}

module.exports = { BoundedMap };
