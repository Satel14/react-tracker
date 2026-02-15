import SteamIcon from './../component/icons/SteamIcon';
import PlaystationIcon from './../component/icons/PlaystaionIcon';
import XboxIcon from './../component/icons/XboxIcon';



const getPlatformAvatar = (platform) => {
  const normalizedPlatform = platform === "xbl" ? "xbox" : platform;
  const avatars = {
    psn: "/images/psn_avatar.jpg",
    steam: "/images/steam_avatar.jpg",
    xbox: "/images/xbox_avatar.jpg",
  }

  return avatars[normalizedPlatform] || avatars.steam
}

const getIconComponentPlatfrom = (platform) => {
  const normalizedPlatform = platform === "xbl" ? "xbox" : platform;
  const iconComponents = {
    steam: <SteamIcon />,
    psn: <PlaystationIcon />,
    xbox: <XboxIcon />,
  }

  return iconComponents[normalizedPlatform] || iconComponents.steam
}

export {
  getPlatformAvatar,
  getIconComponentPlatfrom
}
