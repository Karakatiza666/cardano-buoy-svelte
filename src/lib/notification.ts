import { successOperationIf, useOperation, type OperationResult } from "$lib/compositions/operation"
import { useRetryOperation } from "$lib/compositions/retryOperation"
import type { Hex } from "ts-binary-newtypes"
// import {gqlTxPing } from "cardano-buoy"
// import { runGraphql_ } from "$lib/functions/tx"
import { retry, wait } from "ts-retry-promise"
import type { BlockFrostAPI } from "@blockfrost/blockfrost-js"

export const proceedAfterDialog = <T>(
   tx: () => Promise<T>,
   f: (resolve: () => void, reject: () => void) => OperationResult) => {
   const { setOperation } = useOperation()
   return new Promise<T>((resolve, reject) => {
      setOperation(Promise.resolve(f(() => tx().then(resolve, reject), () => reject(new Error('Operation cancelled')))))
   })
}

export const operationAfterDialog = <T>(
   tx: () => Promise<T>,
   f: (resolve: () => void, reject: () => void) => OperationResult) => {
   const { setOperation } = useOperation()
   return new Promise<() => Promise<T>>((resolve, reject) => {
      // setOperation(Promise.resolve(f(() => tx().then(resolve, reject), () => reject('Operation cancelled'))))
      setOperation(Promise.resolve(f(() => resolve(tx), () => reject(new Error('Operation cancelled')))))
   })
}

export const notificationDialog = (
   f: (resolve: () => void, reject: () => void) => OperationResult) => {
   const { setOperation } = useOperation()
   return new Promise<void>((resolve, reject) => {
      // setOperation(Promise.resolve(f(() => tx().then(resolve, reject), () => reject('Operation cancelled'))))
      setOperation(Promise.resolve(f(() => resolve(), () => reject(new Error('Operation cancelled')))))
   })
}

export const retryTransaction = ({
   msgSent = (txHash) => `Sent transaction ${txHash}!`,
   msgSubmitError = 'Failed to submit transaction. Resubmitting, please sign the next transaction.',
   msgConfirmError = 'Failed to confirm transaction. Resubmitting, please sign the next transaction.',
   msgExhaustedError = 'Failed to confirm transaction after multiple attempts - \
   there might be a problem with your wallet or Cardano network. Try again later.',
   id = '',
   ...args
}: {
   ctx: { blockfrostApi: BlockFrostAPI, ttlSeconds: number, txRetries: number },
   id?: string,
   msgSent?: (txHash: Hex) => string,
   msgSubmitError?: string,
   msgConfirmError?: string,
   msgExhaustedError?: string,
   msgPreDesc: string,
   msgHashDesc: (txHash: Hex) => string,
   tx: () => Promise<Hex>,
   msgSuccess: (txHash: Hex) => string
}) => {
   const { setOperation } = useOperation()
   const { addRetryOperation, setDescription } = useRetryOperation()
   // const pingTx = runGraphql_(gqlTxPing, args.ctx.graphqlApi)
   const pingTx = (hash: Hex) => args.ctx.blockfrostApi.txs(hash).then(tx => tx.hash == hash)
   const op = async (id: string) => {
      console.log('before setdesc')
      setDescription(id, args.msgPreDesc)
      console.log('after setdesc')
      const txPromise = args.tx()
      setOperation(
         successOperationIf(
            txPromise,
            msgSent,
            txHash => !!txHash.length,
            e => ({ error: e.message ?? e.info ?? e.error ?? e })
         )
      )
      return txPromise.then((txHash) => async (lastCheck: boolean) => {
         if (!txHash.length) {
            setOperation(
               Promise.resolve({
                  warning:
                     msgSubmitError
               })
            )
            return false // Allows to ignore desired errors
         }
         setDescription(id, args.msgHashDesc(txHash))
         const delaySeconds = 20 // Duration to wait until first check request
         const periodSeconds = 20 // Duration between requests
         const extraSeconds = 20 // Duration to keep checking tx after ttl expires
         await wait(delaySeconds * 1000)
         // Retry promise rejects if pingTx hasn't resolved to true until timeout
         const retryPromise = retry(() => pingTx(txHash), {
            until: (b) => b,
            delay: periodSeconds * 1000, // ms
            timeout: (args.ctx.ttlSeconds - delaySeconds + extraSeconds) * 1000 // ms
         })
         setOperation(
            // pureSuccessOperation(
            //    retryPromise,
            //    () =>
            //       `Successfully minted currency! It will appear in your wallet in a few moments.<br/>Transaction ID <a href="https://cardanoscan.io/transaction/${txHash}" target="blank_" rel="noreferrer">${txHash}</a>`
            // )
            retryPromise
               .then(() => ({
                  success: args.msgSuccess(txHash)
               }),
               () => lastCheck
                  ? { error: msgExhaustedError }
                  : { warning: msgConfirmError }
            )
         )
         return retryPromise.catch((e) => false)
      })
   }

   const operation = addRetryOperation(op, args.ctx.txRetries, id)

   return operation
}