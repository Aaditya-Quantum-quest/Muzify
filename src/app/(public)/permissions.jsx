import { useRouter } from "expo-router";
import PermissionsScreen from "../../screens/PermissionScreen";

export default function Permissions() {
  const router = useRouter();

  return (
    <PermissionsScreen
      onFinish={(folder) => {
        console.log("Selected music folder:", folder);
        router.replace("/(tabs)/home");
      }}
    />
  );
}