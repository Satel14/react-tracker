import React from "react";
import { Button } from "antd";
import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { translate } from "react-switch-lang";

// Every route below / and /404 is a lazy chunk. Without a boundary here, a chunk
// that fails to download rethrows on every render and unmounts the whole tree,
// Navbar and Footer included, leaving a blank page until a manual reload.
class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[route] render failed:", error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    const { t, children } = this.props;

    if (!this.state.failed) return children;

    return (
      <div className="player-error">
        <div className="player-error__card player-error__card--network">
          <div className="player-error__icon"><WarningOutlined /></div>
          <h2 className="player-error__title">{t("pages.routeError.title")}</h2>
          <p className="player-error__description">{t("pages.routeError.description")}</p>
          <div className="player-error__actions">
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
            >
              {t("pages.routeError.reload")}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default translate(RouteErrorBoundary);
