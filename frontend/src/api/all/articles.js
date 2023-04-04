import { get } from '../fetch'

export const getBugReport = () => get('/articles/bugreport', true)