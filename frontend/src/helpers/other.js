import SteamIcon from './../component/icons/SteamIcon';
import PlaystationIcon from './../component/icons/PlaystaionIcon';
import XboxIcon from './../component/icons/XboxIcon';



const getPlatformAvatar = (platform) => {
  const avatars = {
    pns: "/images/psn_avatar.jpg",
    steam: "/images/steam_avatar.jpg",
    xbox: "/images/xbox_avatar.jpg",
  }

  return avatars[platform]
}

const getIconComponentPlatfrom = (platform) => {
  const iconComponents = {
    steam: <SteamIcon />,
    psn: <PlaystationIcon />,
    xbox: <XboxIcon />,
  }

  return iconComponents[platform]
}

export {
  getPlatformAvatar,
  getIconComponentPlatfrom
}