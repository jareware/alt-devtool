import alts from './alts'
import makeFinalStore from 'alt/utils/makeFinalStore'
import post from './post'
import parseStores from './parseStores'
import getStoreData from './getStoreData'
import uid from './uid'

let listeners = []
const snapshots = {}

// handle messages from the hook
function onMessageFromHook(event) {
  if (event && event.source !== window) {
    return
  }

  const message = event.data

  if (typeof message !== 'object' || message === null || message.source !== 'alt-hook') {
    return
  }

  const { action, data } = message.payload

  switch (action) {
    case 'SELECT_ALT':
      alts.switch(data.id)
      post('ALT', {
        alts: alts.map(x => x.name)
      })
    return
    case 'REFRESH':
      registerAlt()
    return
    case 'SNAPSHOT':
      let snapshot = alts.get().takeSnapshot()
      prompt("Look! Here's your entire app state in a string:", snapshot)
      console.log("App snapshot", JSON.parse(snapshot))
    return
    case 'FLUSH':
      let flushed = alts.get().flush()
      prompt("App flushed; App snapshot taken:", flushed)
      console.log("App flushed and snapshotted", JSON.parse(flushed))

      parseStores().forEach(data => post('STORES', data))
    return
    case 'RECYCLE_STORE':
      alts.get().recycle(data.storeName)
      parseStores().forEach(data => post('STORES', data))
    return
    case 'REVERT':
      if (snapshots[data.id]) {
        alts.get().bootstrap(snapshots[data.id])
        parseStores().forEach(data => post('STORES', data))
      }
    case 'BOOTSTRAP':
      if (data.bootstrapData) {
        alts.get().bootstrap(data.bootstrapData)
      }
    return
    return
    case 'START_RECORDING':
      // XXX start recording
      // if we're recording let the dispatch now that it was recorded...
    case 'CLEAR_RECORDING':
      // XXX I guess we need to retroactively clear all the dispatches. This should be handled in the store
    case 'STOP_RECORDING':
      // XXX we stop the recording and let the post dispatches know.
    case 'REPLAY_RECORDING':
      // XXX straight-forward, just replay them in a standard way.
    case 'LOAD_RECORDING':
      // XXX I wish this used the file system API
    case 'SAVE_RECORDING':
      // XXX I wish this used the file system API
  }
}

window.addEventListener('message', onMessageFromHook)

function registerAlt() {
  listeners.forEach(x => x.destroy())

  // initial post of alts
  post('ALT', {
    alts: alts.map(x => x.name)
  })

  parseStores().forEach(data => post('STORES', data))

  listeners = alts.map((obj, i) => {
    const alt = obj.alt

    // create our state container for each store
    const altStores = alt.deserialize(alt.takeSnapshot())
    const stores = Object.keys(altStores).reduce((obj, storeName) => {
      obj[storeName] = getStoreData(alt.stores[storeName], altStores[storeName])
      return obj
    }, {})

    // store listeners for when each store changes
    const storeListeners = Object.keys(alt.stores).map((storeName) => {
      const store = alt.stores[storeName]
      const { config } = store.StoreModel

      function mapState(state) {
        return config.onSerialize
          ? config.onSerialize(state)
          : state
      }

      return store.listen((nextState) => {
        stores[storeName] = getStoreData(store, mapState(nextState))
      })
    })

    // the final store for dispatch
    const finalStore = makeFinalStore(alt)

    const listener = finalStore.listen(function ({ payload }) {
      const id = uid()

      post('STORES', {
        alt: i,
        stores: Object.keys(stores).map(name => stores[name])
      })

      post('DISPATCH', {
        alt: i,
        id: id,
        action: payload.details.id,
        data: JSON.stringify(payload.data)
      })

      snapshots[id] = alt.takeSnapshot()
    })

    return {
      destroy() {
        storeListeners.forEach(f => f())
        listener()
      }
    }
  })
}

export default registerAlt
