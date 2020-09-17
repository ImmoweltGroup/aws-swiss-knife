export const range = (len: number) => [...Array(len).keys()]
export const chunk = <T>(items: T[], size: number) => {
  const numChunks = range(Math.ceil(items.length / size))
  return numChunks.map(i => items.slice(i * size, (i + 1) * size))
}
