
import { useCallback } from "react";
import { useRouter } from "expo-router";
import WelcomeScreen from "../../screens/WelcomeScreen";

export default function Index() {
  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    router.push("/(public)/permissions");
  }, [router]);

  return <WelcomeScreen onGetStarted={handleGetStarted} />;
}
