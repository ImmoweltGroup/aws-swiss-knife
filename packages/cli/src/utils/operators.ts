import { combineLatest, MonoTypeOperatorFunction, Observable, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'

type ObsFn<T, K> = (orig: T) => Observable<K>
type MergeFn<T, K> = (orig: T, newValue: K) => T
export const mergeObj = <T, K>(
  obs: ObsFn<T, K>,
  merge: MergeFn<T, K>
): MonoTypeOperatorFunction<T> => {
  return source =>
    source.pipe(
      switchMap(v => combineLatest([of(v), obs(v)])),
      map(([orig, newValue]) => merge(orig, newValue))
    )
}
