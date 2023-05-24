import { writable, get, derived, type Writable, type Readable } from "svelte/store"
import {persistentStorage} from 'cardano-buoy'

const state = writable()

const statePromise = writable(() => Promise.reject<unknown>())

function resetConnector(e?: Error) {
   state.set(undefined)
   statePromise.set(() => Promise.reject(e))
   const st = persistentStorage()
   st.remove('lastWallet')
}

function setConnectorAsync<T>({key}: { key: string }, wallet: Promise<T>) {
   statePromise.set(() => wallet.then(wlt => {
      const st = persistentStorage()
      st.set({'lastWallet': key})
      state.set(wlt)
      return wlt
   },
   (e) => (resetConnector(e), Promise.reject(e))
   ))
}

export function useWalletConnector<T>() {
   return {
      wallet:  { subscribe: state.subscribe } as Readable<T | undefined>,
      requireWallet: () => get(state) as T ?? (() => { throw new Error("Required wallet when it was not set!")})(),
      walletPromise: { subscribe: statePromise.subscribe } as Readable<() => Promise<T>>,
      resetConnector,
      setConnectorAsync: setConnectorAsync<T>
   }
}
