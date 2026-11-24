import { Component } from "react";
import PlayerNotice from "./PlayerNotice";

/**
 * Inside the installed app the player shares the page with the other tabs, so
 * a crash in the YouTube player must not blank the whole app.
 */
export default class PlayerBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("player crashed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <PlayerNotice title="The player stopped" action="Reload player" onAction={() => this.setState({ failed: false })}>
          Something went wrong in the video player. Your queue is safe.
        </PlayerNotice>
      );
    }
    return this.props.children;
  }
}
