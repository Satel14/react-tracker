import openNotification from '../component/Notification'

export const getHistory = async () => {
  try {
    const history = await localStorage.history;
    return history !== null ? JSON.parse(history) : {}
  } catch (e) {
    return null
  }
}

export const addHistory = async (platform, gameid, nickname, avatar) => {
  try {
    let history = await getHistory()

    history = history || {};
    if (history[gameid]) {
      return history[gameid]
    }

    const ids = Object.keys(history)
    if (ids.length > 4) {
      delete history[ids[0]]
    }

    history[gameid] = { avatar, platform, nickname }
    return localStorage.getItem('history', JSON.stringify(history))
  } catch (e) {
    return null
  }
}
export const removeHistory = () => {
  localStorage.removeItem('history')
}

export const getFavorites = async () => {
  try {
    const favorites = await localStorage.favorites;
    return favorites !== null ? JSON.parse(favorites) : {}
  } catch (e) {
    return null
  }
}