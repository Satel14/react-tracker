function createPubgApiClient({ apiKey, onRateLimit }) {
  return {
    async doRequest(url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.api+json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) throw new Error("Player not found");
        if (response.status === 401) throw new Error("API Key Invalid");
        if (response.status === 429) {
          if (typeof onRateLimit === "function") {
            onRateLimit();
          }
          throw new Error("Rate Limit Reached");
        }
        throw new Error(`PUBG API Error: ${response.statusText}`);
      }

      return response.json();
    },
  };
}

module.exports = {
  createPubgApiClient,
};
