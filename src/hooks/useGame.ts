import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { store } from '@/engine/store.js';

type State = ReturnType<typeof store.getState>;

/** Subscribe to a slice of the engine store; object/array results are compared shallowly. */
export function useGame<T>(sel: (s: State) => T): T {
  return useStore(store, useShallow(sel));
}
export { store };
