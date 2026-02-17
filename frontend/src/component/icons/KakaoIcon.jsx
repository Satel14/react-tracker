import React from "react";

const PRIMARY_ICON = "https://cdn.jsdelivr.net/npm/simple-icons@16.8.0/icons/kakao.svg";
const FALLBACK_ICON = "https://icons.iconarchive.com/icons/simpleicons-team/simple/128/kakao-icon.png";

const KakaoIcon = () => {
  return (
    <img
      src={PRIMARY_ICON}
      alt="Kakao"
      className="platform-provider-icon platform-provider-icon--kakao"
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

export default KakaoIcon;
