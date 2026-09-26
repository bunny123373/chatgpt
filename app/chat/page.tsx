import AuthGate from "@/components/AuthGate";

/** The app itself. The landing page lives at "/" and redirects signed-in users here. */
export default function ChatPage() {
  return <AuthGate />;
}
