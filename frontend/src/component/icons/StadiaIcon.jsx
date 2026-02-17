import React from "react";

const PRIMARY_ICON = "https://cdn.jsdelivr.net/npm/simple-icons@16.8.0/icons/stadia.svg";
const FALLBACK_ICON = "https://icons.iconarchive.com/icons/simpleicons-team/simple/128/stadia-icon.png";

const StadiaIcon = () => {
  return (
    <img
      src={PRIMARY_ICON}
      alt="Stadia"
      className="platform-provider-icon"
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallbackApplied === "1") return;
        img.dataset.fallbackApplied = "1";
        img.src = FALLBACK_ICON;
      }}
    />
  );
};

export default StadiaIcon;
