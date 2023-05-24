// Describes a long operation that may fail with an error message
// Single operation is possible at any time
// Success and Error message is displayed in the layout

import { derived, writable, type Readable } from "svelte/store"

// 'idle' state is reject state
export type OperationResult = /* 'idle' | */{ actions?: Record<string, () => void>} & ({ success: string } | { warning: string } | { error: string })
// const defalt: OperationResult = {
//    error: ' xxxxx<a href="https://www.google.com">guugl </a> sfsgfefjhgblerjgh erjkhg \
//    leiwrg iulewrhg ierhigwoehrg irhgiweruhgi erhgp hergp whpaehfpigjrtuwhgvruebvwpr rwb\
//     gwoergbwvnpwbiptir bgowb gpiwerb gpwergfb erupbvgerb eg',
//    actions: {
//       'Continue': () => {},
//       'Restart': () => {},
//    }
// }

const operation = writable({
   result: () => Promise.reject<OperationResult>(),
   // completion: () => Promise.reject<void>()
}) // Promise.resolve<OperationResult>('idle'))
// const operation = writable(() => Promise.resolve<OperationResult>(defalt))

export const operationError = (e: Error) => ({error: e.message ?? e })
export const successOperation = <T>(op: Promise<T>, then: (t: T) => string) => op.then(v => ({success: then(v)}), operationError)
export const successOperationIf = <T>(op: Promise<T>, then: (t: T) => string, if_: (t: T) => boolean, onError = operationError) =>
   op.then(v => if_(v) ? ({success: then(v)}) : Promise.reject(), onError)

// export const onOperationResult = (r: OperationResult, f: (r: NonNullable<OperationResult>) => void) => {
//    if (r) f(r)
// }
// export const pureSuccessOperation = <T>(op: Promise<T>, then: (t: T) => string) => op.then(v => ({success: then(v)}))

export function useOperation() {
   return {
      operation: derived(operation, o => o),
      setOperation: (p: Promise<OperationResult>) => operation.update(o => {
         o.result = () => p.catch((e: Error) => ({error: e.message}))
         return o
      }),
      // setCompletion: (p: Promise<void>) => operation.update(o => {
      //    o.completion = () => p
      //    return o
      // }),
      resetOperation: () => (console.log('resetOperation called'), operation.set({
         result: () => Promise.reject<OperationResult>(),
         // completion: () => Promise.reject<void>()
      }) )
   }
}
