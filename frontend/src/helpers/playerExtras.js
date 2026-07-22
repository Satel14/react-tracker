export const mergeProfileExtras = (data, extras) => {
  if (!data || data?.profile?.status !== "deferred") return data;
  if (!extras || typeof extras.status !== "string") return data;

  return {
    ...data,
    profile: {
      ...data.profile,
      ...extras,
      banType: extras.banType ?? data.profile.banType,
    },
  };
};
