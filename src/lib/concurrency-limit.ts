/**
 * Promise pool: run async work with at most `maxParallel` tasks in flight.
 * Extra tasks wait in FIFO order (same idea as `p-limit`, without a dependency).
 */
export function createConcurrencyLimit(maxParallel: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  const kick = () => {
    while (running < maxParallel && queue.length > 0) {
      const start = queue.shift()!;
      running++;
      start();
    }
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            kick();
          });
      };
      queue.push(run);
      kick();
    });
  };
}
