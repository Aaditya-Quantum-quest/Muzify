import { useEffect, useState } from "react";
import { consumeLaunchBackground } from "../services/welcomeBackgrounds";

const FALLBACK = require("../../assets/splash-icon.png");

export function useWelcomeBackground() {
  const [bg, setBg] = useState(null);

  useEffect(() => {
    let live = true;
    consumeLaunchBackground()
      .then((uri) => {
        if (live) setBg({ uri, fallback: FALLBACK });
      })
      .catch(() => {
        if (live) setBg({ uri: null, fallback: FALLBACK });
      });
    return () => {
      live = false;
    };
  }, []);

  return bg;
}
