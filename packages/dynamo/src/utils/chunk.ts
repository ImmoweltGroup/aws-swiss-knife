export const chunk = <T>(items: T[], size: number): T[][] =>
  items.reduce(
    (prev, item) => {
      if (prev[prev.length - 1].length >= size) {
        prev.push([]);
      }
      prev[prev.length - 1].push(item);
      return prev;
    },
    [[]]
  );
