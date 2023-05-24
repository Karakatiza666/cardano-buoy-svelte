import { lazy, lazyCache } from "ts-practical-fp";
import { writable, get, derived } from "svelte/store"

// Stores a promise of a task locked in a clojure.
// Promise returns a callback that resolves when attempt is successful or failed
// Successful attempt resolves to the id of a task
// Failed attempt resolves to null
// const state = writable<Record<number, Promise<() => Promise<void> >>>({})
const state = writable<Map<string, {desc: string, promise: () => Promise<void>}>>(new Map());

const remove = <K>(id: K) => <V>(s: Map<K, V>) => {
   s.delete(id)
   return s
}

// check() function returns boolean of whether operation was successful
// if check() rejects - it is an error
function createRetry(id: string, operation: (id: string) => Promise<(lastCheck: boolean) => Promise<boolean>>/*, onRemove: () => void*/, maxRetries: number, retries = 0) {
   return operation(id).then(async check => {
      console.log('Do we need to retry tx?', id, get(state).has(id))
      if (!get(state).has(id)) {
         return
      }
      if (retries >= maxRetries) {
         state.update(remove(id))
         return
      }
      const lastCheck = retries == maxRetries - 1
      const success = await check(lastCheck)

      if (!get(state).has(id)) {
         return
      }
      if (success) {
         state.update(remove(id))
         return
      }
      console.log('creating next createRetry')
      createRetry(id, operation, /*onRemove,*/ maxRetries, retries + 1)
   }, (e: Error) => {
      console.log('caught in createRetry', e)
      state.update(remove(id))
   })
}

const randomStr = () => (Math.random() * 100000).toFixed()

// eslint-disable-next-line @typescript-eslint/no-empty-function
function addRetryOperation(operation: (id: string) => Promise<(lastCheck: boolean) => Promise<boolean>>, maxRetries: number, id = '', desc = '') {
   // const id = getNextIndex()
   if (!id) {
      id = randomStr()
   }

   const promise = lazyCache(() => createRetry(id, operation, /*onRemove,*/ maxRetries))
   state.update(m => m.set(id, {desc, promise: promise}))
   promise() // Trigger start of evaluation of a lazy promise after state.update
   // This way operation starts executing after state already has id of this operation
   // return (init: (id: number) => void) => {
   //    init(id)
      return {
         id,
         cancel: () => {
            // onRemove()
            state.update(remove(id))
         },
         operationCompletion: promise
      }
   // }
}

const cancelOperation = (id: string) => state.update(remove(id))

const setDescription = (id: string, desc: string) => {
   if (get(state).has(id)) {
      state.update(m => {
         m.set(id, {...m.get(id)!, desc})
         return m
      })
   }
}

export function useRetryOperation() {
   return {
      operations: derived(state, f => f),
      addRetryOperation,
      cancelOperation,
      setDescription
   }
}
