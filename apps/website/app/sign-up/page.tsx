import { AuthPanel } from "../site/auth-panel";

export const dynamic = "force-static";
export default function SignUpPage() {
  return <AuthPanel mode="sign-up" />;
}
