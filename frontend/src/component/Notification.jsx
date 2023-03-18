import { notification } from "antd"

const openNotification = (type, title, description = "", placement = "bottomRight") => {
  notification[type]({
    message: title,
    className: "csgo-notification",
    description,
    placement
  })
}

export default openNotification