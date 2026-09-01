import { get } from "./fetch";

// Deliberately without the notification flag the other wrappers pass. This one
// backs a section of an article: if the census is down the section folds, and
// a toast over the page somebody came to read would be the louder failure.
export const getRankDistribution = (days = 7) => get(`/census/distribution?days=${days}`, false);

export default getRankDistribution;
