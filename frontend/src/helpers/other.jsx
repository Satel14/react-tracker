import SteamIcon from './../component/icons/SteamIcon';
import PlaystationIcon from './../component/icons/PlaystaionIcon';
import XboxIcon from './../component/icons/XboxIcon';
import KakaoIcon from "../component/icons/KakaoIcon";
import StadiaIcon from "../component/icons/StadiaIcon";
import { normalizePlatform } from "./playerIdentity";

const getPlatformAvatar = (platform) => {
  const normalizedPlatform = normalizePlatform(platform);
  const avatars = {
    psn: "/images/psn_avatar.jpg",
    steam: "/images/steam_avatar.jpg",
    xbox: "/images/xbox_avatar.jpg",
    kakao: "/images/steam_avatar.jpg",
    stadia: "/images/steam_avatar.jpg",
  }

  return avatars[normalizedPlatform] || avatars.steam
}

const getIconComponentPlatfrom = (platform) => {
  const normalizedPlatform = normalizePlatform(platform);
  const iconComponents = {
    steam: <SteamIcon />,
    psn: <PlaystationIcon />,
    xbox: <XboxIcon />,
    kakao: <KakaoIcon />,
    stadia: <StadiaIcon />,
  }

  return iconComponents[normalizedPlatform] || iconComponents.steam
}

export {
  getPlatformAvatar,
  getIconComponentPlatfrom
}
