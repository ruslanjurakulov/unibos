import { AuthPanel } from "../site/auth-panel";

export const dynamic = "force-static";
export default function SignInPage() {
  return <AuthPanel mode="sign-in" />;
}
